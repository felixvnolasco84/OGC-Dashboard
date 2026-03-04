import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================================
// SCHEDULING (programa_obra table) - per nivel 1 partida
// ============================================================

// Get all schedules for a project
export const getSchedulesByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
  },
});

// Get schedule for a specific partida
export const getScheduleByPartida = query({
  args: {
    partida_id: v.id("partidas"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .first();
  },
});

// Upsert schedule for a nivel 1 partida
export const upsertSchedule = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"),
    fecha_inicio: v.optional(v.string()),
    fecha_fin: v.optional(v.string()),
    anticipo_fecha: v.optional(v.string()),
    anticipo_porcentaje: v.optional(v.number()),
    suministro_fecha: v.optional(v.string()),
    finiquito_fecha: v.optional(v.string()),
    finiquito_porcentaje: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("programa_obra")
      .withIndex("by_proyecto_partida", (q) =>
        q.eq("proyecto", args.proyecto).eq("partida_id", args.partida_id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fecha_inicio: args.fecha_inicio,
        fecha_fin: args.fecha_fin,
        anticipo_fecha: args.anticipo_fecha,
        anticipo_porcentaje: args.anticipo_porcentaje,
        suministro_fecha: args.suministro_fecha,
        finiquito_fecha: args.finiquito_fecha,
        finiquito_porcentaje: args.finiquito_porcentaje,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("programa_obra", {
        proyecto: args.proyecto,
        partida_id: args.partida_id,
        fecha_inicio: args.fecha_inicio,
        fecha_fin: args.fecha_fin,
        anticipo_fecha: args.anticipo_fecha,
        anticipo_porcentaje: args.anticipo_porcentaje,
        suministro_fecha: args.suministro_fecha,
        finiquito_fecha: args.finiquito_fecha,
        finiquito_porcentaje: args.finiquito_porcentaje,
      });
    }
  },
});

// Upsert schedule for a nivel 2 familia with parent date validation
export const upsertFamiliaSchedule = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"),
    parent_partida_id: v.id("partidas"),
    fecha_inicio: v.optional(v.string()),
    fecha_fin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parseDateStr = (s: string): Date => {
      if (s.includes("/")) {
        const [d, m, y] = s.split("/").map(Number);
        return new Date(y, m - 1, d);
      }
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    };

    // Validate dates are within parent range
    const parentSchedule = await ctx.db
      .query("programa_obra")
      .withIndex("by_proyecto_partida", (q) =>
        q.eq("proyecto", args.proyecto).eq("partida_id", args.parent_partida_id)
      )
      .first();

    if (parentSchedule) {
      if (parentSchedule.fecha_inicio && args.fecha_inicio) {
        const parentStart = parseDateStr(parentSchedule.fecha_inicio);
        const familiaStart = parseDateStr(args.fecha_inicio);
        if (familiaStart < parentStart) {
          throw new Error(
            "Fecha inicio de familia no puede ser anterior a la fecha inicio de la partida"
          );
        }
      }
      if (parentSchedule.fecha_fin && args.fecha_fin) {
        const parentEnd = parseDateStr(parentSchedule.fecha_fin);
        const familiaEnd = parseDateStr(args.fecha_fin);
        if (familiaEnd > parentEnd) {
          throw new Error(
            "Fecha fin de familia no puede ser posterior a la fecha fin de la partida"
          );
        }
      }
    }

    const existing = await ctx.db
      .query("programa_obra")
      .withIndex("by_proyecto_partida", (q) =>
        q.eq("proyecto", args.proyecto).eq("partida_id", args.partida_id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fecha_inicio: args.fecha_inicio,
        fecha_fin: args.fecha_fin,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("programa_obra", {
        proyecto: args.proyecto,
        partida_id: args.partida_id,
        fecha_inicio: args.fecha_inicio,
        fecha_fin: args.fecha_fin,
      });
    }
  },
});

// ============================================================
// PONDERACIÓN (programa_obra_ponderacion table)
// ============================================================

// Get all ponderaciones for a project
export const getPonderacionesByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra_ponderacion")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
  },
});

// Get ponderaciones for children of a specific nivel 1 partida
export const getPonderacionesByParent = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    parent_partida_nombre: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra_ponderacion")
      .withIndex("by_proyecto_parent", (q) =>
        q.eq("proyecto", args.proyecto_id).eq("parent_partida_nombre", args.parent_partida_nombre)
      )
      .collect();
  },
});

