import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";

// ============================================
// QUERIES
// ============================================

// Get all ingresos for a project
export const getByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
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
    return await ctx.db.get(args.id);
  },
});

// Get totals for a project
export const getTotalsByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
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
    clerk_id: v.string(), // Clerk user ID to look up internal user
  },
  handler: async (ctx, args) => {
    // Look up internal user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
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
    await ctx.db.delete(args.id);
    return args.id;
  },
});
