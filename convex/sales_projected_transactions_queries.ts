import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertProjectionAccess, currentProjectionMetadata } from "./projectionImportHistory";

// Get projected transactions by sales project
export const getBySalesProject = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, { kind: "collection", project_id: args.sales_proyecto });
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    return projections;
  },
});

// Get upload metadata for a sales project
export const getUploadMetadata = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
    return currentProjectionMetadata(ctx, { kind: "collection", project_id: args.sales_proyecto });
  },
});
