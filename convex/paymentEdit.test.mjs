import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import * as providerStats from "./providerStats";
import { buildEditDraft, editForm, rebaseEditForm, rebaseConceptEdits } from "../src/lib/payment-edit-draft";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Prueba", descripcion: "", image: "", organization_id: "org",
      moneda_principal: "MXN", honorarios_porcentaje: 10, honorarios_monto: 100, honorarios_modo: "automatico",
      indirectos_porcentaje: 5, indirectos_fecha_inicio: "2026-10-01" });
    const user = await ctx.db.insert("users", { clerkId: "writer", email: "writer@test.invalid", name: "Writer", role: "finance",
      organization_id: "org", allowed_desarrollos: [project], created_at: 0 });
    const part = { proyecto: project, nombre: "OBRA", familia: "", sub_partida: "", nivel: 1, unidad: "", cantidad: 0,
      precio_unitario: 0, presupuesto_original: 2000, presupuesto_aprobado: 2000, pagado: 1000, por_gastar: 1000, archivo_origen: "" };
    const root = await ctx.db.insert("partidas", part);
    const family = await ctx.db.insert("partidas", { ...part, nivel: 2, partida_nombre: "OBRA", familia: "ACERO", pagado: 300, por_gastar: 1700 });
    const leaf = await ctx.db.insert("partidas", { ...part, nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA", pagado: 300, por_gastar: 1700 });
    const fee = await ctx.db.insert("partidas", { ...part, nombre: "HONORARIOS", pagado: 100, por_gastar: 1900 });
    const provider = await ctx.db.insert("proveedores", { razon_social: "Proveedor de prueba", stats_transaction_count: 1, stats_total_amount: 1000, stats_project_count: 1 });
    await ctx.db.insert("provider_project_stats", { provider_id: provider, proyecto_id: project, transaction_count: 1, total_amount: 1000,
      provider_name_sort: "PROVEEDOR", search_text: "proveedor", is_complete: false, is_archived: false, is_generic: false, updated_at: 0 });
    const transaction = await ctx.db.insert("transacciones", { proyecto: project, proveedor_id: provider, monto_total: 1000, fecha: "05/10/2026",
      tipo_pago: "TRANSFERENCIA", moneda: "MXN", tipo_cambio: "1", status: "Pagado", banco: "Banco histórico", numero_cuenta: "0012345678" });
    const a = await ctx.db.insert("pagos", { transaccion_id: transaction, partida_id: leaf, monto: 300 });
    const b = await ctx.db.insert("pagos", { transaccion_id: transaction, partida_id: root, monto: 700 });
    await ctx.db.insert("meticas_presupuesto", { proyecto: project, presupuesto_original: 4000, presupuesto_aprobado: 4000, gasto_total: 1150, por_gastar: 2850 });
    const invoice = await ctx.db.insert("invoice_records", { proyecto: project, source_document_ids: [], source_transaction_ids: [transaction], primary_transaction_id: transaction,
      source_kind: "pdf", status: "approved", revision: 0, created_by: user, created_at: 0, updated_at: 0 });
    const account = await ctx.db.insert("payment_accounts", { scope_key: "organization:org", provider_id: provider, banco: "Banco actual", alias: "Prueba",
      numero_cuenta: "0098765432", identity_key: "test", status: "active", source: "manual", created_at: 0, updated_at: 0 });
    return { project, user, root, family, leaf, fee, provider, transaction, a, b, invoice, account };
  });
  const writer = t.withIdentity({ subject: "writer" });
  const snapshot = () => t.run(async ctx => Object.fromEntries(await Promise.all(
    ["pagos", "transacciones", "partidas", "desarrollos", "meticas_presupuesto", "proveedores", "provider_project_stats", "invoice_records"]
      .map(async table => [table, await ctx.db.query(table).collect()]))));
  const get = id => t.run(ctx => ctx.db.get(id));
  const review = async (fields = {}, amounts = [{ id: ids.a, monto: 350 }]) => {
    const loaded = await writer.query(api.transacciones.getEditContext, { id: ids.transaction });
    expect(loaded.status).toBe("ready");
    const draft = { id: ids.transaction, fields, amounts, expectedSource: loaded.context.source };
    const result = await writer.query(api.transacciones.previewEdit, draft);
    expect(result.status).toBe("ready");
    return { draft, result, loaded: loaded.context };
  };
  const save = r => writer.mutation(api.transacciones.saveEdit, { ...r.draft, expectedScope: r.result.expectedScope });
  return { t, writer, ids, snapshot, get, review, save };
}

