import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getPartidas = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("partidas").collect();
  },
});


export const getByFamily = query({
  args: {
    family: v.string(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("partidas")
      .filter((q) => q.eq(q.field("familia"), args.family))
      .order("desc")
      .take(100);
    return tasks;
  },
});

export const getByProject = query({
  args: {
    projectId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
      .collect();
  },
});

export const getProjectMetrics = query({
  args: {
    projectId: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    let partidas;
    if (!args.projectId) {
      partidas = await ctx.db.query("partidas").collect();
    } else {
      partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
    }

    // Calculate metrics
    const presupuestoAprobado = partidas.reduce(
      (sum, p) => sum + parseFloat(p.aprobado || "0"),
      0
    );
    const pagado = partidas.reduce(
      (sum, p) => sum + parseFloat(p.pagado || "0"),
      0
    );
    const porLiquidar = partidas.reduce(
      (sum, p) => sum + parseFloat(p.por_liquidar || "0"),
      0
    );
    const actual = partidas.reduce(
      (sum, p) => sum + parseFloat(p.actual || "0"),
      0
    );

    return {
      presupuestoAprobado,
      gastoTotal: pagado,
      porGastar: porLiquidar,
      actual,
      totalPartidas: partidas.length,
    };
  },
});

export const getGroupedByPartida = query({
  args: {
    projectId: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    let partidas;
    if (!args.projectId) {
      partidas = await ctx.db.query("partidas").collect();
    } else {
      partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
    }

    type PartidaType = typeof partidas[0];
    type GroupedPartida = {
      nombre: string;
      presupuestoAprobado: number;
      pagado: number;
      porLiquidar: number;
      actual: number;
      items: PartidaType[];
    };

    // Group by partida name
    const grouped = partidas.reduce((acc, p) => {
      const key = p.nombre;
      if (!acc[key]) {
        acc[key] = {
          nombre: key,
          presupuestoAprobado: 0,
          pagado: 0,
          porLiquidar: 0,
          actual: 0,
          items: [],
        };
      }
      acc[key].presupuestoAprobado += parseFloat(p.aprobado || "0");
      acc[key].pagado += parseFloat(p.pagado || "0");
      acc[key].porLiquidar += parseFloat(p.por_liquidar || "0");
      acc[key].actual += parseFloat(p.actual || "0");
      acc[key].items.push(p);
      return acc;
    }, {} as Record<string, GroupedPartida>);

    return Object.values(grouped);
  },
});

export const getGroupedByFamilia = query({
  args: {
    projectId: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    let partidas;
    if (!args.projectId) {
      partidas = await ctx.db.query("partidas").collect();
    } else {
      partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
    }

    type PartidaType = typeof partidas[0];
    type GroupedFamilia = {
      familia: string;
      presupuestoAprobado: number;
      pagado: number;
      porLiquidar: number;
      actual: number;
      items: PartidaType[];
    };

    // Group by familia
    const grouped = partidas.reduce((acc, p) => {
      const key = p.familia;
      if (!acc[key]) {
        acc[key] = {
          familia: key,
          presupuestoAprobado: 0,
          pagado: 0,
          porLiquidar: 0,
          actual: 0,
          items: [],
        };
      }
      acc[key].presupuestoAprobado += parseFloat(p.aprobado || "0");
      acc[key].pagado += parseFloat(p.pagado || "0");
      acc[key].porLiquidar += parseFloat(p.por_liquidar || "0");
      acc[key].actual += parseFloat(p.actual || "0");
      acc[key].items.push(p);
      return acc;
    }, {} as Record<string, GroupedFamilia>);

    return Object.values(grouped);
  },
});



export const createPartida = mutation({
  args: {
    nombre: v.string(),
    familia: v.string(),
    sub_partida: v.string(),
    Cantidad: v.string(),
    PrecioUnitario: v.string(),
    Subtotal: v.string(),
    Iva: v.string(),
    total: v.string(),
    aprobado: v.string(),
    pagado: v.string(),
    por_liquidar: v.string(),
    actual: v.string(),
    fecha_carga: v.string(),
    archivo_origen: v.string(),
    proyecto: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    const partida = await ctx.db.insert("partidas", {
      nombre: args.nombre,
      familia: args.familia,
      sub_partida: args.sub_partida,
      Cantidad: args.Cantidad,
      PrecioUnitario: args.PrecioUnitario,
      Subtotal: args.Subtotal,
      Iva: args.Iva,
      total: args.total,
      aprobado: args.aprobado,
      pagado: args.pagado,
      por_liquidar: args.por_liquidar,
      actual: args.actual,
      fecha_carga: args.fecha_carga,
      archivo_origen: args.archivo_origen,
      proyecto: args.proyecto,
    });
    return partida;
  },
});

export const update = mutation({
  args: {
    id: v.id("partidas"),
    nombre: v.string(),
    familia: v.string(),
    sub_partida: v.string(),
    Cantidad: v.string(),
    PrecioUnitario: v.string(),
    Subtotal: v.string(),
    Iva: v.string(),
    total: v.string(),
    aprobado: v.string(),
    pagado: v.string(),
    por_liquidar: v.string(),
    actual: v.string(),
    fecha_carga: v.string(),
    archivo_origen: v.string(),
    proyecto: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {

    const { id, ...rest } = args;
    const existingPartida = await ctx.db.get(id);

    if (!existingPartida) {
      throw new Error("Not found");
    }

    const updatedPartida = await ctx.db.patch(args.id, {
      ...rest,
    });
    return updatedPartida;
  },
});