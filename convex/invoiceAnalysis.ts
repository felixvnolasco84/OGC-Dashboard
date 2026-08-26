import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertInvoiceReviewer,
  canUserAccessDesarrollo,
} from "./permissions";
import {
  INVOICE_ANALYSIS_SCHEMA_VERSION,
  INVOICE_CATEGORY_SEEDS,
  INVOICE_TAXONOMY_VERSION,
  INVOICE_UNRESOLVED_CODE,
  normalizeInvoiceCurrency,
  normalizeInvoiceText,
  normalizeInvoiceUuid,
} from "./invoiceRules";

const MAX_XML_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

type Reviewer = Doc<"users">;

function invoiceFileKind(document: Doc<"documentos">) {
  const mime = String(document.mime_type || "").toLowerCase();
  const name = document.nombre.toLowerCase();
  if (mime.includes("xml") || name.endsWith(".xml")) return "xml" as const;
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf" as const;
  if (mime.startsWith("image/") || /\.(png|jpe?g)$/i.test(name)) return "image" as const;
  return "unsupported" as const;
}

async function assertReviewerProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"desarrollos">,
) {
  const reviewer = await assertInvoiceReviewer(ctx) as Reviewer;
  const project = await ctx.db.get(projectId);
  if (!project || !canUserAccessDesarrollo(reviewer, project)) {
    throw new Error("No tienes acceso al proyecto de la factura.");
  }
  return { reviewer, project };
}

async function ensureCategories(ctx: MutationCtx, organizationId?: string) {
  const current = await ctx.db
    .query("invoice_cost_categories")
    .withIndex("by_organization_active", (q) =>
      q.eq("organization_id", organizationId).eq("active", true))
    .collect();
  const byCode = new Map(current.map((category) => [category.code, category]));
  const now = Date.now();
  for (const seed of INVOICE_CATEGORY_SEEDS) {
    if (byCode.has(seed.code)) continue;
    await ctx.db.insert("invoice_cost_categories", {
      organization_id: organizationId,
      code: seed.code,
      label: seed.label,
      parent_code: seed.parent_code,
      aliases: seed.aliases,
      active: true,
      version: INVOICE_TAXONOMY_VERSION,
      created_at: now,
      updated_at: now,
    });
  }
}