describe("payment edit review and atomic save", () => {
  it("payment edits preview and persist the distributed automatic concept amounts", async () => {
    const f = await fixture();
    const travelIds = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.user, { role: "admin" });
      await ctx.db.patch(f.ids.fee, { presupuesto_original: 200, presupuesto_aprobado: 200 });
      const common = { proyecto: f.ids.project, nombre: "VIÁTICOS", familia: "Viaje", sub_partida: "", nivel: 1, unidad: "", cantidad: 0, precio_unitario: 0, presupuesto_original: 100, presupuesto_aprobado: 100, pagado: 0, archivo_origen: "" };
      const root = await ctx.db.insert("partidas", common);
      const family = await ctx.db.insert("partidas", { ...common, nivel: 2, partida_nombre: "VIÁTICOS" });
      const a = await ctx.db.insert("partidas", { ...common, nivel: 3, partida_nombre: "VIÁTICOS", sub_partida: "Hotel", presupuesto_original: 40, presupuesto_aprobado: 40 });
      const b = await ctx.db.insert("partidas", { ...common, nivel: 3, partida_nombre: "VIÁTICOS", sub_partida: "Comida", presupuesto_original: 60, presupuesto_aprobado: 60 });
      return { root, family, a, b };
    });
    const fee_concepts = [{ concepto: "honorarios", partida_id: f.ids.fee, excluded_partidas: [] }, { concepto: "viaticos", partida_id: travelIds.root, excluded_partidas: [] }];
    const preview = await f.writer.query(api.desarrollos.previewFeeImpact, { id: f.ids.project, fee_concepts });
    expect(preview.status, preview.message).toBe("ready");
    await f.writer.mutation(api.desarrollos.update, { id: f.ids.project, fee_concepts, expected_impact: preview.expectedImpact });
    const r = await f.review({}, [{ id: f.ids.a, monto: 400 }]);
    expect(r.result.afterBudget).toMatchObject({ honorarios: 95.65, indirectos: 47.82 });
    await f.save(r);
    expect((await f.get(travelIds.root)).pagado).toBe(47.82);
    expect((await f.get(travelIds.family)).pagado).toBe(47.82);
    expect((await f.get(travelIds.a)).pagado).toBe(19.13);
    expect((await f.get(travelIds.b)).pagado).toBe(28.69);
    expect((await f.writer.query(api.meticas_presupuesto.getByProyecto, { proyecto_id: f.ids.project })).gasto_total).toBeCloseTo(1243.47, 8);
  });
  it("previews without writes and preserves concepts outside a filtered context", async () => {
    const f = await fixture(), before = await f.snapshot(), r = await f.review();
    expect(await f.snapshot()).toEqual(before);
    expect(r.result.after.monto_total).toBe(1050);
    expect(r.result.concepts).toHaveLength(2);
    expect(r.result.beforeBudget.gasto_total).toBe(1150);
    expect(r.result.afterBudget.gasto_total).toBe(1207.5);
    await f.save(r);
    expect((await f.get(f.ids.b)).monto).toBe(700);
    expect((await f.get(f.ids.transaction)).monto_total).toBe(1050);
    expect((await f.get(f.ids.root)).pagado).toBe(1050);
    expect((await f.get(f.ids.family)).pagado).toBe(350);
    expect((await f.get(f.ids.leaf)).pagado).toBe(350);
    expect((await f.get(f.ids.project)).honorarios_monto).toBe(105);
    expect((await f.get(f.ids.provider)).stats_total_amount).toBe(1050);
    expect((await f.get(f.ids.invoice)).status).toBe("stale");
  });
  it("applies several concepts and the parent together, invalidating invoices even at the same total", async () => {
    const f = await fixture(), r = await f.review({ codigo_referencia: "corregido" }, [{ id: f.ids.a, monto: 400 }, { id: f.ids.b, monto: 600 }]);
    expect(r.result.after.monto_total).toBe(1000);
    expect(r.result.invoiceCount).toBe(1);
    await f.save(r);
    expect((await f.get(f.ids.a)).monto).toBe(400);
    expect((await f.get(f.ids.b)).monto).toBe(600);
    expect((await f.get(f.ids.transaction)).codigo_referencia).toBe("corregido");
    expect((await f.get(f.ids.provider)).stats_total_amount).toBe(1000);
    expect((await f.get(f.ids.invoice)).status).toBe("stale");
  });
  it("rolls back concepts, invoice invalidation and everything else on a later write failure", async () => {
    const f = await fixture(), r = await f.review(), before = await f.snapshot();
    vi.spyOn(providerStats, "updateProviderStatsForTransactionChange").mockRejectedValueOnce(new Error("Fallo posterior"));
    await expect(f.save(r)).rejects.toThrow("Fallo posterior");
    expect(await f.snapshot()).toEqual(before);
  });
  it.each(["provider", "account", "concept", "duplicate", "date", "rate", "amount", "fraction"])("rejects invalid %s before writes", async type => {
    const f = await fixture();
    const r = await f.review(), before = await f.snapshot();
    const draft = structuredClone(r.draft);
    if (type === "provider") { await f.t.run(ctx => ctx.db.patch(f.ids.provider, { archived_at: 1 })); draft.fields.proveedor_id = f.ids.provider; }
    if (type === "account") draft.fields.payment_account_id = f.ids.provider;
    if (type === "concept") draft.amounts[0].id = f.ids.b + "invalid";
    if (type === "duplicate") draft.amounts.push(draft.amounts[0]);
    if (type === "date") draft.fields.fecha = "31/02/2026";
    if (type === "rate") Object.assign(draft.fields, { moneda: "USD", tipo_cambio: "0" });
    if (type === "amount") draft.amounts[0].monto = Infinity;
    if (type === "fraction") draft.amounts[0].monto = 2.123;
    const snapshot = type === "provider" ? await f.snapshot() : before;
    await expect(f.writer.mutation(api.transacciones.saveEdit, { ...draft, expectedScope: r.result.expectedScope })).rejects.toThrow();
    expect(await f.snapshot()).toEqual(snapshot);
  });
  it.each(["viewer", "almacenista", "other-org"])("blocks %s on preview and the legacy individual API", async role => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.user, { role: role === "other-org" ? "finance" : role, organization_id: role === "other-org" ? "other" : "org", allowed_desarrollos: role === "other-org" ? [] : [f.ids.project] }));
    const before = await f.snapshot();
    expect((await f.writer.query(api.transacciones.getEditContext, { id: f.ids.transaction })).status).toBe("error");
    await expect(f.writer.mutation(api.pagos.updatePago, { id: f.ids.a, monto: 999 })).rejects.toThrow();
    expect(await f.snapshot()).toEqual(before);
  });
  it("rejects another transaction's concept even within the same project", async () => {
    const f = await fixture(), r = await f.review();
    const foreign = await f.t.run(async ctx => {
      const transaction = await ctx.db.insert("transacciones", { proyecto: f.ids.project, monto_total: 10, fecha: "05/10/2026", status: "Pagado", moneda: "MXN", tipo_cambio: "1", tipo_pago: "EFECTIVO" });
      return ctx.db.insert("pagos", { transaccion_id: transaction, partida_id: f.ids.root, monto: 10 });
    });
    const before = await f.snapshot();
    await expect(f.writer.mutation(api.transacciones.saveEdit, { ...r.draft, amounts: [{ id: foreign, monto: 20 }], expectedScope: r.result.expectedScope })).rejects.toThrow("corresponden");
    expect(await f.snapshot()).toEqual(before);
  });
  it.each(["source", "config", "other-payment", "account", "invoice"])("rejects a stale review after %s changes", async change => {
    const f = await fixture(), r = await f.review(change === "account" ? { payment_account_id: f.ids.account } : {});
    await f.t.run(ctx => change === "source" ? ctx.db.patch(f.ids.transaction, { codigo_referencia: "otra edición" })
      : change === "config" ? ctx.db.patch(f.ids.project, { honorarios_porcentaje: 20 })
      : change === "other-payment" ? ctx.db.patch(f.ids.b, { monto: 800 })
      : change === "account" ? ctx.db.patch(f.ids.account, { status: "archived" })
      : ctx.db.patch(f.ids.invoice, { revision: 1 }));
    const before = await f.snapshot();
    await expect(f.save(r)).rejects.toThrow();
    expect(await f.snapshot()).toEqual(before);
  });
  it("does not accept empty review tokens or apply a repeated save twice", async () => {
    const f = await fixture(), r = await f.review();
    await expect(f.writer.mutation(api.transacciones.saveEdit, { ...r.draft, expectedScope: "" })).rejects.toThrow("impacto cambió");
    await f.save(r);
    const after = await f.snapshot();
    await expect(f.save(r)).rejects.toThrow("transacción cambió");
    expect(await f.snapshot()).toEqual(after);
  });
  it("handles paid to pending and back without charging ineligible totals", async () => {
    const f = await fixture();
    const r = await f.review({ status: "Por pagar" }, []);
    expect(r.result.afterPnl.totalPagado).toBe(0);
    expect(r.result.afterBudget.honorarios).toBe(100); // Existing budget mode includes pending transactions.
    expect(r.result.afterBudget.indirectos).toBe(0);
    await f.save(r);
    expect((await f.get(f.ids.root)).pagado).toBe(0);
    const paid = await f.review({ status: "Pagado" }, []);
    await f.save(paid);
    expect((await f.get(f.ids.root)).pagado).toBe(1000);
  });
  it("moves the reporting month while keeping historical honorarios and indirectos charges", async () => {
    const f = await fixture(), r = await f.review({ fecha: "30/09/2026" }, []);
    expect(r.result.afterBudget.indirectos).toBe(50);
    expect(Object.keys(r.result.beforePnl.monthly)).toEqual(["2026-10"]);
    expect(Object.keys(r.result.afterPnl.monthly)).toEqual(["2026-9"]);
    await f.save(r);
    expect((await f.get(f.ids.transaction)).fecha).toBe("30/09/2026");
  });
  it("changes currency without converting nominal amounts, then recalculates a rate-only edit", async () => {
    const f = await fixture(), r = await f.review({ moneda: "USD", tipo_cambio: "20" }, []);
    expect(r.result.after.monto_total).toBe(1000);
    expect(r.result.afterPnl.totalPagado).toBe(20000);
    await f.save(r);
    expect((await f.get(f.ids.project)).moneda_principal).toBe("USD");
    const rate = await f.review({ tipo_cambio: "21" }, []);
    expect(rate.result.afterPnl.totalPagado).toBe(21000);
    await f.save(rate);
    expect((await f.get(f.ids.transaction)).tipo_cambio).toBe("21");
  });
  it("copies the account snapshot and clears the association on manual edits", async () => {
    const f = await fixture(), r = await f.review({ payment_account_id: f.ids.account }, []);
    expect(r.result.after.banco).toBe("Banco actual");
    await f.save(r);
    expect((await f.get(f.ids.transaction)).numero_cuenta).toBe("0098765432");
    const manual = await f.review({ banco: "Banco manual" }, []);
    await f.save(manual);
    expect((await f.get(f.ids.transaction)).payment_account_id).toBeUndefined();
  });
  it("blocks an archived provider and a mismatched account even with a fresh review source", async () => {
    const f = await fixture();
    const loaded = await f.writer.query(api.transacciones.getEditContext, { id: f.ids.transaction });
    const request = { id: f.ids.transaction, fields: {}, amounts: [{ id: f.ids.a, monto: 350 }], expectedSource: loaded.context.source };
    await f.t.run(ctx => ctx.db.patch(f.ids.provider, { archived_at: 1 }));
    expect((await f.writer.query(api.transacciones.previewEdit, request)).message).toContain("proveedor");
    await f.t.run(async ctx => { await ctx.db.patch(f.ids.provider, { archived_at: undefined }); await ctx.db.patch(f.ids.account, { scope_key: "organization:other" }); });
    const before = await f.snapshot();
    expect((await f.writer.query(api.transacciones.previewEdit, { ...request, fields: { payment_account_id: f.ids.account } })).message).toContain("cuenta guardada");
    expect(await f.snapshot()).toEqual(before);
  });
  it("preserves refunds and zero and secures the legacy individual edit", async () => {
    const f = await fixture();
    await f.writer.mutation(api.pagos.updatePago, { id: f.ids.a, monto: -50 });
    expect((await f.get(f.ids.transaction)).monto_total).toBe(650);
    expect((await f.get(f.ids.root)).pagado).toBe(650);
    expect((await f.get(f.ids.provider)).stats_total_amount).toBe(650);
    await f.writer.mutation(api.pagos.updatePago, { id: f.ids.a, monto: 0 });
    expect((await f.get(f.ids.transaction)).monto_total).toBe(700);
  });
  it("isolates empty amounts, individual edits and rebasing of untouched fields", async () => {
    const f = await fixture(), r = await f.review(), form = editForm(r.loaded.transaction);
    expect(() => buildEditDraft(r.loaded, form, { [f.ids.a]: "" })).toThrow("Completa");
    expect(() => buildEditDraft(r.loaded, form, { [f.ids.b]: "50" }, f.ids.a)).toThrow("Sólo");
    form.codigo_referencia = "mi borrador";
    const current = structuredClone(r.loaded); current.transaction.fecha = "10/10/2026";
    expect(rebaseEditForm(r.loaded, current, form)).toMatchObject({ fecha: "2026-10-10", codigo_referencia: "mi borrador" });
  });
});


