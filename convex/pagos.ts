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

// Query to get all payments by partida name (for level 0 aggregation)
// Filters by proyecto to prevent cross-project collisions
export const getByPartidaName = query({
    args: {
        partida_name: v.string(),
        proyecto_id: v.optional(v.id("desarrollos")),
    },
    handler: async (ctx, args) => {
        const payments = await ctx.db
            .query("pagos")
            .filter((q) => {
                if (args.proyecto_id) {
                    return q.and(
                        q.eq(q.field("partida"), args.partida_name),
                        q.eq(q.field("proyecto"), args.proyecto_id)
                    );
                }
                return q.eq(q.field("partida"), args.partida_name);
            })
            .collect();

        return payments;
    },
});

// Query to get all payments by familia (for level 1 aggregation)
// Filters by both partida and proyecto to prevent collisions
export const getByFamilia = query({
    args: {
        partida_name: v.string(),
        familia_name: v.string(),
        proyecto_id: v.optional(v.id("desarrollos")),
    },
    handler: async (ctx, args) => {
        const payments = await ctx.db
            .query("pagos")
            .filter((q) => {
                if (args.proyecto_id) {
                    return q.and(
                        q.eq(q.field("partida"), args.partida_name),
                        q.eq(q.field("familia"), args.familia_name),
                        q.eq(q.field("proyecto"), args.proyecto_id)
                    );
                }
                return q.and(
                    q.eq(q.field("partida"), args.partida_name),
                    q.eq(q.field("familia"), args.familia_name)
                );
            })
            .collect();

        return payments;
    },
});

export const getByProyecto = query({
    args: {
        proyecto_id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const payments = await ctx.db
            .query("pagos")
            .filter((q) => q.eq(q.field("proyecto"), args.proyecto_id))
            .collect();

        return payments;
    },
});
