import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper function to format Excel serial date to D/M/YYYY
function formatExcelDate(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Upload projected transactions from Excel API response
export const uploadProjections = mutation({
  args: {
    proyecto: v.id("desarrollos"),
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

    // Delete any existing projections for this project
    const existingProjections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    for (const projection of existingProjections) {
      await ctx.db.delete(projection._id);
    }

    // Delete any existing weekly totals for this project
    const existingWeeklyTotals = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    for (const total of existingWeeklyTotals) {
      await ctx.db.delete(total._id);
    }

    // Insert all new projections and track weekly aggregates
    const insertedIds: Id<"projected_transactions">[] = [];
    const weeklyAggregates = new Map<number, { amount: number; position: number }>();
    
    for (const partidaProjection of args.projections) {
      for (const weekProjection of partidaProjection.weeklyProjections) {
        const id = await ctx.db.insert("projected_transactions", {
          proyecto: args.proyecto,
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

        // Aggregate amounts by week_date
        const existing = weeklyAggregates.get(weekProjection.week);
        if (existing) {
          existing.amount += weekProjection.amount;
        } else {
          weeklyAggregates.set(weekProjection.week, {
            amount: weekProjection.amount,
            position: weekProjection.position,
          });
        }
      }
    }

    // Insert weekly projected totals
    const weeklyTotalIds: Id<"weekly_projected_totals">[] = [];
    for (const [weekDate, data] of weeklyAggregates.entries()) {
      const id = await ctx.db.insert("weekly_projected_totals", {
        proyecto: args.proyecto,
        week_date: weekDate,
        week_date_formatted: formatExcelDate(weekDate),
        weekly_total: data.amount,
        position: data.position,
        upload_id: uploadId,
        uploaded_at: uploadedAt,
      });
      weeklyTotalIds.push(id);
    }

    return {
      success: true,
      uploadId,
      totalInserted: insertedIds.length,
      weeklyTotalsCreated: weeklyTotalIds.length,
      message: `Successfully uploaded ${insertedIds.length} projected transactions and created ${weeklyTotalIds.length} weekly totals`,
    };
  },
});

// Get all projected transactions for a project
export const getByProject = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const projections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    return projections.sort((a, b) => a.week_date - b.week_date);
  },
});

// Get projected transactions grouped by week for a project
export const getGroupedByWeek = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const projections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
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

// Get cumulative projected spending over time for a project
export const getCumulativeProjections = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const projections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
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

// Get projected transactions for a specific partida
export const getByPartida = query({
  args: {
    proyecto: v.id("desarrollos"),
    partida: v.string(),
  },
  handler: async (ctx, args) => {
    const projections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto_partida", (q) =>
        q.eq("proyecto", args.proyecto).eq("partida", args.partida)
      )
      .collect();

    return projections.sort((a, b) => a.week_date - b.week_date);
  },
});

// Get upload metadata for a project
export const getUploadMetadata = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const projections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
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

// Delete all projections for a project
export const deleteByProject = mutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const projections = await ctx.db
      .query("projected_transactions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    for (const projection of projections) {
      await ctx.db.delete(projection._id);
    }

    return {
      success: true,
      deletedCount: projections.length,
      message: `Deleted ${projections.length} projected transactions`,
    };
  },
});

// Helper function to convert Excel serial date to JavaScript Date
export const excelDateToJSDate = (serial: number): Date => {
  // Excel dates are days since 1/1/1900, but Excel incorrectly treats 1900 as a leap year
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + serial * msPerDay);
};