// Upsert ponderación for a familia/sub-partida
export const upsertPonderacion = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"),
    parent_partida_nombre: v.string(),
    peso: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("programa_obra_ponderacion")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { peso: args.peso });
      return existing._id;
    } else {
      return await ctx.db.insert("programa_obra_ponderacion", {
        proyecto: args.proyecto,
        partida_id: args.partida_id,
        parent_partida_nombre: args.parent_partida_nombre,
        peso: args.peso,
      });
    }
  },
});

// ============================================================
// AVANCE REAL (avance_real table) - per nivel 3 sub-partida
// ============================================================

// Get all avance real entries for a project
export const getAvanceRealByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("avance_real")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
  },
});

// Get avance real for a specific partida
export const getAvanceRealByPartida = query({
  args: {
    partida_id: v.id("partidas"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("avance_real")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .first();
  },
});

// Upsert avance real for a sub-partida
export const upsertAvanceReal = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"),
    porcentaje: v.number(),
    fecha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("avance_real")
      .withIndex("by_proyecto_partida", (q) =>
        q.eq("proyecto", args.proyecto).eq("partida_id", args.partida_id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        porcentaje: args.porcentaje,
        fecha: args.fecha,
        updated_at: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("avance_real", {
        proyecto: args.proyecto,
        partida_id: args.partida_id,
        porcentaje: args.porcentaje,
        fecha: args.fecha,
        updated_at: Date.now(),
      });
    }
  },
});

// ============================================================
// ADD FAMILIA / SUB-PARTIDA from Programa de Obra
// ============================================================

// Add a new familia (nivel 2) under a nivel 1 partida
export const addFamilia = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    partida_nombre: v.string(), // Parent nivel 1 partida name
    familia: v.string(), // New familia name
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("partidas", {
      nivel: 2,
      nombre: args.partida_nombre,
      familia: args.familia,
      sub_partida: "",
      partida_nombre: args.partida_nombre,
      unidad: "global",
      cantidad: 0,
      precio_unitario: 0,
      presupuesto_original: 0,
      presupuesto_aprobado: 0,
      pagado: 0,
      por_gastar: 0,
      archivo_origen: "programa_obra",
      proyecto: args.proyecto,
    });
  },
});

// Add a new sub-partida (nivel 3) under a familia
export const addSubPartida = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    partida_nombre: v.string(), // Parent nivel 1 partida name
    familia: v.string(), // Parent familia name
    sub_partida: v.string(), // New sub-partida name
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("partidas", {
      nivel: 3,
      nombre: args.partida_nombre,
      familia: args.familia,
      sub_partida: args.sub_partida,
      partida_nombre: args.partida_nombre,
      unidad: "global",
      cantidad: 0,
      precio_unitario: 0,
      presupuesto_original: 0,
      presupuesto_aprobado: 0,
      pagado: 0,
      por_gastar: 0,
      archivo_origen: "programa_obra",
      proyecto: args.proyecto,
    });
  },
});

// ============================================================
// AVANCE on DETALLE (programa_obra_detalle.avance_porcentaje)
// ============================================================

// Update avance_porcentaje on a programa_obra_detalle record
export const updateDetalleAvance = mutation({
  args: {
    detalle_id: v.id("programa_obra_detalle"),
    avance_porcentaje: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.detalle_id, {
      avance_porcentaje: args.avance_porcentaje,
    });
    return { success: true };
  },
});

// Update peso on a programa_obra record (level 0 partida)
export const updateSchedulePeso = mutation({
  args: {
    schedule_id: v.id("programa_obra"),
    peso: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.schedule_id, { peso: args.peso });
    return { success: true };
  },
});

// Update peso on a programa_obra_detalle record (level 1 familia)
export const updateDetallePeso = mutation({
  args: {
    detalle_id: v.id("programa_obra_detalle"),
    peso: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.detalle_id, { peso: args.peso });
    return { success: true };
  },
});

// Update dates + time extension on a programa_obra_detalle record
export const updateDetalleSchedule = mutation({
  args: {
    detalle_id: v.id("programa_obra_detalle"),
    fecha_inicio: v.optional(v.string()),
    fecha_fin: v.optional(v.string()),
    tiempo_extra_cantidad: v.optional(v.number()),
    tiempo_extra_unidad: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.detalle_id, {
      fecha_inicio: args.fecha_inicio,
      fecha_fin: args.fecha_fin,
      tiempo_extra_cantidad: args.tiempo_extra_cantidad,
      tiempo_extra_unidad: args.tiempo_extra_unidad,
    });
    return { success: true };
  },
});

