import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const update = mutation({
    args: {
        id: v.id("costos"),
        administracion: v.string(),
        familia: v.string(),
        partida: v.string(),
        sub_partida: v.string(),
        monto: v.string(),
        fecha: v.string(),
        codigo_referencia: v.string(),
        factura: v.string(),
    },
    handler: async (ctx, args) => {

        const { id, ...rest } = args;
        const existingCost = await ctx.db.get(id);

        if (!existingCost) {
            throw new Error("Not found");
        }

        const updatedCost = await ctx.db.patch(args.id, {
            ...rest,
        });
        return updatedCost;
    },
});

export const getCostos = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("costos").collect();
    },
});

export const getAllDiferentAdministracion = query(async (ctx) => {
    const distinctValues: string[] = [];
    let doc = await ctx.db
        .query("costos")
        .withIndex("by_administracion")
        .order("desc")
        .first();
    while (doc !== null) {
        distinctValues.push(doc.administracion);
        const administracion = doc.administracion;
        doc = await ctx.db
            .query("costos")
            .withIndex("by_administracion", (q) => q.lt("administracion", administracion))
            .order("desc")
            .first();
    }
    return distinctValues;
});

export const getAllDiferentFamilia = query(async (ctx) => {
    const distinctValues: string[] = [];
    let doc = await ctx.db
        .query("costos")
        .withIndex("by_familia")
        .order("desc")
        .first();
    while (doc !== null) {
        distinctValues.push(doc.familia);
        const familia = doc.familia;
        doc = await ctx.db
            .query("costos")
            .withIndex("by_familia", (q) => q.lt("familia", familia))
            .order("desc")
            .first();
    }
    return distinctValues;
});

export const getAllDiferentFamiliaByPartida = query({
    args: {
        administracion: v.string(),
        partida: v.string()
    },
    handler: async (ctx, args) => {
        const distinctValues: string[] = [];
        let doc = await ctx.db
            .query("costos")
            .withIndex("by_familia")
            .filter((q) => q.eq(q.field("administracion"), args.administracion))
            .filter((q) => q.eq(q.field("partida"), args.partida))
            .order("desc")
            .first();
        while (doc !== null) {
            distinctValues.push(doc.familia);
            const familia = doc.familia;
            doc = await ctx.db
                .query("costos")
                .withIndex("by_familia", (q) => q.lt("familia", familia))
                .filter((q) => q.eq(q.field("administracion"), args.administracion))
                .filter((q) => q.eq(q.field("partida"), args.partida))
                .order("desc")
                .first();
        }
        return distinctValues;
    },
});



export const getAllDiferentPartida = query(async (ctx) => {
    const distinctValues: string[] = [];
    let doc = await ctx.db
        .query("costos")
        .withIndex("by_partida")
        .order("desc")
        .first();
    while (doc !== null) {
        distinctValues.push(doc.partida);
        const partida = doc.partida;
        doc = await ctx.db
            .query("costos")
            .withIndex("by_partida", (q) => q.lt("partida", partida))
            .order("desc")
            .first();
    }
    return distinctValues;
})

export const getAllDiferentPartidaByAdministracion = query({
    args: {
        administracion: v.string(),
    },
    handler: async (ctx, args) => {
        const distinctValues: string[] = [];
        let doc = await ctx.db
            .query("costos")
            .withIndex("by_partida")
            .filter((q) => q.eq(q.field("administracion"), args.administracion))
            .order("desc")
            .first();
        while (doc !== null) {
            distinctValues.push(doc.partida);
            const partida = doc.partida;
            doc = await ctx.db
                .query("costos")
                .withIndex("by_partida", (q) => q.lt("partida", partida))
                .filter((q) => q.eq(q.field("administracion"), args.administracion))
                .order("desc")
                .first();
        }
        return distinctValues;
    },
})

