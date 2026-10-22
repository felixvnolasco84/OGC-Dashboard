import { v } from "convex/values";
import { query, mutation as rawMutation } from "./_generated/server";
import { mutation, updateIngresosTotalsInternal } from "./functions";
import { writableIncomeAttempt, assertIncomeOriginal } from "./incomeImportHistory";
import { incomeCurrencyTotals, INCOME_IMPORT_TIMEOUT, INCOME_IMPORT_MAX_ROWS } from "./incomeImportRules";
import type { IncomeImportResult } from "./incomeImportValidators";
import { assertIncomeManager, assertIncomeProjectAccess } from "./permissions";

// ============================================
// QUERIES
// ============================================

// Get all ingresos for a project
export const getByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await assertIncomeProjectAccess(ctx, args.proyecto_id);
    const ingresos = await ctx.db
      .query("ingresos")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
    
    // Sort by fecha (most recent first)
    return ingresos.sort((a, b) => {
      // Parse DD/MM/YYYY format
      const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split("/").map(Number);
        return new Date(year, month - 1, day).getTime();
      };
      return parseDate(b.fecha) - parseDate(a.fecha);
    });
  },
});

// Get single ingreso by ID
export const getById = query({
  args: { id: v.id("ingresos") },
  handler: async (ctx, args) => {
    const ingreso = await ctx.db.get(args.id);
    if (!ingreso) return null;
    await assertIncomeProjectAccess(ctx, ingreso.proyecto);
    return ingreso;
  },
});

// Get totals for a project
export const getTotalsByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await assertIncomeProjectAccess(ctx, args.proyecto_id);
    const totals = await ctx.db
      .query("ingresos_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .first();
    
    return totals || { 
      proyecto: args.proyecto_id, 
      total_ingresos: 0, 
      total_count: 0, 
      last_updated: Date.now() 
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

// Create a new ingreso
export const create = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    monto: v.number(),
    fecha: v.string(),
    descripcion: v.optional(v.string()),
    moneda: v.string(),
    documento_adjunto: v.optional(v.string()),
    documento_nombre: v.optional(v.string()),
    clerk_id: v.optional(v.string()), // Legacy argument; attribution comes from the session.
  },
  handler: async (ctx, args) => {
    const user = await assertIncomeManager(ctx);
    await assertIncomeProjectAccess(ctx, args.proyecto);
    
    const ingresoId = await ctx.db.insert("ingresos", {
      proyecto: args.proyecto,
      monto: args.monto,
      fecha: args.fecha,
      descripcion: args.descripcion,
      moneda: args.moneda,
      documento_adjunto: args.documento_adjunto,
      documento_nombre: args.documento_nombre,
      added_by_id: user._id,
      added_by_name: user.name,
      created_at: Date.now(),
    });
    
    return ingresoId;
  },
});

// Atomic commit of an immutable, backed-up review. Only this batch path uses
// the raw writer: the same total calculation runs once before the commit.
export const bulkCreate = rawMutation({
  args: { attempt_id: v.id("income_import_attempts"), clerk_id: v.optional(v.string()) },
  handler: async (ctx, args): Promise<IncomeImportResult> => {
    const { attempt, user } = await writableIncomeAttempt(ctx, args.attempt_id);
    if (attempt.result) return attempt.result;
    if (attempt.status !== "processing") throw new Error(attempt.error || "El intento ya terminó.");
    if (Date.now() >= attempt.created_at + INCOME_IMPORT_TIMEOUT) throw new Error("El intento de carga expiró.");
    await assertIncomeOriginal(ctx, attempt);
    const items = await ctx.db.query("income_import_items").withIndex("by_attempt_position", q => q.eq("attempt_id", attempt._id)).take(INCOME_IMPORT_MAX_ROWS + 1);
    const pending = items.filter(item => item.outcome === "pending");
    if (items.length !== attempt.response_rows || pending.length !== attempt.valid_rows || !pending.length) throw new Error("La vista previa guardada está incompleta.");
    const amounts = incomeCurrencyTotals(pending);
    if (amounts.some(amount => !Number.isFinite(amount.monto))) throw new Error("El importe acumulado supera el rango permitido.");
    const now = Date.now();
    for (const item of pending) {
      if (item.proyecto !== attempt.proyecto || !Number.isFinite(item.monto) || item.monto <= 0 || !item.fecha) throw new Error("Una fila guardada no es válida. No se importaron ingresos.");
      const id = await ctx.db.insert("ingresos", {
        proyecto: attempt.proyecto, import_attempt_id: attempt._id,
        monto: item.monto, fecha: item.fecha, descripcion: item.descripcion || undefined, moneda: item.moneda,
        added_by_id: user._id, added_by_name: user.name, created_at: now,
      });
      await ctx.db.patch(item._id, { ingreso_id: id, outcome: "created" });
    }
    await updateIngresosTotalsInternal(ctx, attempt.proyecto);
    const result: IncomeImportResult = { created: pending.length, rejected: attempt.rejected_rows, response_rows: items.length, amounts };
    await ctx.db.patch(attempt._id, { status: "completed", completed_at: now, result, error: undefined });
    return result;
  },
});
// Update an existing ingreso
export const update = mutation({
  args: {
    id: v.id("ingresos"),
    monto: v.optional(v.number()),
    fecha: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    moneda: v.optional(v.string()),
    documento_adjunto: v.optional(v.string()),
    documento_nombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertIncomeManager(ctx);
    const ingreso = await ctx.db.get(args.id);
    if (!ingreso) throw new Error("Ingreso no encontrado.");
    await assertIncomeProjectAccess(ctx, ingreso.proyecto);
    const { id, ...updates } = args;
    
    // Filter out undefined values and add updated_at
    const filteredUpdates: Record<string, unknown> = { updated_at: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    
    await ctx.db.patch(id, filteredUpdates);
    return id;
  },
});

// Delete an ingreso
export const remove = mutation({
  args: { id: v.id("ingresos") },
  handler: async (ctx, args) => {
    await assertIncomeManager(ctx);
    const ingreso = await ctx.db.get(args.id);
    if (!ingreso) throw new Error("Ingreso no encontrado.");
    await assertIncomeProjectAccess(ctx, ingreso.proyecto);
    await ctx.db.delete(args.id);
    return args.id;
  },
});