// ============================================================
// DETALLE queries (programa_obra_detalle table)
// ============================================================

// Get all detalle records for a project
export const getDetallesByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra_detalle")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
  },
});

// Get detalle records for a specific parent programa_obra record
export const getDetallesByProgramaObra = query({
  args: {
    programa_obra_id: v.id("programa_obra"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra_detalle")
      .withIndex("by_programa_obra", (q) =>
        q.eq("programa_obra_id", args.programa_obra_id)
      )
      .collect();
  },
});

// ============================================================
// BULK UPSERT FROM EXCEL
// ============================================================

const excelRowValidator = v.object({
  nivel: v.number(),
  partida: v.string(),
  familia: v.optional(v.string()),
  subpartida: v.optional(v.string()),
  fecha_inicio: v.optional(v.string()),
  fecha_fin: v.optional(v.string()),
  anticipo_fecha: v.optional(v.string()),
  anticipo_porcentaje: v.optional(v.number()),
  suministro_fecha: v.optional(v.string()),
  finiquito_fecha: v.optional(v.string()),
  finiquito_porcentaje: v.optional(v.number()),
  peso: v.optional(v.number()),
});

export const bulkUpsertFromExcel = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    rows: v.array(excelRowValidator),
  },
  handler: async (ctx, args) => {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    // Granular tracking
    let partidasCreated = 0;
    let partidasUpdated = 0;
    let partidasSkipped = 0;
    let familiasCreated = 0;
    let familiasUpdated = 0;
    let familiasSkipped = 0;

    // Group rows by partida name for efficient processing
    const nivel1Rows = args.rows.filter((r) => r.nivel === 1);
    const childRows = args.rows.filter((r) => r.nivel === 2 || r.nivel === 3);

    // Reset orden on all existing records so only items in this upload are shown
    const existingSchedules = await ctx.db
      .query("programa_obra")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    for (const s of existingSchedules) {
      await ctx.db.patch(s._id, { orden: undefined });
    }

    const existingDetalles = await ctx.db
      .query("programa_obra_detalle")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    for (const d of existingDetalles) {
      await ctx.db.patch(d._id, { orden: undefined });
    }

    // Cache: partida name → programa_obra _id
    const programaObraCache = new Map<string, string>();
    // Map: raw Excel name → canonical DB partida name (for consistent storage)
    const nameToCanonical = new Map<string, string>();

    // Helper: normalize a string for fuzzy comparison (trim, collapse spaces, NFC normalize, uppercase)
    const normalize = (s: string) =>
      s.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();

    // Pre-fetch all nivel 1 partidas for this project (used as fallback for fuzzy matching)
    const allNivel1Partidas = await ctx.db
      .query("partidas")
      .withIndex("by_nivel_proyecto", (q) =>
        q.eq("nivel", 1).eq("proyecto", args.proyecto)
      )
      .collect();

    // --- Process NIVEL 1 rows: upsert into programa_obra ---
    for (let i = 0; i < nivel1Rows.length; i++) {
      const row = nivel1Rows[i];
      const trimmedName = row.partida.trim();

      // 1. Try exact index match first (fast path)
      let partida = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_nombre", (q) =>
          q.eq("proyecto", args.proyecto).eq("nivel", 1).eq("nombre", trimmedName)
        )
        .first();

      // 2. Fallback: normalized comparison (handles Unicode, extra spaces, case)
      if (!partida) {
        const normalizedInput = normalize(trimmedName);
        partida = allNivel1Partidas.find(
          (p) => normalize(p.nombre) === normalizedInput
        ) ?? null;
      }

      if (!partida) {
        errors.push(`Partida "${row.partida}" not found in project`);
        partidasSkipped++;
        continue;
      }

      // Check if programa_obra record already exists
      const existing = await ctx.db
        .query("programa_obra")
        .withIndex("by_proyecto_partida", (q) =>
          q.eq("proyecto", args.proyecto).eq("partida_id", partida._id)
        )
        .first();

      const data = {
        fecha_inicio: row.fecha_inicio,
        fecha_fin: row.fecha_fin,
        anticipo_fecha: row.anticipo_fecha,
        anticipo_porcentaje: row.anticipo_porcentaje,
        suministro_fecha: row.suministro_fecha,
        finiquito_fecha: row.finiquito_fecha,
        finiquito_porcentaje: row.finiquito_porcentaje,
        peso: row.peso,
        orden: i,
      };

      // Map Excel name to canonical DB name for consistent storage
      nameToCanonical.set(row.partida, partida.nombre);
      nameToCanonical.set(trimmedName, partida.nombre);

      if (existing) {
        await ctx.db.patch(existing._id, data);
        programaObraCache.set(partida.nombre, existing._id);
        updated++;
        partidasUpdated++;
      } else {
        const id = await ctx.db.insert("programa_obra", {
          proyecto: args.proyecto,
          partida_id: partida._id,
          ...data,
        });
        programaObraCache.set(partida.nombre, id);
        created++;
        partidasCreated++;
      }
    }

    // --- Process NIVEL 2/3 rows: upsert into programa_obra_detalle ---
    for (let i = 0; i < childRows.length; i++) {
      const row = childRows[i];
      const trimmedChildPartida = row.partida.trim();
      // Resolve canonical name, then look up in cache
      const canonicalPartida = nameToCanonical.get(row.partida) ?? nameToCanonical.get(trimmedChildPartida);
      let parentId = canonicalPartida ? programaObraCache.get(canonicalPartida) : undefined;

      if (!parentId) {
        // 1. Exact index match
        let partida = await ctx.db
          .query("partidas")
          .withIndex("by_proyecto_nivel_nombre", (q) =>
            q.eq("proyecto", args.proyecto).eq("nivel", 1).eq("nombre", trimmedChildPartida)
          )
          .first();

        // 2. Fallback: normalized comparison
        if (!partida) {
          const normalizedInput = normalize(trimmedChildPartida);
          partida = allNivel1Partidas.find(
            (p) => normalize(p.nombre) === normalizedInput
          ) ?? null;
        }

        if (partida) {
          const parentSchedule = await ctx.db
            .query("programa_obra")
            .withIndex("by_proyecto_partida", (q) =>
              q.eq("proyecto", args.proyecto).eq("partida_id", partida._id)
            )
            .first();

          if (parentSchedule) {
            parentId = parentSchedule._id;
            // Store with canonical name
            nameToCanonical.set(row.partida, partida.nombre);
            nameToCanonical.set(trimmedChildPartida, partida.nombre);
            programaObraCache.set(partida.nombre, parentId);
          }
        }
      }

      if (!parentId) {
        errors.push(
          `Parent programa_obra not found for partida "${row.partida}" (nivel ${row.nivel}, familia "${row.familia || ""}")`
        );
        familiasSkipped++;
        continue;
      }

      // Use canonical partida name for consistent storage and lookup
      const resolvedPartida = nameToCanonical.get(row.partida) ?? nameToCanonical.get(trimmedChildPartida) ?? trimmedChildPartida;

      // Check if detalle already exists (match by proyecto + partida + familia + subpartida + nivel)
      let existingDetalles = await ctx.db
        .query("programa_obra_detalle")
        .withIndex("by_proyecto_partida_familia", (q) =>
          q
            .eq("proyecto", args.proyecto)
            .eq("partida", resolvedPartida)
            .eq("familia", row.familia?.trim() || "")
        )
        .collect();

      // Fallback: try raw Excel name in case old records were stored with it
      if (existingDetalles.length === 0 && resolvedPartida !== row.partida) {
        existingDetalles = await ctx.db
          .query("programa_obra_detalle")
          .withIndex("by_proyecto_partida_familia", (q) =>
            q
              .eq("proyecto", args.proyecto)
              .eq("partida", row.partida)
              .eq("familia", row.familia?.trim() || "")
          )
          .collect();
      }

      const existingDetalle = existingDetalles.find(
        (d) =>
          d.nivel === row.nivel &&
          (d.subpartida || "") === (row.subpartida || "")
      );

      const detalleData = {
        fecha_inicio: row.fecha_inicio,
        fecha_fin: row.fecha_fin,
        anticipo_fecha: row.anticipo_fecha,
        anticipo_porcentaje: row.anticipo_porcentaje,
        suministro_fecha: row.suministro_fecha,
        finiquito_fecha: row.finiquito_fecha,
        finiquito_porcentaje: row.finiquito_porcentaje,
        peso: row.peso,
        orden: i,
      };

      if (existingDetalle) {
        await ctx.db.patch(existingDetalle._id, {
          ...detalleData,
          partida: resolvedPartida,
          familia: row.familia?.trim() || "",
        });
        updated++;
        familiasUpdated++;
      } else {
        await ctx.db.insert("programa_obra_detalle", {
          proyecto: args.proyecto,
          programa_obra_id: parentId as Id<"programa_obra">,
          nivel: row.nivel,
          partida: resolvedPartida,
          familia: row.familia?.trim() || "",
          subpartida: row.subpartida?.trim(),
          ...detalleData,
        });
        created++;
        familiasCreated++;
      }
    }

    return {
      created,
      updated,
      errors,
      partidas: { created: partidasCreated, updated: partidasUpdated, skipped: partidasSkipped, total: nivel1Rows.length },
      familias: { created: familiasCreated, updated: familiasUpdated, skipped: familiasSkipped, total: childRows.length },
    };
  },
});

