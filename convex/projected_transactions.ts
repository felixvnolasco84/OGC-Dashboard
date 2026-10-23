import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertProjectionAccess, assertLegacyProjectionWrite, currentProjectionMetadata } from "./projectionImportHistory";

export const uploadProjections = mutation({
  args: { attempt_id: v.optional(v.id("projection_import_attempts")) },
  handler: async () => { throw new Error("Recarga la aplicación y confirma el Excel con respaldo desde Proyecciones."); },
});

// Get all projected transactions for a project
export const getByProject = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, { kind: "expense", project_id: args.proyecto });
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
    await assertProjectionAccess(ctx, { kind: "expense", project_id: args.proyecto });
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
    await assertProjectionAccess(ctx, { kind: "expense", project_id: args.proyecto });
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
    await assertProjectionAccess(ctx, { kind: "expense", project_id: args.proyecto });
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
    return currentProjectionMetadata(ctx, { kind: "expense", project_id: args.proyecto });
  },
});

// Delete all projections for a project
export const deleteByProject = mutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await assertLegacyProjectionWrite(ctx, { kind: "expense", project_id: args.proyecto });
    await assertProjectionAccess(ctx, { kind: "expense", project_id: args.proyecto });
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
