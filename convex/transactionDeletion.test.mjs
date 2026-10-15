import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import * as budgetMaintenance from "./budgetMaintenance";
import { deriveFeeConcepts } from "./feeConceptRules";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
const tables = ["desarrollos", "users", "partidas", "transacciones", "pagos", "documentos",
  "proveedores", "provider_project_stats", "meticas_presupuesto", "invoice_records"];
afterEach(() => vi.restoreAllMocks());

async function fixture(lineCount = 3) {
  const test = convexTest(schema, modules);
  const ids = await test.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra", descripcion: "", image: "", organization_id: "org",
      moneda_principal: "USD", honorarios_porcentaje: 10, honorarios_monto: 100,
      indirectos_porcentaje: 5, indirectos_fecha_inicio: "2026-10-01" });
    const user = await ctx.db.insert("users", { clerkId: "writer", email: "writer@test.invalid", name: "Writer",
      role: "finance", organization_id: "org", allowed_desarrollos: [project], created_at: 0 });
    const base = { proyecto: project, nombre: "OBRA", familia: "", sub_partida: "", nivel: 1, unidad: "", cantidad: 0,
      precio_unitario: 0, presupuesto_original: 2000, presupuesto_aprobado: 2000, pagado: 0, por_gastar: 2000, archivo_origen: "" };
    const root = await ctx.db.insert("partidas", base);
    const family = await ctx.db.insert("partidas", { ...base, nivel: 2, partida_nombre: "OBRA", familia: "ACERO" });
    const leaf = await ctx.db.insert("partidas", { ...base, nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA" });
    const fee = await ctx.db.insert("partidas", { ...base, nombre: "HONORARIOS", presupuesto_original: 200, presupuesto_aprobado: 200 });
    const amount = lineCount * 100 + 25;
    const provider = await ctx.db.insert("proveedores", { razon_social: "Proveedor", stats_transaction_count: 1,
      stats_total_amount: amount, stats_project_count: 1 });
    const providerStat = await ctx.db.insert("provider_project_stats", { provider_id: provider, proyecto_id: project,
      transaction_count: 1, total_amount: amount, provider_name_sort: "proveedor", search_text: "proveedor",
      is_complete: false, is_archived: false, is_generic: false, updated_at: 0 });
    const transactionBase = { proyecto: project, fecha: "05/10/2026", tipo_pago: "TRANSFERENCIA", tipo_cambio: "1", status: "Pagado" };
    const transaction = await ctx.db.insert("transacciones", { ...transactionBase, proveedor_id: provider, monto_total: amount, moneda: "USD" });
    const remaining = await ctx.db.insert("transacciones", { ...transactionBase, monto_total: 600, moneda: "MXN" });
    const partidas = [root, family, leaf];
    for (let index = 0; index < lineCount; index++) {
      await ctx.db.insert("pagos", { transaccion_id: transaction, partida_id: partidas[index % partidas.length], monto: 100 });
    }
    await ctx.db.insert("pagos", { transaccion_id: transaction, concepto: "Histórico sin partida", monto: 25 });
    for (const [index, partidaId] of partidas.entries()) {
      await ctx.db.insert("pagos", { transaccion_id: remaining, partida_id: partidaId, monto: (index + 1) * 100 });
    }
    const invoiceBase = { proyecto: project, source_document_ids: [], source_transaction_ids: [transaction],
      source_kind: "pdf", status: "approved", revision: 0, created_by: user, created_at: 0, updated_at: 0 };
    const invoice = await ctx.db.insert("invoice_records", { ...invoiceBase, primary_transaction_id: transaction });
    const linkedInvoice = await ctx.db.insert("invoice_records", invoiceBase);
    const document = await ctx.db.insert("documentos", { nombre: "Factura", descripcion: "", type: "factura",
      transaccion_id: transaction, proyecto: project, invoice_id: linkedInvoice });
    const otherDocument = await ctx.db.insert("documentos", { nombre: "Comprobante", descripcion: "", type: "comprobante",
      transaccion_id: remaining, proyecto: project });
    const metrics = await ctx.db.insert("meticas_presupuesto", { proyecto: project, presupuesto_original: 2200,
      presupuesto_aprobado: 2200, gasto_total: 0, por_gastar: 2200 });
    return { project, user, root, family, leaf, fee, provider, providerStat, transaction, remaining,
      invoice, linkedInvoice, document, otherDocument, metrics };
  });
  const writer = test.withIdentity({ subject: "writer" });
  const get = id => test.run(ctx => ctx.db.get(id));
  const snapshot = () => test.run(async ctx => Object.fromEntries(await Promise.all(
    tables.map(async table => [table, await ctx.db.query(table).collect()]))));
  const remove = () => writer.mutation(api.transacciones.deleteTransaction, { id: ids.transaction });
  return { test, ids, get, snapshot, remove };
}