// ============================================================
// COMENTARIOS (programa_obra_comentarios table)
// ============================================================

// Get all comentarios for a project
export const getComentariosByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("programa_obra_comentarios")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
  },
});

// Add a comentario to a partida (level 0) or familia (level 1)
export const addComentario = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    parent_type: v.string(), // "partida" | "familia"
    parent_id: v.string(),
    comentario: v.string(),
    fecha_inicio: v.string(), // DD/MM/YYYY
    fecha_fin: v.string(), // DD/MM/YYYY
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    let userName: string | undefined;
    if (user) {
      const dbUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.subject))
        .first();
      if (dbUser) {
        userId = dbUser._id;
        userName = dbUser.name;
      }
    }
    return await ctx.db.insert("programa_obra_comentarios", {
      proyecto: args.proyecto,
      parent_type: args.parent_type,
      parent_id: args.parent_id,
      comentario: args.comentario,
      fecha_inicio: args.fecha_inicio,
      fecha_fin: args.fecha_fin,
      created_by_id: userId,
      created_by_name: userName,
      created_at: Date.now(),
    });
  },
});

// Update a comentario (text and/or dates)
export const updateComentario = mutation({
  args: {
    comentario_id: v.id("programa_obra_comentarios"),
    comentario: v.optional(v.string()),
    fecha_inicio: v.optional(v.string()),
    fecha_fin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, string> = {};
    if (args.comentario !== undefined) updates.comentario = args.comentario;
    if (args.fecha_inicio !== undefined) updates.fecha_inicio = args.fecha_inicio;
    if (args.fecha_fin !== undefined) updates.fecha_fin = args.fecha_fin;
    await ctx.db.patch(args.comentario_id, updates);
    return { success: true };
  },
});

