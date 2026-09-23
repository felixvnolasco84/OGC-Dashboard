import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  canUserAccessDesarrollo,
  getCurrentUserOrThrow,
  getScopedOrganizationId,
  hasAdminAccess,
} from "./permissions";
import {
  canCreateBitacora,
  classifyBitacoraRevision,
  validateBitacoraAttachmentMetadata,
} from "./bitacoraRules";

const OFFLINE_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

const logPayloadValidator = v.object({
  categoria: v.string(),
  partida_id: v.id("partidas"),
  familias_tags: v.array(v.string()),
  responsable: v.string(),
  fecha: v.string(),
  avance_dia: v.string(),
  comentarios: v.optional(v.string()),
  status: v.string(),
});

const newAttachmentValidator = v.object({
  clientId: v.string(),
  storageId: v.id("_storage"),
  kind: v.union(v.literal("photo"), v.literal("document")),
  name: v.string(),
  description: v.optional(v.string()),
});

const attachmentUpdateValidator = v.object({
  clientId: v.string(),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
});

type ProjectUser = Awaited<ReturnType<typeof getCurrentUserOrThrow>>;
type OfflineApplyResult =
  | { status: "applied"; logId: Id<"bitacora">; revision: number; syncVersion: number }
  | { status: "conflict"; reason: "changed" | "deleted"; server: Awaited<ReturnType<typeof enrichLog>> | null }
  | { status: "forbidden" | "validation_error"; message: string };

async function projectAndUser(
  ctx: QueryCtx | MutationCtx,
  proyecto: Id<"desarrollos">,
): Promise<{ project: Doc<"desarrollos">; user: ProjectUser }> {
  const user = await getCurrentUserOrThrow(ctx);
  const project = await ctx.db.get(proyecto);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("Unauthorized: Project access required");
  }
  return { project, user };
}

function canCreate(user: ProjectUser) {
  return canCreateBitacora(user.role);
}

async function validatePartida(
  ctx: QueryCtx | MutationCtx,
  partidaId: Id<"partidas">,
  proyecto: Id<"desarrollos">,
) {
  const partida = await ctx.db.get(partidaId);
  return Boolean(partida && partida.proyecto === proyecto && partida.nivel === 1);
}

