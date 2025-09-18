import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
    args: {
        monto: v.string(),
        fecha: v.string(),
        tipo_pago: v.string(),
        banco: v.string(),
        tarjeta: v.string(),
        numero_cuenta: v.string(),
        numero_transferencia: v.string(),
        codigo_referencia: v.string(),
        factura: v.string(),
        moneda: v.string(),
        tipo_cambio: v.string(),
        costo_id: v.id("costos"),
        informacion_facturacion_pago: v.optional(v.id("informacion_facturacion_pago")),
    },
    handler: async (ctx, args) => {
        const existingCost = await ctx.db.get(args.costo_id);

        if (!existingCost) {
            throw new Error("Not found");
        }

        const createdPayment = await ctx.db.insert("pagos", {
            ...args,
            administracion: existingCost.administracion,
            partida: existingCost.partida,
            sub_partida: existingCost.sub_partida,
            familia: existingCost.familia,
            logo_banco: "",
        });
        return createdPayment;
    },
});

export const update = mutation({
    args: {
        id: v.id("pagos"),
        monto: v.string(),
        fecha: v.string(),
        tipo_pago: v.string(),
        banco: v.string(),
        tarjeta: v.string(),
        numero_cuenta: v.string(),
        numero_transferencia: v.string(),
        codigo_referencia: v.string(),
        factura: v.string(),
        moneda: v.string(),
        tipo_cambio: v.string(),
        informacion_facturacion_pago: v.optional(v.id("informacion_facturacion_pago")),
    },
    handler: async (ctx, args) => {
        const { id, ...updateData } = args;
        
        const existingPayment = await ctx.db.get(id);
        if (!existingPayment) {
            throw new Error("Payment not found");
        }

        const updatedPayment = await ctx.db.patch(id, updateData);
        return updatedPayment;
    },
});