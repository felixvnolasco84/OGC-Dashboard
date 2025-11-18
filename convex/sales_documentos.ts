import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get all sales documents
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const documentos = await ctx.db
      .query("documentos")
      .collect();
    
    // Filter only documents with sales_proyecto field
    return documentos.filter(doc => doc.sales_proyecto !== undefined);
  },
});

// Get all documents for a sales project
export const getBySalesProyecto = query({
  args: { sales_proyecto_id: v.id("sales_projects") },
  handler: async (ctx, args) => {
    const documentos = await ctx.db
      .query("documentos")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .collect();
    
    return documentos;
  },
});

// Delete a document
export const deleteDocument = mutation({
  args: { id: v.id("documentos") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