export const startInvoiceAnalysis = mutation({
  args: {
    project_id: v.id("desarrollos"),
    document_ids: v.array(v.id("documentos")),
    transaction_ids: v.array(v.id("transacciones")),
    client_request_id: v.string(),
  },
  handler: async (ctx, args) => {
    const { reviewer, project } = await assertReviewerProject(ctx, args.project_id);
    if (!args.client_request_id.trim() || args.client_request_id.length > 120) {
      throw new Error("Identificador de solicitud inválido.");
    }
    if (args.document_ids.length < 1 || args.document_ids.length > 2) {
      throw new Error("Selecciona un XML y, opcionalmente, un PDF o imagen.");
    }
    if (new Set(args.document_ids).size !== args.document_ids.length) {
      throw new Error("No se permiten documentos repetidos.");
    }
    if (args.transaction_ids.length < 1 || args.transaction_ids.length > 10) {
      throw new Error("Selecciona entre una y diez transacciones relacionadas.");
    }
    const previous = await ctx.db
      .query("invoice_analysis_runs")
      .withIndex("by_requester_request", (q) =>
        q.eq("requested_by", reviewer._id).eq("client_request_id", args.client_request_id))
      .first();
    if (previous) return { invoice_id: previous.invoice_id, run_id: previous._id, duplicate: true };

    const transactions = await Promise.all(args.transaction_ids.map((id) => ctx.db.get(id)));
    if (transactions.some((transaction) => !transaction || transaction.proyecto !== args.project_id)) {
      throw new Error("Todas las transacciones deben pertenecer al proyecto seleccionado.");
    }
    const documents = await Promise.all(args.document_ids.map((id) => ctx.db.get(id)));
    if (documents.some((document) => !document || document.proyecto !== args.project_id)) {
      throw new Error("Todos los documentos deben pertenecer al proyecto seleccionado.");
    }
    const allowedTransactions = new Set(args.transaction_ids.map(String));
    if (documents.some((document) => document?.transaccion_id && !allowedTransactions.has(String(document.transaccion_id)))) {
      throw new Error("Un documento está vinculado a otra transacción.");
    }

    const kinds = documents.map((document) => invoiceFileKind(document!));
    if (kinds.includes("unsupported")) {
      throw new Error("Sólo se admiten CFDI XML, PDF, PNG y JPEG.");
    }
    if (kinds.filter((kind) => kind === "xml").length > 1 || kinds.filter((kind) => kind !== "xml").length > 1) {
      throw new Error("Cada análisis admite un XML y un documento visual.");
    }
    documents.forEach((document, index) => {
      const size = document?.size || 0;
      const kind = kinds[index];
      const max = kind === "xml" ? MAX_XML_SIZE : kind === "pdf" ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
      if (size > max) throw new Error(`El archivo ${document?.nombre} excede el límite permitido.`);
    });

    await ensureCategories(ctx, project.organization_id || reviewer.organization_id);
    const sourceKind = kinds.includes("xml") && kinds.length > 1
      ? "mixed"
      : kinds[0] as "xml" | "pdf" | "image";
    const now = Date.now();
    const linkedInvoiceIds = [...new Set(documents.flatMap((document) => document?.invoice_id ? [document.invoice_id] : []))];
    if (linkedInvoiceIds.length > 1) {
      throw new Error("Los documentos seleccionados pertenecen a análisis de factura distintos.");
    }
    const existingInvoiceId = linkedInvoiceIds[0];
    let invoiceId = existingInvoiceId;
    if (invoiceId) {
      const existing = await ctx.db.get(invoiceId);
      if (!existing || existing.proyecto !== args.project_id) {
        throw new Error("El vínculo de factura existente no es válido.");
      }
      await ctx.db.patch(invoiceId, {
        source_document_ids: args.document_ids,
        source_transaction_ids: args.transaction_ids,
        primary_transaction_id: args.transaction_ids[0],
        status: "queued",
        updated_at: now,
      });
    } else {
      invoiceId = await ctx.db.insert("invoice_records", {
        organization_id: project.organization_id || reviewer.organization_id,
        proyecto: args.project_id,
        source_document_ids: args.document_ids,
        source_transaction_ids: args.transaction_ids,
        primary_transaction_id: args.transaction_ids[0],
        provider_id: transactions[0]?.proveedor_id,
        source_kind: sourceKind,
        status: "queued",
        revision: 0,
        created_by: reviewer._id,
        created_at: now,
        updated_at: now,
      });
    }
    for (const documentId of args.document_ids) {
      await ctx.db.patch(documentId, { invoice_id: invoiceId });
    }

    const runId = await ctx.db.insert("invoice_analysis_runs", {
      invoice_id: invoiceId,
      requested_by: reviewer._id,
      client_request_id: args.client_request_id,
      status: "queued",
      schema_version: INVOICE_ANALYSIS_SCHEMA_VERSION,
      taxonomy_version: INVOICE_TAXONOMY_VERSION,
      warnings: [],
      created_at: now,
    });
    await ctx.scheduler.runAfter(0, internal.invoiceProcessing.processInvoiceRun, {
      run_id: runId,
    });
    return { invoice_id: invoiceId, run_id: runId, duplicate: false };
  },
});

