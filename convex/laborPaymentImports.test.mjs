import { convexTest } from "convex-test";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { replaceLaborPaymentImport } from "./laborPaymentImports";
import * as budgetMaintenance from "./budgetMaintenance";
import { deriveFeeConcepts } from "./feeConceptRules";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
const tableNames = ["desarrollos", "partidas", "transacciones", "pagos", "proveedores",
  "provider_project_stats", "labor_payment_imports", "meticas_presupuesto"];
const rowCounts = [5, 5, 4, 4, 1, 2, 6, 1, 6, 1, 9, 16];
const transactionCounts = [1, 1, 1, 1, 1, 2, 3, 1, 3, 1, 3, 4];

async function storeFile(test, file) {
  const hash = createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
  return test.run(async ctx => {
    const id = await ctx.storage.store(file);
    // convex-test 0.0.41 uses base64 and omits MIME; the real _storage API returns hex.
    await ctx.db.patch(id, { sha256: hash, contentType: file.type });
    return id;
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function fixture() {
  const test = convexTest(schema, modules);
  const ids = await test.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra", descripcion: "", image: "",
      moneda_principal: "MXN", honorarios_porcentaje: 10, honorarios_monto: 10 });
    const user = await ctx.db.insert("users", { clerkId: "writer", email: "writer@example.test", name: "Writer",
      role: "admin", allowed_desarrollos: [project], created_at: 0 });
    const base = { proyecto: project, nivel: 1, nombre: "OBRA", familia: "", sub_partida: "", unidad: "",
      cantidad: 0, precio_unitario: 0, presupuesto_original: 100000, presupuesto_aprobado: 100000,
      pagado: 0, por_gastar: 100000, archivo_origen: "" };
    const root = await ctx.db.insert("partidas", base);
    const family = await ctx.db.insert("partidas", { ...base, nivel: 2, partida_nombre: "OBRA", familia: "MANO_OBRA" });
    const leaves = [];
    for (let index = 0; index < 42; index++) {
      leaves.push(await ctx.db.insert("partidas", { ...base, nivel: 3, partida_nombre: "OBRA",
        familia: "MANO_OBRA", sub_partida: `OFICIO ${index}` }));
    }
    const fee = await ctx.db.insert("partidas", { ...base, nombre: "HONORARIOS" });
    const provider = await ctx.db.insert("proveedores", { razon_social: "Proveedor", stats_transaction_count: 1,
      stats_total_amount: 100, stats_project_count: 1 });
    await ctx.db.insert("provider_project_stats", { provider_id: provider, proyecto_id: project,
      transaction_count: 1, total_amount: 100, provider_name_sort: "PROVEEDOR", search_text: "PROVEEDOR",
      is_complete: false, is_archived: false, is_generic: false, updated_at: 0 });
    const tx = { proyecto: project, fecha: "01/07/2026", tipo_pago: "TRANSFERENCIA", moneda: "MXN", tipo_cambio: "1" };
    const manual = await ctx.db.insert("transacciones", { ...tx, proveedor_id: provider, status: "Pagado", monto_total: 100 });
    for (const [partida_id, monto] of [[root, 25], [family, 25], [leaves[0], 50]]) {
      await ctx.db.insert("pagos", { transaccion_id: manual, partida_id, monto });
    }
    const pending = await ctx.db.insert("transacciones", { ...tx, status: "Por pagar", monto_total: 900 });
    await ctx.db.insert("pagos", { transaccion_id: pending, partida_id: leaves[0], monto: 900 });
    return { project, user, root, family, leaves, fee, provider, manual, pending };
  });
  const writer = test.withIdentity({ subject: "writer" });
  const snapshot = () => test.run(async ctx => Object.fromEntries(await Promise.all(
    tableNames.map(async table => [table, await ctx.db.query(table).collect()]))));
  const args = (hash = "a", counts = rowCounts) => {
    let sourceRow = 1;
    const weeks = counts.map((count, weekIndex) => {
      const transactions = Array.from({ length: Math.min(count, transactionCounts[weekIndex]) }, (_, txIndex) => ({
        source_key: `${weekIndex}-${txIndex}`, monto_total: 0, tipo_pago: "TRANSFERENCIA", moneda: "MXN",
        categoria: "OTRO", factura: `FACTURA-${weekIndex}-${txIndex}`, proveedor: "Proveedor", proveedor_id: ids.provider,
        line_items: [],
      }));
      for (let index = 0; index < count; index++) {
        const leafIndex = (sourceRow - 1) % ids.leaves.length;
        const transaction = transactions[index % transactions.length];
        transaction.line_items.push({ partida_id: ids.leaves[leafIndex], partida: "OBRA", familia: "MANO_OBRA",
          sub_partida: `OFICIO ${leafIndex}`, monto: 100, numero_personas_origen: 1, source_row: ++sourceRow });
        transaction.monto_total += 100;
      }
      return { date: new Date(Date.UTC(2026, 6, 27 + weekIndex * 7)).toISOString().slice(0, 10),
        total_people: 1, roles: [{ key: "oficial", label: "Oficial", count: 1 }],
        row_count: count, amount_total: count * 100, warnings: [], transactions };
    });
    return { proyecto: ids.project, source: { file_name: "Pagos.xlsx", file_hash: hash.repeat(64), sheet_name: "Pagos",
      administration: "Obra", currency: "MXN", row_count: sourceRow - 1 }, weeks };
  };
  const prepare = async (input = args(), options = {}) => {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    const file = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const source = { ...input.source, file_hash: createHash("sha256").update(bytes).digest("hex") };
    const startArgs = { proyecto: input.proyecto, request_id: options.request_id || randomUUID(), source,
      size: file.size, content_type: file.type, dates: input.weeks.map(week => week.date) };
    const started = await writer.mutation(api.laborImportHistory.startAttempt, startArgs);
    if (started.upload_url && options.attach !== false) {
      const storageId = await storeFile(test, file);
      await writer.mutation(api.laborImportHistory.attachFile, { attempt_id: started.attempt_id, storage_id: storageId });
    }
    return { attempt_id: started.attempt_id, weeks: input.weeks, startArgs, file, started };
  };
  const upload = async input => {
    const prepared = await prepare(input || args());
    return writer.action(api.laborPaymentImports.confirmLaborPaymentImport, { attempt_id: prepared.attempt_id, weeks: prepared.weeks });
  };
  return { test, writer, ids, args, prepare, upload, snapshot };
}

