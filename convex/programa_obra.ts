import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  assertAdmin,
  assertCanWrite,
  assertInvoiceReviewer,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
  hasInvoiceReviewAccess,
} from "./permissions";
import {
  deriveMilestoneStatus,
  getAssistedMatchMode,
  getDaysUntil,
  getExpectedMilestoneAmount,
  getMexicoCityDateKey,
  getReminderDays,
  isActionableMilestone,
  isCompleteDeliveryStatus,
  isPaidStatus,
  isPartialDeliveryStatus,
  parseProgramDateToUtcDay,
  transactionMatchesMilestone,
  validateMilestonePercentage,
  validateReminderDays,
  type ProgramaObraMilestoneKind,
} from "./programaObraMilestoneRules";

async function assertProjectAccess(
  ctx: QueryCtx | MutationCtx,
  proyectoId: Id<"desarrollos">,
) {
  if (!(await checkDesarrolloAccess(ctx, proyectoId))) {
    throw new Error("No tienes acceso a este proyecto.");
  }
}

async function assertPartidaInProject(
  ctx: QueryCtx | MutationCtx,
  partidaId: Id<"partidas">,
  proyectoId: Id<"desarrollos">,
) {
  const partida = await ctx.db.get(partidaId);
  if (!partida || partida.proyecto !== proyectoId) {
    throw new Error("La partida no pertenece al proyecto seleccionado.");
  }
  return partida;
}

// ============================================================
// SCHEDULING (programa_obra table) - per nivel 1 partida
// ============================================================

// Get all schedules for a project
export const getSchedulesByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto_id);
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
    const partida = await ctx.db.get(args.partida_id);
    if (!partida?.proyecto) return null;
    await assertProjectAccess(ctx, partida.proyecto);
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
    anticipo_recordatorio_dias: v.optional(v.number()),
    suministro_recordatorio_dias: v.optional(v.number()),
    finiquito_recordatorio_dias: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);
    await assertPartidaInProject(ctx, args.partida_id, args.proyecto);
    validateMilestonePercentage(args.anticipo_porcentaje);
    validateMilestonePercentage(args.finiquito_porcentaje);
    validateReminderDays(args.anticipo_recordatorio_dias);
    validateReminderDays(args.suministro_recordatorio_dias);
    validateReminderDays(args.finiquito_recordatorio_dias);

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
        anticipo_recordatorio_dias: args.anticipo_recordatorio_dias,
        suministro_recordatorio_dias: args.suministro_recordatorio_dias,
        finiquito_recordatorio_dias: args.finiquito_recordatorio_dias,
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
        anticipo_recordatorio_dias: args.anticipo_recordatorio_dias,
        suministro_recordatorio_dias: args.suministro_recordatorio_dias,
        finiquito_recordatorio_dias: args.finiquito_recordatorio_dias,
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
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);
    const partida = await assertPartidaInProject(ctx, args.partida_id, args.proyecto);
    const parentPartida = await assertPartidaInProject(ctx, args.parent_partida_id, args.proyecto);
    if (
      parentPartida.nivel !== 1 ||
      partida.nivel !== 2 ||
      partida.partida_nombre !== parentPartida.nombre
    ) {
      throw new Error("La familia no pertenece a la partida seleccionada.");
    }

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
    await assertProjectAccess(ctx, args.proyecto_id);
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
    await assertProjectAccess(ctx, args.proyecto_id);
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
    await assertAdmin(ctx);
    await assertProjectAccess(ctx, args.proyecto);
    await assertPartidaInProject(ctx, args.partida_id, args.proyecto);
    validateMilestonePercentage(args.peso);

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
    await assertProjectAccess(ctx, args.proyecto_id);
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
    const partida = await ctx.db.get(args.partida_id);
    if (!partida?.proyecto) return null;
    await assertProjectAccess(ctx, partida.proyecto);
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
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);
    await assertPartidaInProject(ctx, args.partida_id, args.proyecto);
    validateMilestonePercentage(args.porcentaje);

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
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);

    const parentPartida = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_nombre", (q) =>
        q.eq("proyecto", args.proyecto).eq("nivel", 1).eq("nombre", args.partida_nombre),
      )
      .first();
    if (!parentPartida) {
      throw new Error("La partida padre no pertenece al proyecto seleccionado.");
    }

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
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);

    const family = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_partida", (q) =>
        q.eq("proyecto", args.proyecto).eq("nivel", 2).eq("partida_nombre", args.partida_nombre),
      )
      .filter((q) => q.eq(q.field("familia"), args.familia))
      .first();
    if (!family) {
      throw new Error("La familia padre no pertenece a la partida seleccionada.");
    }

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
    await assertCanWrite(ctx);

    const detalle = await ctx.db.get(args.detalle_id);
    if (!detalle) {
      throw new Error("Detalle de programa de obra no encontrado");
    }
    await assertProjectAccess(ctx, detalle.proyecto);
    validateMilestonePercentage(args.avance_porcentaje);

    const previousValue = detalle.avance_porcentaje;
    if (previousValue === args.avance_porcentaje) {
      return { success: true };
    }

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

    await ctx.db.patch(args.detalle_id, {
      avance_porcentaje: args.avance_porcentaje,
    });

    await ctx.db.insert("programa_obra_avance_historial", {
      proyecto: detalle.proyecto,
      detalle_id: args.detalle_id,
      partida: detalle.partida,
      familia: detalle.familia,
      old_value: previousValue,
      new_value: args.avance_porcentaje,
      changed_by_id: userId,
      changed_by_name: userName,
      created_at: Date.now(),
    });

    return { success: true };
  },
});

