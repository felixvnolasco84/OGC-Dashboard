import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanWrite,
  assertInvoiceReviewer,
  canUserAccessDesarrollo,
  getCurrentUserOrThrow,
} from "./permissions";
import { mutation } from "./functions";
import {
  INVOICE_ANALYSIS_SCHEMA_VERSION,
  INVOICE_CATEGORY_SEEDS,
  INVOICE_TAXONOMY_VERSION,
  INVOICE_UNRESOLVED_CODE,
  buildInvoiceBudgetTargets,
  buildInvoiceReconciliation,
  invoiceDocumentPairKey,
  invoiceAllocationValidationError,
  isCurrentInvoiceRunState,
  normalizeInvoiceCurrency,
  normalizeInvoiceText,
  normalizeInvoiceUuid,
  parseInvoiceIssuedDate,
} from "./invoiceRules";
import { markInvoicesStaleForCategory } from "./invoiceIntegrity";
import { mostSpecificCostLabel, normalizeCostText } from "./costRules";

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

async function assertWriterProject(ctx: MutationCtx, projectId: Id<"desarrollos">) {
  const user = await assertCanWrite(ctx) as Reviewer;
  const project = await ctx.db.get(projectId);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("No tienes acceso para cargar facturas en este proyecto.");
  }
  return { user, project };
}

async function assertAccessibleProject(ctx: QueryCtx, projectId: Id<"desarrollos">) {
  const user = await getCurrentUserOrThrow(ctx) as Reviewer;
  const project = await ctx.db.get(projectId);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("No tienes acceso al proyecto de la factura.");
  }
  return { user, project };
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
    const existing = byCode.get(seed.code);
    if (!existing) {
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
    } else if (existing.version < INVOICE_TAXONOMY_VERSION) {
      await markInvoicesStaleForCategory(ctx, existing._id);
      await ctx.db.patch(existing._id, {
        label: seed.label,
        parent_code: seed.parent_code,
        aliases: seed.aliases,
        version: INVOICE_TAXONOMY_VERSION,
        updated_at: now,
      });
    }
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
    if (new Set(args.transaction_ids.map(String)).size !== args.transaction_ids.length) {
      throw new Error("No se permiten transacciones repetidas.");
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
    let existingInvoice: Doc<"invoice_records"> | null = null;
    if (invoiceId) {
      existingInvoice = await ctx.db.get(invoiceId);
      if (!existingInvoice || existingInvoice.proyecto !== args.project_id) {
        throw new Error("El vínculo de factura existente no es válido.");
      }
      if (["queued", "extracting", "review_required"].includes(existingInvoice.status)) {
        throw new Error("Esta factura ya tiene un análisis activo o pendiente de revisión.");
      }
    } else {
      invoiceId = await ctx.db.insert("invoice_records", {
        organization_id: project.organization_id || reviewer.organization_id,
        proyecto: args.project_id,
        source_document_ids: args.document_ids,
        source_transaction_ids: args.transaction_ids,
        primary_transaction_id: args.transaction_ids[0],
        intake_mode: "linked_transaction",
        provider_id: transactions[0]?.proveedor_id,
        source_kind: sourceKind,
        status: "queued",
        revision: 0,
        created_by: reviewer._id,
        created_at: now,
        updated_at: now,
      });
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
    if (existingInvoice) {
      const previousRuns = await ctx.db
        .query("invoice_analysis_runs")
        .withIndex("by_invoice_created", (q) => q.eq("invoice_id", existingInvoice!._id))
        .collect();
      for (const previousRun of previousRuns) {
        if (previousRun._id === runId || !["queued", "extracting", "review_required"].includes(previousRun.status)) continue;
        await ctx.db.patch(previousRun._id, {
          status: "stale",
          completed_at: previousRun.completed_at || now,
        });
      }
      const nextDocumentIds = new Set(args.document_ids.map(String));
      for (const previousDocumentId of existingInvoice.source_document_ids) {
        if (nextDocumentIds.has(String(previousDocumentId))) continue;
        const previousDocument = await ctx.db.get(previousDocumentId);
        if (previousDocument?.invoice_id === existingInvoice._id) {
          await ctx.db.patch(previousDocument._id, { invoice_id: undefined });
        }
      }
      await ctx.db.patch(existingInvoice._id, {
        source_document_ids: args.document_ids,
        source_transaction_ids: args.transaction_ids,
        primary_transaction_id: args.transaction_ids[0],
        intake_mode: existingInvoice.intake_mode || "linked_transaction",
        provider_id: transactions[0]?.proveedor_id,
        source_kind: sourceKind,
        status: "queued",
        active_run_id: runId,
        approved_category_ids: undefined,
        reconciliation_status: undefined,
        reconciliation_exception_codes: undefined,
        approved_by: undefined,
        approved_at: undefined,
        rejected_by: undefined,
        rejected_at: undefined,
        revision: existingInvoice.revision + 1,
        updated_at: now,
      });
    } else {
      await ctx.db.patch(invoiceId, { active_run_id: runId });
    }
    for (const documentId of args.document_ids) {
      await ctx.db.patch(documentId, { invoice_id: invoiceId });
    }
    await ctx.scheduler.runAfter(0, internal.invoiceProcessing.processInvoiceRun, {
      run_id: runId,
    });
    return { invoice_id: invoiceId, run_id: runId, duplicate: false };
  },
});

