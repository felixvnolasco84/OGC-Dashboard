import { feeBudgetConvert } from "./indirectosBudget";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { assertCanWrite, checkDesarrolloAccess, getCurrentUserOrThrow } from "./permissions";
import { normalizePaymentMethod, paymentScopeKey } from "./paymentAccountRules";
import { transactionChangeInvalidatesInvoice, markInvoicesStaleForTransaction } from "./invoiceIntegrity";
import { updateProviderStatsForTransactionChange } from "./providerStats";
import { feeHierarchyPaymentTotals } from "./budgetMaintenance";
import { calculateHonorariosFromRecords, isHonorariosPartida } from "./honorariosRules";
import { calculateBudgetIndirectos } from "./indirectosBudget";
import { calculatePresupuestoMetrics } from "./presupuestoRules";
import { reportDateIso } from "./indirectosRules";
import { summarizeProjectPaymentRecords } from "./desarrollos";

export const editFields = {
  proveedor_id: v.optional(v.union(v.id("proveedores"), v.null())),
  payment_account_id: v.optional(v.union(v.id("payment_accounts"), v.null())),
  fecha: v.optional(v.string()), tipo_pago: v.optional(v.string()),
  moneda: v.optional(v.string()), tipo_cambio: v.optional(v.string()), status: v.optional(v.string()),
  categoria: v.optional(v.string()), banco: v.optional(v.string()), tarjeta: v.optional(v.string()),
  numero_cuenta: v.optional(v.string()), clabe: v.optional(v.string()), numero_transferencia: v.optional(v.string()),
  codigo_referencia: v.optional(v.string()), factura: v.optional(v.string()), comprobante: v.optional(v.string()),
};
export const paymentEditValidators = {
  id: v.id("transacciones"), fields: v.object(editFields),
  amounts: v.array(v.object({ id: v.id("pagos"), monto: v.number() })),
};
export type EditFields = Partial<Pick<Doc<"transacciones">, Exclude<keyof typeof editFields, "proveedor_id" | "payment_account_id">>> & {
  proveedor_id?: Id<"proveedores"> | null; payment_account_id?: Id<"payment_accounts"> | null;
};
export type PaymentEditDraft = { id: Id<"transacciones">; fields: EditFields; amounts: { id: Id<"pagos">; monto: number }[] };
type ReadCtx = Pick<QueryCtx, "db" | "auth">;
const LIMIT = 2500;
const CAPACITY = "El proyecto supera el límite de revisión completa. No se guardaron cambios; solicita una revisión de capacidad.";
const sorted = <T extends { _id: string }>(rows: T[]) => [...rows].sort((a, b) => a._id.localeCompare(b._id));
const rootName = (p: Doc<"partidas">) => p.nivel === 1 ? p.nombre : p.partida_nombre || p.nombre;
const rate = (t: Doc<"transacciones">) => {
  const n = Number(t.tipo_cambio?.replace(",", "."));
  return t.moneda === "MXN" ? 1 : n > 0 && Number.isFinite(n) ? n : t.moneda === "EUR" ? 18.5 : 17;
};

export function editSource(transaction: Doc<"transacciones">, items: Doc<"pagos">[]) {
  return JSON.stringify([transaction, sorted(items)]);
}

export async function loadEditContext(ctx: ReadCtx, id: Id<"transacciones">) {
  const user = await getCurrentUserOrThrow(ctx as QueryCtx);
  const transaction = await ctx.db.get(id);
  if (!transaction) throw new Error("La transacción ya no existe.");
  if (["viewer", "almacenista"].includes(user.role) || !(await checkDesarrolloAccess(ctx as QueryCtx, transaction.proyecto))) {
    throw new Error("No tienes permiso para editar esta transacción.");
  }
  const items = await ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", id)).take(LIMIT + 1);
  if (!items.length) throw new Error("La transacción no tiene conceptos.");
  if (items.length > LIMIT) throw new Error(CAPACITY);
  const lineItems = await Promise.all(items.map(async item => {
    const partida = item.partida_id ? await ctx.db.get(item.partida_id) : null;
    return { ...item, label: partida ? [rootName(partida), partida.familia, partida.sub_partida].filter(Boolean).join(" › ")
      : item.concepto || item.source_description_snapshot || "Concepto sin clasificación", partida };
  }));
  return { transaction, lineItems, source: editSource(transaction, items) };
}
export type PaymentEditContext = Awaited<ReturnType<typeof loadEditContext>>;