export const getAvanceHistorialByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto_id);
    return await ctx.db
      .query("programa_obra_avance_historial")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
  },
});

// Update peso on a programa_obra record (level 0 partida)
export const updateSchedulePeso = mutation({
  args: {
    schedule_id: v.id("programa_obra"),
    peso: v.number(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const schedule = await ctx.db.get(args.schedule_id);
    if (!schedule) throw new Error("Programa de obra no encontrado.");
    await assertProjectAccess(ctx, schedule.proyecto);
    validateMilestonePercentage(args.peso);
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
    await assertAdmin(ctx);
    const detalle = await ctx.db.get(args.detalle_id);
    if (!detalle) throw new Error("Detalle de programa de obra no encontrado.");
    await assertProjectAccess(ctx, detalle.proyecto);
    validateMilestonePercentage(args.peso);
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
    await assertCanWrite(ctx);
    const detalle = await ctx.db.get(args.detalle_id);
    if (!detalle) throw new Error("Detalle de programa de obra no encontrado.");
    await assertProjectAccess(ctx, detalle.proyecto);
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
    await assertProjectAccess(ctx, args.proyecto_id);
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
    const schedule = await ctx.db.get(args.programa_obra_id);
    if (!schedule) return [];
    await assertProjectAccess(ctx, schedule.proyecto);
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
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);

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

    for (const row of args.rows) {
      validateMilestonePercentage(row.anticipo_porcentaje);
      validateMilestonePercentage(row.finiquito_porcentaje);
      validateMilestonePercentage(row.peso);
    }

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
    await assertProjectAccess(ctx, args.proyecto_id);
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
    await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);
    if (args.parent_type !== "partida" && args.parent_type !== "familia") {
      throw new Error("Tipo de comentario inválido.");
    }
    const parent = args.parent_type === "partida"
      ? await ctx.db.get(args.parent_id as Id<"programa_obra">)
      : await ctx.db.get(args.parent_id as Id<"programa_obra_detalle">);
    if (!parent || parent.proyecto !== args.proyecto) {
      throw new Error("El elemento comentado no pertenece al proyecto.");
    }

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
    await assertCanWrite(ctx);
    const existing = await ctx.db.get(args.comentario_id);
    if (!existing) throw new Error("Comentario no encontrado.");
    await assertProjectAccess(ctx, existing.proyecto);
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
    await assertCanWrite(ctx);
    const existing = await ctx.db.get(args.comentario_id);
    if (!existing) throw new Error("Comentario no encontrado.");
    await assertProjectAccess(ctx, existing.proyecto);
    await ctx.db.delete(args.comentario_id);
    return { success: true };
  },
});