export const getByTransaction = query({
  args: { transaction_id: v.id("transacciones") },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transaction_id);
    if (!transaction) return null;
    const { project, reviewer } = await assertReviewerProject(ctx, transaction.proyecto);
    let invoice = await ctx.db
      .query("invoice_records")
      .withIndex("by_transaction", (q) => q.eq("primary_transaction_id", args.transaction_id))
      .order("desc")
      .first();
    if (!invoice) {
      const allocation = await ctx.db
        .query("invoice_allocations")
        .withIndex("by_transaction", (q) => q.eq("transaction_id", args.transaction_id))
        .order("desc")
        .first();
      invoice = allocation ? await ctx.db.get(allocation.invoice_id) : null;
    }
    const categories = await ctx.db
      .query("invoice_cost_categories")
      .withIndex("by_organization_active", (q) =>
        q.eq("organization_id", invoice?.organization_id || project.organization_id || reviewer.organization_id).eq("active", true))
      .collect();
    if (!invoice) return { invoice: null, run: null, items: [], allocations: [], categories };
    const runs = await ctx.db
      .query("invoice_analysis_runs")
      .withIndex("by_invoice_created", (q) => q.eq("invoice_id", invoice._id))
      .order("desc")
      .take(10);
    const run = invoice.active_run_id
      ? runs.find((candidate) => candidate._id === invoice.active_run_id) || runs[0]
      : runs[0];
    const [items, allocations, history] = run
      ? await Promise.all([
          ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect(),
          ctx.db.query("invoice_allocations").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect(),
          ctx.db.query("invoice_review_history").withIndex("by_invoice_created", (q) => q.eq("invoice_id", invoice._id)).order("desc").take(20),
        ])
      : [[], [], []];
    return { invoice, run, items: items.sort((a, b) => a.source_index - b.source_index), allocations, categories, history };
  },
});

export const listReviewQueue = query({
  args: { project_id: v.id("desarrollos"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertReviewerProject(ctx, args.project_id);
    const limit = Math.min(Math.max(args.limit || 50, 1), 100);
    const records = await ctx.db
      .query("invoice_records")
      .withIndex("by_project_created", (q) => q.eq("proyecto", args.project_id))
      .order("desc")
      .take(limit);
    return records.filter((record) => record.status !== "approved" && record.status !== "rejected");
  },
});

export const listHistoricalCandidates = query({
  args: { project_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await assertReviewerProject(ctx, args.project_id);
    const documents = await ctx.db
      .query("documentos")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.project_id))
      .collect();
    return documents
      .filter((document) => !document.invoice_id && document.transaccion_id)
      .filter((document) => {
        const kind = invoiceFileKind(document);
        return kind !== "unsupported" && (normalizeInvoiceText(document.type).includes("factura") || kind === "xml");
      })
      .slice(0, 500)
      .map((document) => ({
        id: document._id,
        transaction_id: document.transaccion_id,
        name: document.nombre,
        type: document.type,
        size: document.size,
        uploaded_at: document.uploaded_at,
      }));
  },
});