export const startDirectInvoiceIntake = mutation({
  args: {
    project_id: v.id("desarrollos"),
    documents: v.array(v.object({
      storage_id: v.id("_storage"),
      name: v.string(),
      type: v.string(),
      size: v.number(),
      mime_type: v.optional(v.string()),
    })),
    client_request_id: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, project } = await assertWriterProject(ctx, args.project_id);
    if (!args.client_request_id.trim() || args.client_request_id.length > 120) {
      throw new Error("Identificador de solicitud inválido.");
    }
    const previous = await ctx.db
      .query("invoice_analysis_runs")
      .withIndex("by_requester_request", (q) =>
        q.eq("requested_by", user._id).eq("client_request_id", args.client_request_id))
      .first();
    if (previous) return { invoice_id: previous.invoice_id, run_id: previous._id, duplicate: true };
    if (args.documents.length < 1 || args.documents.length > 2) {
      throw new Error("Selecciona un XML y, opcionalmente, un PDF o imagen.");
    }
    if (new Set(args.documents.map((document) => String(document.storage_id))).size !== args.documents.length) {
      throw new Error("No se permiten archivos repetidos.");
    }
    const kinds = args.documents.map((document) => invoiceFileKind({
      nombre: document.name,
      mime_type: document.mime_type,
    } as Doc<"documentos">));
    if (kinds.includes("unsupported")) throw new Error("Sólo se admiten CFDI XML, PDF, PNG y JPEG.");
    if (kinds.filter((kind) => kind === "xml").length > 1 || kinds.filter((kind) => kind !== "xml").length > 1) {
      throw new Error("Cada carga admite un XML y un solo respaldo PDF o imagen.");
    }
    args.documents.forEach((document, index) => {
      if (!document.name.trim() || document.name.length > 240) throw new Error("Nombre de archivo inválido.");
      const kind = kinds[index];
      const max = kind === "xml" ? MAX_XML_SIZE : kind === "pdf" ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
      if (!Number.isFinite(document.size) || document.size <= 0 || document.size > max) {
        throw new Error(`El archivo ${document.name} no tiene un tamaño permitido.`);
      }
    });

    await ensureCategories(ctx, project.organization_id || user.organization_id);
    const now = Date.now();
    const documentIds: Id<"documentos">[] = [];
    for (const document of args.documents) {
      documentIds.push(await ctx.db.insert("documentos", {
        nombre: document.name.trim(),
        descripcion: "Factura cargada para análisis y aprobación",
        storage_id: document.storage_id,
        type: document.type.trim() || "factura",
        size: document.size,
        mime_type: document.mime_type,
        proyecto: args.project_id,
        uploaded_at: now,
      }));
    }
    const sourceKind = kinds.includes("xml") && kinds.length > 1
      ? "mixed"
      : kinds[0] as "xml" | "pdf" | "image";
    const invoiceId = await ctx.db.insert("invoice_records", {
      organization_id: project.organization_id || user.organization_id,
      proyecto: args.project_id,
      source_document_ids: documentIds,
      source_transaction_ids: [],
      intake_mode: "direct",
      source_kind: sourceKind,
      status: "queued",
      revision: 0,
      created_by: user._id,
      created_at: now,
      updated_at: now,
    });
    const runId = await ctx.db.insert("invoice_analysis_runs", {
      invoice_id: invoiceId,
      requested_by: user._id,
      client_request_id: args.client_request_id,
      status: "queued",
      schema_version: INVOICE_ANALYSIS_SCHEMA_VERSION,
      taxonomy_version: INVOICE_TAXONOMY_VERSION,
      warnings: [],
      created_at: now,
    });
    await ctx.db.patch(invoiceId, { active_run_id: runId });
    for (const documentId of documentIds) await ctx.db.patch(documentId, { invoice_id: invoiceId });
    await ctx.scheduler.runAfter(0, internal.invoiceProcessing.processInvoiceRun, { run_id: runId });
    return { invoice_id: invoiceId, run_id: runId, duplicate: false };
  },
});

