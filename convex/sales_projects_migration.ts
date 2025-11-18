import { mutation } from "./_generated/server";

/**
 * Migration: Create missing sales_meticas_presupuesto records for existing sales projects
 * 
 * Run this once to ensure all existing sales projects have their corresponding metrics records.
 * Safe to run multiple times - will skip projects that already have metrics.
 */
export const createMissingSalesMetrics = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all sales projects
    const allSalesProjects = await ctx.db.query("sales_projects").collect();
    
    let created = 0;
    let skipped = 0;
    
    for (const project of allSalesProjects) {
      // Check if metrics record already exists
      const existingMetrics = await ctx.db
        .query("sales_meticas_presupuesto")
        .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", project._id))
        .first();
      
      if (existingMetrics) {
        skipped++;
        continue;
      }
      
      // Create missing metrics record
      await ctx.db.insert("sales_meticas_presupuesto", {
        sales_proyecto: project._id,
        presupuesto_original: 0,
        presupuesto_aprobado: 0,
        gasto_total: 0,
        por_gastar: 0,
      });
      
      created++;
    }
    
    return {
      success: true,
      total_projects: allSalesProjects.length,
      created,
      skipped,
      message: `Created ${created} missing metrics records, skipped ${skipped} existing ones.`
    };
  },
});

/**
 * Verification query: Check if all sales projects have metrics records
 */
export const verifySalesProjectsIntegrity = mutation({
  args: {},
  handler: async (ctx) => {
    const allSalesProjects = await ctx.db.query("sales_projects").collect();
    const missingMetrics: string[] = [];
    
    for (const project of allSalesProjects) {
      const metricsRecord = await ctx.db
        .query("sales_meticas_presupuesto")
        .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", project._id))
        .first();
      
      if (!metricsRecord) {
        missingMetrics.push(project.nombre);
      }
    }
    
    return {
      total_projects: allSalesProjects.length,
      projects_with_metrics: allSalesProjects.length - missingMetrics.length,
      projects_missing_metrics: missingMetrics.length,
      missing_projects: missingMetrics,
      is_valid: missingMetrics.length === 0
    };
  },
});
