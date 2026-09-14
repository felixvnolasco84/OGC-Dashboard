import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Auth, paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertCanWrite,
  canUserAccessDesarrollo,
  getCurrentUserOrThrow,
  hasAdminAccess,
} from "./permissions";
import { canCreateBitacora, validateBitacoraAttachmentMetadata } from "./bitacoraRules";

// Helper to check authentication
async function getUserIdentity(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

async function assertProjectAccess(
  ctx: QueryCtx | MutationCtx,
  proyecto: Id<"desarrollos">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const project = await ctx.db.get(proyecto);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("Unauthorized: Project access required");
  }
  return user;
}

async function assertProjectAdmin(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
) {
  const user = await assertProjectAccess(ctx, proyecto);
  if (!hasAdminAccess(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
  return user;
}

async function validateStoredFiles(
  ctx: MutationCtx,
  storageIds: Id<"_storage">[] | undefined,
  kind: "photo" | "document",
) {
  for (const storageId of storageIds ?? []) {
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) throw new Error("Uploaded file not found");
    const mime = metadata.contentType ?? "";
    const validation = validateBitacoraAttachmentMetadata(kind, metadata.size, mime);
    if (validation) throw new Error(validation);
  }
}

async function bumpSyncVersion(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
) {
  const state = await ctx.db
    .query("bitacora_sync_state")
    .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto))
    .unique();
  const version = (state?.version ?? 0) + 1;
  if (state) {
    await ctx.db.patch(state._id, { version, updated_at: Date.now() });
  } else {
    await ctx.db.insert("bitacora_sync_state", {
      proyecto,
      version,
      updated_at: Date.now(),
    });
  }
  return version;
}

function isRequestedMonth(fecha: string, month: number, year: number) {
  const match = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return Boolean(match && Number(match[2]) === month && Number(match[3]) === year);
}

async function touchLog(ctx: MutationCtx, logId: Id<"bitacora">, clerkId: string) {
  const log = await ctx.db.get(logId);
  if (!log) return;
  const syncVersion = await bumpSyncVersion(ctx, log.proyecto);
  await ctx.db.patch(logId, {
    revision: (log.revision ?? 1) + 1,
    sync_version: syncVersion,
    updated_at: Date.now(),
    updated_by: clerkId,
    client_id: log.client_id ?? `legacy:${log._id}`,
  });
  await ctx.db.insert("bitacora_sync_changes", {
    proyecto: log.proyecto,
    sync_version: syncVersion,
    log_id: logId,
    client_id: log.client_id ?? `legacy:${log._id}`,
    operation: "attachment",
    revision: (log.revision ?? 1) + 1,
    created_at: Date.now(),
  });
}

