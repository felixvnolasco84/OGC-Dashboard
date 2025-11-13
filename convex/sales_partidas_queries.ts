import { query } from "./_generated/server";
import { v } from "convex/values";

// Get all sales partidas for a sales project
export const getBySalesProyecto = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    const partidas = await ctx.db
      .query("sales_partidas")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    return partidas;
  },
});
