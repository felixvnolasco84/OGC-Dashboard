import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    partidas: defineTable({
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
    }),
  });
