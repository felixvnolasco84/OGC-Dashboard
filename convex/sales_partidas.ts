import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// Create a new sales partida
export const createSalesPartida = mutation({
    args: {
        nivel: v.number(),
        nombre: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        partida_nombre: v.optional(v.string()),
        unidad: v.string(),
        cantidad: v.number(),
        precio_unitario: v.number(),
        presupuesto_original: v.number(),
        presupuesto_aprobado: v.number(),
        pagado: v.number(),
        archivo_origen: v.string(),
        sales_proyecto: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        const partidaId = await ctx.db.insert("sales_partidas", {
            nivel: args.nivel,
            nombre: args.nombre,
            familia: args.familia,
            sub_partida: args.sub_partida,
            partida_nombre: args.partida_nombre,
            unidad: args.unidad,
            cantidad: args.cantidad,
            precio_unitario: args.precio_unitario,
            presupuesto_original: args.presupuesto_original,
            presupuesto_aprobado: args.presupuesto_aprobado,
            pagado: args.pagado,
            por_gastar: args.presupuesto_aprobado - args.pagado,
            archivo_origen: args.archivo_origen,
            sales_proyecto: args.sales_proyecto,
        });

        return partidaId;
    },
});


export const getBySalesProject = query({
    args: {
        salesProjectId: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("sales_partidas")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.salesProjectId))
            .collect();
    },
});

// Update a sales partida
export const update = mutation({
    args: {
        id: v.id("sales_partidas"),
        nivel: v.number(),
        nombre: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        partida_nombre: v.optional(v.string()),
        unidad: v.string(),
        cantidad: v.number(),
        precio_unitario: v.number(),
        presupuesto_original: v.number(),
        presupuesto_aprobado: v.number(),
        pagado: v.number(),
        archivo_origen: v.string(),
        sales_proyecto: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        
        await ctx.db.patch(id, {
            ...updates,
            por_gastar: args.presupuesto_aprobado - args.pagado,
        });

        return id;
    },
});

// Paginated query for sales partidas (for DashboardTable)
export const list = query({
    args: {
        paginationOpts: paginationOptsValidator,
        proyectoId: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("sales_partidas")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyectoId))
            .paginate(args.paginationOpts);
    },
});