describe("atomic transaction deletion", () => {
  it.each([3, 60])("recalculates once after deleting %s mapped concepts and a historical concept", async lineCount => {
    const fixtureData = await fixture(lineCount);
    const { ids, get } = fixtureData;
    const rebuild = vi.spyOn(budgetMaintenance, "repairProjectPaymentTotals");
    const remainingBefore = await get(ids.remaining);
    await fixtureData.remove();
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(await get(ids.transaction)).toBeNull();
    expect(await get(ids.document)).toBeNull();
    expect(await get(ids.otherDocument)).not.toBeNull();
    expect(await get(ids.remaining)).toEqual(remainingBefore);
    const payments = await fixtureData.test.run(ctx => ctx.db.query("pagos").collect());
    expect(payments).toHaveLength(3);
    expect(payments.every(payment => payment.transaccion_id === ids.remaining)).toBe(true);
    expect(await get(ids.root)).toMatchObject({ pagado: 600, por_gastar: 1400, presupuesto_aprobado: 2000 });
    expect(await get(ids.family)).toMatchObject({ pagado: 500, por_gastar: 1500 });
    expect(await get(ids.leaf)).toMatchObject({ pagado: 300, por_gastar: 1700 });
    expect(await get(ids.fee)).toMatchObject({ pagado: 60, por_gastar: 140 });
    expect(await get(ids.project)).toMatchObject({ moneda_principal: "MXN", honorarios_monto: 60 });
    expect(await get(ids.metrics)).toMatchObject({ gasto_total: 690, por_gastar: 1510 });
    expect(await get(ids.provider)).toMatchObject({ stats_transaction_count: 0, stats_total_amount: 0, stats_project_count: 0 });
    expect(await get(ids.providerStat)).toBeNull();
    for (const invoiceId of [ids.invoice, ids.linkedInvoice]) {
      expect(await get(invoiceId)).toMatchObject({ status: "stale", revision: 1 });
    }
  });

  it("recalculates manual honorarios from the remaining concepts", async () => {
    const fixtureData = await fixture();
    const { ids } = fixtureData;
    await fixtureData.test.run(async ctx => {
      await ctx.db.patch(ids.project, { honorarios_modo: "transacciones" });
      await ctx.db.insert("pagos", { transaccion_id: ids.transaction, partida_id: ids.fee, monto: 50 });
      await ctx.db.insert("pagos", { transaccion_id: ids.remaining, partida_id: ids.fee, monto: 40 });
      await ctx.db.patch(ids.remaining, { monto_total: 640 });
    });
    await fixtureData.remove();
    expect(await fixtureData.get(ids.project)).toMatchObject({ honorarios_monto: 40 });
    expect(await fixtureData.get(ids.fee)).toMatchObject({ pagado: 40, por_gastar: 160 });
    expect(await fixtureData.get(ids.metrics)).toMatchObject({ gasto_total: 670 });
  });

  it("rebuilds configured fees once using the final project currency", async () => {
    const fixtureData = await fixture(60);
    const { ids } = fixtureData;
    await fixtureData.test.run(async ctx => {
      const partidas = await ctx.db.query("partidas").collect();
      const feeConcepts = deriveFeeConcepts([{ concepto: "honorarios", partida_id: ids.fee, excluded_partidas: [ids.fee] }], partidas);
      await ctx.db.patch(ids.project, { fee_concepts: feeConcepts });
    });
    const rebuild = vi.spyOn(budgetMaintenance, "repairProjectPaymentTotals");
    await fixtureData.remove();
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(await fixtureData.get(ids.project)).toMatchObject({ moneda_principal: "MXN", honorarios_monto: 60 });
    expect(await fixtureData.get(ids.fee)).toMatchObject({ pagado: 60 });
    expect(await fixtureData.get(ids.metrics)).toMatchObject({ gasto_total: 690 });
  });

  it("resets totals and currency when deleting the last transaction without a provider", async () => {
    const fixtureData = await fixture();
    const { ids } = fixtureData;
    await fixtureData.test.run(async ctx => {
      const payments = await ctx.db.query("pagos").withIndex("by_transaccion", query => query.eq("transaccion_id", ids.transaction)).collect();
      for (const payment of payments) await ctx.db.delete(payment._id);
      await ctx.db.delete(ids.transaction);
    });
    await fixtureData.test.withIdentity({ subject: "writer" }).mutation(api.transacciones.deleteTransaction, { id: ids.remaining });
    expect(await fixtureData.get(ids.project)).toMatchObject({ moneda_principal: "MXN", honorarios_monto: 0 });
    expect(await fixtureData.get(ids.metrics)).toMatchObject({ gasto_total: 0, por_gastar: 2200 });
    expect(await fixtureData.get(ids.root)).toMatchObject({ pagado: 0, por_gastar: 2000 });
  });

  it.each(["read_only", "no_project_access", "unauthenticated"])("rejects %s without changing records", async access => {
    const fixtureData = await fixture();
    await fixtureData.test.run(ctx => ctx.db.patch(fixtureData.ids.user, access === "read_only"
      ? { role: "viewer" } : { allowed_desarrollos: [] }));
    const before = await fixtureData.snapshot();
    const client = access === "unauthenticated" ? fixtureData.test : fixtureData.test.withIdentity({ subject: "writer" });
    await expect(client.mutation(api.transacciones.deleteTransaction, { id: fixtureData.ids.transaction })).rejects.toThrow();
    expect(await fixtureData.snapshot()).toEqual(before);
  });

  it("rolls back deletions, provider statistics and invoice invalidation if rebuilding fails", async () => {
    const fixtureData = await fixture();
    const before = await fixtureData.snapshot();
    vi.spyOn(budgetMaintenance, "repairProjectPaymentTotals").mockRejectedValueOnce(new Error("Fallo al recalcular"));
    await expect(fixtureData.remove()).rejects.toThrow("Fallo al recalcular");
    expect(await fixtureData.snapshot()).toEqual(before);
  });
});