export const reviewInvoiceAnalysis = mutation({
  args: {
    invoice_id: v.id("invoice_records"),
    run_id: v.id("invoice_analysis_runs"),
    expected_revision: v.number(),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
    items: v.array(v.object({
      item_id: v.id("invoice_items"),
      category_id: v.optional(v.id("invoice_cost_categories")),
      canonical_label: v.string(),
      asset_candidate: v.boolean(),
    })),
    allocations: v.array(v.object({
      transaction_id: v.id("transacciones"),
      amount: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoice_id);
    if (!invoice) throw new Error("Factura no encontrada.");
    const { reviewer } = await assertReviewerProject(ctx, invoice.proyecto);
    const run = await ctx.db.get(args.run_id);
    if (!run || run.invoice_id !== invoice._id) throw new Error("Ejecución no encontrada.");
    if (invoice.revision !== args.expected_revision) {
      throw new Error("La factura cambió mientras la revisabas. Recarga antes de continuar.");
    }
    const now = Date.now();
    if (args.decision === "reject") {
      if (!args.reason?.trim()) throw new Error("Indica el motivo del rechazo.");
      await ctx.db.patch(run._id, { status: "rejected", completed_at: now });
      await ctx.db.patch(invoice._id, {
        status: "rejected",
        rejected_by: reviewer._id,
        rejected_at: now,
        revision: invoice.revision + 1,
        updated_at: now,
      });
      await ctx.db.insert("invoice_review_history", {
        invoice_id: invoice._id,
        run_id: run._id,
        actor_user_id: reviewer._id,
        action: "rejected",
        revision: invoice.revision + 1,
        reason: args.reason.trim(),
        created_at: now,
      });
      return { status: "rejected" as const };
    }

    if (!args.items.length) throw new Error("La factura no contiene conceptos para aprobar.");
    if (!args.allocations.length) throw new Error("Asigna el importe a por lo menos una transacción.");
    const storedItems = await ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect();
    const storedById = new Map(storedItems.map((item) => [String(item._id), item]));
    if (args.items.some((item) => !storedById.has(String(item.item_id)))) {
      throw new Error("Se intentó modificar un concepto ajeno a esta factura.");
    }
    const categoryIds = [...new Set(args.items.flatMap((item) => item.category_id ? [item.category_id] : []))];
    const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
    if (categories.some((category) => !category || !category.active || category.organization_id !== invoice.organization_id)) {
      throw new Error("Una categoría no pertenece a la organización de la factura.");
    }
    const categoryById = new Map(categories.filter(Boolean).map((category) => [String(category!._id), category!]));
    for (const update of args.items) {
      const category = update.category_id ? categoryById.get(String(update.category_id)) : undefined;
      const unresolved = !category || category.code === INVOICE_UNRESOLVED_CODE;
      await ctx.db.patch(update.item_id, {
        category_id: category?._id,
        canonical_label: update.canonical_label.trim().slice(0, 180) || storedById.get(String(update.item_id))!.description,
        asset_candidate: update.asset_candidate,
        classification_status: unresolved ? "unresolved" : category?.code === storedById.get(String(update.item_id))!.proposed_category_code ? "approved" : "overridden",
        reviewed_by: reviewer._id,
        reviewed_at: now,
        updated_at: now,
      });
    }

    const existingAllocations = await ctx.db.query("invoice_allocations").withIndex("by_invoice", (q) => q.eq("invoice_id", invoice._id)).collect();
    for (const allocation of existingAllocations) await ctx.db.delete(allocation._id);
    let needsOverride = false;
    const allocationCurrencies = new Set<string>();
    const permittedTransactionIds = new Set(invoice.source_transaction_ids.map(String));
    for (const allocation of args.allocations) {
      const transaction = await ctx.db.get(allocation.transaction_id);
      if (!transaction || transaction.proyecto !== invoice.proyecto || !permittedTransactionIds.has(String(transaction._id))) {
        throw new Error("Una asignación pertenece a otra transacción o proyecto.");
      }
      if (!Number.isFinite(allocation.amount) || allocation.amount === 0) {
        throw new Error("Los importes asignados deben ser distintos de cero.");
      }
      if (Math.abs(Math.abs(allocation.amount) - Math.abs(transaction.monto_total)) > 0.01) needsOverride = true;
      if (invoice.invoice_type === "credit_note" && allocation.amount > 0) needsOverride = true;
      allocationCurrencies.add(normalizeInvoiceCurrency(transaction.moneda));
      await ctx.db.insert("invoice_allocations", {
        invoice_id: invoice._id,
        run_id: run._id,
        transaction_id: transaction._id,
        amount: allocation.amount,
        currency: normalizeInvoiceCurrency(transaction.moneda),
        created_by: reviewer._id,
        created_at: now,
        updated_at: now,
      });
    }
    const allocatedTotal = args.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (allocationCurrencies.size > 1) needsOverride = true;
    const onlyAllocationCurrency = [...allocationCurrencies][0];
    if (invoice.currency && invoice.currency !== "SIN_MONEDA" && onlyAllocationCurrency !== invoice.currency) needsOverride = true;
    if (invoice.total !== undefined && allocationCurrencies.size === 1 && Math.abs(Math.abs(allocatedTotal) - Math.abs(invoice.total)) > 0.01) needsOverride = true;
    if (needsOverride && !args.reason?.trim()) {
      throw new Error("Los importes no concilian. Captura un motivo de excepción para aprobar.");
    }

    await ctx.db.patch(run._id, { status: "approved", completed_at: now });
    await ctx.db.patch(invoice._id, {
      status: "approved",
      active_run_id: run._id,
      approved_category_ids: categoryIds,
      approved_by: reviewer._id,
      approved_at: now,
      revision: invoice.revision + 1,
      updated_at: now,
    });
    await ctx.db.insert("invoice_review_history", {
      invoice_id: invoice._id,
      run_id: run._id,
      actor_user_id: reviewer._id,
      action: needsOverride ? "approved_with_override" : "approved",
      revision: invoice.revision + 1,
      reason: args.reason?.trim() || undefined,
      created_at: now,
    });
    return { status: "approved" as const };
  },
});

export const claimRun = internalMutation({
  args: { run_id: v.id("invoice_analysis_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status !== "queued") return false;
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "extracting", started_at: now });
    await ctx.db.patch(run.invoice_id, { status: "extracting", updated_at: now });
    return true;
  },
});

export const getRunContext = internalQuery({
  args: { run_id: v.id("invoice_analysis_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Ejecución no encontrada.");
    const invoice = await ctx.db.get(run.invoice_id);
    if (!invoice) throw new Error("Factura no encontrada.");
    const [documents, transaction, categories] = await Promise.all([
      Promise.all(invoice.source_document_ids.map((id) => ctx.db.get(id))),
      ctx.db.get(invoice.primary_transaction_id),
      ctx.db.query("invoice_cost_categories")
        .withIndex("by_organization_active", (q) => q.eq("organization_id", invoice.organization_id).eq("active", true))
        .collect(),
    ]);
    if (documents.some((document) => !document?.storage_id)) throw new Error("Un documento no está disponible en Convex Storage.");
    if (!transaction) throw new Error("La transacción ya no existe.");
    return { run, invoice, documents, transaction, categories };
  },
});

const extractedItemValidator = v.object({
  source_index: v.number(),
  description: v.string(),
  product_code: v.optional(v.string()),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
  unit_price: v.optional(v.number()),
  discount: v.optional(v.number()),
  net_amount: v.optional(v.number()),
  tax_amount: v.optional(v.number()),
  gross_amount: v.optional(v.number()),
  category_code: v.string(),
  canonical_label: v.string(),
  confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  asset_candidate: v.boolean(),
  evidence_page: v.optional(v.number()),
});

export const completeRun = internalMutation({
  args: {
    run_id: v.id("invoice_analysis_runs"),
    source_hash: v.string(),
    document_hashes: v.array(v.object({ document_id: v.id("documentos"), sha256: v.string(), mime_type: v.string() })),
    invoice_type: v.union(v.literal("invoice"), v.literal("credit_note"), v.literal("receipt"), v.literal("unknown")),
    uuid: v.optional(v.string()),
    folio: v.optional(v.string()),
    issuer_name: v.optional(v.string()),
    issuer_rfc: v.optional(v.string()),
    receiver_rfc: v.optional(v.string()),
    issued_at: v.optional(v.string()),
    currency: v.string(),
    subtotal: v.optional(v.number()),
    discount: v.optional(v.number()),
    transferred_taxes: v.optional(v.number()),
    retained_taxes: v.optional(v.number()),
    total: v.optional(v.number()),
    items: v.array(extractedItemValidator),
    warnings: v.array(v.string()),
    model: v.string(),
    response_id: v.optional(v.string()),
    input_tokens: v.optional(v.number()),
    output_tokens: v.optional(v.number()),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status !== "extracting") return false;
    const invoice = await ctx.db.get(run.invoice_id);
    if (!invoice) throw new Error("Factura no encontrada.");
    const existingItems = await ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect();
    for (const item of existingItems) await ctx.db.delete(item._id);
    const categories = await ctx.db.query("invoice_cost_categories")
      .withIndex("by_organization_active", (q) => q.eq("organization_id", invoice.organization_id).eq("active", true))
      .collect();
    const categoryByCode = new Map(categories.map((category) => [category.code, category]));
    const now = Date.now();
    for (const item of args.items) {
      const proposed = categoryByCode.get(item.category_code) || categoryByCode.get(INVOICE_UNRESOLVED_CODE);
      await ctx.db.insert("invoice_items", {
        invoice_id: invoice._id,
        run_id: run._id,
        source_index: item.source_index,
        description: item.description.slice(0, 500),
        normalized_description: normalizeInvoiceText(item.description),
        product_code: item.product_code,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        discount: item.discount,
        net_amount: item.net_amount,
        tax_amount: item.tax_amount,
        gross_amount: item.gross_amount,
        proposed_category_code: proposed?.code || INVOICE_UNRESOLVED_CODE,
        category_id: proposed?._id,
        canonical_label: item.canonical_label.slice(0, 180),
        confidence: item.confidence,
        classification_status: proposed?.code === INVOICE_UNRESOLVED_CODE ? "unresolved" : "proposed",
        asset_candidate: item.asset_candidate,
        evidence_page: item.evidence_page,
        created_at: now,
        updated_at: now,
      });
    }
    const duplicate = args.uuid
      ? await ctx.db.query("invoice_records").withIndex("by_uuid", (q) => q.eq("uuid_normalized", normalizeInvoiceUuid(args.uuid))).first()
      : null;
    const duplicateSourceRun = await ctx.db
      .query("invoice_analysis_runs")
      .withIndex("by_source_hash", (q) => q.eq("source_hash", args.source_hash))
      .first();
    const warnings = [...new Set([
      ...args.warnings,
      ...(duplicate && duplicate._id !== invoice._id ? ["El UUID ya aparece en otra factura; revisa un posible duplicado."] : []),
      ...(duplicateSourceRun && duplicateSourceRun.invoice_id !== invoice._id ? ["Los mismos archivos ya fueron analizados en otra factura; revisa un posible duplicado."] : []),
      ...(!args.items.length ? ["No se recuperaron conceptos de la factura."] : []),
    ])].slice(0, 20);
    await ctx.db.patch(run._id, {
      status: "review_required",
      source_hash: args.source_hash,
      model: args.model,
      response_id: args.response_id,
      input_tokens: args.input_tokens,
      output_tokens: args.output_tokens,
      duration_ms: args.duration_ms,
      warnings,
      completed_at: now,
    });
    await ctx.db.patch(invoice._id, {
      status: "review_required",
      invoice_type: args.invoice_type,
      uuid: args.uuid,
      uuid_normalized: args.uuid ? normalizeInvoiceUuid(args.uuid) : undefined,
      folio: args.folio,
      issuer_name: args.issuer_name,
      issuer_rfc: args.issuer_rfc,
      receiver_rfc: args.receiver_rfc,
      issued_at: args.issued_at,
      currency: normalizeInvoiceCurrency(args.currency),
      subtotal: args.subtotal,
      discount: args.discount,
      transferred_taxes: args.transferred_taxes,
      retained_taxes: args.retained_taxes,
      total: args.total,
      active_run_id: run._id,
      updated_at: now,
    });
    for (const document of args.document_hashes) {
      await ctx.db.patch(document.document_id, { sha256: document.sha256, mime_type: document.mime_type });
    }
    return true;
  },
});