// ============================================================
// OPERATIONAL MILESTONES
// ============================================================

type MilestoneDecision = Doc<"programa_obra_hito_links">;
type TransactionSource = {
  transaction: Doc<"transacciones">;
  pagos: Doc<"pagos">[];
  documents: Doc<"documentos">[];
};
async function loadMilestoneContext(ctx: QueryCtx, proyectoId: Id<"desarrollos">) {
  const [schedules, partidas, transactions, requisitions, documents, requisitionDocuments, links] =
    await Promise.all([
      ctx.db.query("programa_obra").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
      ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
      ctx.db.query("transacciones").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
      ctx.db.query("requisiciones").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
      ctx.db.query("documentos").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
      ctx.db.query("requisicion_documentos").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
      ctx.db.query("programa_obra_hito_links").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
    ]);

  const [paymentRows, requisitionRows] = await Promise.all([
    Promise.all(
      transactions.map(async (transaction) => ({
        transaction,
        pagos: await ctx.db
          .query("pagos")
          .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
          .collect(),
        documents: documents.filter((document) => document.transaccion_id === transaction._id),
      })),
    ),
    Promise.all(
      requisitions.map(async (requisition) => ({
        requisition,
        items: await ctx.db
          .query("requisicion_items")
          .withIndex("by_requisicion", (q) => q.eq("requisicion_id", requisition._id))
          .collect(),
        documents: requisitionDocuments.filter((document) => document.requisicion_id === requisition._id),
      })),
    ),
  ]);

  return { schedules, partidas, paymentRows, requisitionRows, links };
}

function getDescendantPartidaIds(
  schedule: Doc<"programa_obra">,
  partidas: Doc<"partidas">[],
): Set<string> {
  const parent = partidas.find((partida) => partida._id === schedule.partida_id);
  const ids = new Set<string>([schedule.partida_id]);
  if (!parent) return ids;

  for (const partida of partidas) {
    if (
      partida._id === parent._id ||
      (partida.nivel > 1 &&
        (partida.partida_nombre === parent.nombre || partida.nombre === parent.nombre))
    ) {
      ids.add(partida._id);
    }
  }
  return ids;
}

function getDecision(
  links: MilestoneDecision[],
  scheduleId: Id<"programa_obra">,
  kind: ProgramaObraMilestoneKind,
  sourceType: "transaccion" | "requisicion",
  sourceId: string,
) {
  return links.find(
    (link) =>
      link.programa_obra_id === scheduleId &&
      link.hito === kind &&
      link.source_type === sourceType &&
      (sourceType === "transaccion" ? link.transaccion_id === sourceId : link.requisicion_id === sourceId),
  )?.decision;
}

function transactionEvidenceCount(source: TransactionSource): number {
  return source.documents.length +
    (source.transaction.comprobante ? 1 : 0) +
    (source.transaction.factura ? 1 : 0);
}

function getAllocatedAmount(source: TransactionSource, partidaIds: Set<string>): number {
  const matchingAmount = source.pagos
    .filter((pago) => pago.partida_id && partidaIds.has(pago.partida_id))
    .reduce((sum, pago) => sum + pago.monto, 0);
  return Math.round(matchingAmount * 100) / 100;
}

