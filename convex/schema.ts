import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(), // Clerk user ID
    email: v.string(),
    name: v.string(),
    role: v.string(), // "admin", "user", "viewer"
    allowed_desarrollos: v.array(v.id("desarrollos")), // Projects user can access
    created_at: v.number(),
    last_login: v.optional(v.number()),
  }).index("by_clerk_id", { fields: ["clerkId"] })
    .index("by_email", { fields: ["email"] }),
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
    status: v.optional(v.string()), // Activo, Cancelado, Entregado
    fecha_creacion: v.optional(v.string()),
    honorarios_porcentaje: v.optional(v.number()), // User-set percentage (e.g., 15 for 15%)
    honorarios_monto: v.optional(v.number()), // Auto-calculated amount based on percentage
    excluded_partidas_honorarios: v.optional(v.array(v.id("partidas"))),
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
    image: v.optional(v.string()), // Legacy: Appwrite file ID (kept for backward compatibility)
    storage_id: v.optional(v.id("_storage")), // New: Convex storage ID
    type: v.string(),
    size: v.optional(v.number()), // File size in bytes
    transaccion_id: v.id("transacciones"), // Now references transaction instead of individual pagos
    proyecto: v.id("desarrollos"),
    uploaded_at: v.optional(v.number()), // Timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_transaccion", { fields: ["transaccion_id"] }),
  meticas_presupuesto: defineTable({
    proyecto: v.id("desarrollos"),
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    gasto_total: v.number(),
    por_gastar: v.number(),    
  }).index("by_proyecto", { fields: ["proyecto"] }),
  proveedores: defineTable({
    razon_social: v.string(),
    rfc: v.string(),
    direccion: v.string(),
    nombre_contacto: v.string(),
    telefono_contacto: v.string(),
    cuenta: v.string(),
    clabe: v.string(),
    banco: v.string(),
  }).index("by_rfc", { fields: ["rfc"] })
    .index("by_razon_social", { fields: ["razon_social"] }),
  
  // Projected transactions from Excel upload (weekly cash flow projections)
  projected_transactions: defineTable({
    proyecto: v.id("desarrollos"),
    partida: v.string(), // Partida name from Excel (e.g., "CIMENTACIÓN", "MUROS_PB")
    week_date: v.number(), // Excel serial date (days since 1/1/1900)
    amount: v.number(), // Projected amount for this week
    position: v.number(), // Week position index (0-based)
    // Upload metadata
    upload_id: v.string(), // Unique ID for each upload batch
    file_name: v.string(),
    sheet_name: v.string(),
    uploaded_at: v.number(), // Timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_upload_id", { fields: ["upload_id"] })
    .index("by_proyecto_partida", { fields: ["proyecto", "partida"] })
    .index("by_proyecto_week", { fields: ["proyecto", "week_date"] }),
  
  // Weekly projected totals (aggregated summary of projected_transactions by week)
  weekly_projected_totals: defineTable({
    proyecto: v.id("desarrollos"),
    week_date: v.number(), // Excel serial date (days since 1/1/1900)
    week_date_formatted: v.string(), // Formatted date string (D/M/YYYY)
    weekly_total: v.number(), // Total projected amount for this week across all partidas
    position: v.number(), // Week position index (0-based)
    // Upload metadata
    upload_id: v.string(), // Unique ID linking to source upload
    uploaded_at: v.number(), // Timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_week", { fields: ["proyecto", "week_date"] })
    .index("by_upload_id", { fields: ["upload_id"] }),
});