export const failRun = internalMutation({
  args: {
    run_id: v.id("invoice_analysis_runs"),
    error_code: v.string(),
    error: v.string(),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) return;
    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: "failed",
      error_code: args.error_code.slice(0, 80),
      error: args.error.slice(0, 500),
      duration_ms: args.duration_ms,
      completed_at: now,
    });
    await ctx.db.patch(run.invoice_id, { status: "failed", updated_at: now });
  },
});

export const getApprovedProjectInvoiceData = internalQuery({
  args: { project_ids: v.array(v.id("desarrollos")) },
  handler: async (ctx, args) => {
    const results = [];
    for (const projectId of args.project_ids) {
      const records = await ctx.db.query("invoice_records")
        .withIndex("by_project_status", (q) => q.eq("proyecto", projectId).eq("status", "approved"))
        .collect();
      for (const record of records) {
        if (!record.active_run_id) continue;
        const [items, allocations, provider] = await Promise.all([
          ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", record.active_run_id!)).collect(),
          ctx.db.query("invoice_allocations").withIndex("by_run", (q) => q.eq("run_id", record.active_run_id!)).collect(),
          record.provider_id ? ctx.db.get(record.provider_id) : Promise.resolve(null),
        ]);
        const categoryIds = [...new Set(items.flatMap((item) => item.category_id ? [item.category_id] : []))];
        const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
        results.push({ record, items, allocations, provider, categories: categories.filter(Boolean) });
      }
    }
    return results;
  },
});