function buildMilestone(
  context: Awaited<ReturnType<typeof loadMilestoneContext>>,
  schedule: Doc<"programa_obra">,
  kind: ProgramaObraMilestoneKind,
  canViewFinancial: boolean,
  todayKey: string,
) {
  const parent = context.partidas.find((partida) => partida._id === schedule.partida_id);
  const plannedDate = kind === "anticipo"
    ? schedule.anticipo_fecha
    : kind === "suministro"
      ? schedule.suministro_fecha
      : schedule.finiquito_fecha;
  if (!plannedDate) return null;

  const configuredReminder = kind === "anticipo"
    ? schedule.anticipo_recordatorio_dias
    : kind === "suministro"
      ? schedule.suministro_recordatorio_dias
      : schedule.finiquito_recordatorio_dias;
  const reminderDays = getReminderDays(kind, configuredReminder);
  const partidaIds = getDescendantPartidaIds(schedule, context.partidas);
  const scheduleLinks = context.links.filter(
    (link) => link.programa_obra_id === schedule._id && link.hito === kind,
  );

  const relevantTransactions = context.paymentRows
    .filter((source) => source.pagos.some((pago) => pago.partida_id && partidaIds.has(pago.partida_id)))
    .map((source) => ({
      ...source,
      amount: getAllocatedAmount(source, partidaIds),
      evidenceCount: transactionEvidenceCount(source),
      decision: getDecision(context.links, schedule._id, kind, "transaccion", source.transaction._id),
      exactCategory: transactionMatchesMilestone(source.transaction.categoria, kind),
    }));

  for (const link of scheduleLinks) {
    if (link.source_type !== "transaccion" || !link.transaccion_id) continue;
    if (relevantTransactions.some((source) => source.transaction._id === link.transaccion_id)) continue;
    const linkedSource = context.paymentRows.find((source) => source.transaction._id === link.transaccion_id);
    if (!linkedSource) continue;
    relevantTransactions.push({
      ...linkedSource,
      amount: linkedSource.transaction.monto_total,
      evidenceCount: transactionEvidenceCount(linkedSource),
      decision: link.decision,
      exactCategory: transactionMatchesMilestone(linkedSource.transaction.categoria, kind),
    });
  }

  const eligibleTransactions = relevantTransactions.filter((source) => source.decision !== "rejected");
  const confirmedTransactions = eligibleTransactions.filter((source) => source.decision === "confirmed");
  const exactTransactions = eligibleTransactions.filter((source) => source.exactCategory);
  const manualFiniquitoCandidates = kind === "finiquito"
    ? eligibleTransactions.filter(
        (source) =>
          !source.exactCategory &&
          !transactionMatchesMilestone(source.transaction.categoria, "anticipo") &&
          !transactionMatchesMilestone(source.transaction.categoria, "suministro"),
      )
    : [];

  const requisitionCandidates = kind === "suministro"
    ? context.requisitionRows
        .filter((source) =>
          source.items.some(
            (item) => item.partida_id === schedule.partida_id || partidaIds.has(item.partida_id),
          ),
        )
        .map((source) => ({
          ...source,
          amount: source.items.reduce((sum, item) => sum + (item.monto ?? 0), 0),
          evidenceCount: source.documents.length,
          decision: getDecision(context.links, schedule._id, kind, "requisicion", source.requisition._id),
        }))
    : [];

  for (const link of scheduleLinks) {
    if (link.source_type !== "requisicion" || !link.requisicion_id || kind !== "suministro") continue;
    if (requisitionCandidates.some((source) => source.requisition._id === link.requisicion_id)) continue;
    const linkedSource = context.requisitionRows.find((source) => source.requisition._id === link.requisicion_id);
    if (!linkedSource) continue;
    requisitionCandidates.push({
      ...linkedSource,
      amount: linkedSource.items.reduce((sum, item) => sum + (item.monto ?? 0), 0),
      evidenceCount: linkedSource.documents.length,
      decision: link.decision,
    });
  }

  const eligibleRequisitions = requisitionCandidates.filter((source) => source.decision !== "rejected");
  const confirmedRequisitions = eligibleRequisitions.filter((source) => source.decision === "confirmed");
  const initialTemporalStatus = deriveMilestoneStatus({
    plannedDate,
    reminderDays,
    todayKey,
    completed: false,
  });
  const matchMode = getAssistedMatchMode({
    kind,
    confirmedCount: confirmedTransactions.length + confirmedRequisitions.length,
    exactCount: kind === "suministro"
      ? exactTransactions.length + eligibleRequisitions.length
      : exactTransactions.length,
    manualCandidateCount: manualFiniquitoCandidates.length,
    withinReminderWindow: initialTemporalStatus !== "scheduled",
  });
  const selectedTransactions = matchMode === "confirmed"
    ? confirmedTransactions
    : matchMode === "automatic"
      ? exactTransactions
      : [];
  const selectedRequisitions = kind === "suministro"
    ? matchMode === "confirmed"
      ? confirmedRequisitions
      : matchMode === "automatic"
        ? eligibleRequisitions
        : []
    : [];
  const completed = kind === "suministro"
    ? selectedRequisitions.length > 0 && selectedRequisitions.every((source) => isCompleteDeliveryStatus(source.requisition.status_entrega))
    : selectedTransactions.length > 0 && selectedTransactions.every((source) => isPaidStatus(source.transaction.status));
  const partial = kind === "suministro" &&
    !completed &&
    selectedRequisitions.some(
      (source) => isPartialDeliveryStatus(source.requisition.status_entrega) || isCompleteDeliveryStatus(source.requisition.status_entrega),
    );
  const evidenceCount = kind === "suministro"
    ? selectedRequisitions.reduce((sum, source) => sum + source.evidenceCount, 0) +
      selectedTransactions.reduce((sum, source) => sum + source.evidenceCount, 0)
    : selectedTransactions.reduce((sum, source) => sum + source.evidenceCount, 0);
  const temporalStatus = deriveMilestoneStatus({
    plannedDate,
    reminderDays,
    todayKey,
    completed,
    partial,
    evidencePresent: evidenceCount > 0,
  });
  const withinReminderWindow = temporalStatus !== "scheduled";
  const reviewRequired = matchMode === "review" && withinReminderWindow;
  const status = deriveMilestoneStatus({
    plannedDate,
    reminderDays,
    todayKey,
    completed,
    partial,
    reviewRequired,
    evidencePresent: evidenceCount > 0,
  });
  const expectedAmount = getExpectedMilestoneAmount(
    parent?.presupuesto_aprobado ?? 0,
    kind === "anticipo" ? schedule.anticipo_porcentaje : kind === "finiquito" ? schedule.finiquito_porcentaje : undefined,
  );
  const actualAmount = selectedTransactions.reduce((sum, source) => sum + source.amount, 0);
  const actualDates = kind === "suministro"
    ? [
        ...selectedRequisitions.map((source) => source.requisition.fecha_entrega).filter(Boolean) as string[],
        ...selectedTransactions.map((source) => source.transaction.fecha).filter(Boolean),
      ]
    : selectedTransactions.map((source) => source.transaction.fecha).filter(Boolean);
  const transactionCandidates = kind === "finiquito"
    ? relevantTransactions.filter(
        (source) =>
          source.exactCategory ||
          manualFiniquitoCandidates.some((candidate) => candidate.transaction._id === source.transaction._id) ||
          source.decision != null,
      )
    : relevantTransactions.filter((source) => source.exactCategory || source.decision != null);
  const latestActualDate = actualDates.reduce<string | undefined>((latest, current) => {
    if (!latest) return current;
    const latestDay = parseProgramDateToUtcDay(latest);
    const currentDay = parseProgramDateToUtcDay(current);
    if (currentDay == null) return latest;
    return latestDay == null || currentDay > latestDay ? current : latest;
  }, undefined);

  return {
    scheduleId: schedule._id,
    partidaId: schedule.partida_id,
    partidaName: parent?.nombre ?? "Partida",
    kind,
    plannedDate,
    reminderDays,
    status,
    actionable: isActionableMilestone(status),
    daysUntil: getDaysUntil(plannedDate, todayKey),
    sourceCount: selectedRequisitions.length + selectedTransactions.length,
    candidateCount: kind === "suministro"
      ? requisitionCandidates.length + transactionCandidates.length
      : exactTransactions.length + manualFiniquitoCandidates.length,
    evidenceCount,
    actualDate: latestActualDate,
    canViewFinancial,
    expectedAmount: canViewFinancial && kind !== "suministro" ? expectedAmount ?? undefined : undefined,
    actualAmount: canViewFinancial ? Math.round(actualAmount * 100) / 100 : undefined,
    variance: canViewFinancial && expectedAmount != null
      ? Math.round((actualAmount - expectedAmount) * 100) / 100
      : undefined,
    transactionCandidates,
    requisitionCandidates,
    selectedTransactionIds: new Set(selectedTransactions.map((source) => source.transaction._id)),
    selectedRequisitionIds: new Set(selectedRequisitions.map((source) => source.requisition._id)),
  };
}