async function reviewConcepts(f, conceptos, amounts = []) {
  const r = await f.review({}, amounts);
  r.draft.conceptos = conceptos;
  r.result = await f.writer.query(api.transacciones.previewEdit, r.draft);
  expect(r.result.status).toBe("ready");
  return r;
}

describe("optional additional concepts", () => {
  it.each(["createTransaction", "createTransactionBulk"])("persists optional text independently from classification through %s", async name => {
    const f = await fixture();
    const result = await f.writer.mutation(api.transacciones[name], {
      proyecto: f.ids.project, monto_total: 60, fecha: "2026-10-05", tipo_pago: "EFECTIVO", moneda: "MXN", tipo_cambio: "1", status: "Pagado",
      lineItems: [
        { partida_id: f.ids.leaf, partida: "OBRA", familia: "ACERO", sub_partida: "VARILLA", monto: 10, concepto_adicional: "  Entrega de octubre  " },
        { partida_id: f.ids.family, partida: "OBRA", familia: "ACERO", sub_partida: "", monto: 20, concepto_adicional: "  " },
        { partida_id: f.ids.root, partida: "OBRA", familia: "", sub_partida: "", monto: 30 },
      ],
    });
    const transaction = await f.writer.query(api.transacciones.getTransactionConceptosById, { id: result.transaccionId });
    expect(transaction.lineItems).toHaveLength(3);
    expect(transaction.lineItems.find(p => p.monto === 10)).toMatchObject({ concepto_adicional: "Entrega de octubre", concepto: "VARILLA", concepto_normalizado: "varilla" });
    expect(transaction.lineItems.find(p => p.monto === 20).concepto_adicional).toBeUndefined();
    expect(transaction.lineItems.find(p => p.monto === 30).concepto_adicional).toBeUndefined();
  });

  it("previews and saves text alone without changing financial records, classification or invoice analysis", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.a, { concepto: "VARILLA", concepto_normalizado: "VARILLA", classification_status: "mapped" }));
    const before = await f.snapshot();
    const r = await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: "  Entrega planta norte  " }]);
    expect(await f.snapshot()).toEqual(before);
    expect(r.result.concepts.find(p => p.id === f.ids.a)).toMatchObject({ before: 300, after: 300, conceptoBefore: "", conceptoAfter: "Entrega planta norte" });
    expect(r.result.hasChanges).toBe(true);
    expect(r.result.invoiceCount).toBe(0);
    expect(r.result.beforeBudget).toEqual(r.result.afterBudget);
    expect(r.result.beforePnl).toEqual(r.result.afterPnl);
    await f.save(r);
    const after = await f.snapshot();
    expect(after.pagos).toEqual(before.pagos.map(p => p._id === f.ids.a ? { ...p, concepto_adicional: "Entrega planta norte" } : p));
    for (const table of Object.keys(before).filter(table => table !== "pagos")) expect(after[table]).toEqual(before[table]);
  });

  it("preserves omitted text and clears it with null or whitespace", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.a, { concepto_adicional: "Conservar" }));
    await f.save(await f.review({}, [{ id: f.ids.b, monto: 710 }]));
    expect((await f.get(f.ids.a)).concepto_adicional).toBe("Conservar");
    const noChange = await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: " Conservar " }]);
    expect(noChange.result.hasChanges).toBe(false);
    await f.save(await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: null }]));
    expect((await f.get(f.ids.a)).concepto_adicional).toBeUndefined();
    await f.t.run(ctx => ctx.db.patch(f.ids.a, { concepto_adicional: "Borrar" }));
    await f.save(await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: "  " }]));
    expect((await f.get(f.ids.a)).concepto_adicional).toBeUndefined();
  });

  it("does not repair historical total discrepancies during a text-only edit", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.transaction, { monto_total: 999.99 }));
    const r = await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: "Nota histórica" }]);
    expect(r.result.after.monto_total).toBe(999.99);
    expect(r.result.invoiceCount).toBe(0);
    await f.save(r);
    expect((await f.get(f.ids.transaction)).monto_total).toBe(999.99);
    expect((await f.get(f.ids.invoice)).status).toBe("approved");
  });

  it("rejects duplicate or foreign IDs and protects text edits with both review tokens", async () => {
    const f = await fixture();
    const r = await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: "A" }]);
    const before = await f.snapshot();
    await expect(f.writer.mutation(api.transacciones.saveEdit, { ...r.draft, conceptos: [...r.draft.conceptos, ...r.draft.conceptos], expectedScope: r.result.expectedScope })).rejects.toThrow("repetidos");
    const foreign = await f.t.run(async ctx => {
      const tx = await ctx.db.insert("transacciones", { proyecto: f.ids.project, monto_total: 1, fecha: "05/10/2026", tipo_pago: "EFECTIVO", moneda: "MXN", tipo_cambio: "1", status: "Pagado" });
      return ctx.db.insert("pagos", { transaccion_id: tx, monto: 1 });
    });
    const bad = await f.writer.query(api.transacciones.previewEdit, { ...r.draft, conceptos: [{ id: foreign, concepto_adicional: "X" }] });
    expect(bad).toMatchObject({ status: "error" });
    // Refresh the scope after creating unrelated records, then try another draft.
    const current = await reviewConcepts(f, r.draft.conceptos);
    await expect(f.writer.mutation(api.transacciones.saveEdit, { ...current.draft, conceptos: [{ id: f.ids.a, concepto_adicional: "B" }], expectedScope: current.result.expectedScope })).rejects.toThrow("impacto cambió");
    await f.t.run(ctx => ctx.db.patch(f.ids.a, { concepto_adicional: "Edición concurrente" }));
    await expect(f.save(current)).rejects.toThrow("transacción cambió");
    expect((await f.get(f.ids.a)).monto).toBe(before.pagos.find(p => p._id === f.ids.a).monto);
  });

  it("rolls back text together with amounts when a later write fails", async () => {
    const f = await fixture();
    const r = await reviewConcepts(f, [{ id: f.ids.a, concepto_adicional: "Sin guardar" }], [{ id: f.ids.a, monto: 350 }]);
    const before = await f.snapshot();
    vi.spyOn(providerStats, "updateProviderStatsForTransactionChange").mockRejectedValueOnce(new Error("Fallo posterior"));
    await expect(f.save(r)).rejects.toThrow("Fallo posterior");
    expect(await f.snapshot()).toEqual(before);
  });

  it("builds scoped text drafts and rebases only modified descriptions", async () => {
    const f = await fixture(), r = await f.review({}, []), form = editForm(r.loaded.transaction);
    const draft = buildEditDraft(r.loaded, form, {}, f.ids.a, { [f.ids.a]: "  Texto  " });
    expect(draft.conceptos).toEqual([{ id: f.ids.a, concepto_adicional: "Texto" }]);
    expect(() => buildEditDraft(r.loaded, form, {}, f.ids.a, { [f.ids.b]: "Otro" })).toThrow("Sólo");
    expect(() => buildEditDraft(r.loaded, form, {}, undefined, { missing: "Otro" })).toThrow("ya no existe");
    r.loaded.lineItems[0].concepto_adicional = "Anterior";
    expect(buildEditDraft(r.loaded, form, {}, undefined, { [f.ids.a]: "" }).conceptos).toEqual([{ id: f.ids.a, concepto_adicional: null }]);
    expect(rebaseConceptEdits(r.loaded, { [f.ids.a]: " Anterior ", [f.ids.b]: "Mi borrador" })).toEqual({ [f.ids.b]: "Mi borrador" });
  });
});
