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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("partidas", {
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
    });
  },
});