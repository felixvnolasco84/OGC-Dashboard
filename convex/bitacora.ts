import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Auth } from "convex/server";
import { Id } from "./_generated/dataModel";

// Helper to check authentication
async function getUserIdentity(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
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
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);

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
      uploaded_at: Date.now(),
    });

    // If there are images, create document entries for each
    if (args.imagenes && args.imagenes.length > 0) {
      // Get partida name for photo naming
      const partida = await ctx.db.get(args.partida_id);
      const partidaNombre = partida?.nombre || "Bitácora";
      
      for (const storageId of args.imagenes) {
        await ctx.db.insert("documentos", {
          nombre: `${partidaNombre} - Foto`,
          descripcion: `Foto adjunta a bitácora ${partidaNombre}`,
          type: "bitacora_foto",
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
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);

    let logs = await ctx.db
      .query("bitacora")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    // Filter by partida if specified
    if (args.partida_id) {
      logs = logs.filter((log) => log.partida_id === args.partida_id);
    }

    // Enrich with partida info and photos
    const enrichedLogs = await Promise.all(logs.map(async (log) => {
      // Get partida info
      const partida = await ctx.db.get(log.partida_id);
      const partidaNombre = partida?.nombre || "General";
      
      // Fetch photos linked to this log
      const fotos = await ctx.db
        .query("documentos")
        .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", log._id as Id<"bitacora">))
        .collect();

      // Generate URLs for photos with storage_id
      const fotosWithUrls = await Promise.all(
        fotos.map(async (foto) => {
          if (foto.storage_id) {
            const url = await ctx.storage.getUrl(foto.storage_id);
            return { ...foto, url };
          }
          return { ...foto, url: null };
        })
      );

      return {
        ...log,
        departamento: partidaNombre,
        fotos: fotosWithUrls,
      };
    }));

    // Sort by date (most recent first)
    return enrichedLogs.sort((a, b) => (b.uploaded_at || 0) - (a.uploaded_at || 0));
  },
});

// Get bitacora entry by ID with photos
export const getLogEntryById = query({
  args: {
    logId: v.id("bitacora"),
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);

    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log entry not found");
    }

    // Get partida info
    const partida = await ctx.db.get(log.partida_id);
    const partidaNombre = partida?.nombre || "General";

    // Get associated photos
    const photos = await ctx.db
      .query("documentos")
      .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", log._id as Id<"bitacora">))
      .collect();

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

    return {
      ...log,
      departamento: partidaNombre,
      fotos: photosWithUrls,
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
    await getUserIdentity(ctx);

    const logs = await ctx.db
      .query("bitacora")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    // Group by date
    const logsByDate: Record<string, typeof logs> = {};
    
    for (const log of logs) {
      const fecha = log.fecha; // DD/MM/YYYY or "DD Mes, YYYY"
      
      if (!logsByDate[fecha]) {
        logsByDate[fecha] = [];
      }
      
      // Get partida info
      const partida = await ctx.db.get(log.partida_id);
      
      logsByDate[fecha].push({
        ...log,
        departamento: partida?.nombre || "General",
      } as any);
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
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);

    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log entry not found");
    }

    // Build update object with only provided fields
    const updates: any = {};
    if (args.categoria !== undefined) updates.categoria = args.categoria;
    if (args.partida_id !== undefined) updates.partida_id = args.partida_id;
    if (args.familias_tags !== undefined) updates.familias_tags = args.familias_tags;
    if (args.responsable !== undefined) updates.responsable = args.responsable;
    if (args.fecha !== undefined) updates.fecha = args.fecha;
    if (args.avance_dia !== undefined) updates.avance_dia = args.avance_dia;
    if (args.comentarios !== undefined) updates.comentarios = args.comentarios;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(args.logId, updates);

    return args.logId;
  },
});

// Delete a bitacora entry
export const deleteLogEntry = mutation({
  args: {
    logId: v.id("bitacora"),
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);

    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log entry not found");
    }

    // Delete associated photos
    const photos = await ctx.db
      .query("documentos")
      .withIndex("by_bitacora_id", (q) => q.eq("bitacora_id", args.logId as any))
      .collect();
    
    for (const photo of photos) {
      await ctx.db.delete(photo._id);
    }

    // Delete the log entry
    await ctx.db.delete(args.logId);

    return args.logId;
  },
});

// Delete a single photo from a bitacora entry
export const deletePhoto = mutation({
  args: {
    photoId: v.id("documentos"),
  },
  handler: async (ctx, args) => {
    await getUserIdentity(ctx);

    const photo = await ctx.db.get(args.photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }

    // Delete the storage file
    if (photo.storage_id) {
      await ctx.storage.delete(photo.storage_id);
    }

    // Delete the document entry
    await ctx.db.delete(args.photoId);

    return args.photoId;
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
    await getUserIdentity(ctx);

    const logs = await ctx.db
      .query("bitacora")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    // Count by partida and date
    const counts: Record<string, Record<string, number>> = {};

    for (const log of logs) {
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
    await getUserIdentity(ctx);

    const bitacora = await ctx.db.get(args.bitacora_id);
    if (!bitacora) {
      throw new Error("Bitacora entry not found");
    }

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
      bitacora_id: args.bitacora_id as any,
      uploaded_at: Date.now(),
    });

    return photoId;
  },
});
