import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper function to parse European formatted number (1.234.567,89 -> 1234567.89)
function parseEuropeanNumber(str: string): number {
  // Remove $ and spaces
  const cleaned = str.replace(/\$/g, '').trim();
  // Replace dots (thousands separator) with nothing
  const withoutDots = cleaned.replace(/\./g, '');
  // Replace comma (decimal separator) with dot
  const withDecimalDot = withoutDots.replace(/,/g, '.');
  return parseFloat(withDecimalDot);
}

// Helper function to convert D/M/YYYY to Excel serial date
function dateToExcelSerial(dateStr: string): number {
  const [day, month, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date.getTime() - excelEpoch.getTime()) / msPerDay);
}

// Upload weekly projected totals
export const uploadWeeklyTotals = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    weeklyData: v.array(
      v.object({
        date: v.string(), // D/M/YYYY format
        amount: v.string(), // European format: $ 1.234.567,89
      })
    ),
  },
  handler: async (ctx, args) => {
    const uploadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const uploadedAt = Date.now();

    // Delete any existing weekly totals for this project
    const existingTotals = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    for (const total of existingTotals) {
      await ctx.db.delete(total._id);
    }

    // Insert all new weekly totals
    const insertedIds: Id<"weekly_projected_totals">[] = [];

    for (let i = 0; i < args.weeklyData.length; i++) {
      const weekData = args.weeklyData[i];
      const excelSerial = dateToExcelSerial(weekData.date);
      const amount = parseEuropeanNumber(weekData.amount);

      const id = await ctx.db.insert("weekly_projected_totals", {
        proyecto: args.proyecto,
        week_date: excelSerial,
        week_date_formatted: weekData.date,
        weekly_total: amount,
        position: i,
        upload_id: uploadId,
        uploaded_at: uploadedAt,
      });
      insertedIds.push(id);
    }

    return {
      success: true,
      uploadId,
      totalInserted: insertedIds.length,
      message: `Successfully uploaded ${insertedIds.length} weekly totals`,
    };
  },
});

// Get all weekly totals for a project
export const getByProject = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const totals = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    return totals.sort((a, b) => a.position - b.position);
  },
});

// Get cumulative weekly totals for a project
export const getCumulativeTotals = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const totals = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    // Sort by position
    const sortedTotals = totals.sort((a, b) => a.position - b.position);

    // Calculate cumulative amounts
    let cumulative = 0;
    const cumulativeData = sortedTotals.map((week) => {
      cumulative += week.weekly_total;
      return {
        week_date: week.week_date,
        week_date_formatted: week.week_date_formatted,
        weekly_total: week.weekly_total,
        cumulative_total: cumulative,
        position: week.position,
      };
    });

    return cumulativeData;
  },
});

// Get weekly total for a specific date
export const getByDate = query({
  args: {
    proyecto: v.id("desarrollos"),
    week_date: v.number(),
  },
  handler: async (ctx, args) => {
    const total = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto_week", (q) =>
        q.eq("proyecto", args.proyecto).eq("week_date", args.week_date)
      )
      .first();

    return total;
  },
});

// Delete all weekly totals for a project
export const deleteByProject = mutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const totals = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    for (const total of totals) {
      await ctx.db.delete(total._id);
    }

    return {
      success: true,
      deletedCount: totals.length,
      message: `Deleted ${totals.length} weekly totals`,
    };
  },
});

// Get summary statistics
export const getSummary = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const totals = await ctx.db
      .query("weekly_projected_totals")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    if (totals.length === 0) {
      return null;
    }

    const sortedTotals = totals.sort((a, b) => a.position - b.position);
    const totalAmount = sortedTotals.reduce((sum, t) => sum + t.weekly_total, 0);
    const avgWeekly = totalAmount / sortedTotals.length;
    const maxWeekly = Math.max(...sortedTotals.map((t) => t.weekly_total));
    const minWeekly = Math.min(...sortedTotals.map((t) => t.weekly_total));

    return {
      totalWeeks: sortedTotals.length,
      totalAmount,
      averageWeekly: avgWeekly,
      maxWeekly,
      minWeekly,
      firstWeek: sortedTotals[0],
      lastWeek: sortedTotals[sortedTotals.length - 1],
    };
  },
});
