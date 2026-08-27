import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const RUN_STATUSES_INVALIDATED_BY_SOURCE_CHANGE = new Set([
  "queued",
  "extracting",
  "review_required",
  "approved",
]);

export function transactionChangeInvalidatesInvoice(
  existing: {
    proveedor_id?: unknown;
    monto_total: number;
    fecha: string;
    status: string;
    moneda: string;
    tipo_cambio?: string;
  },
  update: {
    proveedor_id?: unknown | null;
    monto_total?: number;
    fecha?: string;
    status?: string;
    moneda?: string;
    tipo_cambio?: string;
  },
) {
  const providerChanged = update.proveedor_id !== undefined &&
    String(existing.proveedor_id || "") !== String(update.proveedor_id || "");
  return providerChanged ||
    (update.monto_total !== undefined && update.monto_total !== existing.monto_total) ||
    (update.fecha !== undefined && update.fecha !== existing.fecha) ||
    (update.status !== undefined && update.status !== existing.status) ||
    (update.moneda !== undefined && update.moneda !== existing.moneda) ||
    (update.tipo_cambio !== undefined && update.tipo_cambio !== existing.tipo_cambio);
}

export async function markInvoiceStale(
  ctx: MutationCtx,
  invoiceId: Id<"invoice_records">,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.status === "stale") return false;

  const now = Date.now();
  if (invoice.active_run_id) {
    const run = await ctx.db.get(invoice.active_run_id);
    if (run && RUN_STATUSES_INVALIDATED_BY_SOURCE_CHANGE.has(run.status)) {
      await ctx.db.patch(run._id, {
        status: "stale",
        completed_at: run.completed_at || now,
      });
    }
  }
  await ctx.db.patch(invoice._id, {
    status: "stale",
    revision: invoice.revision + 1,
    updated_at: now,
  });
  return true;
}

export async function markInvoicesStaleForTransaction(
  ctx: MutationCtx,
  transactionId: Id<"transacciones">,
) {
  const [primaryInvoices, allocations, documents] = await Promise.all([
    ctx.db
      .query("invoice_records")
      .withIndex("by_transaction", (q) => q.eq("primary_transaction_id", transactionId))
      .collect(),
    ctx.db
      .query("invoice_allocations")
      .withIndex("by_transaction", (q) => q.eq("transaction_id", transactionId))
      .collect(),
    ctx.db
      .query("documentos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transactionId))
      .collect(),
  ]);
  const invoiceIds = new Set<Id<"invoice_records">>(primaryInvoices.map((invoice) => invoice._id));
  for (const allocation of allocations) invoiceIds.add(allocation.invoice_id);
  for (const document of documents) {
    if (document.invoice_id) invoiceIds.add(document.invoice_id);
  }
  for (const invoiceId of invoiceIds) await markInvoiceStale(ctx, invoiceId);
  return invoiceIds.size;
}

export async function markInvoicesStaleForProvider(
  ctx: MutationCtx,
  providerId: Id<"proveedores">,
) {
  const invoices = await ctx.db
    .query("invoice_records")
    .withIndex("by_provider", (q) => q.eq("provider_id", providerId))
    .collect();
  for (const invoice of invoices) await markInvoiceStale(ctx, invoice._id);
  return invoices.length;
}

export async function markInvoicesStaleForCategory(
  ctx: MutationCtx,
  categoryId: Id<"invoice_cost_categories">,
) {
  const items = await ctx.db
    .query("invoice_items")
    .withIndex("by_category", (q) => q.eq("category_id", categoryId))
    .collect();
  const invoiceIds = new Set(items.map((item) => item.invoice_id));
  for (const invoiceId of invoiceIds) await markInvoiceStale(ctx, invoiceId);
  return invoiceIds.size;
}

export async function markLinkedInvoiceStaleForDocument(
  ctx: MutationCtx,
  documentId: Id<"documentos">,
) {
  const document = await ctx.db.get(documentId);
  if (!document?.invoice_id) return false;
  return await markInvoiceStale(ctx, document.invoice_id);
}