// Delete a comentario
export const deleteComentario = mutation({
  args: {
    comentario_id: v.id("programa_obra_comentarios"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.comentario_id);
    return { success: true };
  },
});

// ============================================================
// PAYMENT DISTRIBUTION (Phase 5)
// ============================================================

// Distribute a payment amount among familias based on ponderación weights.
// If no weights are configured (all 0%), the full amount goes to the nivel 1 partida directly.
// Returns an array of { partida_id, monto } line items to be used in transaction creation.
export const distributePaymentByPonderacion = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    partida_nombre: v.string(), // Nivel 1 partida name
    monto: v.number(), // Total amount to distribute
  },
  handler: async (ctx, args) => {
    // Get ponderaciones for children of this partida
    const ponderaciones = await ctx.db
      .query("programa_obra_ponderacion")
      .withIndex("by_proyecto_parent", (q) =>
        q.eq("proyecto", args.proyecto_id).eq("parent_partida_nombre", args.partida_nombre)
      )
      .collect();

    // If no weights configured, return null to indicate direct payment
    const totalWeight = ponderaciones.reduce((s, p) => s + p.peso, 0);
    if (ponderaciones.length === 0 || totalWeight === 0) {
      return null; // Caller should assign to nivel 1 partida directly
    }

    // Distribute proportionally
    const lineItems = [];
    let distributed = 0;

    for (let i = 0; i < ponderaciones.length; i++) {
      const pond = ponderaciones[i];
      const isLast = i === ponderaciones.length - 1;

      // Last item gets the remainder to avoid floating-point rounding issues
      const amount = isLast
        ? args.monto - distributed
        : Math.round((pond.peso / totalWeight) * args.monto * 100) / 100;

      // Get the partida record to build the line item
      const partida = await ctx.db.get(pond.partida_id);
      if (partida) {
        lineItems.push({
          partida_id: partida._id,
          partida: partida.nombre,
          familia: partida.familia,
          sub_partida: partida.sub_partida,
          monto: amount,
        });
        distributed += amount;
      }
    }

    return lineItems;
  },
});