// Create a new bitacora entry
export const createLogEntry = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    categoria: v.string(), // Estructura, Instalaciones, Acabados, Seguridad, Generales
    partida_id: v.id("partidas"), // Level 1 partida (required)
    familias_tags: v.array(v.string()), // Level 2 familia tags
    responsable: v.string(),
    fecha: v.string(), // DD/MM/YYYY or "DD Mes, YYYY"
    avance_dia: v.string(), // Daily progress notes
    comentarios: v.optional(v.string()), // Retos / Incidencias
    status: v.optional(v.string()), // "Sin problemas", "Con retrasos", etc.
    imagenes: v.optional(v.array(v.id("_storage"))), // Array of storage IDs for photos
    imagenesDescripciones: v.optional(v.array(v.string())), // Descriptions for each image (same order as imagenes)
    documentos: v.optional(v.array(v.id("_storage"))), // Array of storage IDs for documents
    documentosNombres: v.optional(v.array(v.string())), // Names for each document (same order as documentos)
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    if (!canCreateBitacora(user.role)) throw new Error("Unauthorized: Bitácora create access required");
    const project = await ctx.db.get(args.proyecto);
    if (!project || !canUserAccessDesarrollo(user, project)) {
      throw new Error("Unauthorized: Project access required");
    }
    const partidaForProject = await ctx.db.get(args.partida_id);
    if (
      !partidaForProject ||
      partidaForProject.proyecto !== args.proyecto ||
      partidaForProject.nivel !== 1
    ) {
      throw new Error("Invalid partida for project");
    }
    await validateStoredFiles(ctx, args.imagenes, "photo");
    await validateStoredFiles(ctx, args.documentos, "document");
    const syncVersion = await bumpSyncVersion(ctx, args.proyecto);
    const now = Date.now();

    // Create main bitacora entry
    const logId = await ctx.db.insert("bitacora", {
      proyecto: args.proyecto,
      categoria: args.categoria,
      partida_id: args.partida_id,
      familias_tags: args.familias_tags,
      responsable: args.responsable,
      fecha: args.fecha,
      avance_dia: args.avance_dia,
      comentarios: args.comentarios,
      status: args.status || "Sin problemas",
      uploaded_at: now,
      revision: 1,
      sync_version: syncVersion,
      updated_at: now,
      created_by: user.clerkId,
      updated_by: user.clerkId,
    });
    await ctx.db.patch(logId, { client_id: `legacy:${logId}` });
    await ctx.db.insert("bitacora_sync_changes", {
      proyecto: args.proyecto,
      sync_version: syncVersion,
      log_id: logId,
      client_id: `legacy:${logId}`,
      operation: "create",
      revision: 1,
      created_at: now,
    });

    // If there are images, create document entries for each
    if (args.imagenes && args.imagenes.length > 0) {
      // Get partida name for photo naming
      const partida = await ctx.db.get(args.partida_id);
      const partidaNombre = partida?.nombre || "Bitácora";
      
      // Get current user for photo comments
      const identity = await ctx.auth.getUserIdentity();
      let userId: Id<"users"> | null = null;
      let userName = "Sistema";
      
      if (identity) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .first();
        if (user) {
          userId = user._id;
          userName = user.name;
        }
      }
      
      for (let i = 0; i < args.imagenes.length; i++) {
        const storageId = args.imagenes[i];
        const descripcion = args.imagenesDescripciones?.[i] || "";
        
        // Create the documento entry
        const docId = await ctx.db.insert("documentos", {
          nombre: `${partidaNombre} - Foto`,
          descripcion: descripcion,
          type: "bitacora_foto",
          storage_id: storageId,
          proyecto: args.proyecto,
          bitacora_id: logId,
          uploaded_at: Date.now(),
        });
        
        // If there's a description and we have a user, also create a photo comment
        if (descripcion && descripcion.trim() !== "" && userId) {
          await ctx.db.insert("photo_comments", {
            photo_id: docId,
            user_id: userId,
            user_name: userName,
            comment: descripcion,
            created_at: Date.now(),
          });
        }
      }
    }
    
    // If there are documents, create document entries for each
    if (args.documentos && args.documentos.length > 0) {
      for (let i = 0; i < args.documentos.length; i++) {
        const storageId = args.documentos[i];
        const nombre = args.documentosNombres?.[i] || `Documento ${i + 1}`;
        
        await ctx.db.insert("documentos", {
          nombre: nombre,
          descripcion: "",
          type: "bitacora_documento",
          storage_id: storageId,
          proyecto: args.proyecto,
          bitacora_id: logId,
          uploaded_at: Date.now(),
        });
      }
    }

    return logId;
  },
});

