import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all weekly avance real values for a project
export const getByProyecto = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const avanceRecords = await ctx.db
      .query("weekly_avance_real")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    return avanceRecords;
  },
});

// Get avance real for a specific week
export const getByProyectoAndWeek = query({
  args: {
    proyecto: v.id("desarrollos"),
    week_date: v.number(),
  },
  handler: async (ctx, args) => {
    const avanceRecord = await ctx.db
      .query("weekly_avance_real")
      .withIndex("by_proyecto_week", (q) => 
        q.eq("proyecto", args.proyecto).eq("week_date", args.week_date)
      )
      .first();

    return avanceRecord;
  },
});

// Save or update weekly avance real (upsert)
export const saveWeeklyAvance = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    week_date: v.number(),
    week_date_formatted: v.string(),
    avance_real: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if record already exists
    const existing = await ctx.db
      .query("weekly_avance_real")
      .withIndex("by_proyecto_week", (q) => 
        q.eq("proyecto", args.proyecto).eq("week_date", args.week_date)
      )
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        avance_real: args.avance_real,
        week_date_formatted: args.week_date_formatted,
        updated_at: Date.now(),
      });
      return existing._id;
    } else {
      // Create new record
      const id = await ctx.db.insert("weekly_avance_real", {
        proyecto: args.proyecto,
        week_date: args.week_date,
        week_date_formatted: args.week_date_formatted,
        avance_real: args.avance_real,
        updated_at: Date.now(),
      });
      return id;
    }
  },
});

// Save multiple weekly avance values at once (batch operation)
export const saveMultipleWeeklyAvance = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    avanceData: v.array(
      v.object({
        week_date: v.number(),
        week_date_formatted: v.string(),
        avance_real: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const weekData of args.avanceData) {
      // Check if record already exists
      const existing = await ctx.db
        .query("weekly_avance_real")
        .withIndex("by_proyecto_week", (q) => 
          q.eq("proyecto", args.proyecto).eq("week_date", weekData.week_date)
        )
        .first();

      if (existing) {
        // Update existing record
        await ctx.db.patch(existing._id, {
          avance_real: weekData.avance_real,
          week_date_formatted: weekData.week_date_formatted,
          updated_at: Date.now(),
        });
        results.push(existing._id);
      } else {
        // Create new record
        const id = await ctx.db.insert("weekly_avance_real", {
          proyecto: args.proyecto,
          week_date: weekData.week_date,
          week_date_formatted: weekData.week_date_formatted,
          avance_real: weekData.avance_real,
          updated_at: Date.now(),
        });
        results.push(id);
      }
    }

    return {
      success: true,
      count: results.length,
      ids: results,
    };
  },
});

// Delete a specific weekly avance record
export const deleteWeeklyAvance = mutation({
  args: {
    id: v.id("weekly_avance_real"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// Delete all weekly avance records for a project
export const deleteAllForProyecto = mutation({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("weekly_avance_real")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    await Promise.all(records.map((record) => ctx.db.delete(record._id)));

    return {
      success: true,
      deletedCount: records.length,
    };
  },
});