async function nextSyncVersion(
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

function attachmentClientId(document: Doc<"documentos">) {
  return document.client_id ?? `legacy-document:${document._id}`;
}

async function enrichLog(
  ctx: QueryCtx | MutationCtx,
  log: Doc<"bitacora">,
) {
  const partida = await ctx.db.get(log.partida_id);
  const documents = await ctx.db
    .query("documentos")
    .withIndex("by_bitacora_id", (q) =>
      q.eq("bitacora_id", log._id as Id<"bitacora">),
    )
    .collect();

  const attachments = await Promise.all(
    documents
      .filter((document) => !document.deleted_at)
      .map(async (document) => ({
        _id: document._id,
        clientId: attachmentClientId(document),
        kind:
          document.type === "bitacora_foto"
            ? ("photo" as const)
            : ("document" as const),
        nombre: document.nombre,
        descripcion: document.descripcion,
        storage_id: document.storage_id,
        url: document.storage_id
          ? await ctx.storage.getUrl(document.storage_id)
          : null,
      })),
  );

  return {
    ...log,
    client_id: log.client_id ?? `legacy:${log._id}`,
    revision: log.revision ?? 1,
    sync_version: log.sync_version ?? 0,
    updated_at: log.updated_at ?? log.uploaded_at,
    departamento: partida?.nombre ?? "General",
    fotos: attachments.filter((item) => item.kind === "photo"),
    documentos: attachments.filter((item) => item.kind === "document"),
  };
}

async function validateAttachment(
  ctx: MutationCtx,
  attachment: {
    storageId: Id<"_storage">;
    kind: "photo" | "document";
  },
) {
  const metadata = await ctx.db.system.get(attachment.storageId);
  if (!metadata) return "El archivo subido no existe.";
  const contentType = metadata.contentType ?? "";
  return validateBitacoraAttachmentMetadata(attachment.kind, metadata.size, contentType);
}

async function validateReservedAttachment(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
  operationId: string,
  attachment: { clientId: string; storageId: Id<"_storage">; kind: "photo" | "document" },
) {
  const validation = await validateAttachment(ctx, attachment);
  if (validation) return validation;
  const reservation = await ctx.db
    .query("bitacora_upload_reservations")
    .withIndex("by_operation_attachment", (q) =>
      q.eq("operation_id", operationId).eq("attachment_id", attachment.clientId),
    )
    .unique();
  if (
    !reservation ||
    reservation.proyecto !== proyecto ||
    reservation.storage_id !== attachment.storageId
  ) {
    return "La reserva del archivo no corresponde a este proyecto u operación.";
  }
  return null;
}

async function insertAttachment(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
  logId: Id<"bitacora">,
  attachment: {
    clientId: string;
    storageId: Id<"_storage">;
    kind: "photo" | "document";
    name: string;
    description?: string;
  },
) {
  const existing = await ctx.db
    .query("documentos")
    .withIndex("by_client_id", (q) => q.eq("client_id", attachment.clientId))
    .first();
  if (existing) {
    if (existing.proyecto !== proyecto || existing.bitacora_id !== logId) {
      throw new Error("Attachment clientId already belongs to another report");
    }
    return existing._id;
  }

  return ctx.db.insert("documentos", {
    nombre: attachment.name,
    descripcion: attachment.description ?? "",
    type:
      attachment.kind === "photo"
        ? "bitacora_foto"
        : "bitacora_documento",
    storage_id: attachment.storageId,
    proyecto,
    bitacora_id: logId,
    uploaded_at: Date.now(),
    client_id: attachment.clientId,
  });
}

async function removeAttachments(
  ctx: MutationCtx,
  logId: Id<"bitacora">,
  clientIds: string[],
) {
  for (const clientId of clientIds) {
    let document = await ctx.db
      .query("documentos")
      .withIndex("by_client_id", (q) => q.eq("client_id", clientId))
      .first();
    if (!document && clientId.startsWith("legacy-document:")) {
      document = await ctx.db.get(
        clientId.slice("legacy-document:".length) as Id<"documentos">,
      );
    }
    if (!document || String(document.bitacora_id) !== String(logId)) continue;
    if (document.storage_id) await ctx.storage.delete(document.storage_id);
    await ctx.db.delete(document._id);
  }
}

async function updateAttachments(
  ctx: MutationCtx,
  logId: Id<"bitacora">,
  updates: { clientId: string; name?: string; description?: string }[],
) {
  for (const update of updates) {
    let document = await ctx.db
      .query("documentos")
      .withIndex("by_client_id", (q) => q.eq("client_id", update.clientId))
      .first();
    if (!document && update.clientId.startsWith("legacy-document:")) {
      document = await ctx.db.get(
        update.clientId.slice("legacy-document:".length) as Id<"documentos">,
      );
    }
    if (!document || String(document.bitacora_id) !== String(logId)) continue;
    await ctx.db.patch(document._id, {
      ...(update.name !== undefined ? { nombre: update.name } : {}),
      ...(update.description !== undefined
        ? { descripcion: update.description }
        : {}),
      client_id: update.clientId,
    });
  }
}

export const getOfflineBootstrap = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const { project, user } = await projectAndUser(ctx, args.proyecto);
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    const state = await ctx.db
      .query("bitacora_sync_state")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .unique();

    let assignableUsers: Array<{
      _id: Id<"users">;
      name: string;
      email: string;
    }> = [];
    if (hasAdminAccess(user)) {
      const organizationId = getScopedOrganizationId(user);
      const users = organizationId
        ? await ctx.db
          .query("users")
          .withIndex("by_organization", (q) =>
            q.eq("organization_id", organizationId),
          )
          .collect()
        : await ctx.db.query("users").collect();
      assignableUsers = users.map(({ _id, name, email }) => ({
        _id,
        name,
        email,
      }));
    }

    const verifiedAt = Date.now();
    return {
      verifiedAt,
      expiresAt: verifiedAt + OFFLINE_ACCESS_MS,
      latestVersion: state?.version ?? 0,
      user: {
        _id: user._id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
        role: user.role,
        organization_id: user.organization_id,
        allowed_desarrollos: user.allowed_desarrollos,
      },
      project,
      partidas: partidas.filter((item) => item.nivel === 1 || item.nivel === 2),
      assignableUsers,
    };
  },
});

