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
