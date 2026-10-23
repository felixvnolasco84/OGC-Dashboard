import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertProjectionAccess, assertLegacyProjectionWrite, currentProjectionMetadata } from "./projectionImportHistory";

export const uploadSalesProjections = mutation({
  args: { attempt_id: v.optional(v.id("projection_import_attempts")) },
  handler: async () => { throw new Error("Recarga la aplicación y confirma el Excel con respaldo desde Proyecciones."); },
});

// Get all projected transactions for a sales project
export const getBySalesProject = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, { kind: "collection", project_id: args.sales_proyecto });
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    return projections.sort((a, b) => a.week_date - b.week_date);
  },
});

// Get projected transactions grouped by week for a sales project
export const getGroupedByWeek = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, { kind: "collection", project_id: args.sales_proyecto });
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    // Group by week_date and sum amounts
    const weeklyTotals = new Map<number, number>();
    
    for (const projection of projections) {
      const currentTotal = weeklyTotals.get(projection.week_date) || 0;
      weeklyTotals.set(projection.week_date, currentTotal + projection.amount);
    }

    // Convert to array and sort by date
    const result = Array.from(weeklyTotals.entries())
      .map(([week_date, amount]) => ({ week_date, amount }))
      .sort((a, b) => a.week_date - b.week_date);

    return result;
  },
});

// Get cumulative projected collections over time for a sales project
export const getCumulativeProjections = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, { kind: "collection", project_id: args.sales_proyecto });
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    // Group by week_date and sum amounts
    const weeklyTotals = new Map<number, number>();
    
    for (const projection of projections) {
      const currentTotal = weeklyTotals.get(projection.week_date) || 0;
      weeklyTotals.set(projection.week_date, currentTotal + projection.amount);
    }

    // Convert to sorted array
    const sortedWeeks = Array.from(weeklyTotals.entries())
      .map(([week_date, amount]) => ({ week_date, amount }))
      .sort((a, b) => a.week_date - b.week_date);

    // Calculate cumulative amounts
    let cumulative = 0;
    const cumulativeData = sortedWeeks.map((week) => {
      cumulative += week.amount;
      return {
        week_date: week.week_date,
        weekly_amount: week.amount,
        cumulative_amount: cumulative,
      };
    });

    return cumulativeData;
  },
});

// Get upload metadata for a sales project
export const getUploadMetadata = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    return currentProjectionMetadata(ctx, { kind: "collection", project_id: args.sales_proyecto });
  },
});

// Delete all projections for a sales project
export const deleteBySalesProject = mutation({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    await assertLegacyProjectionWrite(ctx, { kind: "collection", project_id: args.sales_proyecto });
    await assertProjectionAccess(ctx, { kind: "collection", project_id: args.sales_proyecto });
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    for (const projection of projections) {
      await ctx.db.delete(projection._id);
    }

    return {
      success: true,
      deletedCount: projections.length,
      message: `Deleted ${projections.length} sales projected transactions`,
    };
  },
});

// Helper function to convert Excel serial date to JavaScript Date
export const excelDateToJSDate = (serial: number): Date => {
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + serial * msPerDay);
};
