import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Upload projected transactions from Excel API response for sales projects
export const uploadSalesProjections = mutation({
  args: {
    sales_proyecto: v.id("sales_projects"),
    fileName: v.string(),
    sheetName: v.string(),
    projections: v.array(
      v.object({
        partida: v.string(),
        total: v.optional(v.number()),
        calculatedTotal: v.optional(v.number()),
        rowIndex: v.optional(v.number()),
        projectionCount: v.optional(v.number()),
        weeklyProjections: v.array(
          v.object({
            week: v.number(), // Excel serial date
            columnLetter: v.optional(v.string()), // Excel column (A, B, C, etc.)
            amount: v.number(),
            position: v.number(),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const uploadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const uploadedAt = Date.now();

    // Delete any existing projections for this sales project
    const existingProjections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    for (const projection of existingProjections) {
      await ctx.db.delete(projection._id);
    }

    // Insert all new projections
    const insertedIds: Id<"sales_projected_transactions">[] = [];
    
    for (const partidaProjection of args.projections) {
      for (const weekProjection of partidaProjection.weeklyProjections) {
        const id = await ctx.db.insert("sales_projected_transactions", {
          sales_proyecto: args.sales_proyecto,
          partida: partidaProjection.partida,
          week_date: weekProjection.week,
          amount: weekProjection.amount,
          position: weekProjection.position,
          upload_id: uploadId,
          file_name: args.fileName,
          sheet_name: args.sheetName,
          uploaded_at: uploadedAt,
        });
        insertedIds.push(id);
      }
    }

    return {
      success: true,
      uploadId,
      totalInserted: insertedIds.length,
      message: `Successfully uploaded ${insertedIds.length} sales projected transactions`,
    };
  },
});

// Get all projected transactions for a sales project
export const getBySalesProject = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
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
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .first();

    if (!projections) {
      return null;
    }

    return {
      upload_id: projections.upload_id,
      file_name: projections.file_name,
      sheet_name: projections.sheet_name,
      uploaded_at: projections.uploaded_at,
    };
  },
});

// Delete all projections for a sales project
export const deleteBySalesProject = mutation({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
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
