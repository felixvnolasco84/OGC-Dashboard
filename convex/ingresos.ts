import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { Id } from "./_generated/dataModel";
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

// Bulk create ingresos from a parsed Excel upload
export const bulkCreate = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    clerk_id: v.optional(v.string()), // Legacy argument; attribution comes from the session.
    ingresos: v.array(
      v.object({
        monto: v.number(),
        fecha: v.string(),
        descripcion: v.optional(v.string()),
        moneda: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await assertIncomeManager(ctx);
    await assertIncomeProjectAccess(ctx, args.proyecto);

    if (args.ingresos.length === 0) {
      return { created: 0, ids: [] as Id<"ingresos">[] };
    }

    const now = Date.now();
    const ids: Id<"ingresos">[] = [];

    for (const item of args.ingresos) {
      // Defensive validation: skip rows that don't meet minimum requirements
      if (!Number.isFinite(item.monto) || item.monto <= 0 || !item.fecha) {
        continue;
      }

      const ingresoId = await ctx.db.insert("ingresos", {
        proyecto: args.proyecto,
        monto: item.monto,
        fecha: item.fecha,
        descripcion: item.descripcion || undefined,
        moneda: item.moneda || "MXN",
        added_by_id: user._id,
        added_by_name: user.name,
        created_at: now,
      });

      ids.push(ingresoId);
    }

    return { created: ids.length, ids };
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