export const pullChanges = query({
  args: {
    proyecto: v.id("desarrollos"),
    afterVersion: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await projectAndUser(ctx, args.proyecto);
    const state = await ctx.db
      .query("bitacora_sync_state")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .unique();

    // Version zero means a fresh device. Read the complete project so legacy
    // rows created before offline support are included without a risky migration.
    const page = args.afterVersion === 0
      ? await ctx.db
        .query("bitacora")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
        .order("asc")
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("bitacora")
        .withIndex("by_proyecto_sync_version", (q) =>
          q
            .eq("proyecto", args.proyecto)
            .gt("sync_version", args.afterVersion),
        )
        .order("asc")
        .paginate(args.paginationOpts);

    return {
      ...page,
      page: await Promise.all(page.page.map((log) => enrichLog(ctx, log))),
      latestVersion: state?.version ?? 0,
    };
  },
});

export const generateBitacoraUploadUrl = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    operationId: v.string(),
    attachmentId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await projectAndUser(ctx, args.proyecto);
    if (!canCreate(user)) throw new Error("Unauthorized: Read-only role");
    if (!args.operationId || !args.attachmentId) {
      throw new Error("Invalid upload reservation");
    }
    return ctx.storage.generateUploadUrl();
  },
});

export const registerBitacoraUpload = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    operationId: v.string(),
    attachmentId: v.string(),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("photo"), v.literal("document")),
  },
  handler: async (ctx, args) => {
    const { user } = await projectAndUser(ctx, args.proyecto);
    if (!canCreate(user)) throw new Error("Unauthorized: Read-only role");
    const validation = await validateAttachment(ctx, {
      storageId: args.storageId,
      kind: args.kind,
    });
    if (validation) throw new Error(validation);
    const existing = await ctx.db
      .query("bitacora_upload_reservations")
      .withIndex("by_operation_attachment", (q) =>
        q.eq("operation_id", args.operationId).eq("attachment_id", args.attachmentId),
      )
      .unique();
    if (existing) {
      if (existing.proyecto !== args.proyecto || existing.storage_id !== args.storageId) {
        throw new Error("Upload reservation mismatch");
      }
      return existing._id;
    }
    return ctx.db.insert("bitacora_upload_reservations", {
      proyecto: args.proyecto,
      operation_id: args.operationId,
      attachment_id: args.attachmentId,
      storage_id: args.storageId,
      clerk_id: user.clerkId,
      created_at: Date.now(),
    });
  },
});