describe("atomic labor imports with multiple weeks", () => {
  it("imports 60 concepts, 22 transactions and 12 cuts with complete budget and provider totals", async () => {
    const f = await fixture();
    const result = await f.upload();
    expect(result).toMatchObject({ status: "created", row_count: 60, transaction_count: 22, providers_created: 0, providers_reused: 1 });
    const state = await f.snapshot();
    expect(state.labor_payment_imports.filter(item => item.status === "active")).toHaveLength(12);
    expect(state.pagos.filter(item => item.source_row)).toHaveLength(60);
    const root = state.partidas.find(item => item._id === f.ids.root);
    const family = state.partidas.find(item => item._id === f.ids.family);
    expect(root).toMatchObject({ pagado: 6100, por_gastar: 93900 });
    expect(family.pagado).toBe(6075);
    expect(state.partidas.find(item => item._id === f.ids.leaves[0]).pagado).toBe(250);
    expect(state.partidas.find(item => item._id === f.ids.fee).pagado).toBe(700);
    expect(state.meticas_presupuesto[0].gasto_total).toBe(6800);
    expect(state.proveedores[0]).toMatchObject({ stats_transaction_count: 23, stats_total_amount: 6100, stats_project_count: 1 });
    expect(state.provider_project_stats[0]).toMatchObject({ transaction_count: 23, total_amount: 6100 });
  });

  it("returns unchanged without financial writes when the same file is confirmed again", async () => {
    const f = await fixture();
    await f.upload();
    const before = await f.snapshot();
    expect(await f.upload()).toMatchObject({ status: "unchanged", transaction_count: 22 });
    expect(await f.snapshot()).toEqual(before);
  });

  it("replaces all matching cuts without duplicating payments or deleting manual transactions", async () => {
    const f = await fixture();
    await f.upload();
    const input = f.args("b");
    for (const week of input.weeks) {
      week.amount_total /= 2;
      for (const tx of week.transactions) {
        tx.monto_total /= 2;
        for (const item of tx.line_items) item.monto /= 2;
      }
    }
    expect(await f.upload(input)).toMatchObject({ status: "replaced", replaced_dates: 12, amount_total: 3000 });
    const state = await f.snapshot();
    expect(state.transacciones).toHaveLength(24);
    expect(state.transacciones.find(item => item._id === f.ids.manual).monto_total).toBe(100);
    expect(state.pagos.filter(item => item.source_row)).toHaveLength(60);
    expect(state.labor_payment_imports.filter(item => item.status === "superseded")).toHaveLength(12);
    expect(state.partidas.find(item => item._id === f.ids.root).pagado).toBe(3100);
    expect(state.proveedores[0]).toMatchObject({ stats_transaction_count: 23, stats_total_amount: 3100, stats_project_count: 1 });
    expect(state.provider_project_stats[0]).toMatchObject({ transaction_count: 23, total_amount: 3100 });
  });

  it("preserves omitted concepts when a reload contains only part of an invoice", async () => {
    const f = await fixture();
    await f.upload();
    const input = f.args("b", [1]);
    input.weeks[0].amount_total = 150;
    input.weeks[0].transactions[0].monto_total = 150;
    input.weeks[0].transactions[0].line_items[0].monto = 150;
    await f.upload(input);
    const { partidas } = await f.snapshot();
    expect(partidas.find(item => item._id === f.ids.leaves[0]).pagado).toBe(300);
    expect(partidas.find(item => item._id === f.ids.leaves[1]).pagado).toBe(200);
    expect(partidas.find(item => item._id === f.ids.root).pagado).toBe(6150);
  });

  it("preserves the other cuts when only one date is replaced", async () => {
    const f = await fixture();
    await f.upload();
    const before = await f.snapshot();
    const input = f.args("b");
    input.weeks = input.weeks.slice(0, 1);
    input.source.row_count = input.weeks[0].row_count;
    input.weeks[0].amount_total -= 50;
    input.weeks[0].transactions[0].monto_total -= 50;
    input.weeks[0].transactions[0].line_items[0].monto -= 50;
    expect(await f.upload(input)).toMatchObject({ status: "replaced", replaced_dates: 1, row_count: 5 });
    const after = await f.snapshot();
    const unaffectedImportIds = before.labor_payment_imports.filter(item => item.capture_date !== input.weeks[0].date).map(item => item._id);
    expect(after.labor_payment_imports.filter(item => unaffectedImportIds.includes(item._id)))
      .toEqual(before.labor_payment_imports.filter(item => unaffectedImportIds.includes(item._id)));
    expect(after.transacciones.filter(item => unaffectedImportIds.includes(item.labor_import_id)))
      .toEqual(before.transacciones.filter(item => unaffectedImportIds.includes(item.labor_import_id)));
    expect(after.proveedores[0]).toMatchObject({ stats_transaction_count: 23, stats_total_amount: 6050 });
  });

  it("keeps other invoices on the same date and consolidates their actual amounts and workforce", async () => {
    const f = await fixture();
    await f.upload(f.args("a", [1]));
    const before = await f.snapshot();
    const original = before.transacciones.find(tx => tx.labor_import_id);
    const input = f.args("b", [1]);
    input.weeks[0].transactions[0].factura = "PLM-501019025.pdf";
    input.weeks[0].transactions[0].categoria = "MATERIAL";
    input.weeks[0].transactions[0].line_items[0].numero_personas_origen = 0;
    input.weeks[0].roles = [];
    input.weeks[0].total_people = 0;
    await f.upload(input);
    const after = await f.snapshot();
    expect(after.transacciones.find(tx => tx._id === original._id)).toMatchObject({ monto_total: 100, factura: original.factura });
    expect(after.transacciones.filter(tx => tx.labor_import_id)).toHaveLength(2);
    expect(after.labor_payment_imports.find(cut => cut.status === "active"))
      .toMatchObject({ amount_total: 200, transaction_count: 2, source_row_count: 2, total_people: 1 });
    expect(after.proveedores[0]).toMatchObject({ stats_transaction_count: 3, stats_total_amount: 300 });
    expect(after.partidas.find(partida => partida._id === f.ids.root).pagado).toBe(300);
    // Returning to either file after another upload must remain idempotent.
    expect(await f.upload(f.args("a", [1]))).toMatchObject({ status: "unchanged" });
    expect(await f.snapshot()).toEqual(after);
    expect(await f.upload(input)).toMatchObject({ status: "unchanged" });
    expect(await f.snapshot()).toEqual(after);
  });

  it("keeps transaction, payment and document IDs when an included concept changes", async () => {
    const f = await fixture();
    await f.upload(f.args("a", [1]));
    const before = await f.snapshot();
    const transaction = before.transacciones.find(tx => tx.labor_import_id);
    const payment = before.pagos.find(item => item.transaccion_id === transaction._id);
    const documentId = await f.test.run(ctx => ctx.db.insert("documentos", {
      nombre: "Factura", descripcion: "", type: "pdf", transaccion_id: transaction._id, proyecto: f.ids.project,
    }));
    const input = f.args("b", [1]);
    input.weeks[0].amount_total = 50;
    input.weeks[0].transactions[0].monto_total = 50;
    input.weeks[0].transactions[0].line_items[0].monto = 50;
    await f.upload(input);
    const after = await f.snapshot();
    expect(after.transacciones.find(tx => tx._id === transaction._id).monto_total).toBe(50);
    expect(after.pagos.find(item => item._id === payment._id).monto).toBe(50);
    expect(await f.test.run(ctx => ctx.db.get(documentId))).toMatchObject({ transaccion_id: transaction._id });
  });

  it("checks persisted payments instead of assuming an active file hash means the upload is complete", async () => {
    const f = await fixture();
    await f.upload(f.args("a", [1]));
    const before = await f.snapshot();
    const transaction = before.transacciones.find(tx => tx.labor_import_id);
    await f.writer.mutation(api.transacciones.deleteTransaction, { id: transaction._id });
    expect(await f.upload(f.args("a", [1]))).toMatchObject({ status: "replaced", amount_total: 100 });
    const after = await f.snapshot();
    expect(after.transacciones.filter(tx => tx.labor_import_id)).toHaveLength(1);
    expect(after.proveedores[0]).toMatchObject({ stats_transaction_count: 2, stats_total_amount: 200 });
    expect(after.partidas.find(partida => partida._id === f.ids.root).pagado).toBe(200);
  });

  it("does not rewrite identical data from a renamed or resaved workbook", async () => {
    const f = await fixture();
    await f.upload();
    const before = await f.snapshot();
    expect(await f.upload(f.args("b"))).toMatchObject({ status: "unchanged" });
    expect(await f.snapshot()).toEqual(before);
  });

  it("rejects ambiguous reductions of repeated concept rows atomically", async () => {
    const f = await fixture();
    const original = f.args("a", [5]);
    for (const item of original.weeks[0].transactions[0].line_items) {
      item.partida_id = f.ids.leaves[0];
      item.sub_partida = "OFICIO 0";
    }
    await f.upload(original);
    const before = await f.snapshot();
    await expect(f.upload(f.args("b", [1]))).rejects.toThrow(/menos filas/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("retains manual honorarios and calculates indirectos only after their starting date", async () => {
    const f = await fixture();
    await f.test.run(ctx => ctx.db.patch(f.ids.project, { honorarios_modo: "transacciones",
      indirectos_porcentaje: 5, indirectos_fecha_inicio: "2026-10-01" }));
    await f.upload();
    const state = await f.snapshot();
    expect(state.desarrollos[0].honorarios_monto).toBe(0);
    expect(state.partidas.find(item => item._id === f.ids.fee).pagado).toBe(0);
    // Only the last two cuts (25 concepts of 100) fall in October: 2500 * 5%.
    expect(state.meticas_presupuesto[0].gasto_total).toBe(6225);
  });

  it("updates configured fee concepts together with the imported payments", async () => {
    const f = await fixture();
    await f.test.run(async ctx => {
      await ctx.db.patch(f.ids.fee, { presupuesto_original: 10000, presupuesto_aprobado: 10000 });
      const partidas = await ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", f.ids.project)).collect();
      const concepts = deriveFeeConcepts([{ concepto: "honorarios", partida_id: f.ids.fee, excluded_partidas: [f.ids.fee] }], partidas);
      await ctx.db.patch(f.ids.project, { fee_concepts: concepts.map(concept => ({ ...concept, fecha_inicio: "2026-07-01" })) });
    });
    await f.upload();
    const state = await f.snapshot();
    expect(state.desarrollos[0].honorarios_monto).toBe(610);
    expect(state.partidas.find(item => item._id === f.ids.fee).pagado).toBe(610);
    expect(state.meticas_presupuesto[0].gasto_total).toBe(6710);
  });

  it("rolls back the whole replacement when final recalculation fails", async () => {
    const f = await fixture();
    await f.upload();
    const before = await f.snapshot();
    vi.spyOn(budgetMaintenance, "repairProjectPaymentTotals").mockRejectedValueOnce(new Error("Fallo de cálculo"));
    const input = f.args("b");
    input.weeks[0].transactions[0].proveedor = "Nuevo proveedor";
    delete input.weeks[0].transactions[0].proveedor_id;
    await expect(f.upload(input)).rejects.toThrow("Fallo de cálculo");
    expect(await f.snapshot()).toEqual(before);
  });

  it.each([{ label: "60 concepts", counts: rowCounts }, { label: "1000 concepts", counts: [84, 84, 84, 84, 84, 84, 84, 84, 83, 83, 83, 79] }])(
    "reads payment history once per transaction for $label", async ({ counts }) => {
      const f = await fixture();
      const input = f.args("a", counts);
      const prepared = await f.prepare(input);
      const reads = [];
      await f.writer.run(async ctx => {
        const db = { ...ctx.db, query(table) {
          const query = ctx.db.query(table);
          const withIndex = query.withIndex.bind(query);
          query.withIndex = (index, ...rest) => { reads.push([table, index]); return withIndex(index, ...rest); };
          return query;
        } };
        await replaceLaborPaymentImport._handler({ ...ctx, db }, { attempt_id: prepared.attempt_id, weeks: input.weeks });
      });
      const transactionCount = input.weeks.reduce((sum, week) => sum + week.transactions.length, 0) + 2;
      expect(reads.filter(([table]) => table === "pagos")).toHaveLength(transactionCount);
      expect(reads.filter(([table, index]) => table === "transacciones" && index === "by_proyecto")).toHaveLength(1);
      const state = await f.snapshot();
      expect(state.pagos.filter(item => item.source_row)).toHaveLength(input.source.row_count);
      expect(state.partidas.find(item => item._id === f.ids.root).pagado).toBe(input.source.row_count * 100 + 100);
    },
  );
});

describe("original Excel backups and import audit", () => {
  const paginationOpts = { cursor: null, numItems: 25 };
  const confirm = (f, prepared) => f.writer.action(api.laborPaymentImports.confirmLaborPaymentImport,
    { attempt_id: prepared.attempt_id, weeks: prepared.weeks });
  const getAttempt = (f, id) => f.writer.query(api.laborImportHistory.getAttempt, { attempt_id: id });
  const items = (f, id) => f.writer.query(api.laborImportHistory.listAttemptItems, { attempt_id: id, paginationOpts });

  it("keeps exact original bytes, filename and metadata, with one snapshot for each incoming transaction", async () => {
    const f = await fixture();
    const input = f.args();
    input.source.file_name = "Pagos originales (revisión 2).xlsx";
    const prepared = await f.prepare(input);
    const result = await confirm(f, prepared);
    const attempt = await getAttempt(f, prepared.attempt_id);
    expect(attempt).toMatchObject({ status: "completed", source: { file_name: input.source.file_name },
      imported_by: f.ids.user, imported_by_name: "Writer", result });
    const stored = await f.test.run(async ctx => (await ctx.storage.get(attempt.storage_id)).arrayBuffer());
    expect(new Uint8Array(stored)).toEqual(new Uint8Array(await prepared.file.arrayBuffer()));
    const download = await f.writer.query(api.laborImportHistory.getDownloadUrl, { attempt_id: attempt._id });
    expect(download.file_name).toBe(input.source.file_name);
    expect(download.url).toBeTruthy();
    const snapshots = (await items(f, attempt._id)).page;
    expect(snapshots).toHaveLength(22);
    expect(snapshots[0]).toMatchObject({ factura: "FACTURA-0-0", monto_total: 500, source_rows: [2, 3, 4, 5, 6], outcome: "created" });
    const sources = await f.writer.query(api.laborImportHistory.listTransactionSources,
      { transaccion_id: snapshots[0].transaccion_id, paginationOpts });
    expect(sources.page[0].attempt._id).toBe(attempt._id);
    expect(sources.page[0].file_available).toBe(true);
  });

  it("reuses the request and its committed result without duplicating audit items or financial data", async () => {
    const f = await fixture();
    const request_id = randomUUID();
    const prepared = await f.prepare(f.args("a", [1]), { request_id });
    const first = await confirm(f, prepared);
    const before = await f.snapshot();
    const repeated = await f.prepare(f.args("a", [1]), { request_id });
    expect(repeated.attempt_id).toBe(prepared.attempt_id);
    expect(repeated.started.upload_url).toBeNull();
    expect(await confirm(f, repeated)).toEqual(first);
    expect(await f.snapshot()).toEqual(before);
    expect((await items(f, prepared.attempt_id)).page).toHaveLength(1);
    expect(await f.test.run(ctx => ctx.db.query("labor_payment_import_attempts").collect())).toHaveLength(1);
    await expect(f.writer.mutation(api.laborImportHistory.startAttempt,
      { ...prepared.startArgs, source: { ...prepared.startArgs.source, file_name: "Otro.xlsx" } })).rejects.toThrow(/otro intento/);
  });

  it("creates a separate unchanged event for a new confirmation, reusing the verified original", async () => {
    const f = await fixture();
    const first = await f.prepare(f.args("a", [1]));
    await confirm(f, first);
    const before = await f.snapshot();
    const second = await f.prepare(f.args("a", [1]));
    expect(second.attempt_id).not.toBe(first.attempt_id);
    expect(second.started.upload_url).toBeNull();
    expect(await confirm(f, second)).toMatchObject({ status: "unchanged" });
    const a = await getAttempt(f, first.attempt_id);
    const b = await getAttempt(f, second.attempt_id);
    expect(b).toMatchObject({ status: "unchanged", storage_id: a.storage_id });
    expect((await items(f, second.attempt_id)).page[0].outcome).toBe("unchanged");
    expect(await f.snapshot()).toEqual(before);
  });

  it("associates partial reloads only with incoming transactions and preserves earlier source references", async () => {
    const f = await fixture();
    const first = await f.prepare(f.args("a", [2]));
    await confirm(f, first);
    const original = (await items(f, first.attempt_id)).page[0];
    const input = f.args("b", [1]);
    input.weeks[0].transactions[0].factura = "NUEVA FACTURA";
    const second = await f.prepare(input);
    await confirm(f, second);
    const next = (await items(f, second.attempt_id)).page;
    expect(next).toHaveLength(1);
    expect(next[0].factura).toBe("NUEVA FACTURA");
    const sources = await f.writer.query(api.laborImportHistory.listTransactionSources,
      { transaccion_id: original.transaccion_id, paginationOpts });
    expect(sources.page.map(item => item.attempt_id)).toEqual([first.attempt_id]);
    expect(await f.writer.query(api.laborImportHistory.getLegacyTransactionReference,
      { transaccion_id: original.transaccion_id })).toBeNull();
    // A partial update to the original invoice creates an additional reference, with its own input amount.
    const update = f.args("c", [1]);
    update.weeks[0].transactions[0].line_items[0].monto = 150;
    update.weeks[0].transactions[0].monto_total = 150;
    update.weeks[0].amount_total = 150;
    const third = await f.prepare(update);
    await confirm(f, third);
    expect((await items(f, third.attempt_id)).page[0]).toMatchObject({ transaccion_id: original.transaccion_id, monto_total: 150, source_rows: [2] });
    expect((await items(f, first.attempt_id)).page[0].monto_total).toBe(200);
  });

  it("retains failed imports and their originals while rolling back financial changes and snapshots", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]));
    const before = await f.snapshot();
    vi.spyOn(budgetMaintenance, "repairProjectPaymentTotals").mockRejectedValueOnce(new Error("Fallo de cálculo de prueba"));
    await expect(confirm(f, prepared)).rejects.toThrow(/Fallo de cálculo de prueba/);
    expect(await f.snapshot()).toEqual(before);
    expect(await getAttempt(f, prepared.attempt_id)).toMatchObject({ status: "failed", error: expect.stringContaining("Fallo de cálculo de prueba") });
    expect((await items(f, prepared.attempt_id)).page).toEqual([]);
    expect((await f.writer.query(api.laborImportHistory.getDownloadUrl, { attempt_id: prepared.attempt_id })).url).toBeTruthy();
  });

  it("records an unavailable original after transfer failure and blocks imports without a saved file", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]), { attach: false });
    const before = await f.snapshot();
    await expect(confirm(f, prepared)).rejects.toThrow(/Archivo original no disponible/);
    expect(await getAttempt(f, prepared.attempt_id)).toMatchObject({ status: "failed" });
    expect(await f.snapshot()).toEqual(before);
    const history = await f.writer.query(api.laborImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts });
    expect(history.page[0].file_available).toBe(false);
  });

  it.each(["hash", "size"])("rejects a stored file with the wrong %s before any financial write", async mismatch => {
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]), { attach: false });
    const file = mismatch === "hash" ? new Blob([new Uint8Array(prepared.file.size)]) : prepared.file;
    const storageId = await storeFile(f.test, file);
    if (mismatch === "size") await f.test.run(ctx => ctx.db.patch(prepared.attempt_id, { size: prepared.file.size + 1 }));
    const before = await f.snapshot();
    await expect(f.writer.mutation(api.laborImportHistory.attachFile, { attempt_id: prepared.attempt_id, storage_id: storageId })).rejects.toThrow(/no coincide/);
    expect((await getAttempt(f, prepared.attempt_id)).storage_id).toBeUndefined();
    expect(await f.snapshot()).toEqual(before);
  });

  it("expires abandoned attempts and never overwrites a completed outcome", async () => {
    const f = await fixture();
    const pending = await f.prepare(f.args("a", [1]), { attach: false });
    await f.test.run(ctx => ctx.db.patch(pending.attempt_id, { created_at: Date.now() - 31 * 60 * 1000 }));
    await f.test.mutation(internal.laborImportHistory.expireAttempt, { attempt_id: pending.attempt_id });
    expect(await getAttempt(f, pending.attempt_id)).toMatchObject({ status: "failed", error: expect.stringContaining("30 minutos") });
    const completed = await f.prepare(f.args("b", [1]));
    await confirm(f, completed);
    const before = await getAttempt(f, completed.attempt_id);
    await f.test.mutation(internal.laborImportHistory.expireAttempt, { attempt_id: completed.attempt_id });
    await f.writer.mutation(api.laborImportHistory.failAttempt, { attempt_id: completed.attempt_id, error: "Respuesta perdida" });
    expect(await getAttempt(f, completed.attempt_id)).toEqual(before);
  });

  it("allows project viewers to read and download, but only the initiating writer may attach or confirm", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]));
    await f.test.run(async ctx => {
      for (const [clerkId, role] of [["viewer", "viewer"], ["other", "finance"]]) {
        await ctx.db.insert("users", { clerkId, role, name: clerkId, email: `${clerkId}@example.test`, allowed_desarrollos: [f.ids.project], created_at: 0 });
      }
    });
    const viewer = f.test.withIdentity({ subject: "viewer" });
    expect((await viewer.query(api.laborImportHistory.getDownloadUrl, { attempt_id: prepared.attempt_id })).url).toBeTruthy();
    expect((await viewer.query(api.laborImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts })).page).toHaveLength(1);
    const storage_id = (await getAttempt(f, prepared.attempt_id)).storage_id;
    for (const subject of ["viewer", "other"]) {
      const actor = f.test.withIdentity({ subject });
      await expect(actor.mutation(api.laborImportHistory.attachFile, { attempt_id: prepared.attempt_id, storage_id })).rejects.toThrow();
      await expect(actor.mutation(api.laborPaymentImports.replaceLaborPaymentImport, { attempt_id: prepared.attempt_id, weeks: prepared.weeks })).rejects.toThrow();
      await expect(actor.mutation(api.laborImportHistory.failAttempt, { attempt_id: prepared.attempt_id, error: "No autorizado" })).rejects.toThrow();
    }
    expect((await getAttempt(f, prepared.attempt_id)).status).toBe("processing");
  });

  it("denies unauthenticated and foreign-project access to attempts, items, sources and downloads", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]));
    await confirm(f, prepared);
    const transactionId = (await items(f, prepared.attempt_id)).page[0].transaccion_id;
    await f.test.run(ctx => ctx.db.patch(f.ids.user, { role: "finance", allowed_desarrollos: [] }));
    const queries = [
      [api.laborImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts }],
      [api.laborImportHistory.getAttempt, { attempt_id: prepared.attempt_id }],
      [api.laborImportHistory.listAttemptItems, { attempt_id: prepared.attempt_id, paginationOpts }],
      [api.laborImportHistory.getDownloadUrl, { attempt_id: prepared.attempt_id }],
      [api.laborImportHistory.listTransactionSources, { transaccion_id: transactionId, paginationOpts }],
      [api.laborImportHistory.getLegacyTransactionReference, { transaccion_id: transactionId }],
    ];
    for (const client of [f.test, f.writer]) for (const [query, args] of queries) await expect(client.query(query, args)).rejects.toThrow();
  });

  it("preserves file snapshots after deleting a transaction, and purges them when the project is deleted", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]));
    await confirm(f, prepared);
    const snapshot = (await items(f, prepared.attempt_id)).page[0];
    const second = await f.prepare(f.args("a", [1]));
    await confirm(f, second);
    const attempt = await getAttempt(f, prepared.attempt_id);
    await f.writer.mutation(api.transacciones.deleteTransaction, { id: snapshot.transaccion_id });
    expect((await items(f, prepared.attempt_id)).page[0]).toMatchObject({ deleted: true, factura: snapshot.factura, monto_total: 100 });
    expect((await f.writer.query(api.laborImportHistory.getDownloadUrl, { attempt_id: prepared.attempt_id })).url).toBeTruthy();
    await f.writer.mutation(api.desarrollos.deleteProject, { id: f.ids.project });
    const remaining = await f.test.run(async ctx => ({
      attempts: await ctx.db.query("labor_payment_import_attempts").collect(),
      items: await ctx.db.query("labor_payment_import_attempt_items").collect(),
      storage: await ctx.db.system.get(attempt.storage_id),
    }));
    expect(remaining).toEqual({ attempts: [], items: [], storage: null });
  });

  it("migrates legacy cuts in resumable pages, grouping metadata without inventing source items", async () => {
    const f = await fixture();
    await f.test.run(async ctx => {
      for (let index = 0; index < 30; index++) {
        await ctx.db.insert("labor_payment_imports", { proyecto: f.ids.project,
          capture_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
          total_people: 0, roles: [], source_file_name: "Histórico.xlsx", source_file_hash: "a".repeat(64),
          source_sheet_name: "Pagos", source_administration: "Obra", source_currency: "MXN", source_row_count: 1,
          transaction_count: 1, amount_total: 100, warnings: [], status: "active", imported_by: f.ids.user, imported_at: 123,
        });
      }
    });
    const diagnostic = await f.test.mutation(internal.laborImportHistory.migrateLegacyAttempts, { cursor: null, dry_run: true });
    expect(diagnostic).toMatchObject({ processed: 25, migrated: 25, isDone: false });
    expect(await f.test.run(ctx => ctx.db.query("labor_payment_import_attempts").collect())).toEqual([]);
    let cursor = null;
    do {
      const result = await f.test.mutation(internal.laborImportHistory.migrateLegacyAttempts, { cursor, dry_run: false });
      cursor = result.isDone ? null : result.cursor;
    } while (cursor);
    const history = await f.writer.query(api.laborImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts });
    expect(history.page).toHaveLength(1);
    expect(history.page[0]).toMatchObject({ status: "legacy", file_available: false, created_at: 123 });
    expect(history.page[0].dates).toHaveLength(30);
    expect((await items(f, history.page[0]._id)).page).toEqual([]);
    const again = await f.test.mutation(internal.laborImportHistory.migrateLegacyAttempts, { cursor: null, dry_run: false });
    expect(again.migrated).toBe(0);
    expect((await f.writer.query(api.laborImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts })).page).toHaveLength(1);
  });

  it("paginates history and a transaction's source attempts without losing or duplicating records", async () => {
    const f = await fixture();
    for (let index = 0; index < 27; index++) await f.upload(f.args("a", [1]));
    const history = await f.writer.query(api.laborImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts });
    expect(history.page).toHaveLength(25);
    expect(history.isDone).toBe(false);
    const rest = await f.writer.query(api.laborImportHistory.listHistory,
      { proyecto: f.ids.project, paginationOpts: { ...paginationOpts, cursor: history.continueCursor } });
    expect(rest.page).toHaveLength(2);
    expect(new Set([...history.page, ...rest.page].map(attempt => attempt._id)).size).toBe(27);
    const transaction = (await items(f, history.page[0]._id)).page[0].transaccion_id;
    const first = await f.writer.query(api.laborImportHistory.listTransactionSources, { transaccion_id: transaction, paginationOpts });
    const next = await f.writer.query(api.laborImportHistory.listTransactionSources,
      { transaccion_id: transaction, paginationOpts: { ...paginationOpts, cursor: first.continueCursor } });
    expect(first.page).toHaveLength(25);
    expect(next.page).toHaveLength(2);
    expect(new Set([...first.page, ...next.page].map(item => item.attempt_id)).size).toBe(27);
  });

  it("paginates movements in a large attempt with their own original source rows", async () => {
    const f = await fixture();
    const input = f.args("a", [27]);
    const original = input.weeks[0].transactions[0];
    input.weeks[0].transactions = original.line_items.map((line, index) => ({ ...original,
      factura: `FACTURA-${index}`, source_key: `source-${index}`, monto_total: line.monto, line_items: [line],
    }));
    const prepared = await f.prepare(input);
    await confirm(f, prepared);
    const first = await items(f, prepared.attempt_id);
    const next = await f.writer.query(api.laborImportHistory.listAttemptItems,
      { attempt_id: prepared.attempt_id, paginationOpts: { ...paginationOpts, cursor: first.continueCursor } });
    expect(first.page).toHaveLength(25);
    expect(next.page).toHaveLength(2);
    expect(new Set([...first.page, ...next.page].flatMap(item => item.source_rows)).size).toBe(27);
  });

  it("finishes a large deleted project's history cleanup in bounded scheduled pages", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const prepared = await f.prepare(f.args("a", [1]));
    await confirm(f, prepared);
    const first = (await items(f, prepared.attempt_id)).page[0];
    await f.test.run(async ctx => {
      const { _id, _creationTime, deleted, ...fields } = first;
      for (let index = 0; index < 110; index++) await ctx.db.insert("labor_payment_import_attempt_items", { ...fields, source_key: `copy-${index}` });
    });
    // The background entry point must not erase a live project's audit.
    await f.test.mutation(internal.laborImportHistory.purgeDeletedProjectHistory, { proyecto: f.ids.project });
    expect(await f.test.run(ctx => ctx.db.query("labor_payment_import_attempt_items").collect())).toHaveLength(111);
    await f.writer.mutation(api.desarrollos.deleteProject, { id: f.ids.project });
    await f.test.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await f.test.run(ctx => ctx.db.query("labor_payment_import_attempt_items").collect())).toEqual([]);
    expect(await f.test.run(ctx => ctx.db.query("labor_payment_import_attempts").collect())).toEqual([]);
  });
});
