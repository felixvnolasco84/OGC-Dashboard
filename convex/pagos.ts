import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
    args: {
        partida_id: v.id("partidas"),
        partida: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        monto: v.number(),
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
        status: v.string(),
        proyecto: v.id("desarrollos"),
        informacion_facturacion_pago: v.optional(v.id("informacion_facturacion_pago")),
    },
    handler: async (ctx, args) => {
        const existingPartida = await ctx.db.get(args.partida_id);

        if (!existingPartida) {
            throw new Error("Not found");
        }

        const createdPayment = await ctx.db.insert("pagos", {
            ...args,
            partida_id: args.partida_id,
            administracion: existingPartida.nombre,
            partida: existingPartida.nombre,
            sub_partida: existingPartida.sub_partida,
            status: args.status,
            familia: existingPartida.familia,
            logo_banco: "",
        });
        return createdPayment;
    },
});

export const update = mutation({
    args: {
        id: v.id("pagos"),
        monto: v.number(),
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
        status: v.string(),
        proyecto: v.id("desarrollos"),
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

export const deletePayment = mutation({
    args: {
        id: v.id("pagos"),
    },
    handler: async (ctx, args) => {
        const { id } = args;
        const existingPayment = await ctx.db.get(id);
        if (!existingPayment) {
            throw new Error("Payment not found");
        }
        await ctx.db.delete(id);
    },
});

// Query to get all payments for a specific partida
export const getByPartidaId = query({
    args: {
        partida_id: v.id("partidas"),
    },
    handler: async (ctx, args) => {
        const payments = await ctx.db
            .query("pagos")
            .filter((q) => q.eq(q.field("partida_id"), args.partida_id))
            .collect();
        
        return payments;
    },
});
