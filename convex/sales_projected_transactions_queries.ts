import { query } from "./_generated/server";
import { v } from "convex/values";

// Get projected transactions by sales project
export const getBySalesProject = query({
  args: { sales_proyecto: v.id("sales_projects") },
  handler: async (ctx, args) => {
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
    const projections = await ctx.db
      .query("sales_projected_transactions")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto))
      .collect();

    if (projections.length === 0) return null;

    // Get most recent upload
    const mostRecent = projections.reduce((latest, current) => {
      return current.uploaded_at > latest.uploaded_at ? current : latest;
    });

    return {
      upload_id: mostRecent.upload_id,
      file_name: mostRecent.file_name,
      uploaded_at: mostRecent.uploaded_at,
      total_records: projections.length,
    };
  },
});
