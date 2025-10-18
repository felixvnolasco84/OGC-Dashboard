import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";

// Query to get metrics for a specific proyecto
export const getByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {    
    const metrics = await ctx.db
      .query("meticas_presupuesto")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .first();
      return metrics;
  },
});

// Query to get all metrics
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const metrics = await ctx.db
      .query("meticas_presupuesto")
      .collect();

    return metrics;
  },
});

// Manual mutation to recalculate metrics for a proyecto
// Useful for initialization or fixing data issues
export const recalculate = mutation({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Get all partidas for this proyecto (nivel 1 only for aggregated totals)
    const nivel1Partidas = await ctx.db
      .query("partidas")
      .filter((q) => 
        q.and(
          q.eq(q.field("nivel"), 1),
          q.eq(q.field("proyecto"), args.proyecto_id)
        )
      )
      .collect();
    
    // Calculate totals by summing nivel 1 partidas
    const presupuesto_original = nivel1Partidas.reduce(
      (sum, p) => sum + (p.presupuesto_original || 0),
      0
    );
    
    const presupuesto_aprobado = nivel1Partidas.reduce(
      (sum, p) => sum + (p.presupuesto_aprobado || 0),
      0
    );
    
    const gasto_total = nivel1Partidas.reduce(
      (sum, p) => sum + (p.pagado || 0),
      0
    );
    
    const por_gastar = presupuesto_aprobado - gasto_total;
    
    // Check if meticas_presupuesto already exists for this proyecto
    const existingMetrics = await ctx.db
      .query("meticas_presupuesto")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .first();
    
    if (existingMetrics) {
      // Update existing record
      await ctx.db.patch(existingMetrics._id, {
        presupuesto_original,
        presupuesto_aprobado,
        gasto_total,
        por_gastar
      });
      return { success: true, operation: "updated", metrics: existingMetrics._id };
    } else {
      // Create new record
      const newMetrics = await ctx.db.insert("meticas_presupuesto", {
        proyecto: args.proyecto_id,
        presupuesto_original,
        presupuesto_aprobado,
        gasto_total,
        por_gastar
      });
      return { success: true, operation: "created", metrics: newMetrics };
    }
  },
});