// Get all bitacora entries for a project
export const getLogEntriesByProject = query({
  args: {
    proyecto: v.id("desarrollos"),
    partida_id: v.optional(v.id("partidas")), // Filter by partida
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto);

    const logsPage = args.partida_id
      ? await ctx.db
        .query("bitacora")
        .withIndex("by_proyecto_partida", (q) =>
          q.eq("proyecto", args.proyecto).eq("partida_id", args.partida_id!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("bitacora")
        .withIndex("by_proyecto_uploaded", (q) => q.eq("proyecto", args.proyecto))
        .order("desc")
        .paginate(args.paginationOpts);

    const partidaById = new Map(
      await Promise.all(
        Array.from(new Set(logsPage.page.map((log) => log.partida_id))).map(
          async (partidaId) => [partidaId, await ctx.db.get(partidaId)] as const
        )
      )
    );

    // Enrich with partida info, photos, and documents
    const enrichedLogs = await Promise.all(logsPage.page.filter((log) => !log.deleted_at).map(async (log) => {
      // Get partida info
      const partida = partidaById.get(log.partida_id);
      const partidaNombre = partida?.nombre || "General";
      
      // Fetch all linked documents (photos and files)
      const allDocs = (await ctx.db
        .query("documentos")
        .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", log._id as Id<"bitacora">))
        .collect()).filter((document) => !document.deleted_at);
      
      // Separate photos from documents
      const photos = allDocs.filter(d => d.type === "bitacora_foto");
      const docs = allDocs.filter(d => d.type === "bitacora_documento");

      // Generate URLs for photos with storage_id
      const fotosWithUrls = await Promise.all(
        photos.map(async (foto) => {
          if (foto.storage_id) {
            const url = await ctx.storage.getUrl(foto.storage_id);
            return { ...foto, url };
          }
          return { ...foto, url: null };
        })
      );
      
      // Generate URLs for documents with storage_id
      const docsWithUrls = await Promise.all(
        docs.map(async (doc) => {
          if (doc.storage_id) {
            const url = await ctx.storage.getUrl(doc.storage_id);
            return { ...doc, url };
          }
          return { ...doc, url: null };
        })
      );

      return {
        ...log,
        departamento: partidaNombre,
        fotos: fotosWithUrls,
        documentos: docsWithUrls,
      };
    }));

    return {
      ...logsPage,
      page: enrichedLogs,
    };
  },
});

// Get bitacora entry by ID with photos and documents
export const getLogEntryById = query({
  args: {
    logId: v.id("bitacora"),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) {
      // Return null instead of throwing so the client doesn't crash when a log
      // was deleted or the user lost access.
      return null;
    }
    await assertProjectAccess(ctx, log.proyecto);
    if (log.deleted_at) return null;

    // Get partida info
    const partida = await ctx.db.get(log.partida_id);
    const partidaNombre = partida?.nombre || "General";

    // Get all associated documents (photos and files)
    const allDocs = (await ctx.db
      .query("documentos")
      .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", log._id as Id<"bitacora">))
      .collect()).filter((document) => !document.deleted_at);
    
    // Separate photos from documents
    const photos = allDocs.filter(d => d.type === "bitacora_foto");
    const docs = allDocs.filter(d => d.type === "bitacora_documento");

    // Generate URLs for photos with storage_id
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        if (photo.storage_id) {
          const url = await ctx.storage.getUrl(photo.storage_id);
          return { ...photo, url };
        }
        return { ...photo, url: null };
      })
    );
    
    // Generate URLs for documents with storage_id
    const docsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        if (doc.storage_id) {
          const url = await ctx.storage.getUrl(doc.storage_id);
          return { ...doc, url };
        }
        return { ...doc, url: null };
      })
    );

    return {
      ...log,
      departamento: partidaNombre,
      fotos: photosWithUrls,
      documentos: docsWithUrls,
    };
  },
});

// Get bitacora entries grouped by date for calendar view
export const getLogsByDateRange = query({
  args: {
    proyecto: v.id("desarrollos"),
    month: v.number(), // 1-12
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto);

    const logs = await ctx.db
      .query("bitacora")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    // Group by date
    const logsByDate: Record<string, typeof logs> = {};
    
    for (const log of logs.filter((item) => !item.deleted_at && isRequestedMonth(item.fecha, args.month, args.year))) {
      const fecha = log.fecha; // DD/MM/YYYY or "DD Mes, YYYY"
      
      if (!logsByDate[fecha]) {
        logsByDate[fecha] = [];
      }
      
      // Get partida info
      const partida = await ctx.db.get(log.partida_id);
      
      logsByDate[fecha].push({
        ...log,
        departamento: partida?.nombre || "General",
      } as typeof log);
    }

    return logsByDate;
  },
});

