import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get transactions by sales project (without details)
export const getBySalesProyecto = query({
  args: { sales_proyecto_id: v.id("sales_projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sales_transacciones")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .collect();
  },
});

// Get transactions by sales project with details
export const getBySalesProyectoWithDetails = query({
  args: { sales_proyecto_id: v.id("sales_projects") },
  handler: async (ctx, args) => {
    const transacciones = await ctx.db
      .query("sales_transacciones")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .collect();

    // For each transaction, get its line items (pagos) and count documents
    const transaccionesWithDetails = await Promise.all(
      transacciones.map(async (transaccion) => {
        // Get line items (pagos)
        const lineItems = await ctx.db
          .query("sales_pagos")
          .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", transaccion._id))
          .collect();

        // Get documents count
        const documentos = await ctx.db
          .query("documentos")
          .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", transaccion._id))
          .collect();

        return {
          ...transaccion,
          conceptosCount: lineItems.length,
          documentosCount: documentos.length,
        };
      })
    );

    return transaccionesWithDetails;
  },
});

// Delete a sales transaction
export const deleteTransaction = mutation({
  args: { id: v.id("sales_transacciones") },
  handler: async (ctx, args) => {
    // Delete all line items first
    const lineItems = await ctx.db
      .query("sales_pagos")
      .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
      .collect();

    for (const item of lineItems) {
      await ctx.db.delete(item._id);
    }

    // Delete the transaction
    await ctx.db.delete(args.id);
  },
});
