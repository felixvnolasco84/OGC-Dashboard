import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(), // Clerk user ID
    email: v.string(),
    name: v.string(),
    role: v.string(), // "admin", "user", "viewer", "contratista"
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
    partida_id: v.optional(v.id("partidas")), // Linked Level 1 Partida for bitacora
    bitacora_id: v.optional(v.union(v.id("documentos"), v.id("bitacora"))), // Parent bitacora entry ID for photos
    comment: v.optional(v.string()), // Comment for bitacora photos
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_transaccion", { fields: ["transaccion_id"] })
    .index("by_sales_transaccion", { fields: ["sales_transaccion_id"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_bitacora_id", { fields: ["bitacora_id"] }),
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
    created_by: v.optional(v.id("users")), // User who created this provider
    created_at: v.optional(v.number()), // Timestamp when created
  }).index("by_rfc", { fields: ["rfc"] })
    .index("by_razon_social", { fields: ["razon_social"] })
    .index("by_created_by", { fields: ["created_by"] }),
  
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
  chart_configurations_sales: defineTable({
    user_id: v.id("users"), // User who owns this configuration
    proyecto_id: v.id("sales_projects"), // Project this chart belongs to (regular or sales)
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
  
  // Bitacora (Construction Log) - Daily reports with partida and familia tags
  bitacora: defineTable({
    proyecto: v.id("desarrollos"),
    categoria: v.string(), // Estructura, Instalaciones, Acabados, Seguridad, Generales
    partida_id: v.id("partidas"), // Level 1 item (Instalaciones, Estructura, etc.)
    familias_tags: v.array(v.string()), // Level 2 items tags (INSTALACIONES HIDRÁULICAS, etc.)
    responsable: v.string(),
    fecha: v.string(), // DD/MM/YYYY or "DD Mes, YYYY"
    avance_dia: v.string(), // Daily progress notes
    comentarios: v.optional(v.string()), // Retos / Incidencias
    status: v.optional(v.string()), // "Sin problemas", "Con retrasos", etc.
    // Metadata
    uploaded_at: v.number(), // Timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_proyecto_partida", { fields: ["proyecto", "partida_id"] })
    .index("by_proyecto_fecha", { fields: ["proyecto", "fecha"] })
    .index("by_proyecto_categoria", { fields: ["proyecto", "categoria"] }),
  
  // Photo comments - Multiple comments per photo with user attribution
  photo_comments: defineTable({
    photo_id: v.id("documentos"), // Reference to the photo document
    user_id: v.id("users"), // User who made the comment
    user_name: v.string(), // Cached user name for display
    comment: v.string(), // Comment text
    created_at: v.number(), // Timestamp
  }).index("by_photo", { fields: ["photo_id"] })
    .index("by_user", { fields: ["user_id"] }),
  
  // Ingresos (Income) - Money entries for a project
  ingresos: defineTable({
    proyecto: v.id("desarrollos"),
    monto: v.number(), // Amount
    fecha: v.string(), // Date in DD/MM/YYYY format
    descripcion: v.optional(v.string()), // Optional description/notes
    moneda: v.string(), // Currency: MXN, USD, EUR
    // Document attachment (URL to uploaded file)
    documento_adjunto: v.optional(v.string()), // URL to attached document
    documento_nombre: v.optional(v.string()), // Original file name
    // User tracking
    added_by_id: v.id("users"), // User who added this entry
    added_by_name: v.string(), // Cached user name for display
    // Metadata
    created_at: v.number(), // Timestamp when created
    updated_at: v.optional(v.number()), // Timestamp when last updated
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_added_by", { fields: ["added_by_id"] })
    .index("by_fecha", { fields: ["fecha"] }),
  
  // Ingresos totals - Cached total for each project (updated via trigger)
  ingresos_totals: defineTable({
    proyecto: v.id("desarrollos"),
    total_ingresos: v.number(), // Sum of all ingresos.monto for this project
    total_count: v.number(), // Number of income entries
    last_updated: v.number(), // Timestamp of last update
  }).index("by_proyecto", { fields: ["proyecto"] }),
  
  // Ingresos documents - Separate document storage for income entries
  ingresos_documentos: defineTable({
    ingreso_id: v.id("ingresos"), // Reference to parent ingreso
    proyecto: v.id("desarrollos"), // Project reference
    nombre: v.string(), // Document name
    descripcion: v.optional(v.string()), // Description
    storage_id: v.id("_storage"), // Convex storage ID
    type: v.string(), // Document type (factura, comprobante, etc.)
    size: v.number(), // File size in bytes
    uploaded_at: v.number(), // Timestamp
    uploaded_by_id: v.id("users"), // User who uploaded
    uploaded_by_name: v.string(), // Cached user name
  }).index("by_ingreso", { fields: ["ingreso_id"] })
    .index("by_proyecto", { fields: ["proyecto"] }),
  
  // Requisiciones (Material/Equipment Requests) - Purchase workflow
  requisiciones: defineTable({
    proyecto: v.id("desarrollos"),
    tipo: v.string(), // "material" | "equipo"
    solicitante_id: v.id("users"),
    solicitante_nombre: v.string(), // Cached user name
    proveedor_id: v.optional(v.id("proveedores")),
    fecha_solicitud: v.string(), // DD/MM/YYYY - When submitted
    fecha_entrega: v.optional(v.string()), // DD/MM/YYYY - Requested delivery date
    descripcion: v.optional(v.string()), // Comments/notes
    status: v.string(), // En proceso, Pagado, Cancelado (payment status)
    status_entrega: v.optional(v.string()), // Pendiente, Parcial, Completo (delivery status)
    // Review / approval workflow
    status_revision: v.optional(v.string()), // "Pendiente de revisión" | "Aprobada" | "Parcialmente Aprobada" | "Rechazada"
    nota_revision: v.optional(v.string()), // Required note for partial/reject
    revisado_por_id: v.optional(v.id("users")),
    revisado_por_nombre: v.optional(v.string()),
    revisado_at: v.optional(v.number()),
    // Metadata
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_solicitante", { fields: ["solicitante_id"] })
    .index("by_status", { fields: ["status"] })
    .index("by_proyecto_status", { fields: ["proyecto", "status"] })
    .index("by_proyecto_status_entrega", { fields: ["proyecto", "status_entrega"] })
    .index("by_proyecto_status_revision", { fields: ["proyecto", "status_revision"] }),
  
  // Requisicion line items - Materials/equipment requested
  requisicion_items: defineTable({
    requisicion_id: v.id("requisiciones"),
    partida_id: v.id("partidas"), // Level 1 reference (required)
    familia: v.string(), // Level 2 name (required)
    sub_partida: v.optional(v.string()), // Level 3 name or custom text
    cantidad: v.number(),
    unidad: v.string(), // Editable unit (defaults from budget)
    monto: v.optional(v.number()), // Optional estimated amount
    // Review fields
    status_revision: v.optional(v.string()), // "pendiente" | "aprobado" | "rechazado"
    cantidad_aprobada: v.optional(v.number()), // Approved qty (may differ from cantidad)
    nota_item: v.optional(v.string()), // Optional per-item reviewer note
  }).index("by_requisicion", { fields: ["requisicion_id"] })
    .index("by_partida", { fields: ["partida_id"] }),
  
  // Requisicion documents - Attached support files
  requisicion_documentos: defineTable({
    requisicion_id: v.id("requisiciones"),
    proyecto: v.id("desarrollos"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    type: v.string(),
    size: v.number(),
    uploaded_at: v.number(),
    uploaded_by_id: v.id("users"),
    uploaded_by_name: v.string(),
  }).index("by_requisicion", { fields: ["requisicion_id"] })
    .index("by_proyecto", { fields: ["proyecto"] }),
  
  // Requisicion history - Tracks all changes to requisiciones
  requisicion_history: defineTable({
    proyecto: v.id("desarrollos"),
    requisicion_id: v.id("requisiciones"),
    action: v.string(), // "created" | "updated" | "status_changed" | "status_entrega_changed" | "cancelled" | "deleted" | "document_added" | "document_removed"
    field_changed: v.optional(v.string()), // Which field changed (for updates)
    old_value: v.optional(v.string()), // Previous value (JSON stringified)
    new_value: v.optional(v.string()), // New value (JSON stringified)
    changed_by_id: v.id("users"),
    changed_by_name: v.string(),
    created_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_requisicion", { fields: ["requisicion_id"] })
    .index("by_proyecto_created", { fields: ["proyecto", "created_at"] })
    .index("by_changed_by", { fields: ["changed_by_id"] }),
  
  // Requisicion read status - Tracks when users last viewed requisicion changes per project
  requisicion_read_status: defineTable({
    user_id: v.id("users"),
    proyecto: v.id("desarrollos"),
    last_read_at: v.number(), // Timestamp of last viewed
  }).index("by_user_proyecto", { fields: ["user_id", "proyecto"] }),
  
  // Programa de Obra - Scheduling data per nivel 1 partida
  programa_obra: defineTable({
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"), // Nivel 1 partida reference
    fecha_inicio: v.optional(v.string()), // Activity start date (DD/MM/YYYY)
    fecha_fin: v.optional(v.string()), // Activity end date (DD/MM/YYYY)
    anticipo_fecha: v.optional(v.string()), // Anticipo date
    anticipo_porcentaje: v.optional(v.number()), // Anticipo %
    suministro_fecha: v.optional(v.string()), // Material/equipment delivery date
    finiquito_fecha: v.optional(v.string()), // Finiquito date
    finiquito_porcentaje: v.optional(v.number()), // Finiquito %
    peso: v.optional(v.number()), // Weight (0-100%)
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_proyecto_partida", { fields: ["proyecto", "partida_id"] }),
  
  // Programa de Obra - Ponderación (complexity weight) per familia/sub-partida
  programa_obra_ponderacion: defineTable({
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"), // The nivel 2 or nivel 3 partida
    parent_partida_nombre: v.string(), // Parent nivel 1 partida name
    peso: v.number(), // Weight (0-100%)
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_proyecto_parent", { fields: ["proyecto", "parent_partida_nombre"] }),
  
  // Programa de Obra - Detalle (child schedule items: familia nivel 2, subpartida nivel 3)
  programa_obra_detalle: defineTable({
    proyecto: v.id("desarrollos"),
    programa_obra_id: v.id("programa_obra"), // parent schedule record
    nivel: v.number(), // 2 (familia) or 3 (subpartida)
    partida: v.string(), // parent partida name (for lookups)
    familia: v.string(), // familia name
    subpartida: v.optional(v.string()), // only for nivel 3
    fecha_inicio: v.optional(v.string()), // DD/MM/YYYY
    fecha_fin: v.optional(v.string()),
    anticipo_fecha: v.optional(v.string()),
    anticipo_porcentaje: v.optional(v.number()),
    suministro_fecha: v.optional(v.string()),
    finiquito_fecha: v.optional(v.string()),
    finiquito_porcentaje: v.optional(v.number()),
    peso: v.optional(v.number()),
    avance_porcentaje: v.optional(v.number()), // Avance real % (0-100)
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_programa_obra", { fields: ["programa_obra_id"] })
    .index("by_proyecto_partida_familia", { fields: ["proyecto", "partida", "familia"] }),

  // Programa de Obra - Avance real per sub-partida (nivel 3)
  avance_real: defineTable({
    proyecto: v.id("desarrollos"),
    partida_id: v.id("partidas"), // Nivel 3 partida reference
    porcentaje: v.number(), // Avance real % (0-100)
    fecha: v.optional(v.string()), // Date of the avance entry
    updated_at: v.number(), // Timestamp
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_proyecto_partida", { fields: ["proyecto", "partida_id"] }),
});
