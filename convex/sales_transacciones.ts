import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";

// Create a new sales transaction with line items
export const createSalesTransaction = mutation({
    args: {
        sales_proyecto: v.id("sales_projects"),
        nombre_cliente: v.string(),
        monto_total: v.number(),
        fecha: v.string(),
        tipo_pago: v.string(),
        moneda: v.string(),
        tipo_cambio: v.string(),
        status: v.string(),
        categoria: v.optional(v.string()),
        banco: v.optional(v.string()),
        tarjeta: v.optional(v.string()),
        numero_cuenta: v.optional(v.string()),
        numero_transferencia: v.optional(v.string()),
        codigo_referencia: v.optional(v.string()),
        factura: v.optional(v.string()),
        comprobante: v.optional(v.string()),
        presupuesto_archivo: v.optional(v.string()),
        lineItems: v.array(
            v.object({
                sales_partida_id: v.id("sales_partidas"),
                monto: v.number(),
            })
        ),
    },
    handler: async (ctx, args) => {
        const { lineItems, ...transactionData } = args;

        // Create the parent transaction
        const transactionId = await ctx.db.insert("sales_transacciones", transactionData);

        // Create all line items (pagos)
        const pagoPromises = lineItems.map((item) =>
            ctx.db.insert("sales_pagos", {
                sales_transaccion_id: transactionId,
                sales_partida_id: item.sales_partida_id,
                monto: item.monto,
            })
        );

        await Promise.all(pagoPromises);

        return transactionId;
    },
});


// Get all transactions with project name, line items count, and documents count
export const getAllWithDetails = query({
    args: {},
    handler: async (ctx) => {
        const transactions = await ctx.db
            .query("sales_transacciones")
            .order("desc")
            .collect();

        // For each transaction, get related data
        const transactionsWithDetails = await Promise.all(
            transactions.map(async (transaction) => {
                // Get project name
                const proyecto = await ctx.db.get(transaction.sales_proyecto);

                // Count line items
                const lineItems = await ctx.db
                    .query("sales_pagos")
                    .withIndex("by_sales_transaccion", (q) =>
                        q.eq("sales_transaccion_id", transaction._id)
                    )
                    .collect();

                // Count documents
                const documents = await ctx.db
                    .query("documentos")
                    .withIndex("by_sales_transaccion", (q) =>
                        q.eq("sales_transaccion_id", transaction._id)
                    )
                    .collect();

                return {
                    ...transaction,
                    proyectoNombre: proyecto?.nombre,
                    lineItemsCount: lineItems.length,
                    documentsCount: documents.length,
                };
            })
        );

        return transactionsWithDetails;
    },
});

// Delete transaction and all its line items
export const deleteTransaction = mutation({
    args: {
        id: v.id("sales_transacciones"),
    },
    handler: async (ctx, args) => {
        const existingTransaction = await ctx.db.get(args.id);
        if (!existingTransaction) {
            throw new Error("Transaction not found");
        }

        // Delete all line items (pagos) associated with this transaction
        const lineItems = await ctx.db
            .query("sales_pagos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        for (const item of lineItems) {
            await ctx.db.delete(item._id);
        }

        // Delete associated documents
        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        for (const doc of documents) {
            await ctx.db.delete(doc._id);
        }

        // Delete the transaction
        await ctx.db.delete(args.id);
    },
});


export const getTransactionById = query({
    args: {
        id: v.id("sales_transacciones"),
    },
    handler: async (ctx, args) => {
        const transaction = await ctx.db.get(args.id);
        if (!transaction) {
            return null;
        }

        // Get all line items for this transaction
        const lineItems = await ctx.db
            .query("sales_pagos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        // Get associated documents
        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        return {
            ...transaction,
            lineItems,
            documents,
        };
    },
});