export const getDirectIntake = query({
  args: { invoice_id: v.id("invoice_records") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoice_id);
    if (!invoice || invoice.intake_mode !== "direct") throw new Error("Carga de factura no encontrada.");
    const { user, project } = await assertAccessibleProject(ctx, invoice.proyecto);
    const run = invoice.active_run_id ? await ctx.db.get(invoice.active_run_id) : null;
    const [items, documents, partidas, duplicateInvoice] = await Promise.all([
      run ? ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect() : Promise.resolve([]),
      Promise.all(invoice.source_document_ids.map((id) => ctx.db.get(id))),
      ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", invoice.proyecto)).collect(),
      invoice.duplicate_invoice_id ? ctx.db.get(invoice.duplicate_invoice_id) : Promise.resolve(null),
    ]);
    const documentViews = await Promise.all(documents.filter(Boolean).map(async (document) => ({
      _id: document!._id,
      name: document!.nombre,
      type: document!.type,
      size: document!.size,
      url: document!.storage_id ? await ctx.storage.getUrl(document!.storage_id) : null,
    })));
    return {
      invoice,
      run,
      project: { _id: project._id, name: project.nombre },
      items: items.sort((left, right) => left.source_index - right.source_index),
      documents: documentViews,
      budget_targets: buildInvoiceBudgetTargets(partidas),
      duplicate_invoice: duplicateInvoice ? {
        _id: duplicateInvoice._id,
        folio: duplicateInvoice.folio,
        uuid: duplicateInvoice.uuid,
        integrated_transaction_id: duplicateInvoice.integrated_transaction_id || duplicateInvoice.primary_transaction_id,
      } : null,
      can_review: user.role === "admin" || user.role === "finance",
    };
  },
});

