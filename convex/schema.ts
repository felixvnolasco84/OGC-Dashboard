import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  partidas: defineTable({
    nivel: v.number(),
    nombre: v.string(),
    familia: v.string(),
    sub_partida: v.string(),
    partida_nombre: v.optional(v.string()), // Reference to parent partida for nivel 2 & 3
    unidad: v.string(),
    cantidad: v.number(),
    precio_unitario: v.number(),        
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    pagado: v.number(),    
    por_gastar: v.optional(v.number()),
    archivo_origen: v.string(),
    proyecto: v.optional(v.id("desarrollos")),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_nombre", { fields: ["nombre"] })
    .index("by_nombre_proyecto", { fields: ["nombre", "proyecto"] })
    .index("by_nombre_familia", { fields: ["nombre", "familia"] })
    .index("by_nombre_familia_proyecto", { fields: ["nombre", "familia", "proyecto"] })
    .index("by_nivel_proyecto", { fields: ["nivel", "proyecto"] })
    .index("by_proyecto_nivel_nombre", { fields: ["proyecto", "nivel", "nombre"] })
    .index("by_proyecto_nivel_partida", { fields: ["proyecto", "nivel", "partida_nombre"] })
    .index("by_proyecto_nivel_partida_familia", { fields: ["proyecto", "nivel", "partida_nombre", "familia"] }),
  desarrollos: defineTable({
    nombre: v.string(),
    descripcion: v.string(),
    image: v.string(),
  }),
  // Parent transaction that holds all payment details and documents
  transacciones: defineTable({
    proyecto: v.id("desarrollos"),
    monto_total: v.number(), // Total amount of all line items
    fecha: v.string(),
    tipo_pago: v.string(), // efectivo, transferencia, tarjeta, cheque
    moneda: v.string(), // MXN, USD, EUR
    tipo_cambio: v.string(),
    status: v.string(), // Pagado, Por pagar
    categoria: v.optional(v.string()), // anticipo, material, estimacion
    // Bank details (for non-cash payments)
    banco: v.optional(v.string()),
    tarjeta: v.optional(v.string()),
    numero_cuenta: v.optional(v.string()),
    numero_transferencia: v.optional(v.string()),
    // Reference and documents
    codigo_referencia: v.optional(v.string()),
    factura: v.optional(v.string()),
    comprobante: v.optional(v.string()),
    presupuesto_archivo: v.optional(v.string()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_status", { fields: ["status"] })
    .index("by_fecha", { fields: ["fecha"] }),
  
  // Line items (concepts) that reference a parent transaction
  pagos: defineTable({
    transaccion_id: v.id("transacciones"), // Foreign key to parent transaction
    partida_id: v.id("partidas"), // Reference to specific partida/familia/sub-partida
    monto: v.number(), // Individual line item amount
  }).index("by_transaccion", { fields: ["transaccion_id"] })
    .index("by_partida_id", { fields: ["partida_id"] }),
  documentos: defineTable({
    nombre: v.string(),
    descripcion: v.string(),
    image: v.string(),
    type: v.string(),
    transaccion_id: v.id("transacciones"), // Now references transaction instead of individual pagos
    proyecto: v.id("desarrollos"),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_transaccion", { fields: ["transaccion_id"] }),
  meticas_presupuesto: defineTable({
    proyecto: v.id("desarrollos"),
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    gasto_total: v.number(),
    por_gastar: v.number(),    
  }).index("by_proyecto", { fields: ["proyecto"] }),
});