function toPublicMilestone(milestone: NonNullable<ReturnType<typeof buildMilestone>>) {
  return {
    scheduleId: milestone.scheduleId,
    partidaId: milestone.partidaId,
    partidaName: milestone.partidaName,
    kind: milestone.kind,
    plannedDate: milestone.plannedDate,
    reminderDays: milestone.reminderDays,
    status: milestone.status,
    actionable: milestone.actionable,
    daysUntil: milestone.daysUntil,
    sourceCount: milestone.sourceCount,
    candidateCount: milestone.candidateCount,
    evidenceCount: milestone.evidenceCount,
    actualDate: milestone.actualDate,
    canViewFinancial: milestone.canViewFinancial,
    expectedAmount: milestone.expectedAmount,
    actualAmount: milestone.actualAmount,
    variance: milestone.variance,
  };
}

export const getMilestoneDashboard = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto_id);
    const user = await getCurrentUserOrThrow(ctx);
    const canViewFinancial = hasInvoiceReviewAccess(user);
    const context = await loadMilestoneContext(ctx, args.proyecto_id);
    const todayKey = getMexicoCityDateKey();
    return context.schedules.flatMap((schedule) =>
      (["anticipo", "suministro", "finiquito"] as ProgramaObraMilestoneKind[])
        .map((kind) => buildMilestone(context, schedule, kind, canViewFinancial, todayKey))
        .filter((milestone): milestone is NonNullable<typeof milestone> => milestone !== null)
        .map(toPublicMilestone),
    );
  },
});