export const applyOfflineOperation = mutation({
  args: {
    operationId: v.string(),
    clientId: v.string(),
    proyecto: v.id("desarrollos"),
    operation: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete"),
    ),
    baseRevision: v.number(),
    logId: v.optional(v.id("bitacora")),
    payload: v.optional(logPayloadValidator),
    addedAttachments: v.array(newAttachmentValidator),
    updatedAttachments: v.array(attachmentUpdateValidator),
    removedAttachmentClientIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<OfflineApplyResult> => {
    let access: Awaited<ReturnType<typeof projectAndUser>>;
    try {
      access = await projectAndUser(ctx, args.proyecto);
    } catch (error) {
      return {
        status: "forbidden" as const,
        message: error instanceof Error ? error.message : "Acceso denegado.",
      };
    }

    if (args.operation === "create" && !canCreate(access.user)) {
      return { status: "forbidden" as const, message: "Rol de sólo lectura." };
    }
    if (
      (args.operation === "update" || args.operation === "delete") &&
      !hasAdminAccess(access.user)
    ) {
      return {
        status: "forbidden" as const,
        message: "Sólo un administrador puede editar o eliminar reportes.",
      };
    }

    const receipt = await ctx.db
      .query("bitacora_sync_operations")
      .withIndex("by_operation_id", (q) =>
        q.eq("operation_id", args.operationId),
      )
      .first();
    if (receipt) {
      if (
        receipt.client_id !== args.clientId ||
        receipt.proyecto !== args.proyecto
      ) {
        return {
          status: "validation_error" as const,
          message: "El identificador de operación ya está en uso.",
        };
      }
      return {
        status: "applied" as const,
        logId: receipt.log_id,
        revision: receipt.revision,
        syncVersion: receipt.sync_version,
      };
    }

    let log = args.logId ? await ctx.db.get(args.logId) : null;
    if (!log) {
      log = await ctx.db
        .query("bitacora")
        .withIndex("by_client_id", (q) => q.eq("client_id", args.clientId))
        .first();
    }

    if (args.operation === "create" && log) {
      if (log.proyecto !== args.proyecto) {
        return {
          status: "validation_error" as const,
          message: "El identificador del reporte pertenece a otro proyecto.",
        };
      }
      return {
        status: "applied" as const,
        logId: log._id,
        revision: log.revision ?? 1,
        syncVersion: log.sync_version ?? 0,
      };
    }

    if (args.operation !== "create") {
      if (!log || log.proyecto !== args.proyecto) {
        return {
          status: "conflict" as const,
          reason: "deleted" as const,
          server: null,
        };
      }
      const revisionState = classifyBitacoraRevision(
        args.baseRevision,
        log.revision ?? 1,
        Boolean(log.deleted_at),
      );
      if (revisionState !== "match") {
        return {
          status: "conflict" as const,
          reason: revisionState,
          server: await enrichLog(ctx, log),
        };
      }
    }

    if (args.operation !== "delete") {
      if (!args.payload) {
        return {
          status: "validation_error" as const,
          message: "Faltan los datos del reporte.",
        };
      }
      if (!args.payload.avance_dia.trim() || !args.payload.responsable.trim()) {
        return {
          status: "validation_error" as const,
          message: "Responsable y avance del día son obligatorios.",
        };
      }
      if (!await validatePartida(ctx, args.payload.partida_id, args.proyecto)) {
        return {
          status: "validation_error" as const,
          message: "La partida no pertenece al proyecto o no es de nivel 1.",
        };
      }
      for (const attachment of args.addedAttachments) {
        const validationError = await validateReservedAttachment(
          ctx,
          args.proyecto,
          args.operationId,
          attachment,
        );
        if (validationError) {
          return { status: "validation_error" as const, message: validationError };
        }
      }
    }

    const syncVersion = await nextSyncVersion(ctx, args.proyecto);
    const now = Date.now();
    let logId: Id<"bitacora">;
    let revision: number;

    if (args.operation === "create") {
      const payload = args.payload!;
      revision = 1;
      logId = await ctx.db.insert("bitacora", {
        proyecto: args.proyecto,
        categoria: payload.categoria,
        partida_id: payload.partida_id,
        familias_tags: payload.familias_tags,
        responsable: payload.responsable,
        fecha: payload.fecha,
        avance_dia: payload.avance_dia,
        comentarios: payload.comentarios,
        status: payload.status,
        uploaded_at: now,
        client_id: args.clientId,
        revision,
        sync_version: syncVersion,
        updated_at: now,
        created_by: access.user.clerkId,
        updated_by: access.user.clerkId,
      });
    } else {
      logId = log!._id;
      revision = (log!.revision ?? 1) + 1;
      if (args.operation === "delete") {
        await removeAttachments(
          ctx,
          logId,
          (await ctx.db
            .query("documentos")
            .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", logId))
            .collect()).map(attachmentClientId),
        );
        await ctx.db.patch(logId, {
          deleted_at: now,
          revision,
          sync_version: syncVersion,
          updated_at: now,
          updated_by: access.user.clerkId,
          client_id: args.clientId,
        });
      } else {
        const payload = args.payload!;
        await ctx.db.patch(logId, {
          categoria: payload.categoria,
          partida_id: payload.partida_id,
          familias_tags: payload.familias_tags,
          responsable: payload.responsable,
          fecha: payload.fecha,
          avance_dia: payload.avance_dia,
          comentarios: payload.comentarios,
          status: payload.status,
          revision,
          sync_version: syncVersion,
          updated_at: now,
          updated_by: access.user.clerkId,
          client_id: args.clientId,
        });
      }
    }

    if (args.operation !== "delete") {
      await removeAttachments(ctx, logId, args.removedAttachmentClientIds);
      await updateAttachments(ctx, logId, args.updatedAttachments);
      for (const attachment of args.addedAttachments) {
        await insertAttachment(ctx, args.proyecto, logId, attachment);
        const reservation = await ctx.db
          .query("bitacora_upload_reservations")
          .withIndex("by_operation_attachment", (q) =>
            q.eq("operation_id", args.operationId).eq("attachment_id", attachment.clientId),
          )
          .unique();
        if (reservation) await ctx.db.delete(reservation._id);
      }
    }

    await ctx.db.insert("bitacora_sync_changes", {
      proyecto: args.proyecto,
      sync_version: syncVersion,
      log_id: logId,
      client_id: args.clientId,
      operation: args.operation,
      revision,
      created_at: now,
    });

    await ctx.db.insert("bitacora_sync_operations", {
      operation_id: args.operationId,
      client_id: args.clientId,
      proyecto: args.proyecto,
      log_id: logId,
      operation: args.operation,
      revision,
      sync_version: syncVersion,
      clerk_id: access.user.clerkId,
      created_at: now,
    });

    return {
      status: "applied" as const,
      logId,
      revision,
      syncVersion,
    };
  },
});