export const listDirectIntakeQueue = query({
  args: { project_id: v.optional(v.id("desarrollos")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const reviewer = await assertInvoiceReviewer(ctx) as Reviewer;
    if (args.project_id) await assertReviewerProject(ctx, args.project_id);
    const limit = Math.min(Math.max(args.limit || 30, 1), 100);
    const records = args.project_id
      ? await ctx.db.query("invoice_records")
          .withIndex("by_project_created", (q) => q.eq("proyecto", args.project_id!))
          .order("desc").take(150)
      : await ctx.db.query("invoice_records").order("desc").take(300);
    const pending = records.filter((record) =>
      record.intake_mode === "direct" && ["queued", "extracting", "review_required"].includes(record.status));
    const rows = [];
    for (const record of pending) {
      const project = await ctx.db.get(record.proyecto);
      if (!project || !canUserAccessDesarrollo(reviewer, project)) continue;
      rows.push({
        _id: record._id,
        project_id: record.proyecto,
        project_name: project.nombre,
        folio: record.folio,
        issuer_name: record.issuer_name,
        total: record.total,
        currency: record.currency,
        status: record.status,
        created_at: record.created_at,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  },
});

export const getByTransaction = query({
  args: {
    transaction_id: v.id("transacciones"),
    invoice_id: v.optional(v.id("invoice_records")),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transaction_id);
    if (!transaction) return null;
    const { project, reviewer } = await assertReviewerProject(ctx, transaction.proyecto);
    let invoice = args.invoice_id ? await ctx.db.get(args.invoice_id) : null;
    if (args.invoice_id && !invoice) throw new Error("Factura no encontrada.");
    if (invoice && (
      invoice.proyecto !== transaction.proyecto ||
      !invoice.source_transaction_ids.some((transactionId) => transactionId === args.transaction_id)
    )) {
      throw new Error("La factura solicitada no pertenece a esta transacción.");
    }
    if (!invoice && !args.invoice_id) {
      invoice = await ctx.db
        .query("invoice_records")
        .withIndex("by_transaction", (q) => q.eq("primary_transaction_id", args.transaction_id))
        .order("desc")
        .first();
    }
    if (!invoice && !args.invoice_id) {
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
    const run = invoice.active_run_id
      ? await ctx.db.get(invoice.active_run_id)
      : await ctx.db
          .query("invoice_analysis_runs")
          .withIndex("by_invoice_created", (q) => q.eq("invoice_id", invoice._id))
          .order("desc")
          .first();
    const currentRun = run?.invoice_id === invoice._id ? run : null;
    const [items, allocations, history] = currentRun
      ? await Promise.all([
          ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", currentRun._id)).collect(),
          ctx.db.query("invoice_allocations").withIndex("by_run", (q) => q.eq("run_id", currentRun._id)).collect(),
          ctx.db.query("invoice_review_history").withIndex("by_invoice_created", (q) => q.eq("invoice_id", invoice._id)).order("desc").take(20),
        ])
      : [[], [], []];
    return { invoice, run: currentRun, items: items.sort((a, b) => a.source_index - b.source_index), allocations, categories, history };
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
    return records.filter((record) =>
      record.intake_mode !== "direct" &&
      Boolean(record.primary_transaction_id) &&
      record.status !== "approved" &&
      record.status !== "rejected");
  },
});

export const listHistoricalCandidates = query({
  args: {
    project_id: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await assertReviewerProject(ctx, args.project_id);
    const result = await ctx.db
      .query("documentos")
      .withIndex("by_proyecto_uploaded", (q) => q.eq("proyecto", args.project_id))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = result.page
      .filter((document) => !document.invoice_id && document.transaccion_id && document.storage_id)
      .filter((document) => {
        const kind = invoiceFileKind(document);
        return kind !== "unsupported" && (normalizeInvoiceText(document.type).includes("factura") || kind === "xml");
      })
      .map((document) => ({
        id: document._id,
        transaction_id: document.transaccion_id,
        name: document.nombre,
        type: document.type,
        size: document.size,
        uploaded_at: document.uploaded_at,
        kind: invoiceFileKind(document),
        pair_key: invoiceDocumentPairKey(document.nombre),
      }));
    return { ...result, page };
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
    if (!isCurrentInvoiceRunState({
      active_run_id: invoice.active_run_id,
      run_id: run._id,
      invoice_status: invoice.status,
      run_status: run.status,
      allowed_statuses: ["review_required"],
    })) {
      throw new Error("Esta ejecución ya no es la revisión activa de la factura.");
    }
    if (args.reason && args.reason.trim().length > 1000) {
      throw new Error("El motivo no puede exceder 1,000 caracteres.");
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
    if (args.allocations.length > 10) throw new Error("No se permiten más de diez asignaciones.");
    if (invoice.invoice_type === "payment_complement") {
      throw new Error("Los complementos de pago no representan un gasto adicional y no pueden aprobarse como desglose.");
    }
    const storedItems = await ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect();
    const storedById = new Map(storedItems.map((item) => [String(item._id), item]));
    const submittedItemIds = new Set(args.items.map((item) => String(item.item_id)));
    if (submittedItemIds.size !== args.items.length || submittedItemIds.size !== storedItems.length ||
        args.items.some((item) => !storedById.has(String(item.item_id)))) {
      throw new Error("Debes revisar exactamente una vez todos los conceptos de la factura.");
    }
    const submittedTransactionIds = new Set(args.allocations.map((allocation) => String(allocation.transaction_id)));
    if (submittedTransactionIds.size !== args.allocations.length) {
      throw new Error("No se permiten asignaciones repetidas para una misma transacción.");
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

    const permittedTransactionIds = new Set(invoice.source_transaction_ids.map(String));
    const preparedAllocations: Array<{
      transaction: Doc<"transacciones">;
      amount: number;
      currency: string;
      existingApprovedAmount: number;
    }> = [];
    for (const allocation of args.allocations) {
      const transaction = await ctx.db.get(allocation.transaction_id);
      if (!transaction || transaction.proyecto !== invoice.proyecto || !permittedTransactionIds.has(String(transaction._id))) {
        throw new Error("Una asignación pertenece a otra transacción o proyecto.");
      }
      const validationError = invoiceAllocationValidationError(invoice.invoice_type, allocation.amount);
      if (validationError) throw new Error(validationError);
      const transactionAllocations = await ctx.db
        .query("invoice_allocations")
        .withIndex("by_transaction", (q) => q.eq("transaction_id", transaction._id))
        .collect();
      let existingApprovedAmount = 0;
      for (const existingAllocation of transactionAllocations) {
        if (existingAllocation.invoice_id === invoice._id) continue;
        const existingInvoice = await ctx.db.get(existingAllocation.invoice_id);
        if (existingInvoice?.status === "approved") existingApprovedAmount += existingAllocation.amount;
      }
      preparedAllocations.push({
        transaction,
        amount: allocation.amount,
        currency: normalizeInvoiceCurrency(transaction.moneda),
        existingApprovedAmount,
      });
    }
    const reconciliation = buildInvoiceReconciliation({
      invoice_type: invoice.invoice_type,
      invoice_total: invoice.total,
      invoice_currency: invoice.currency,
      allocations: preparedAllocations.map((allocation) => ({
        amount: allocation.amount,
        currency: allocation.currency,
        transaction_total: allocation.transaction.monto_total,
        existing_approved_amount: allocation.existingApprovedAmount,
      })),
      has_unclassified_items: args.items.some((item) => {
        const category = item.category_id ? categoryById.get(String(item.category_id)) : undefined;
        return !category || category.code === INVOICE_UNRESOLVED_CODE;
      }),
    });
    const needsOverride = reconciliation.status === "exception";
    if (needsOverride && !args.reason?.trim()) {
      throw new Error(`La conciliación requiere una justificación (${reconciliation.exception_codes.join(", ")}).`);
    }

    const existingAllocations = await ctx.db.query("invoice_allocations").withIndex("by_invoice", (q) => q.eq("invoice_id", invoice._id)).collect();
    for (const allocation of existingAllocations) await ctx.db.delete(allocation._id);
    for (const allocation of preparedAllocations) {
      await ctx.db.insert("invoice_allocations", {
        invoice_id: invoice._id,
        run_id: run._id,
        transaction_id: allocation.transaction._id,
        amount: allocation.amount,
        currency: allocation.currency,
        created_by: reviewer._id,
        created_at: now,
        updated_at: now,
      });
    }

    await ctx.db.patch(run._id, { status: "approved", completed_at: now });
    await ctx.db.patch(invoice._id, {
      status: "approved",
      active_run_id: run._id,
      approved_category_ids: categoryIds,
      reconciliation_status: reconciliation.status,
      reconciliation_exception_codes: reconciliation.exception_codes,
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
      exception_codes: reconciliation.exception_codes,
      reconciliation: {
        allocated_total: reconciliation.allocated_total,
        invoice_total: reconciliation.invoice_total,
        currency: reconciliation.currency,
        variance: reconciliation.variance,
        allocation_count: reconciliation.allocation_count,
      },
      created_at: now,
    });
    return { status: "approved" as const, reconciliation };
  },
});

export const approveDirectInvoice = mutation({
  args: {
    invoice_id: v.id("invoice_records"),
    run_id: v.id("invoice_analysis_runs"),
    expected_revision: v.number(),
    provider_id: v.id("proveedores"),
    reason: v.optional(v.string()),
    transaction: v.object({
      monto_total: v.number(),
      fecha: v.string(),
      status: v.union(v.literal("Pagado"), v.literal("Por pagar")),
      tipo_pago: v.string(),
      moneda: v.string(),
      tipo_cambio: v.string(),
      codigo_referencia: v.optional(v.string()),
    }),
    items: v.array(v.object({
      item_id: v.id("invoice_items"),
      partida_id: v.id("partidas"),
      amount: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoice_id);
    if (!invoice || invoice.intake_mode !== "direct") throw new Error("Carga directa de factura no encontrada.");
    const { reviewer } = await assertReviewerProject(ctx, invoice.proyecto);
    if (invoice.integrated_transaction_id) {
      return { transaction_id: invoice.integrated_transaction_id, duplicate: true };
    }
    const run = await ctx.db.get(args.run_id);
    if (!run || run.invoice_id !== invoice._id) throw new Error("Ejecución de factura no encontrada.");
    if (invoice.revision !== args.expected_revision) {
      throw new Error("La factura cambió mientras la revisabas. Recarga antes de aprobar.");
    }
    if (!isCurrentInvoiceRunState({
      active_run_id: invoice.active_run_id,
      run_id: run._id,
      invoice_status: invoice.status,
      run_status: run.status,
      allowed_statuses: ["review_required"],
    })) throw new Error("Esta revisión dejó de ser la activa.");
    if (invoice.invoice_type === "payment_complement") {
      throw new Error("Los complementos de pago no crean un gasto nuevo.");
    }
    if (args.reason && args.reason.trim().length > 1000) throw new Error("La justificación es demasiado larga.");

    const currentDuplicate = invoice.uuid_normalized
      ? (await ctx.db.query("invoice_records")
          .withIndex("by_uuid", (q) => q.eq("uuid_normalized", invoice.uuid_normalized))
          .collect())
          .filter((candidate) => candidate._id !== invoice._id && candidate.created_at < invoice.created_at)
          .sort((left, right) => left.created_at - right.created_at)[0]
      : null;
    let duplicateInvoice = currentDuplicate || (invoice.duplicate_invoice_id ? await ctx.db.get(invoice.duplicate_invoice_id) : null);
    if (!duplicateInvoice && run.source_hash) {
      const matchingRuns = await ctx.db.query("invoice_analysis_runs")
        .withIndex("by_source_hash", (q) => q.eq("source_hash", run.source_hash))
        .collect();
      const duplicateRun = matchingRuns
        .filter((candidate) => candidate.invoice_id !== invoice._id && candidate.created_at < run.created_at)
        .sort((left, right) => left.created_at - right.created_at)[0];
      duplicateInvoice = duplicateRun ? await ctx.db.get(duplicateRun.invoice_id) : null;
    }
    if (duplicateInvoice) {
      throw new Error(`La factura ya existe en el registro ${duplicateInvoice.folio || duplicateInvoice.uuid || duplicateInvoice._id}.`);
    }

    const provider = await ctx.db.get(args.provider_id);
    if (!provider || provider.archived_at || provider.merged_into) throw new Error("Selecciona un proveedor activo.");
    const transactionCurrency = normalizeInvoiceCurrency(args.transaction.moneda);
    if (transactionCurrency === "SIN_MONEDA") throw new Error("Selecciona una moneda válida.");
    const invoiceCurrency = normalizeInvoiceCurrency(invoice.currency);
    if (invoiceCurrency !== "SIN_MONEDA" && invoiceCurrency !== transactionCurrency) {
      throw new Error("La moneda revisada debe coincidir con la factura.");
    }
    const exchangeRate = Number(args.transaction.tipo_cambio);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || (transactionCurrency !== "MXN" && !args.transaction.tipo_cambio.trim())) {
      throw new Error("Captura un tipo de cambio válido.");
    }
    const transactionDate = parseInvoiceIssuedDate(args.transaction.fecha);
    if (!transactionDate) throw new Error("Captura una fecha válida.");
    const paymentType = args.transaction.tipo_pago.trim();
    if (args.transaction.status === "Pagado" && (!paymentType || paymentType === "Por definir")) {
      throw new Error("Selecciona el método de pago para una factura pagada.");
    }
    if (!Number.isFinite(args.transaction.monto_total) || args.transaction.monto_total === 0) {
      throw new Error("El total revisado debe ser distinto de cero.");
    }
    if (invoice.invoice_type === "credit_note" && args.transaction.monto_total >= 0) {
      throw new Error("Una nota de crédito debe integrarse con importe negativo.");
    }
    if (invoice.invoice_type !== "credit_note" && args.transaction.monto_total < 0) {
      throw new Error("Sólo una nota de crédito admite importe negativo.");
    }

    const storedItems = await ctx.db.query("invoice_items")
      .withIndex("by_run", (q) => q.eq("run_id", run._id)).collect();
    const storedById = new Map(storedItems.map((item) => [String(item._id), item]));
    const submittedIds = new Set(args.items.map((item) => String(item.item_id)));
    if (!storedItems.length || submittedIds.size !== storedItems.length || args.items.length !== storedItems.length ||
        args.items.some((item) => !storedById.has(String(item.item_id)))) {
      throw new Error("Debes revisar exactamente una vez todos los conceptos.");
    }
    const itemCategories = await Promise.all(
      [...new Set(storedItems.flatMap((item) => item.category_id ? [item.category_id] : []))]
        .map((id) => ctx.db.get(id)),
    );
    const approvedCategoryIds = itemCategories
      .filter((category): category is Doc<"invoice_cost_categories"> => Boolean(category && category.code !== INVOICE_UNRESOLVED_CODE))
      .map((category) => category._id);
    const approvedCategoryIdSet = new Set(approvedCategoryIds.map(String));
    const partidas = await Promise.all([...new Set(args.items.map((item) => item.partida_id))].map((id) => ctx.db.get(id)));
    const partidaById = new Map(partidas.filter(Boolean).map((partida) => [String(partida!._id), partida!]));
    const projectPartidas = await ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", invoice.proyecto)).collect();
    const validTargetIds = new Set(buildInvoiceBudgetTargets(projectPartidas).map((target) => target.id));
    for (const item of args.items) {
      const partida = partidaById.get(String(item.partida_id));
      if (!partida || partida.proyecto !== invoice.proyecto || !validTargetIds.has(String(partida._id))) {
        throw new Error("Todos los conceptos deben apuntar a una familia hoja o subpartida válida del proyecto.");
      }
      if (!Number.isFinite(item.amount) || item.amount === 0 || Math.abs(item.amount * 100 - Math.round(item.amount * 100)) > 1e-6) {
        throw new Error("Cada concepto debe tener un importe válido con máximo dos decimales.");
      }
      if (invoice.invoice_type === "credit_note" ? item.amount > 0 : item.amount < 0) {
        throw new Error("El signo de los conceptos no coincide con el tipo de factura.");
      }
    }
    const itemTotal = Math.round(args.items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const transactionTotal = Math.round(args.transaction.monto_total * 100) / 100;
    if (Math.abs(itemTotal - transactionTotal) > 0.01) {
      throw new Error("La suma de los conceptos debe coincidir con el total revisado.");
    }
    const signedInvoiceTotal = invoice.total === undefined
      ? undefined
      : invoice.invoice_type === "credit_note" ? -Math.abs(invoice.total) : Math.abs(invoice.total);
    const totalException = signedInvoiceTotal !== undefined && Math.abs(transactionTotal - signedInvoiceTotal) > 0.01;
    if ((totalException || invoice.invoice_type === "unknown") && !args.reason?.trim()) {
      throw new Error("La diferencia con el documento requiere una justificación.");
    }

    const [year, month, day] = transactionDate.split("-");
    const normalizedDate = `${day}/${month}/${year}`;
    const now = Date.now();
    const transactionId = await ctx.db.insert("transacciones", {
      proyecto: invoice.proyecto,
      proveedor_id: provider._id,
      monto_total: transactionTotal,
      fecha: normalizedDate,
      tipo_pago: args.transaction.status === "Pagado" ? paymentType : "Por definir",
      moneda: transactionCurrency,
      tipo_cambio: args.transaction.tipo_cambio.trim(),
      status: args.transaction.status,
      codigo_referencia: args.transaction.codigo_referencia?.trim() || undefined,
      factura: (invoice.folio || invoice.uuid || `Factura ${String(invoice._id).slice(-8)}`).slice(0, 240),
    });

    for (const submitted of args.items) {
      const stored = storedById.get(String(submitted.item_id))!;
      const partida = partidaById.get(String(submitted.partida_id))!;
      const partidaNombre = String(partida.nivel === 1 ? partida.nombre : partida.partida_nombre || partida.nombre).trim();
      const familia = String(partida.familia || "").trim();
      const subPartida = String(partida.sub_partida || "").trim();
      const concepto = mostSpecificCostLabel({
        partida: partidaNombre,
        familia,
        sub_partida: subPartida,
        nombre: partida.nombre,
      });
      await ctx.db.insert("pagos", {
        transaccion_id: transactionId,
        invoice_item_id: stored._id,
        source_description_snapshot: stored.description,
        partida_id: partida._id,
        proyecto_id: invoice.proyecto,
        concepto,
        concepto_normalizado: normalizeCostText(concepto),
        partida_nombre_snapshot: partidaNombre,
        familia_snapshot: familia,
        sub_partida_snapshot: subPartida,
        classification_status: "mapped",
        monto: submitted.amount,
      });
      await ctx.db.patch(stored._id, {
        partida_id: partida._id,
        budget_mapping_status: stored.proposed_partida_id === partida._id ? "confirmed" : "overridden",
        reviewed_by: reviewer._id,
        reviewed_at: now,
        updated_at: now,
        classification_status: stored.category_id && approvedCategoryIdSet.has(String(stored.category_id)) ? "approved" : "unresolved",
      });

      const existingMemory = await ctx.db.query("invoice_budget_mapping_memory")
        .withIndex("by_project_description", (q) =>
          q.eq("project_id", invoice.proyecto).eq("normalized_description", stored.normalized_description))
        .first();
      if (existingMemory) {
        await ctx.db.patch(existingMemory._id, {
          partida_id: partida._id,
          product_code: stored.product_code || existingMemory.product_code,
          confirmations: existingMemory.confirmations + 1,
          last_confirmed_by: reviewer._id,
          updated_at: now,
        });
      } else {
        await ctx.db.insert("invoice_budget_mapping_memory", {
          project_id: invoice.proyecto,
          normalized_description: stored.normalized_description,
          product_code: stored.product_code,
          partida_id: partida._id,
          confirmations: 1,
          last_confirmed_by: reviewer._id,
          created_at: now,
          updated_at: now,
        });
      }
    }

    for (const documentId of invoice.source_document_ids) {
      const document = await ctx.db.get(documentId);
      if (!document || document.proyecto !== invoice.proyecto || document.transaccion_id) {
        throw new Error("Uno de los documentos ya no está disponible para integrar.");
      }
      await ctx.db.patch(document._id, { transaccion_id: transactionId });
    }
    await ctx.db.insert("invoice_allocations", {
      invoice_id: invoice._id,
      run_id: run._id,
      transaction_id: transactionId,
      amount: transactionTotal,
      currency: transactionCurrency,
      created_by: reviewer._id,
      created_at: now,
      updated_at: now,
    });
    await ctx.db.patch(run._id, { status: "approved", completed_at: now });
    await ctx.db.patch(invoice._id, {
      status: "approved",
      source_transaction_ids: [transactionId],
      primary_transaction_id: transactionId,
      integrated_transaction_id: transactionId,
      provider_id: provider._id,
      approved_category_ids: approvedCategoryIds,
      reconciliation_status: totalException ? "exception" : "matched",
      reconciliation_exception_codes: totalException ? ["invoice_total_mismatch"] : [],
      approved_by: reviewer._id,
      approved_at: now,
      revision: invoice.revision + 1,
      updated_at: now,
    });
    await ctx.db.insert("invoice_review_history", {
      invoice_id: invoice._id,
      run_id: run._id,
      actor_user_id: reviewer._id,
      action: totalException ? "direct_integrated_with_override" : "direct_integrated",
      revision: invoice.revision + 1,
      reason: args.reason?.trim() || undefined,
      exception_codes: totalException ? ["invoice_total_mismatch"] : [],
      reconciliation: {
        allocated_total: transactionTotal,
        invoice_total: signedInvoiceTotal,
        currency: transactionCurrency,
        variance: signedInvoiceTotal === undefined ? undefined : Math.round((transactionTotal - signedInvoiceTotal) * 100) / 100,
        allocation_count: 1,
      },
      created_at: now,
    });
    return { transaction_id: transactionId, duplicate: false };
  },
});

export const claimRun = internalMutation({
  args: { run_id: v.id("invoice_analysis_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status !== "queued") return false;
    const invoice = await ctx.db.get(run.invoice_id);
    if (!invoice || !isCurrentInvoiceRunState({
      active_run_id: invoice.active_run_id,
      run_id: run._id,
      invoice_status: invoice.status,
      run_status: run.status,
      allowed_statuses: ["queued"],
    })) {
      await ctx.db.patch(run._id, {
        status: "stale",
        completed_at: run.completed_at || Date.now(),
      });
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "extracting", started_at: now });
    await ctx.db.patch(invoice._id, { status: "extracting", updated_at: now });
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
    if (!isCurrentInvoiceRunState({
      active_run_id: invoice.active_run_id,
      run_id: run._id,
      invoice_status: invoice.status,
      run_status: run.status,
      allowed_statuses: ["extracting"],
    })) {
      throw Object.assign(new Error("La ejecución dejó de ser la activa."), { code: "stale_run" });
    }
    const [documents, transaction, categories, partidas, mappingMemories] = await Promise.all([
      Promise.all(invoice.source_document_ids.map((id) => ctx.db.get(id))),
      invoice.primary_transaction_id ? ctx.db.get(invoice.primary_transaction_id) : Promise.resolve(null),
      ctx.db.query("invoice_cost_categories")
        .withIndex("by_organization_active", (q) => q.eq("organization_id", invoice.organization_id).eq("active", true))
        .collect(),
      ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", invoice.proyecto)).collect(),
      ctx.db.query("invoice_budget_mapping_memory")
        .withIndex("by_project", (q) => q.eq("project_id", invoice.proyecto))
        .collect(),
    ]);
    if (documents.some((document) => !document?.storage_id)) throw new Error("Un documento no está disponible en Convex Storage.");
    if (invoice.intake_mode !== "direct" && !transaction) throw new Error("La transacción ya no existe.");
    return { run, invoice, documents, transaction, categories, partidas, mapping_memories: mappingMemories };
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
  proposed_partida_id: v.optional(v.string()),
  budget_confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  budget_reason: v.optional(v.string()),
  asset_candidate: v.boolean(),
  evidence_page: v.optional(v.number()),
});

export const completeRun = internalMutation({
  args: {
    run_id: v.id("invoice_analysis_runs"),
    source_hash: v.string(),
    document_hashes: v.array(v.object({ document_id: v.id("documentos"), sha256: v.string(), mime_type: v.string() })),
    invoice_type: v.union(v.literal("invoice"), v.literal("credit_note"), v.literal("receipt"), v.literal("payment_complement"), v.literal("unknown")),
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
    if (!isCurrentInvoiceRunState({
      active_run_id: invoice.active_run_id,
      run_id: run._id,
      invoice_status: invoice.status,
      run_status: run.status,
      allowed_statuses: ["extracting"],
    })) {
      await ctx.db.patch(run._id, {
        status: "stale",
        completed_at: run.completed_at || Date.now(),
      });
      return false;
    }
    const existingItems = await ctx.db.query("invoice_items").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect();
    for (const item of existingItems) await ctx.db.delete(item._id);
    const [categories, projectPartidas] = await Promise.all([
      ctx.db.query("invoice_cost_categories")
        .withIndex("by_organization_active", (q) => q.eq("organization_id", invoice.organization_id).eq("active", true))
        .collect(),
      ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", invoice.proyecto)).collect(),
    ]);
    const categoryByCode = new Map(categories.map((category) => [category.code, category]));
    const validBudgetTargetIds = new Set(buildInvoiceBudgetTargets(projectPartidas).map((target) => target.id));
    const now = Date.now();
    for (const item of args.items) {
      const proposed = categoryByCode.get(item.category_code) || categoryByCode.get(INVOICE_UNRESOLVED_CODE);
      const proposedPartidaId = item.proposed_partida_id && validBudgetTargetIds.has(item.proposed_partida_id)
        ? ctx.db.normalizeId("partidas", item.proposed_partida_id) || undefined
        : undefined;
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
        proposed_partida_id: proposedPartidaId,
        budget_match_confidence: proposedPartidaId ? item.budget_confidence : "low",
        budget_match_reason: item.budget_reason?.slice(0, 500),
        budget_mapping_status: proposedPartidaId ? "proposed" : "unresolved",
        asset_candidate: item.asset_candidate,
        evidence_page: item.evidence_page,
        created_at: now,
        updated_at: now,
      });
    }
    const uuidMatches = args.uuid
      ? await ctx.db.query("invoice_records").withIndex("by_uuid", (q) => q.eq("uuid_normalized", normalizeInvoiceUuid(args.uuid))).collect()
      : [];
    const duplicate = uuidMatches
      .filter((candidate) => candidate._id !== invoice._id && candidate.created_at < invoice.created_at)
      .sort((left, right) => left.created_at - right.created_at)[0] || null;
    const sourceMatches = await ctx.db
      .query("invoice_analysis_runs")
      .withIndex("by_source_hash", (q) => q.eq("source_hash", args.source_hash))
      .collect();
    const duplicateSourceRun = sourceMatches
      .filter((candidate) => candidate.invoice_id !== invoice._id && candidate.created_at < run.created_at)
      .sort((left, right) => left.created_at - right.created_at)[0] || null;
    const duplicateInvoiceId = duplicate?._id || duplicateSourceRun?.invoice_id;
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
      duplicate_invoice_id: duplicateInvoiceId,
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
    if (!run || !["queued", "extracting"].includes(run.status)) return;
    const now = Date.now();
    const invoice = await ctx.db.get(run.invoice_id);
    if (!invoice || !isCurrentInvoiceRunState({
      active_run_id: invoice.active_run_id,
      run_id: run._id,
      invoice_status: invoice.status,
      run_status: run.status,
      allowed_statuses: ["queued", "extracting"],
    })) {
      await ctx.db.patch(run._id, {
        status: "stale",
        error_code: args.error_code.slice(0, 80),
        error: args.error.slice(0, 500),
        duration_ms: args.duration_ms,
        completed_at: now,
      });
      return;
    }
    await ctx.db.patch(run._id, {
      status: "failed",
      error_code: args.error_code.slice(0, 80),
      error: args.error.slice(0, 500),
      duration_ms: args.duration_ms,
      completed_at: now,
    });
    await ctx.db.patch(invoice._id, { status: "failed", updated_at: now });
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