export const getMilestoneDetail = query({
  args: {
    schedule_id: v.id("programa_obra"),
    hito: v.union(v.literal("anticipo"), v.literal("suministro"), v.literal("finiquito")),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.schedule_id);
    if (!schedule) return null;
    await assertProjectAccess(ctx, schedule.proyecto);
    const user = await getCurrentUserOrThrow(ctx);
    const canViewFinancial = hasInvoiceReviewAccess(user);
    const context = await loadMilestoneContext(ctx, schedule.proyecto);
    const milestone = buildMilestone(context, schedule, args.hito, canViewFinancial, getMexicoCityDateKey());
    if (!milestone) return null;

    const transactions = canViewFinancial
      ? await Promise.all(milestone.transactionCandidates.map(async (source) => ({
          id: source.transaction._id,
          fecha: source.transaction.fecha,
          status: source.transaction.status,
          categoria: source.transaction.categoria,
          proveedor: source.transaction.proveedor,
          moneda: source.transaction.moneda,
          amount: source.amount,
          decision: source.decision,
          selected: milestone.selectedTransactionIds.has(source.transaction._id),
          exactCategory: source.exactCategory,
          evidence: await Promise.all(source.documents.map(async (document) => ({
            id: document._id,
            name: document.nombre,
            type: document.type,
            url: document.storage_id ? await ctx.storage.getUrl(document.storage_id) : document.image ?? null,
          }))),
          hasLegacyReceipt: Boolean(source.transaction.comprobante || source.transaction.factura),
        })))
      : [];
    const requisitions = args.hito === "suministro"
      ? await Promise.all(milestone.requisitionCandidates.map(async (source) => ({
          id: source.requisition._id,
          fechaSolicitud: source.requisition.fecha_solicitud,
          fechaEntrega: source.requisition.fecha_entrega,
          status: source.requisition.status,
          statusEntrega: source.requisition.status_entrega,
          solicitante: source.requisition.solicitante_nombre,
          itemCount: source.items.length,
          amount: canViewFinancial ? source.amount : undefined,
          decision: source.decision,
          selected: milestone.selectedRequisitionIds.has(source.requisition._id),
          evidence: await Promise.all(source.documents.map(async (document) => ({
            id: document._id,
            name: document.nombre,
            type: document.type,
            url: await ctx.storage.getUrl(document.storage_id),
          }))),
        })))
      : [];

    return {
      ...toPublicMilestone(milestone),
      canManageLinks: canViewFinancial,
      transactions,
      requisitions,
    };
  },
});

