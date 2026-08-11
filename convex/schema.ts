import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  assistantAnswerValidator,
  assistantReferenceValidator,
} from "./assistantTypes";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(), // Clerk user ID
    email: v.string(),
    name: v.string(),
    role: v.string(), // "admin", "user", "viewer", "contratista", "finance"
    organization_id: v.optional(v.string()),
    allowed_desarrollos: v.array(v.id("desarrollos")), // Projects user can access
    allowed_sales_projects: v.optional(v.array(v.id("sales_projects"))), // Sales projects user can access
    invitation_status: v.optional(v.string()), // pending, sent, accepted
    invited_at: v.optional(v.number()),
    invitation_url: v.optional(v.string()),
    invited_by: v.optional(v.id("users")),    
    created_at: v.number(),
    last_login: v.optional(v.number()),
  }).index("by_clerk_id", { fields: ["clerkId"] })
    .index("by_email", { fields: ["email"] })
    .index("by_organization", { fields: ["organization_id"] }),
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
    organization_id: v.optional(v.string()),
  }).index("by_organization", { fields: ["organization_id"] }),
  sales_projects: defineTable({
    nombre: v.string(),
    descripcion: v.string(),
    image: v.string(),
    status: v.optional(v.string()), // Activo, Cancelado, Entregado
    fecha_creacion: v.optional(v.string()),
    comision_porcentaje: v.optional(v.number()), // Commission percentage for sales
    comision_monto: v.optional(v.number()), // Auto-calculated commission amount
    moneda_principal: v.optional(v.string()), // Primary currency for sales project (MXN, USD, EUR) - auto-updated from transactions
    organization_id: v.optional(v.string()),
  }).index("by_organization", { fields: ["organization_id"] }),
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
    proveedor_id: v.optional(v.id("proveedores")),
    proveedor: v.optional(v.string()),
    import_batch_id: v.optional(v.id("transaction_import_batches")),
    labor_import_id: v.optional(v.id("labor_payment_imports")),
    import_source_key: v.optional(v.string()),
    import_signature: v.optional(v.string()),
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
    .index("by_proveedor", { fields: ["proveedor_id"] })
    .index("by_proyecto_proveedor", { fields: ["proyecto", "proveedor_id"] })
    .index("by_import_batch_source", { fields: ["import_batch_id", "import_source_key"] })
    .index("by_labor_import", { fields: ["labor_import_id"] })
    .index("by_proyecto_import_signature", { fields: ["proyecto", "import_signature"] })
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
    // Optional for historical/custom concepts that cannot be mapped safely to
    // the current project budget. New mapped writes always include this field.
    partida_id: v.optional(v.id("partidas")),
    proyecto_id: v.optional(v.id("desarrollos")),
    concepto: v.optional(v.string()),
    concepto_normalizado: v.optional(v.string()),
    partida_nombre_snapshot: v.optional(v.string()),
    familia_snapshot: v.optional(v.string()),
    sub_partida_snapshot: v.optional(v.string()),
    classification_status: v.optional(v.union(
      v.literal("mapped"),
      v.literal("custom"),
      v.literal("unresolved"),
    )),
    monto: v.number(), // Individual line item amount
    numero_personas_origen: v.optional(v.number()),
    source_row: v.optional(v.number()),
  }).index("by_transaccion", { fields: ["transaccion_id"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_proyecto", { fields: ["proyecto_id"] })
    .index("by_proyecto_concepto", { fields: ["proyecto_id", "concepto_normalizado"] }),
  
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
    folder_id: v.optional(v.id("document_folders")), // Optional folder location in the document library
    partida_id: v.optional(v.id("partidas")), // Linked Level 1 Partida for bitacora
    bitacora_id: v.optional(v.union(v.id("documentos"), v.id("bitacora"))), // Parent bitacora entry ID for photos
    comment: v.optional(v.string()), // Comment for bitacora photos
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_uploaded", { fields: ["proyecto", "uploaded_at"] })
    .index("by_sales_proyecto", { fields: ["sales_proyecto"] })
    .index("by_transaccion", { fields: ["transaccion_id"] })
    .index("by_sales_transaccion", { fields: ["sales_transaccion_id"] })
    .index("by_folder", { fields: ["folder_id"] })
    .index("by_folder_uploaded", { fields: ["folder_id", "uploaded_at"] })
    .index("by_folder_proyecto", { fields: ["folder_id", "proyecto"] })
    .index("by_folder_sales_proyecto", { fields: ["folder_id", "sales_proyecto"] })
    .index("by_folder_type", { fields: ["folder_id", "type"] })
    .index("by_partida_id", { fields: ["partida_id"] })
    .index("by_bitacora_id", { fields: ["bitacora_id"] }),
  document_folders: defineTable({
    nombre: v.string(),
    parent_folder_id: v.optional(v.id("document_folders")),
    proyecto: v.optional(v.id("desarrollos")),
    sales_proyecto: v.optional(v.id("sales_projects")),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  }).index("by_parent_folder", { fields: ["parent_folder_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_sales_proyecto", { fields: ["sales_proyecto"] }),
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
    razon_social_normalizada: v.optional(v.string()),
    rfc: v.optional(v.string()),
    rfc_normalizado: v.optional(v.string()),
    direccion: v.optional(v.string()),
    nombre_contacto: v.optional(v.string()),
    telefono_contacto: v.optional(v.string()),
    cuenta: v.optional(v.string()),
    clabe: v.optional(v.string()),
    banco: v.optional(v.string()),
    tipo: v.optional(v.union(v.literal("regular"), v.literal("generico"))),
    archived_at: v.optional(v.number()),
    archived_by: v.optional(v.id("users")),
    reactivated_at: v.optional(v.number()),
    reactivated_by: v.optional(v.id("users")),
    merged_into: v.optional(v.id("proveedores")),
    created_by: v.optional(v.id("users")), // User who created this provider
    created_at: v.optional(v.number()), // Timestamp when created
    updated_at: v.optional(v.number()),
  }).index("by_rfc", { fields: ["rfc"] })
    .index("by_rfc_normalizado", { fields: ["rfc_normalizado"] })
    .index("by_razon_social", { fields: ["razon_social"] })
    .index("by_razon_social_normalizada", { fields: ["razon_social_normalizada"] })
    .index("by_archived_at", { fields: ["archived_at"] })
    .index("by_created_by", { fields: ["created_by"] }),

  transaction_import_batches: defineTable({
    proyecto: v.id("desarrollos"),
    file_name: v.string(),
    file_hash: v.string(),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    total_transactions: v.optional(v.number()),
    imported_transactions: v.optional(v.number()),
    failed_transactions: v.optional(v.number()),
    created_by: v.optional(v.id("users")),
    created_at: v.number(),
    updated_at: v.number(),
    completed_at: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_file_hash", { fields: ["proyecto", "file_hash"] }),

  labor_payment_imports: defineTable({
    proyecto: v.id("desarrollos"),
    capture_date: v.string(),
    total_people: v.number(),
    roles: v.array(v.object({
      key: v.string(),
      label: v.string(),
      count: v.number(),
    })),
    source_file_name: v.string(),
    source_file_hash: v.string(),
    source_sheet_name: v.string(),
    source_administration: v.string(),
    source_currency: v.string(),
    source_row_count: v.number(),
    transaction_count: v.number(),
    amount_total: v.number(),
    warnings: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("superseded")),
    imported_by: v.id("users"),
    imported_at: v.number(),
    superseded_at: v.optional(v.number()),
    superseded_by_user: v.optional(v.id("users")),
    superseded_by_import: v.optional(v.id("labor_payment_imports")),
  }).index("by_proyecto_fecha_estado", { fields: ["proyecto", "capture_date", "status"] })
    .index("by_proyecto_estado_fecha", { fields: ["proyecto", "status", "capture_date"] })
    .index("by_proyecto_file_hash", { fields: ["proyecto", "source_file_hash"] }),
  
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
    .index("by_proyecto_uploaded", { fields: ["proyecto", "uploaded_at"] })
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

  // OGC company-level financial movements used only by the Profit & Loss views.
  // These records intentionally do not update project budgets, partidas, or normal transactions.
  ogc_movimientos: defineTable({
    tipo: v.string(), // "ingreso" | "costo_estructura"
    categoria: v.string(), // HONORARIOS, INDIRECTOS, NOMINA, TRANSPORTE, RENTA, etc.
    monto: v.number(),
    fecha: v.string(), // DD/MM/YYYY
    descripcion: v.optional(v.string()),
    moneda: v.string(),
    tipo_cambio: v.optional(v.number()),
    proyecto: v.optional(v.id("desarrollos")),
    archivo_origen: v.optional(v.string()),
    fila_origen: v.optional(v.number()),
    nota_recepcion_status: v.optional(v.union(v.literal("parcial"), v.literal("completa"))),
    nota_recepcion_storage_id: v.optional(v.id("_storage")),
    nota_recepcion_nombre: v.optional(v.string()),
    nota_recepcion_type: v.optional(v.string()),
    nota_recepcion_size: v.optional(v.number()),
    nota_recepcion_uploaded_at: v.optional(v.number()),
    nota_recepcion_documentos: v.optional(v.array(v.object({
      storage_id: v.id("_storage"),
      nombre: v.string(),
      type: v.string(),
      size: v.number(),
      uploaded_at: v.number(),
    }))),
    status: v.optional(v.string()), // "activo" | "anulado" | "duplicado"
    duplicate_key: v.optional(v.string()),
    duplicate_of: v.optional(v.id("ogc_movimientos")),
    reconciled: v.optional(v.boolean()),
    reconciliation_reference: v.optional(v.string()),
    reconciliation_note: v.optional(v.string()),
    reconciled_by_id: v.optional(v.id("users")),
    reconciled_by_name: v.optional(v.string()),
    reconciled_at: v.optional(v.number()),
    void_reason: v.optional(v.string()),
    voided_by_id: v.optional(v.id("users")),
    voided_by_name: v.optional(v.string()),
    voided_at: v.optional(v.number()),
    updated_by_id: v.optional(v.id("users")),
    updated_by_name: v.optional(v.string()),
    updated_at: v.optional(v.number()),
    organization_id: v.optional(v.string()),
    created_by_id: v.id("users"),
    created_by_name: v.string(),
    created_at: v.number(),
  }).index("by_tipo", { fields: ["tipo"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_fecha", { fields: ["fecha"] })
    .index("by_organization", { fields: ["organization_id"] })
    .index("by_duplicate_key", { fields: ["duplicate_key"] })
    .index("by_status", { fields: ["status"] }),

  ogc_movimientos_audit: defineTable({
    movimiento_id: v.id("ogc_movimientos"),
    action: v.string(), // created, updated, voided, reconciled, marked_duplicate
    reason: v.optional(v.string()),
    before_json: v.optional(v.string()),
    after_json: v.optional(v.string()),
    actor_id: v.id("users"),
    actor_name: v.string(),
    organization_id: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_movimiento", { fields: ["movimiento_id"] })
    .index("by_actor", { fields: ["actor_id"] })
    .index("by_created_at", { fields: ["created_at"] }),
  
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
    .index("by_proveedor", { fields: ["proveedor_id"] })
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
    comentario: v.optional(v.string()),
    documento_ids: v.optional(v.array(v.id("requisicion_documentos"))),
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

  // Notification events - Parent record for system notifications
  notification_events: defineTable({
    proyecto: v.id("desarrollos"),
    requisicion_id: v.optional(v.id("requisiciones")),
    type: v.string(),
    subject: v.string(),
    message: v.optional(v.string()),
    actor_id: v.id("users"),
    actor_name: v.string(),
    channel: v.string(),
    status: v.string(), // pending, sent, partial, failed, no_recipients
    recipient_count: v.number(),
    sent_count: v.number(),
    failed_count: v.number(),
    created_at: v.number(),
    sent_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_requisicion", { fields: ["requisicion_id"] })
    .index("by_proyecto_created", { fields: ["proyecto", "created_at"] })
    .index("by_actor", { fields: ["actor_id"] })
    .index("by_status", { fields: ["status"] }),

  // Notification deliveries - One row per recipient and channel
  notification_deliveries: defineTable({
    notification_event_id: v.id("notification_events"),
    proyecto: v.id("desarrollos"),
    requisicion_id: v.optional(v.id("requisiciones")),
    recipient_user_id: v.optional(v.id("users")),
    recipient_name: v.string(),
    recipient_email: v.string(),
    channel: v.string(), // email, in_app, sms, whatsapp, etc.
    status: v.string(), // pending, sent, failed, read
    provider_message_id: v.optional(v.string()),
    error: v.optional(v.string()),
    created_at: v.number(),
    sent_at: v.optional(v.number()),
    read_at: v.optional(v.number()),
  }).index("by_event", { fields: ["notification_event_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_requisicion", { fields: ["requisicion_id"] })
    .index("by_recipient", { fields: ["recipient_user_id"] })
    .index("by_recipient_proyecto", { fields: ["recipient_user_id", "proyecto"] })
    .index("by_status", { fields: ["status"] })
    .index("by_proyecto_created", { fields: ["proyecto", "created_at"] }),

  // Tareas - Project task assignment and follow-up
  tareas: defineTable({
    proyecto: v.id("desarrollos"),
    parent_task: v.optional(v.id("tareas")),
    position: v.optional(v.number()),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    asignados: v.array(v.id("users")),
    partidas: v.optional(v.array(v.id("partidas"))),
    created_by_id: v.id("users"),
    created_by_name: v.string(),
    status: v.string(), // Pendiente, En progreso, Bloqueada, Completada, Cancelada
    prioridad: v.string(), // Baja, Media, Alta, Urgente
    fecha_limite: v.optional(v.string()), // YYYY-MM-DD
    categoria: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_parent_task", { fields: ["parent_task"] })
    .index("by_status", { fields: ["status"] })
    .index("by_created_by", { fields: ["created_by_id"] }),

  tarea_comments: defineTable({
    tarea_id: v.id("tareas"),
    proyecto: v.id("desarrollos"),
    user_id: v.id("users"),
    user_name: v.string(),
    comment: v.string(),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  }).index("by_tarea", { fields: ["tarea_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_user", { fields: ["user_id"] }),

  tarea_history: defineTable({
    tarea_id: v.id("tareas"),
    proyecto: v.id("desarrollos"),
    action: v.string(),
    field_changed: v.optional(v.string()),
    old_value: v.optional(v.string()),
    new_value: v.optional(v.string()),
    changed_by_id: v.id("users"),
    changed_by_name: v.string(),
    created_at: v.number(),
  }).index("by_tarea", { fields: ["tarea_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_changed_by", { fields: ["changed_by_id"] }),

  tarea_read_status: defineTable({
    user_id: v.id("users"),
    proyecto: v.id("desarrollos"),
    last_read_at: v.number(),
  }).index("by_user_proyecto", { fields: ["user_id", "proyecto"] }),

  tarea_notification_reads: defineTable({
    user_id: v.id("users"),
    tarea_history_id: v.id("tarea_history"),
    proyecto: v.id("desarrollos"),
    read_at: v.number(),
  }).index("by_user_history", { fields: ["user_id", "tarea_history_id"] })
    .index("by_user_proyecto", { fields: ["user_id", "proyecto"] }),

  // RFIs - Formal requests for information
  rfis: defineTable({
    proyecto: v.id("desarrollos"),
    number: v.number(),
    prefix: v.string(),
    revision_number: v.number(),
    previous_revision_id: v.optional(v.id("rfis")),
    subject: v.string(),
    background: v.optional(v.string()),
    question: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_manager_review"),
      v.literal("open"),
      v.literal("closed"),
    ),
    creator_id: v.id("users"),
    received_from_id: v.optional(v.id("users")),
    rfi_manager_id: v.optional(v.id("users")),
    assignee_ids: v.array(v.id("users")),
    required_assignee_ids: v.array(v.id("users")),
    distribution_user_ids: v.array(v.id("users")),
    due_date: v.optional(v.string()),
    location: v.optional(v.string()),
    drawing_number: v.optional(v.string()),
    spec_section: v.optional(v.string()),
    partida_id: v.optional(v.id("partidas")),
    familia: v.optional(v.string()),
    sub_partida: v.optional(v.string()),
    project_stage: v.optional(v.string()),
    cost_impact: v.union(
      v.literal("yes"),
      v.literal("unknown"),
      v.literal("no"),
      v.literal("na"),
    ),
    cost_impact_amount: v.optional(v.number()),
    schedule_impact: v.union(
      v.literal("yes"),
      v.literal("unknown"),
      v.literal("no"),
      v.literal("na"),
    ),
    schedule_impact_days: v.optional(v.number()),
    is_private: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
    opened_at: v.optional(v.number()),
    closed_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_number", { fields: ["proyecto", "number", "revision_number"] })
    .index("by_proyecto_status", { fields: ["proyecto", "status"] })
    .index("by_previous_revision", { fields: ["previous_revision_id"] })
    .index("by_manager", { fields: ["rfi_manager_id"] })
    .index("by_due_date", { fields: ["due_date"] }),

  rfi_number_sequences: defineTable({
    proyecto: v.id("desarrollos"),
    last_number: v.number(),
    updated_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] }),

  rfi_responses: defineTable({
    rfi_id: v.id("rfis"),
    proyecto: v.id("desarrollos"),
    author_id: v.id("users"),
    author_name: v.string(),
    body: v.string(),
    is_official: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_rfi", { fields: ["rfi_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_author", { fields: ["author_id"] }),

  rfi_attachments: defineTable({
    rfi_id: v.id("rfis"),
    proyecto: v.id("desarrollos"),
    response_id: v.optional(v.id("rfi_responses")),
    history_id: v.optional(v.id("rfi_history")),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    type: v.string(),
    size: v.number(),
    uploaded_by_id: v.id("users"),
    uploaded_at: v.number(),
  }).index("by_rfi", { fields: ["rfi_id"] })
    .index("by_response", { fields: ["response_id"] })
    .index("by_history", { fields: ["history_id"] })
    .index("by_proyecto", { fields: ["proyecto"] }),

  rfi_history: defineTable({
    rfi_id: v.id("rfis"),
    proyecto: v.id("desarrollos"),
    action: v.string(),
    field_changed: v.optional(v.string()),
    old_value: v.optional(v.string()),
    new_value: v.optional(v.string()),
    actor_id: v.id("users"),
    actor_name: v.string(),
    created_at: v.number(),
  }).index("by_rfi", { fields: ["rfi_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_actor", { fields: ["actor_id"] }),

  rfi_read_status: defineTable({
    rfi_id: v.id("rfis"),
    proyecto: v.id("desarrollos"),
    user_id: v.id("users"),
    last_read_at: v.number(),
  }).index("by_rfi_user", { fields: ["rfi_id", "user_id"] })
    .index("by_user_proyecto", { fields: ["user_id", "proyecto"] }),

  // Planos arquitectónicos, anotaciones, conversaciones y menciones por proyecto.
  plano_carpetas: defineTable({
    proyecto: v.id("desarrollos"),
    nombre: v.string(),
    created_by_id: v.id("users"),
    created_by_name: v.string(),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_created", { fields: ["proyecto", "created_at"] }),

  planos: defineTable({
    proyecto: v.id("desarrollos"),
    carpeta_id: v.optional(v.id("plano_carpetas")),
    ruta_relativa: v.optional(v.string()),
    storage_id: v.id("_storage"),
    nombre_archivo: v.string(),
    titulo: v.string(),
    numero: v.optional(v.string()),
    disciplina: v.optional(v.string()),
    revision: v.optional(v.string()),
    status: v.string(),
    type: v.string(),
    size: v.number(),
    uploaded_by_id: v.id("users"),
    uploaded_by_name: v.string(),
    annotation_count: v.optional(v.number()),
    open_annotation_count: v.optional(v.number()),
    comment_count: v.optional(v.number()),
    deleting_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_created", { fields: ["proyecto", "created_at"] })
    .index("by_carpeta", { fields: ["carpeta_id"] })
    .index("by_uploaded_by", { fields: ["uploaded_by_id"] }),

  plano_anotaciones: defineTable({
    plano_id: v.id("planos"),
    proyecto: v.id("desarrollos"),
    pagina: v.number(),
    tipo: v.union(
      v.literal("pin"),
      v.literal("rectangle"),
      v.literal("cloud"),
      v.literal("freehand"),
    ),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    puntos: v.optional(v.array(v.object({
      x: v.number(),
      y: v.number(),
    }))),
    comentario: v.string(),
    mentioned_user_ids: v.optional(v.array(v.id("users"))),
    mentioned_users: v.optional(v.array(v.object({
      user_id: v.id("users"),
      name: v.string(),
      email: v.string(),
      start: v.optional(v.number()),
      end: v.optional(v.number()),
      label: v.optional(v.string()),
    }))),
    status: v.string(),
    created_by_id: v.id("users"),
    created_by_name: v.string(),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
    resolved_at: v.optional(v.number()),
    resolved_by_id: v.optional(v.id("users")),
    deleting_at: v.optional(v.number()),
  }).index("by_plano", { fields: ["plano_id"] })
    .index("by_plano_pagina", { fields: ["plano_id", "pagina"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_created_by", { fields: ["created_by_id"] }),

  plano_comentarios: defineTable({
    plano_id: v.id("planos"),
    anotacion_id: v.optional(v.id("plano_anotaciones")),
    proyecto: v.id("desarrollos"),
    user_id: v.id("users"),
    user_name: v.string(),
    comentario: v.string(),
    mentioned_user_ids: v.optional(v.array(v.id("users"))),
    mentioned_users: v.optional(v.array(v.object({
      user_id: v.id("users"),
      name: v.string(),
      email: v.string(),
      start: v.optional(v.number()),
      end: v.optional(v.number()),
      label: v.optional(v.string()),
    }))),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  }).index("by_plano", { fields: ["plano_id"] })
    .index("by_anotacion", { fields: ["anotacion_id"] })
    .index("by_proyecto", { fields: ["proyecto"] })
    .index("by_user", { fields: ["user_id"] }),

  plano_mention_notifications: defineTable({
    proyecto: v.id("desarrollos"),
    plano_id: v.id("planos"),
    anotacion_id: v.optional(v.id("plano_anotaciones")),
    comentario_id: v.optional(v.id("plano_comentarios")),
    recipient_user_id: v.id("users"),
    actor_id: v.id("users"),
    actor_name: v.string(),
    comment_excerpt: v.string(),
    created_at: v.number(),
    read_at: v.optional(v.number()),
  }).index("by_recipient", { fields: ["recipient_user_id"] })
    .index("by_recipient_project", { fields: ["recipient_user_id", "proyecto"] })
    .index("by_recipient_read", { fields: ["recipient_user_id", "read_at"] })
    .index("by_recipient_project_read", { fields: ["recipient_user_id", "proyecto", "read_at"] })
    .index("by_comment", { fields: ["comentario_id"] })
    .index("by_annotation", { fields: ["anotacion_id"] })
    .index("by_plano", { fields: ["plano_id"] }),
  
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
    orden: v.optional(v.number()), // Row order from Excel upload
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
    orden: v.optional(v.number()), // Row order from Excel upload
    tiempo_extra_cantidad: v.optional(v.number()), // Extension amount
    tiempo_extra_unidad: v.optional(v.string()), // "dias" | "semanas" | "meses"
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_programa_obra", { fields: ["programa_obra_id"] })
    .index("by_proyecto_partida_familia", { fields: ["proyecto", "partida", "familia"] }),

  // Programa de Obra - Historial de cambios del avance real por familia
  programa_obra_avance_historial: defineTable({
    proyecto: v.id("desarrollos"),
    detalle_id: v.id("programa_obra_detalle"),
    partida: v.string(),
    familia: v.string(),
    old_value: v.optional(v.number()),
    new_value: v.number(),
    changed_by_id: v.optional(v.id("users")),
    changed_by_name: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_detalle", { fields: ["detalle_id"] })
    .index("by_proyecto_created", { fields: ["proyecto", "created_at"] }),

  // Programa de Obra - Comentarios per partida/familia with date ranges
  programa_obra_comentarios: defineTable({
    proyecto: v.id("desarrollos"),
    // Reference: either a programa_obra (level 0) or programa_obra_detalle (level 1)
    parent_type: v.string(), // "partida" | "familia"
    parent_id: v.string(), // _id of programa_obra or programa_obra_detalle
    comentario: v.string(),
    fecha_inicio: v.string(), // DD/MM/YYYY
    fecha_fin: v.string(), // DD/MM/YYYY
    created_by_id: v.optional(v.id("users")),
    created_by_name: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_parent", { fields: ["parent_type", "parent_id"] })
    .index("by_proyecto_parent", { fields: ["proyecto", "parent_type", "parent_id"] }),

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

  // Autorizaciones de Obra - Section records (licencia, poliza, plan_seguridad, tramites)
  autorizaciones_obra: defineTable({
    proyecto: v.id("desarrollos"),
    seccion: v.string(), // "licencia" | "poliza" | "plan_seguridad" | "tramites"
    status_manual: v.optional(v.string()), // "activo" | "inactivo"
    responsable_id: v.optional(v.id("users")),
    // Licencia fields
    numero_licencia: v.optional(v.string()),
    fecha_emision: v.optional(v.string()), // DD/MM/YYYY
    fecha_vencimiento: v.optional(v.string()), // DD/MM/YYYY
    // Póliza fields
    suma_asegurada: v.optional(v.number()),
    vigencia: v.optional(v.string()), // DD/MM/YYYY
    // Document attachment (single file per section)
    documento_storage_id: v.optional(v.id("_storage")),
    documento_nombre: v.optional(v.string()),
    documento_size: v.optional(v.number()),
    documento_type: v.optional(v.string()),
    documento_uploaded_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_proyecto_seccion", { fields: ["proyecto", "seccion"] }),

  // Autorizaciones de Obra - Trámites (CFE / agua potable items)
  autorizaciones_obra_tramites: defineTable({
    proyecto: v.id("desarrollos"),
    autorizacion_id: v.id("autorizaciones_obra"), // parent tramites section
    servicio: v.string(), // Free text (e.g., "CFE", "OOMSPAAS")
    tramite: v.string(), // Free text (e.g., "Solicitud de suministro")
    estado: v.string(), // "Pendiente" | "Activo"
    // Comprobante attachment
    documento_storage_id: v.optional(v.id("_storage")),
    documento_nombre: v.optional(v.string()),
    documento_size: v.optional(v.number()),
    documento_type: v.optional(v.string()),
    documento_uploaded_at: v.optional(v.number()),
  }).index("by_autorizacion", { fields: ["autorizacion_id"] })
    .index("by_proyecto", { fields: ["proyecto"] }),

  // Autorizaciones de Obra - File replacement history
  autorizaciones_obra_historial: defineTable({
    proyecto: v.id("desarrollos"),
    parent_type: v.string(), // "autorizacion" | "tramite"
    parent_id: v.string(), // _id of autorizaciones_obra or autorizaciones_obra_tramites
    documento_storage_id: v.id("_storage"),
    documento_nombre: v.string(),
    documento_size: v.number(),
    documento_type: v.string(),
    replaced_at: v.number(),
    replaced_by_id: v.optional(v.id("users")),
    replaced_by_name: v.optional(v.string()),
  }).index("by_parent", { fields: ["parent_type", "parent_id"] })
    .index("by_proyecto", { fields: ["proyecto"] }),

  // Contratistas Generales - Main contractors per project (for IMSS/SIROC future use)
  contratistas_generales: defineTable({
    proyecto: v.id("desarrollos"),
    nombre: v.string(), // Company name (e.g., "OGC DEVELOPMENTS SA DE CV")
    responsable_id: v.optional(v.id("users")),
    status_manual: v.optional(v.string()), // "activo" | "inactivo"
    // Contrato (for future IMSS tab)
    contrato_storage_id: v.optional(v.id("_storage")),
    contrato_nombre: v.optional(v.string()),
    contrato_size: v.optional(v.number()),
    contrato_type: v.optional(v.string()),
    contrato_uploaded_at: v.optional(v.number()),
    // SIROC document
    siroc_numero: v.optional(v.string()), // e.g., "C1049546"
    siroc_storage_id: v.optional(v.id("_storage")),
    siroc_nombre: v.optional(v.string()),
    siroc_size: v.optional(v.number()),
    siroc_type: v.optional(v.string()),
    siroc_uploaded_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] }),

  // Subcontratistas - Sub-contractors linked to a contratista general
  subcontratistas: defineTable({
    proyecto: v.id("desarrollos"),
    contratista_general_id: v.optional(v.id("contratistas_generales")),
    nombre: v.string(), // Person/company name
    partida_id: v.optional(v.id("partidas")), // Nivel 1 partida reference
    partida_nombre: v.optional(v.string()), // Denormalized for display
    monto: v.optional(v.number()),
    status_manual: v.optional(v.string()), // "activo" | "inactivo"
    // Presupuesto file
    presupuesto_storage_id: v.optional(v.id("_storage")),
    presupuesto_nombre: v.optional(v.string()),
    presupuesto_size: v.optional(v.number()),
    presupuesto_type: v.optional(v.string()),
    presupuesto_uploaded_at: v.optional(v.number()),
    // Contrato file
    contrato_storage_id: v.optional(v.id("_storage")),
    contrato_nombre: v.optional(v.string()),
    contrato_size: v.optional(v.number()),
    contrato_type: v.optional(v.string()),
    contrato_uploaded_at: v.optional(v.number()),
    // SIROC document
    siroc_numero: v.optional(v.string()), // e.g., "A5653203"
    siroc_storage_id: v.optional(v.id("_storage")),
    siroc_nombre: v.optional(v.string()),
    siroc_size: v.optional(v.number()),
    siroc_type: v.optional(v.string()),
    siroc_uploaded_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_contratista_general", { fields: ["contratista_general_id"] }),

  // IMSS configuration per project (manual input)
  imss_configuracion: defineTable({
    proyecto: v.id("desarrollos"),
    costo_total_imss: v.number(), // Base total registrada ante IMSS
  }).index("by_proyecto", { fields: ["proyecto"] }),

  // IMSS pagos de cuota (simplified payment model)
  imss_pagos_cuota: defineTable({
    proyecto: v.id("desarrollos"),
    parent_type: v.string(), // "contratista_general" | "subcontratista"
    parent_id: v.string(), // _id of contratista_general or subcontratista
    cuota_tipo: v.optional(v.string()), // "Mano de Obra" | "Material"
    monto: v.number(),
    // Comprobante file
    comprobante_storage_id: v.optional(v.id("_storage")),
    comprobante_nombre: v.optional(v.string()),
    comprobante_size: v.optional(v.number()),
    comprobante_type: v.optional(v.string()),
    comprobante_uploaded_at: v.optional(v.number()),
    // Soporte file
    soporte_storage_id: v.optional(v.id("_storage")),
    soporte_nombre: v.optional(v.string()),
    soporte_size: v.optional(v.number()),
    soporte_type: v.optional(v.string()),
    soporte_uploaded_at: v.optional(v.number()),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_parent", { fields: ["parent_type", "parent_id"] }),

  // Programaciones de reportes financieros por proyecto. Los destinatarios
  // siempre son usuarios de la plataforma; no se admiten correos externos.
  report_subscriptions: defineTable({
    proyecto: v.id("desarrollos"),
    owner_user_id: v.id("users"),
    frequency: v.string(),
    timezone: v.string(),
    local_hour: v.number(),
    local_minute: v.number(),
    day_of_week: v.optional(v.number()),
    day_of_month: v.optional(v.number()),
    sections: v.array(v.string()),
    recipient_user_ids: v.array(v.id("users")),
    active: v.boolean(),
    next_run_at: v.number(),
    lease_until: v.optional(v.number()),
    last_run_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_owner", { fields: ["owner_user_id"] })
    .index("by_active_next_run", { fields: ["active", "next_run_at"] }),

  report_runs: defineTable({
    proyecto: v.id("desarrollos"),
    subscription_id: v.optional(v.id("report_subscriptions")),
    requested_by_user_id: v.id("users"),
    source: v.string(),
    period_start: v.string(),
    period_end: v.string(),
    period_key: v.string(),
    subscription_period_key: v.optional(v.string()),
    sections: v.array(v.string()),
    status: v.string(),
    error: v.optional(v.string()),
    warning: v.optional(v.string()),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_subscription", { fields: ["subscription_id"] })
    .index("by_subscription_period", { fields: ["subscription_period_key"] })
    .index("by_status", { fields: ["status"] }),

  report_artifacts: defineTable({
    proyecto: v.id("desarrollos"),
    run_id: v.id("report_runs"),
    visibility_profile: v.string(),
    storage_id: v.optional(v.id("_storage")),
    snapshot_storage_id: v.optional(v.id("_storage")),
    file_name: v.optional(v.string()),
    size: v.optional(v.number()),
    snapshot_json: v.string(),
    snapshot_hash: v.string(),
    insights_json: v.optional(v.string()),
    ai_provider: v.optional(v.string()),
    ai_model: v.optional(v.string()),
    ai_response_id: v.optional(v.string()),
    input_tokens: v.optional(v.number()),
    output_tokens: v.optional(v.number()),
    status: v.string(),
    error: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_run", { fields: ["run_id"] })
    .index("by_run_profile", { fields: ["run_id", "visibility_profile"] }),

  report_deliveries: defineTable({
    proyecto: v.id("desarrollos"),
    run_id: v.id("report_runs"),
    artifact_id: v.optional(v.id("report_artifacts")),
    recipient_user_id: v.id("users"),
    recipient_email: v.string(),
    visibility_profile: v.string(),
    status: v.string(),
    attempts: v.number(),
    idempotency_key: v.string(),
    provider_message_id: v.optional(v.string()),
    error: v.optional(v.string()),
    sent_at: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_proyecto", { fields: ["proyecto"] })
    .index("by_run", { fields: ["run_id"] })
    .index("by_recipient", { fields: ["recipient_user_id"] })
    .index("by_run_recipient", { fields: ["run_id", "recipient_user_id"] }),

  assistant_conversations: defineTable({
    owner_user_id: v.id("users"),
    title: v.string(),
    project_ids: v.array(v.id("desarrollos")),
    created_at: v.number(),
    updated_at: v.number(),
    archived_at: v.optional(v.number()),
  }).index("by_owner_updated", { fields: ["owner_user_id", "updated_at"] })
    .index("by_owner_archived", { fields: ["owner_user_id", "archived_at"] }),

  assistant_messages: defineTable({
    conversation_id: v.id("assistant_conversations"),
    owner_user_id: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    references: v.array(assistantReferenceValidator),
    status: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    client_request_id: v.optional(v.string()),
    reply_to_message_id: v.optional(v.id("assistant_messages")),
    answer: v.optional(assistantAnswerValidator),
    model: v.optional(v.string()),
    response_id: v.optional(v.string()),
    input_tokens: v.optional(v.number()),
    output_tokens: v.optional(v.number()),
    tool_names: v.optional(v.array(v.string())),
    duration_ms: v.optional(v.number()),
    error: v.optional(v.string()),
    error_code: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_conversation_created", { fields: ["conversation_id", "created_at"] })
    .index("by_owner_request", { fields: ["owner_user_id", "client_request_id"] })
    .index("by_reply", { fields: ["reply_to_message_id"] }),
});