export const cleanupAbandonedUploads = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    olderThan: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await projectAndUser(ctx, args.proyecto);
    if (!hasAdminAccess(user)) throw new Error("Unauthorized: Admin required");
    const cutoff = args.olderThan ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const reservations = await ctx.db
      .query("bitacora_upload_reservations")
      .withIndex("by_proyecto_created", (q) =>
        q.eq("proyecto", args.proyecto).lt("created_at", cutoff),
      )
      .take(Math.min(Math.max(args.limit ?? 50, 1), 100));
    for (const reservation of reservations) {
      await ctx.storage.delete(reservation.storage_id);
      await ctx.db.delete(reservation._id);
    }
    return { deleted: reservations.length };
  },
});

export const cleanupSyncHistory = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    keepAfterVersion: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await projectAndUser(ctx, args.proyecto);
    if (!hasAdminAccess(user)) throw new Error("Unauthorized: Admin required");
    const rows = await ctx.db
      .query("bitacora_sync_changes")
      .withIndex("by_proyecto_version", (q) =>
        q.eq("proyecto", args.proyecto).lt("sync_version", args.keepAfterVersion),
      )
      .take(Math.min(Math.max(args.limit ?? 100, 1), 200));
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});

// Idempotent compatibility migration. Fresh clients can work before it runs,
// but backfilling makes subsequent incremental pulls cheaper.
export const backfillOfflineMetadata = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await projectAndUser(ctx, args.proyecto);
    if (!hasAdminAccess(user)) throw new Error("Unauthorized: Admin required");
    const page = await ctx.db
      .query("bitacora")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .paginate(args.paginationOpts);
    let updated = 0;
    for (const log of page.page) {
      if (!log.client_id || !log.revision || log.sync_version === undefined) {
        const syncVersion = await nextSyncVersion(ctx, args.proyecto);
        await ctx.db.patch(log._id, {
          client_id: log.client_id ?? `legacy:${log._id}`,
          revision: log.revision ?? 1,
          sync_version: log.sync_version ?? syncVersion,
          updated_at: log.updated_at ?? log.uploaded_at,
        });
        updated += 1;
      }
      const documents = await ctx.db
        .query("documentos")
        .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", log._id))
        .collect();
      for (const document of documents) {
        if (!document.client_id) {
          await ctx.db.patch(document._id, {
            client_id: `legacy-document:${document._id}`,
          });
        }
      }
    }
    return {
      updated,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