// Update a bitacora entry
export const updateLogEntry = mutation({
  args: {
    logId: v.id("bitacora"),
    categoria: v.optional(v.string()),
    partida_id: v.optional(v.id("partidas")),
    familias_tags: v.optional(v.array(v.string())),
    responsable: v.optional(v.string()),
    fecha: v.optional(v.string()),
    avance_dia: v.optional(v.string()),
    comentarios: v.optional(v.string()),
    status: v.optional(v.string()),
    imagenes: v.optional(v.array(v.id("_storage"))), // New images to add
    imagenesDescripciones: v.optional(v.array(v.string())), // Descriptions for each new image
    documentos: v.optional(v.array(v.id("_storage"))), // New documents to add
    documentosNombres: v.optional(v.array(v.string())), // Names for each new document
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log entry not found");
    }
    const user = await assertProjectAdmin(ctx, log.proyecto);
    if (log.deleted_at) throw new Error("Log entry not found");
    if (args.partida_id !== undefined) {
      const partida = await ctx.db.get(args.partida_id);
      if (!partida || partida.proyecto !== log.proyecto || partida.nivel !== 1) {
        throw new Error("Invalid partida for project");
      }
    }
    await validateStoredFiles(ctx, args.imagenes, "photo");
    await validateStoredFiles(ctx, args.documentos, "document");
    const syncVersion = await bumpSyncVersion(ctx, log.proyecto);

    // Build update object with only provided fields
    const updates: Partial<typeof log> = {};
    if (args.categoria !== undefined) updates.categoria = args.categoria;
    if (args.partida_id !== undefined) updates.partida_id = args.partida_id;
    if (args.familias_tags !== undefined) updates.familias_tags = args.familias_tags;
    if (args.responsable !== undefined) updates.responsable = args.responsable;
    if (args.fecha !== undefined) updates.fecha = args.fecha;
    if (args.avance_dia !== undefined) updates.avance_dia = args.avance_dia;
    if (args.comentarios !== undefined) updates.comentarios = args.comentarios;
    if (args.status !== undefined) updates.status = args.status;
    updates.revision = (log.revision ?? 1) + 1;
    updates.sync_version = syncVersion;
    updates.updated_at = Date.now();
    updates.updated_by = user.clerkId;
    updates.client_id = log.client_id ?? `legacy:${log._id}`;

    await ctx.db.patch(args.logId, updates);
    await ctx.db.insert("bitacora_sync_changes", {
      proyecto: log.proyecto,
      sync_version: syncVersion,
      log_id: log._id,
      client_id: log.client_id ?? `legacy:${log._id}`,
      operation: "update",
      revision: (log.revision ?? 1) + 1,
      created_at: Date.now(),
    });
    
    // Add new images if provided
    if (args.imagenes && args.imagenes.length > 0) {
      // Get current user for photo comments
      const identity = await ctx.auth.getUserIdentity();
      let userId: Id<"users"> | null = null;
      let userName = "Sistema";
      
      if (identity) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .first();
        if (user) {
          userId = user._id;
          userName = user.name;
        }
      }
      
      for (let i = 0; i < args.imagenes.length; i++) {
        const storageId = args.imagenes[i];
        const descripcion = args.imagenesDescripciones?.[i] || "";
        
        // Create the documento entry
        const docId = await ctx.db.insert("documentos", {
          nombre: `foto_${Date.now()}`,
          descripcion: descripcion,
          type: "bitacora_foto",
          storage_id: storageId,
          proyecto: log.proyecto,
          bitacora_id: args.logId,
          uploaded_at: Date.now(),
        });
        
        // If there's a description and we have a user, also create a photo comment
        if (descripcion && descripcion.trim() !== "" && userId) {
          await ctx.db.insert("photo_comments", {
            photo_id: docId,
            user_id: userId,
            user_name: userName,
            comment: descripcion,
            created_at: Date.now(),
          });
        }
      }
    }
    
    // Add new documents if provided
    if (args.documentos && args.documentos.length > 0) {
      for (let i = 0; i < args.documentos.length; i++) {
        const storageId = args.documentos[i];
        const nombre = args.documentosNombres?.[i] || `Documento ${i + 1}`;
        
        await ctx.db.insert("documentos", {
          nombre: nombre,
          descripcion: "",
          type: "bitacora_documento",
          storage_id: storageId,
          proyecto: log.proyecto,
          bitacora_id: args.logId,
          uploaded_at: Date.now(),
        });
      }
    }

    return args.logId;
  },
});