export const setMilestoneLinkDecision = mutation({
  args: {
    schedule_id: v.id("programa_obra"),
    hito: v.union(v.literal("anticipo"), v.literal("suministro"), v.literal("finiquito")),
    source_type: v.union(v.literal("transaccion"), v.literal("requisicion")),
    transaccion_id: v.optional(v.id("transacciones")),
    requisicion_id: v.optional(v.id("requisiciones")),
    decision: v.union(v.literal("confirmed"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    const reviewer = await assertInvoiceReviewer(ctx);
    const schedule = await ctx.db.get(args.schedule_id);
    if (!schedule) throw new Error("El programa de obra ya no existe.");
    await assertProjectAccess(ctx, schedule.proyecto);
    await assertPartidaInProject(ctx, schedule.partida_id, schedule.proyecto);

    const hasTransaction = args.source_type === "transaccion" && Boolean(args.transaccion_id) && !args.requisicion_id;
    const hasRequisition = args.source_type === "requisicion" && Boolean(args.requisicion_id) && !args.transaccion_id;
    if (!hasTransaction && !hasRequisition) {
      throw new Error("Selecciona exactamente una fuente válida para el hito.");
    }
    if (args.transaccion_id) {
      const transaction = await ctx.db.get(args.transaccion_id);
      if (!transaction || transaction.proyecto !== schedule.proyecto) {
        throw new Error("La transacción no pertenece al proyecto.");
      }
      const partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", schedule.proyecto))
        .collect();
      const partidaIds = getDescendantPartidaIds(schedule, partidas);
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();
      if (!pagos.some((pago) => pago.partida_id && partidaIds.has(pago.partida_id))) {
        throw new Error("La transacción no está asignada a esta partida ni a sus descendientes.");
      }
      const validCategory = args.hito === "finiquito"
        ? !transactionMatchesMilestone(transaction.categoria, "anticipo") &&
          !transactionMatchesMilestone(transaction.categoria, "suministro")
        : transactionMatchesMilestone(transaction.categoria, args.hito);
      if (!validCategory) {
        throw new Error("La categoría de la transacción no corresponde al hito seleccionado.");
      }
    }
    if (args.requisicion_id) {
      if (args.hito !== "suministro") {
        throw new Error("Las requisiciones solo pueden asociarse al hito de suministro.");
      }
      const requisition = await ctx.db.get(args.requisicion_id);
      if (!requisition || requisition.proyecto !== schedule.proyecto) {
        throw new Error("La requisición no pertenece al proyecto.");
      }
      const partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", schedule.proyecto))
        .collect();
      const partidaIds = getDescendantPartidaIds(schedule, partidas);
      const items = await ctx.db
        .query("requisicion_items")
        .withIndex("by_requisicion", (q) => q.eq("requisicion_id", requisition._id))
        .collect();
      if (!items.some((item) => partidaIds.has(item.partida_id))) {
        throw new Error("La requisición no contiene conceptos de esta partida ni de sus descendientes.");
      }
    }

    const links = await ctx.db
      .query("programa_obra_hito_links")
      .withIndex("by_programa_hito", (q) => q.eq("programa_obra_id", schedule._id).eq("hito", args.hito))
      .collect();
    const existing = links.find((link) =>
      args.source_type === "transaccion"
        ? link.source_type === "transaccion" && link.transaccion_id === args.transaccion_id
        : link.source_type === "requisicion" && link.requisicion_id === args.requisicion_id,
    );
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        decision: args.decision,
        decided_by_id: reviewer._id,
        decided_by_name: reviewer.name,
        updated_at: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("programa_obra_hito_links", {
      proyecto: schedule.proyecto,
      programa_obra_id: schedule._id,
      partida_id: schedule.partida_id,
      hito: args.hito,
      source_type: args.source_type,
      transaccion_id: args.transaccion_id,
      requisicion_id: args.requisicion_id,
      decision: args.decision,
      decided_by_id: reviewer._id,
      decided_by_name: reviewer.name,
      created_at: now,
      updated_at: now,
    });
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
    await assertProjectAccess(ctx, args.proyecto_id);
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