export const getAllDiferentSubPartida = query(async (ctx) => {
    const distinctValues: string[] = [];
    let doc = await ctx.db
        .query("costos")
        .withIndex("by_sub_partida")
        .order("desc")
        .first();
    while (doc !== null) {
        distinctValues.push(doc.sub_partida);
        const sub_partida = doc.sub_partida;
        doc = await ctx.db
            .query("costos")
            .withIndex("by_sub_partida", (q) => q.lt("sub_partida", sub_partida))
            .order("desc")
            .first();
    }
    return distinctValues;
});

export const getAllDiferentSubPartidaByPartida = query({
    args: {
        administracion: v.string(),
        partida: v.string(),
        familia: v.string(),
    },
    handler: async (ctx, args) => {
        const distinctValues: string[] = [];
        let doc = await ctx.db
            .query("costos")
            .withIndex("by_sub_partida")
            .filter((q) => q.eq(q.field("administracion"), args.administracion))
            .filter((q) => q.eq(q.field("partida"), args.partida))
            .filter((q) => q.eq(q.field("familia"), args.familia))
            .order("desc")
            .first();
        while (doc !== null) {
            distinctValues.push(doc.sub_partida);
            const sub_partida = doc.sub_partida;
            doc = await ctx.db
                .query("costos")
                .withIndex("by_sub_partida", (q) => q.lt("sub_partida", sub_partida))
                .filter((q) => q.eq(q.field("administracion"), args.administracion))
                .filter((q) => q.eq(q.field("partida"), args.partida))
                .filter((q) => q.eq(q.field("familia"), args.familia))
                .order("desc")
                .first();
        }
        return distinctValues;
    },
})

export const getByAdministracion = query({
    args: {
        administracion: v.string(),
    },
    handler: async (ctx, args) => {
        const tasks = await ctx.db
            .query("costos")
            .filter((q) => q.eq(q.field("administracion"), args.administracion))
            .order("desc")
            .take(100);
        return tasks;
    },
});


export const getByDiferentFilters = query({
    args: {
        administracion: v.string(),
        partida: v.optional(v.string()),
        sub_partida: v.optional(v.string()),
        family: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let queryBuilder = ctx.db
            .query("costos")
            .filter((q) => q.eq(q.field("administracion"), args.administracion));

        if (args.partida) {
            queryBuilder = queryBuilder.filter((q) => q.eq(q.field("partida"), args.partida));
        }

        if (args.family) {
            queryBuilder = queryBuilder.filter((q) => q.eq(q.field("familia"), args.family));
        }

        if (args.sub_partida) {
            queryBuilder = queryBuilder.filter((q) => q.eq(q.field("sub_partida"), args.sub_partida));
        }


        const tasks = await queryBuilder
            .order("desc")
            .take(100);

        return tasks;
    },
});

export const getByPartida = query({
    args: {
        partida: v.string(),
    },
    handler: async (ctx, args) => {
        const tasks = await ctx.db
            .query("costos")
            .filter((q) => q.eq(q.field("partida"), args.partida))
            .order("desc")
            .take(100);
        return tasks;
    },
});

export const getBySubPartida = query({
    args: {
        sub_partida: v.string(),
    },
    handler: async (ctx, args) => {
        const tasks = await ctx.db
            .query("costos")
            .filter((q) => q.eq(q.field("sub_partida"), args.sub_partida))
            .order("desc")
            .take(100);
        return tasks;
    },
});

export const getByFamily = query({
    args: {
        family: v.string(),
    },
    handler: async (ctx, args) => {
        const tasks = await ctx.db
            .query("costos")
            .filter((q) => q.eq(q.field("familia"), args.family))
            .order("desc")
            .take(100);
        return tasks;
    },
});


export const createCosto = mutation({

    args: {
        administracion: v.string(),
        partida: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        monto: v.string(),
        fecha: v.string(),
        codigo_referencia: v.string(),
        factura: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("costos", {
            administracion: args.administracion,
            partida: args.partida,
            familia: args.familia,
            sub_partida: args.sub_partida,
            monto: args.monto,
            fecha: args.fecha,
            codigo_referencia: args.codigo_referencia,
            factura: args.factura,
        });
    },
});