// Delete a bitacora entry
export const deleteLogEntry = mutation({
  args: {
    logId: v.id("bitacora"),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log entry not found");
    }
    const user = await assertProjectAdmin(ctx, log.proyecto);
    const syncVersion = await bumpSyncVersion(ctx, log.proyecto);

    // Delete associated photos
    const photos = await ctx.db
      .query("documentos")
      .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", args.logId as Id<"bitacora">))
      .collect();
    
    for (const photo of photos) {
      if (photo.storage_id) await ctx.storage.delete(photo.storage_id);
      await ctx.db.delete(photo._id);
    }

    // Keep a tombstone so stale offline clients cannot resurrect the entry.
    await ctx.db.patch(args.logId, {
      deleted_at: Date.now(),
      revision: (log.revision ?? 1) + 1,
      sync_version: syncVersion,
      updated_at: Date.now(),
      updated_by: user.clerkId,
      client_id: log.client_id ?? `legacy:${log._id}`,
    });
    await ctx.db.insert("bitacora_sync_changes", {
      proyecto: log.proyecto,
      sync_version: syncVersion,
      log_id: log._id,
      client_id: log.client_id ?? `legacy:${log._id}`,
      operation: "delete",
      revision: (log.revision ?? 1) + 1,
      created_at: Date.now(),
    });

    return args.logId;
  },
});

// Delete a single photo from a bitacora entry
export const deletePhoto = mutation({
  args: {
    photoId: v.id("documentos"),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }
    if (!photo.proyecto) throw new Error("Photo has no project");
    const user = await assertProjectAdmin(ctx, photo.proyecto);
    if (!photo.bitacora_id) throw new Error("Photo has no Bitácora entry");
    const parentLog = await ctx.db.get(photo.bitacora_id);
    if (!parentLog || !("avance_dia" in parentLog)) throw new Error("Invalid Bitácora entry");

    // Delete the storage file
    if (photo.storage_id) {
      await ctx.storage.delete(photo.storage_id);
    }

    // Delete the document entry
    await ctx.db.delete(args.photoId);
    await touchLog(ctx, parentLog._id, user.clerkId);

    return args.photoId;
  },
});

// Update photo comment (legacy - updates the single comment field on documentos)
export const updatePhotoComment = mutation({
  args: {
    photoId: v.id("documentos"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }

    if (!photo.proyecto || !photo.bitacora_id) throw new Error("Photo has no project");
    const parentLog = await ctx.db.get(photo.bitacora_id);
    if (!parentLog || !("avance_dia" in parentLog)) throw new Error("Invalid Bitácora entry");
    const user = await assertProjectAdmin(ctx, photo.proyecto);

    await ctx.db.patch(args.photoId, {
      comment: args.comment,
    });
    await touchLog(ctx, parentLog._id, user.clerkId);

    return args.photoId;
  },
});

// Add a new comment to a photo
export const addPhotoComment = mutation({
  args: {
    photoId: v.id("documentos"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getUserIdentity(ctx);
    
    // Get user from database
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    if (!canCreateBitacora(user.role)) throw new Error("Unauthorized: Bitácora create access required");

    const photo = await ctx.db.get(args.photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }
    if (!photo.proyecto) throw new Error("Photo has no project");
    await assertProjectAccess(ctx, photo.proyecto);

    const commentId = await ctx.db.insert("photo_comments", {
      photo_id: args.photoId,
      user_id: user._id,
      user_name: user.name,
      comment: args.comment,
      created_at: Date.now(),
    });

    return commentId;
  },
});

// Get all comments for a photo
export const getPhotoComments = query({
  args: {
    photoId: v.id("documentos"),
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);
    const photo = await ctx.db.get(args.photoId);
    if (!photo?.proyecto) throw new Error("Photo not found");
    await assertProjectAccess(ctx, photo.proyecto);

    const comments = await ctx.db
      .query("photo_comments")
      .withIndex("by_photo", (q) => q.eq("photo_id", args.photoId))
      .collect();

    // Sort by created_at (oldest first)
    return comments.sort((a, b) => a.created_at - b.created_at);
  },
});

