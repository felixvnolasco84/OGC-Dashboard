import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(), // Clerk user ID
    email: v.string(),
    name: v.string(),
    role: v.string(), // "admin", "user", "viewer"
    allowed_desarrollos: v.array(v.id("desarrollos")), // Projects user can access
    allowed_sales_projects: v.optional(v.array(v.id("sales_projects"))), // Sales projects user can access
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
    moneda_principal: v.optional(v.string()), // Primary currency for project (MXN, USD, EUR) - auto-updated from transactions
  }),
  sales_projects: defineTable({
    nombre: v.string(),
    descripcion: v.string(),
    image: v.string(),
    status: v.optional(v.string()), // Activo, Cancelado, Entregado
    fecha_creacion: v.optional(v.string()),
    comision_porcentaje: v.optional(v.number()), // Commission percentage for sales
    comision_monto: v.optional(v.number()), // Auto-calculated commission amount
    moneda_principal: v.optional(v.string()), // Primary currency for sales project (MXN, USD, EUR) - auto-updated from transactions
  }),
  // Sales project line items (similar to partidas but for sales)
  sales_partidas: defineTable({
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
    avance: v.optional(v.number()), // Progress percentage (pagado / presupuesto_aprobado * 100)
    archivo_origen: v.string(),
    sales_proyecto: v.optional(v.id("sales_projects")),
  }).index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_nombre", { fields: ["nombre"] })
    .index("by_nombre_sales_proyecto", { fields: ["nombre", "sales_proyecto"] })
    .index("by_nombre_familia", { fields: ["nombre", "familia"] })
    .index("by_nombre_familia_sales_proyecto", { fields: ["nombre", "familia", "sales_proyecto"] })
    .index("by_nivel_sales_proyecto", { fields: ["nivel", "sales_proyecto"] })
    .index("by_sales_proyecto_nivel_nombre", { fields: ["sales_proyecto", "nivel", "nombre"] })
    .index("by_sales_proyecto_nivel_partida", { fields: ["sales_proyecto", "nivel", "partida_nombre"] })
    .index("by_sales_proyecto_nivel_partida_familia", { fields: ["sales_proyecto", "nivel", "partida_nombre", "familia"] }),
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
  
  // Sales transactions for sales projects
  sales_transacciones: defineTable({
    sales_proyecto: v.id("sales_projects"),
    monto_total: v.number(), // Total amount of all line items
    fecha: v.string(),
    tipo_pago: v.string(), // efectivo, transferencia, tarjeta, cheque
    moneda: v.string(), // MXN, USD, EUR
    tipo_cambio: v.string(),
    status: v.string(), // Pagado, Por pagar
    categoria: v.optional(v.string()), // venta, anticipo, pago_final
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
    nombre_cliente: v.optional(v.string()),
  }).index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_status", { fields: ["status"] })
    .index("by_fecha", { fields: ["fecha"] }),
  
  // Line items (concepts) that reference a parent transaction
  pagos: defineTable({
    transaccion_id: v.id("transacciones"), // Foreign key to parent transaction
    partida_id: v.id("partidas"), // Reference to specific partida/familia/sub-partida
    monto: v.number(), // Individual line item amount
  }).index("by_transaccion", { fields: ["transaccion_id"] })
    .index("by_partida_id", { fields: ["partida_id"] }),
  
  // Sales line items that reference a parent sales transaction
  sales_pagos: defineTable({
    sales_transaccion_id: v.id("sales_transacciones"), // Foreign key to parent sales transaction
    sales_partida_id: v.id("sales_partidas"), // Reference to specific sales partida
    monto: v.number(), // Individual line item amount
  }).index("by_sales_transaccion", { fields: ["sales_transaccion_id"] })
    .index("by_sales_partida_id", { fields: ["sales_partida_id"] }),
  
  documentos: defineTable({
    nombre: v.string(),
    descripcion: v.string(),
    image: v.optional(v.string()), // Legacy: Appwrite file ID (kept for backward compatibility)
    storage_id: v.optional(v.id("_storage")), // New: Convex storage ID
    type: v.string(),
    size: v.optional(v.number()), // File size in bytes
    transaccion_id: v.optional(v.id("transacciones")), // References regular transaction
    sales_transaccion_id: v.optional(v.id("sales_transacciones")), // References sales transaction
    proyecto: v.optional(v.id("desarrollos")), // Regular project
    sales_proyecto: v.optional(v.id("sales_projects")), // Sales project
    uploaded_at: v.optional(v.number()), // Timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_transaccion", { fields: ["transaccion_id"] })
    .index("by_sales_transaccion", { fields: ["sales_transaccion_id"] }),
  meticas_presupuesto: defineTable({
    proyecto: v.id("desarrollos"),
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    gasto_total: v.number(),
    por_gastar: v.number(),    
  }).index("by_proyecto", { fields: ["proyecto"] }),
  sales_meticas_presupuesto: defineTable({
    sales_proyecto: v.id("sales_projects"),
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    gasto_total: v.number(),
    por_gastar: v.number(),    
  }).index("by_sales_proyecto", { fields: ["sales_proyecto"] }),
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
  
  // Sales projected transactions from Excel upload (weekly cash flow projections)
  sales_projected_transactions: defineTable({
    sales_proyecto: v.id("sales_projects"),
    partida: v.string(), // Partida name from Excel
    week_date: v.number(), // Excel serial date (days since 1/1/1900)
    amount: v.number(), // Projected amount for this week
    position: v.number(), // Week position index (0-based)
    // Upload metadata
    upload_id: v.string(), // Unique ID for each upload batch
    file_name: v.string(),
    sheet_name: v.string(),
    uploaded_at: v.number(), // Timestamp
  }).index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_upload_id", { fields: ["upload_id"] })
    .index("by_sales_proyecto_partida", { fields: ["sales_proyecto", "partida"] })
    .index("by_sales_proyecto_week", { fields: ["sales_proyecto", "week_date"] }),
  
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
  
  // Sales weekly projected totals (aggregated summary of sales_projected_transactions by week)
  sales_weekly_projected_totals: defineTable({
    sales_proyecto: v.id("sales_projects"),
    week_date: v.number(), // Excel serial date (days since 1/1/1900)
    week_date_formatted: v.string(), // Formatted date string (D/M/YYYY)
    weekly_total: v.number(), // Total projected amount for this week across all partidas
    position: v.number(), // Week position index (0-based)
    // Upload metadata
    upload_id: v.string(), // Unique ID linking to source upload
    uploaded_at: v.number(), // Timestamp
  }).index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_sales_proyecto_week", { fields: ["sales_proyecto", "week_date"] })
    .index("by_upload_id", { fields: ["upload_id"] }),
  
  // Chart configurations per user (for FamiliaChart and other customizable charts)
  chart_configurations: defineTable({
    user_id: v.id("users"), // User who owns this configuration
    proyecto_id: v.union(v.id("desarrollos"), v.id("sales_projects")), // Project this chart belongs to (regular or sales)
    chart_id: v.string(), // Unique identifier for chart instance (e.g., "familia-chart-1")
    title: v.string(), // Chart title
    color: v.string(), // Chart color (hex code)
    height: v.optional(v.number()), // Chart height in pixels
    // Filters
    partidas: v.optional(v.array(v.string())), // Filter by partida names
    familias: v.optional(v.array(v.string())), // Filter by familia names
    sub_partidas: v.optional(v.array(v.string())), // Filter by sub-partida names
    // Metadata
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_user", { fields: ["user_id"] })
    .index("by_proyecto", { fields: ["proyecto_id"] })
    .index("by_user_proyecto", { fields: ["user_id", "proyecto_id"] })
    .index("by_user_proyecto_chart", { fields: ["user_id", "proyecto_id", "chart_id"] }),

  // Weekly avance real (user-defined progress percentage per week)
  weekly_avance_real: defineTable({
    proyecto: v.id("desarrollos"),
    week_date: v.number(), // Excel serial date (days since 1/1/1900)
    week_date_formatted: v.string(), // Formatted date string (DD Mon YYYY)
    avance_real: v.number(), // Progress percentage (0-100)
    // Metadata
    updated_at: v.number(), // Last update timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_week", { fields: ["proyecto", "week_date"] }),
});
