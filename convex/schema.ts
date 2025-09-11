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
  desarrollos: defineTable({
    nombre: v.string(),
    image: v.string(),
  }),
  costos: defineTable({
    administracion: v.string(),
    partida: v.string(),
    familia: v.string(),
    sub_partida: v.string(),
    monto: v.string(),
    fecha: v.string(),
    codigo_referencia: v.string(),
    factura: v.string(),

  }).index("by_administracion", { fields: ["administracion"] }).index("by_partida", { fields: ["partida"] }).index("by_familia", { fields: ["familia"] }).index("by_sub_partida", { fields: ["sub_partida"] }),
});