// Delete a photo comment
export const deletePhotoComment = mutation({
  args: {
    commentId: v.id("photo_comments"),
  },
  handler: async (ctx, args) => {
    const identity = await getUserIdentity(ctx);
    
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    // Get user to check ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (user?.role === "viewer") {
      throw new Error("Unauthorized: Viewer role is read-only");
    }
    const photo = await ctx.db.get(comment.photo_id);
    if (!photo?.proyecto) throw new Error("Photo not found");
    await assertProjectAccess(ctx, photo.proyecto);
    
    // Only allow deletion by comment owner or admin
    if (user && (comment.user_id === user._id || user.role === "admin")) {
      await ctx.db.delete(args.commentId);
      return args.commentId;
    }

    throw new Error("Not authorized to delete this comment");
  },
});

// Edit a photo comment
export const editPhotoComment = mutation({
  args: {
    commentId: v.id("photo_comments"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getUserIdentity(ctx);
    
    const existingComment = await ctx.db.get(args.commentId);
    if (!existingComment) {
      throw new Error("Comment not found");
    }

    // Get user to check ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user || user.role === "viewer") throw new Error("Unauthorized: Read-only role");
    const photo = await ctx.db.get(existingComment.photo_id);
    if (!photo?.proyecto) throw new Error("Photo not found");
    await assertProjectAccess(ctx, photo.proyecto);
    
    // Only allow editing by comment owner or admin
    if (user && (existingComment.user_id === user._id || user.role === "admin")) {
      await ctx.db.patch(args.commentId, {
        comment: args.comment,
      });
      return args.commentId;
    }

    throw new Error("Not authorized to edit this comment");
  },
});

// Get count of logs by partida for a date range
export const getLogCountsByPartida = query({
  args: {
    proyecto: v.id("desarrollos"),
    month: v.number(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto);

    const logs = await ctx.db
      .query("bitacora")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    // Count by partida and date
    const counts: Record<string, Record<string, number>> = {};

    for (const log of logs.filter((item) => !item.deleted_at && isRequestedMonth(item.fecha, args.month, args.year))) {
      const fecha = log.fecha;
      const partida = await ctx.db.get(log.partida_id);
      const partidaNombre = partida?.nombre || "General";

      if (!counts[fecha]) {
        counts[fecha] = {};
      }
      if (!counts[partidaNombre]) {
        counts[partidaNombre] = {};
      }
      
      counts[fecha][partidaNombre] = (counts[fecha][partidaNombre] || 0) + 1;
    }

    return counts;
  },
});

// Upload a photo and associate with a bitacora entry
export const uploadBitacoraPhoto = mutation({
  args: {
    bitacora_id: v.id("bitacora"),
    storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const bitacora = await ctx.db.get(args.bitacora_id);
    if (!bitacora) {
      throw new Error("Bitacora entry not found");
    }
    const user = await assertProjectAdmin(ctx, bitacora.proyecto);
    await validateStoredFiles(ctx, [args.storage_id], "photo");

    // Get partida name
    const partida = await ctx.db.get(bitacora.partida_id);
    const partidaNombre = partida?.nombre || "Bitácora";

    // Create document entry for photo
    const photoId = await ctx.db.insert("documentos", {
      nombre: `${partidaNombre} - Foto`,
      descripcion: `Foto adjunta a bitácora ${partidaNombre}`,
      type: "bitacora_foto",
      storage_id: args.storage_id,
      proyecto: bitacora.proyecto,
      bitacora_id: args.bitacora_id,
      uploaded_at: Date.now(),
    });
    await ctx.db.patch(photoId, { client_id: `legacy-document:${photoId}` });
    await touchLog(ctx, bitacora._id, user.clerkId);

    return photoId;
  },
});