async function loadRecords(ctx: ReadCtx, project: Doc<"desarrollos">) {
  const partidas = await ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(LIMIT + 1);
  const transactions = await ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(LIMIT + 1);
  let count = partidas.length + transactions.length;
  if (count > LIMIT) throw new Error(CAPACITY);
  const pagos: Doc<"pagos">[] = [];
  for (const t of transactions) {
    const rows = await ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", t._id)).take(LIMIT - count + 1);
    count += rows.length;
    if (count > LIMIT) throw new Error(CAPACITY);
    pagos.push(...rows);
  }
  return { partidas, transactions, pagos };
}

export async function preparePaymentEdit(ctx: ReadCtx, draft: PaymentEditDraft) {
  const context = await loadEditContext(ctx, draft.id);
  const before = context.transaction;
  const project = await ctx.db.get(before.proyecto);
  if (!project) throw new Error("El proyecto ya no existe.");
  const fields = Object.fromEntries(Object.entries(draft.fields).filter(([, value]) => value !== undefined)) as EditFields;
  // Preserve unchanged legacy values, while validating every newly edited classification.
  if (fields.fecha !== undefined && fields.fecha !== before.fecha) {
    const iso = reportDateIso(fields.fecha);
    if (!iso) throw new Error("Indica una fecha válida.");
    const [year, month, day] = iso.split("-");
    fields.fecha = `${day}/${month}/${year}`;
  }
  for (const [key, allowed] of Object.entries({ status: ["Pagado", "Por pagar"], moneda: ["MXN", "USD", "EUR"],
    tipo_pago: ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE"], categoria: ["", "ANTICIPO", "MATERIAL", "ESTIMACION", "OTRO"] })) {
    const k = key as "status" | "moneda" | "tipo_pago" | "categoria";
    if (fields[k] !== undefined && fields[k] !== before[k] && !allowed.includes(fields[k]!)) throw new Error(`El campo ${key} no es válido.`);
  }
  const effective = { ...before, ...fields, proveedor_id: fields.proveedor_id === null ? undefined : fields.proveedor_id ?? before.proveedor_id,
    payment_account_id: fields.payment_account_id === null ? undefined : fields.payment_account_id ?? before.payment_account_id } as Doc<"transacciones">;
  if (effective.moneda !== "MXN" && (fields.moneda !== undefined || fields.tipo_cambio !== undefined)) {
    const parsed = Number(effective.tipo_cambio.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("El tipo de cambio debe ser positivo y válido.");
  }
  const providerChanged = effective.proveedor_id !== before.proveedor_id;
  const provider = effective.proveedor_id ? await ctx.db.get(effective.proveedor_id) : null;
  if (effective.proveedor_id && (!provider || provider.archived_at || provider.merged_into)) {
    throw new Error("El proveedor ya no está disponible.");
  }
  let account: Doc<"payment_accounts"> | null = null;
  if (fields.payment_account_id) {
    account = await ctx.db.get(fields.payment_account_id);
    if (!effective.proveedor_id || !normalizePaymentMethod(effective.tipo_pago) || !account || account.status !== "active" ||
      account.scope_key !== paymentScopeKey(project) || account.provider_id !== effective.proveedor_id) {
      throw new Error("La cuenta guardada ya no está disponible para este proveedor y método.");
    }
    Object.assign(effective, { banco: account.banco, numero_cuenta: account.numero_cuenta, clabe: account.clabe });
  } else if (providerChanged || fields.payment_account_id === null ||
    ["banco", "numero_cuenta", "clabe"].some(k => Object.prototype.hasOwnProperty.call(fields, k)) ||
    (fields.tipo_pago !== undefined && !normalizePaymentMethod(effective.tipo_pago))) {
    effective.payment_account_id = undefined;
  }
  const byId = new Map(context.lineItems.map(p => [p._id, p]));
  const amounts = new Map<Id<"pagos">, number>();
  for (const edit of draft.amounts) {
    const item = byId.get(edit.id);
    if (!item || item.transaccion_id !== draft.id || amounts.has(edit.id)) throw new Error("Los conceptos no corresponden a esta transacción o están repetidos.");
    if (!Number.isFinite(edit.monto) || Math.abs(edit.monto * 100 - Math.round(edit.monto * 100)) > 0.00001) throw new Error("Cada monto debe ser válido, con hasta dos decimales.");
    if (item.partida_id && (!item.partida || item.partida.proyecto !== project._id)) throw new Error("La partida del concepto no pertenece al proyecto.");
    amounts.set(edit.id, edit.monto);
  }
  const afterItems = context.lineItems.map(p => ({ ...p, monto: amounts.get(p._id) ?? p.monto }));
  if (afterItems.some(p => !Number.isFinite(p.monto))) throw new Error("Hay conceptos con montos inválidos.");
  effective.monto_total = afterItems.reduce((sum, p) => sum + p.monto, 0);
  if (!Number.isFinite(effective.monto_total)) throw new Error("El total no es válido.");
  const changedItems = afterItems.filter((p, i) => p.monto !== context.lineItems[i].monto);
  const patch: Partial<Doc<"transacciones">> = {};
  for (const key of [...Object.keys(editFields), "monto_total"] as (keyof Doc<"transacciones">)[]) {
    if (effective[key] !== before[key]) Object.assign(patch, { [key]: effective[key] });
  }
  const financial = changedItems.length > 0 || ["monto_total", "moneda", "tipo_cambio", "status", "fecha"].some(k => Object.prototype.hasOwnProperty.call(patch, k));
  const records = await loadRecords(ctx, project);
  const afterRecords = { ...records,
    transactions: records.transactions.map(t => t._id === before._id ? effective : t),
    pagos: records.pagos.map(p => p.transaccion_id === before._id ? { ...p, monto: amounts.get(p._id) ?? p.monto } : p) };
  let currency = project.moneda_principal || "MXN";
  if (patch.moneda !== undefined) {
    const counts = new Map<string, number>();
    for (const t of afterRecords.transactions) counts.set(t.moneda || "MXN", (counts.get(t.moneda || "MXN") || 0) + 1);
    let max = 0;
    for (const [value, count] of counts) if (count > max) { max = count; currency = value; }
  }
  const honorarios = financial ? calculateHonorariosFromRecords({ proyectoId: project._id, modo: project.honorarios_modo,
      feeConcepts: project.fee_concepts, convert: feeBudgetConvert(project),
    porcentaje: project.honorarios_porcentaje, excludedPartidas: project.excluded_partidas_honorarios, ...afterRecords }) : project.honorarios_monto;
  const afterProject = { ...project, moneda_principal: currency, ...(honorarios !== undefined ? { honorarios_monto: honorarios } : {}) };
  const paid = new Set(afterRecords.transactions.filter(t => t.status === "Pagado").map(t => t._id));
  const direct = new Map<string, number>();
  for (const p of afterRecords.pagos) if (p.partida_id && paid.has(p.transaccion_id)) direct.set(p.partida_id, (direct.get(p.partida_id) || 0) + p.monto);
  const configuredHonorarios = project.fee_concepts?.find(c => c.concepto === "honorarios");
  const configured = calculateBudgetIndirectos(afterProject, records.partidas, afterRecords.transactions, afterRecords.pagos);
  const totals = feeHierarchyPaymentTotals(records.partidas, direct, honorarios, configured, configuredHonorarios?.partida_id);
  const touched = patch.status !== undefined || patch.moneda !== undefined ? afterItems : changedItems;
  const affected = new Set<string>();
  for (const item of touched) {
    const p = item.partida;
    if (!p || p.proyecto !== project._id) continue;
    for (const row of records.partidas) if (rootName(row) === rootName(p) &&
      (row.nivel === 1 || row.nivel === 2 && row.familia === p.familia || row._id === p._id)) affected.add(row._id);
  }
  if (financial) {
    for (const row of records.partidas) if (project.fee_concepts?.some(c => row._id === c.partida_id || row.partida_nombre === records.partidas.find(p => p._id === c.partida_id)?.nombre)) affected.add(row._id);
    const fee = records.partidas.find(p => p.nivel === 1 && (configuredHonorarios ? p._id === configuredHonorarios.partida_id : isHonorariosPartida(p)));
    if (fee) affected.add(fee._id);
  }
  afterRecords.partidas = records.partidas.map(p => affected.has(p._id)
    ? { ...p, pagado: totals.get(p._id) || 0, por_gastar: p.presupuesto_aprobado - (totals.get(p._id) || 0) } : p);
  const budget = (proj: Doc<"desarrollos">, rows: typeof records) => {
    const indirectos = calculateBudgetIndirectos(proj, rows.partidas, rows.transactions, rows.pagos);
    return { ...calculatePresupuestoMetrics(rows.partidas, proj.honorarios_monto, indirectos), honorarios: proj.honorarios_monto || 0,
      indirectos: indirectos.automaticos, manualesSustituidos: indirectos.manualesSustituidos };
  };
  const beforeBudget = budget(project, records), afterBudget = financial ? budget(afterProject, afterRecords) : beforeBudget;
  const primary = await ctx.db.query("invoice_records").withIndex("by_transaction", q => q.eq("primary_transaction_id", before._id)).take(LIMIT + 1);
  const allocations = await ctx.db.query("invoice_allocations").withIndex("by_transaction", q => q.eq("transaction_id", before._id)).take(LIMIT + 1);
  const documents = await ctx.db.query("documentos").withIndex("by_transaccion", q => q.eq("transaccion_id", before._id)).take(LIMIT + 1);
  if (primary.length + allocations.length + documents.length > LIMIT) throw new Error(CAPACITY);
  const invoiceIds = new Set([...primary.map(i => i._id), ...allocations.map(a => a.invoice_id), ...documents.flatMap(d => d.invoice_id ? [d.invoice_id] : [])]);
  const invoices = (await Promise.all([...invoiceIds].map(id => ctx.db.get(id)))).filter((i): i is Doc<"invoice_records"> => Boolean(i));
  const invalidatesInvoices = changedItems.length > 0 || transactionChangeInvalidatesInvoice(before, patch);
  const oldProvider = before.proveedor_id && before.proveedor_id !== effective.proveedor_id ? await ctx.db.get(before.proveedor_id) : provider;
  // Canonical exact scope includes every input used by the review, not just the entity timestamp.
  const scope = JSON.stringify([context.source, project, sorted(records.partidas), sorted(records.transactions), sorted(records.pagos),
    fields, [...amounts].sort(([a], [b]) => a.localeCompare(b)), provider, oldProvider, account, sorted(invoices), sorted(allocations), sorted(documents)]);
  if (new TextEncoder().encode(scope).byteLength > 512 * 1024) throw new Error(CAPACITY);
  const dates = [reportDateIso(before.fecha), reportDateIso(effective.fecha)].filter((d): d is string => Boolean(d)).sort();
  const start = new Date(`${dates[0] || "2026-10-01"}T00:00:00`), end = new Date(`${dates[dates.length - 1] || "2026-10-01"}T23:59:59`);
  const pnl = (t: Doc<"transacciones">, items: Doc<"pagos">[]) => {
    const result = summarizeProjectPaymentRecords(project, { year: start.getFullYear(), cutoffMonth: 12, start, end, currentMonthKey: "" },
      { USD: 17, EUR: 18.5 }, { partidas: records.partidas, transactions: [t], pagos: items, metrics: null });
    return { totalPagado: result.totalPagado, honorarios: result.honorarios, indirectos: result.indirectos,
      costosDirectosObra: result.costosDirectosObra,
      monthly: Object.fromEntries(Object.entries(result.monthly).map(([key, m]) => [key, { honorarios: m.honorarios, indirectos: m.indirectos, costosDirectosObra: m.costosDirectosObra }])) };
  };
  return { context, patch, changedItems, effective, project, afterProject, afterRecords, affected, financial, invalidatesInvoices,
    review: { status: "ready" as const, expectedScope: scope, source: context.source, before, after: effective,
      hasChanges: changedItems.length > 0 || Object.keys(patch).length > 0,
      concepts: context.lineItems.map((p, i) => ({ id: p._id, label: p.label, before: p.monto, after: afterItems[i].monto })),
      hierarchy: afterRecords.partidas.filter(p => affected.has(p._id)).map(p => {
        const old = records.partidas.find(b => b._id === p._id)!;
        return { id: p._id, label: [rootName(p), p.familia, p.sub_partida].filter(Boolean).join(" › "),
          pagadoBefore: old.pagado, pagadoAfter: p.pagado, remainingBefore: old.por_gastar ?? old.presupuesto_aprobado - old.pagado, remainingAfter: p.por_gastar! };
      }), beforeBudget, afterBudget, beforeBudgetCurrency: project.moneda_principal || "MXN", afterBudgetCurrency: currency,
      beforePnl: pnl(before, context.lineItems), afterPnl: pnl(effective, afterItems),
      invoiceCount: invalidatesInvoices ? invoices.filter(i => i.status !== "stale").length : 0,
      providerBefore: oldProvider?.razon_social || before.proveedor || "Sin proveedor", providerAfter: provider?.razon_social || "Sin proveedor",
      rateBefore: rate(before), rateAfter: rate(effective),
      warnings: [!reportDateIso(effective.fecha) ? "La fecha histórica no es válida: esta transacción no entra en P&L por periodo." : "",
        effective.moneda !== "MXN" && !(Number(effective.tipo_cambio.replace(",", ".")) > 0) ? "La conversión usa la tasa de respaldo existente del reporte." : "",
        records.transactions.some(t => t.moneda !== before.moneda) ? "Las jerarquías conservan la agregación nominal existente; P&L convierte a MXN." : ""].filter(Boolean) } };
}
export type PaymentEditReview = Awaited<ReturnType<typeof preparePaymentEdit>>["review"];

export async function applyPaymentEdit(ctx: MutationCtx, draft: PaymentEditDraft, expectedScope?: string, expectedSource?: string) {
  await assertCanWrite(ctx);
  const prepared = await preparePaymentEdit(ctx, draft);
  if (expectedSource !== undefined && expectedSource !== prepared.context.source) throw new Error("La transacción cambió. Actualiza y revisa los cambios antes de guardar.");
  if (expectedScope !== undefined && expectedScope !== prepared.review.expectedScope) throw new Error("El impacto cambió mientras lo revisabas. Actualiza la revisión antes de guardar.");
  if (!prepared.review.hasChanges) return { id: draft.id, changed: false };
  // This helper must run in one raw mutation: write final sources, then final derived values.
  for (const item of prepared.changedItems) await ctx.db.patch(item._id, { monto: item.monto });
  if (prepared.invalidatesInvoices) await markInvoicesStaleForTransaction(ctx, draft.id);
  if (prepared.effective.monto_total !== prepared.context.transaction.monto_total || prepared.effective.proveedor_id !== prepared.context.transaction.proveedor_id) {
    await updateProviderStatsForTransactionChange(ctx, prepared.context.transaction, prepared.effective);
  }
  await ctx.db.patch(draft.id, prepared.patch);
  if (prepared.financial) {
    for (const p of prepared.afterRecords.partidas) if (prepared.affected.has(p._id)) await ctx.db.patch(p._id, { pagado: p.pagado, por_gastar: p.por_gastar });
    await ctx.db.patch(prepared.project._id, { moneda_principal: prepared.afterProject.moneda_principal, honorarios_monto: prepared.afterProject.honorarios_monto });
    const { presupuesto_original, presupuesto_aprobado, gasto_total, por_gastar } = prepared.review.afterBudget;
    const metrics = { presupuesto_original, presupuesto_aprobado, gasto_total, por_gastar };
    const existing = await ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", q => q.eq("proyecto", prepared.project._id)).first();
    if (existing) await ctx.db.patch(existing._id, metrics);
    else await ctx.db.insert("meticas_presupuesto", { proyecto: prepared.project._id, ...metrics });
  }
  return { id: draft.id, changed: true };
}
