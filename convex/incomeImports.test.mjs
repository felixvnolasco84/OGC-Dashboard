import { convexTest } from "convex-test";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { INCOME_IMPORT_TIMEOUT, INCOME_IMPORT_STORAGE_TYPE, incomeStorageType, parseIncomeReview } from "./incomeImportRules";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([["Monto", "Fecha", "Descripción"], [100, "1/10/2026", "Ingreso original"]]);
sheet.D2 = { t: "n", f: "B2*2", v: 200, z: "$#,##0.00" };
sheet["!ref"] = "A1:D2";
XLSX.utils.book_append_sheet(workbook, sheet, "Ingresos originales");
const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const hash = createHash("sha256").update(bytes).digest("hex");
const fileName = "Ingresos originales · revisión octubre 2026.xlsx";
const valid = { monto: 100, fecha: "1/10/2026", descripcion: "Ingreso original", moneda: "MXN", rowIndex: 7 };
const review = (rows = [valid, { ...valid, monto: -20, rowIndex: undefined, descripcion: "Rechazado" }]) => JSON.stringify({ ingresos: rows, summary: { totalRows: 25, validRows: 18, errors: 7, totalAmount: 100 } });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function fixture(role = "finance") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra de prueba", descripcion: "", image: "", organization_id: "org" });
    const other = await ctx.db.insert("desarrollos", { nombre: "Otro proyecto", descripcion: "", image: "", organization_id: "foreign" });
    const user = await ctx.db.insert("users", { clerkId: "writer", name: "Actor de sesión", email: "writer@example.test", role, allowed_desarrollos: [project], organization_id: "org", created_at: 0 });
    const second = await ctx.db.insert("users", { clerkId: "second", name: "Otra persona", email: "second@example.test", role: "finance", allowed_desarrollos: [project], organization_id: "org", created_at: 0 });
    return { project, other, user, second };
  });
  const writer = t.withIdentity({ subject: "writer" });
  const start = (overrides = {}) => writer.mutation(api.incomeImportHistory.startAttempt, {
    proyecto: ids.project, request_id: randomUUID(), file_name: fileName, file_hash: hash, size: bytes.length, content_type: mime, review_json: review(), ...overrides,
  });
  const store = async (attemptId, data = bytes, type = incomeStorageType(attemptId)) => t.run(async ctx => {
    const id = await ctx.storage.store(new Blob([data], { type }));
    // convex-test 0.0.41 returns base64; the actual _storage API uses hex.
    await ctx.db.patch(id, { sha256: createHash("sha256").update(data).digest("hex"), contentType: type });
    return id;
  });
  const prepare = async (overrides = {}) => {
    const started = await start(overrides);
    const storageId = await store(started.attempt_id);
    await writer.mutation(api.incomeImportHistory.attachFile, { attempt_id: started.attempt_id, storage_id: storageId });
    return { attempt_id: started.attempt_id, storageId };
  };
  const state = () => t.run(async ctx => ({ incomes: await ctx.db.query("ingresos").collect(), totals: await ctx.db.query("ingresos_totals").collect(), items: await ctx.db.query("income_import_items").collect(), attempts: await ctx.db.query("income_import_attempts").collect() }));
  const page = { cursor: null, numItems: 25 };
  return { t, ids, writer, start, store, prepare, state, page };
}

describe("original Excel and income import audit", () => {
  it("preserves real workbook bytes/name/formula, original and normalized values, known rejections and unknown coordinates", async () => {
    const f = await fixture();
    const p = await f.prepare();
    const result = await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id });
    expect(result).toEqual({ created: 1, rejected: 1, response_rows: 2, amounts: [{ moneda: "MXN", monto: 100 }] });
    const state = await f.state();
    expect(state.incomes).toHaveLength(1);
    expect(state.incomes[0]).toMatchObject({ monto: 100, fecha: "01/10/2026", import_attempt_id: p.attempt_id, added_by_id: f.ids.user });
    expect(state.totals[0]).toMatchObject({ total_ingresos: 100, total_count: 1 });
    expect(state.items[0]).toMatchObject({ source_row: 7, outcome: "created", ingreso_id: state.incomes[0]._id });
    expect(JSON.parse(state.items[0].raw_json).fecha).toBe("1/10/2026");
    expect(state.items[1]).toMatchObject({ position: 2, outcome: "rejected", errors: ["Monto inválido"] });
    expect(state.items[1].source_row).toBeUndefined();
    const attempt = await f.writer.query(api.incomeImportHistory.getAttempt, { attempt_id: p.attempt_id });
    expect(attempt).toMatchObject({ file_name: fileName, file_hash: hash, size: bytes.length, status: "completed", file_available: true, response_rows: 2, parser_summary: { totalRows: 25, errors: 7 } });
    expect(attempt.review_json).toBeUndefined();
    const download = await f.writer.query(api.incomeImportHistory.getDownloadUrl, { attempt_id: p.attempt_id });
    expect(download.file_name).toBe(fileName);
    const saved = new Uint8Array(await f.t.run(async ctx => (await ctx.storage.get(p.storageId)).arrayBuffer()));
    expect(Buffer.from(saved)).toEqual(bytes);
    expect(XLSX.read(saved).Sheets["Ingresos originales"].D2.f).toBe("B2*2");
  });

  it("returns one committed result across repeated/concurrent confirmations and recovers the request after a lost start response", async () => {
    const f = await fixture();
    const request = randomUUID();
    const p = await f.prepare({ request_id: request });
    const a = await f.start({ request_id: request });
    expect(a.attempt_id).toBe(p.attempt_id);
    const results = await Promise.all([1, 2].map(() => f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id })));
    expect(results[0]).toEqual(results[1]);
    await f.writer.mutation(api.incomeImportHistory.attachFile, { attempt_id: p.attempt_id, storage_id: p.storageId });
    expect(await f.writer.mutation(api.incomeImportHistory.failAttempt, { attempt_id: p.attempt_id, error: "Respuesta perdida" })).toEqual(results[0]);
    const recovered = await f.writer.query(api.incomeImportHistory.getRequestAttempt, { proyecto: f.ids.project, request_id: request });
    expect(recovered.status).toBe("completed");
    const state = await f.state(); expect(state.incomes).toHaveLength(1); expect(state.attempts).toHaveLength(1);
    await expect(f.start({ request_id: request, review_json: review([{ ...valid, monto: 900 }]) })).rejects.toThrow("otro archivo o vista previa");
  });

  it("makes a new confirmation additive even for identical bytes, date and amount", async () => {
    const f = await fixture();
    for (let i = 0; i < 2; i++) {
      const p = await f.prepare(); await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id });
    }
    const state = await f.state(); expect(state.incomes).toHaveLength(2); expect(state.attempts).toHaveLength(2);
    expect(state.attempts[0].storage_id).not.toBe(state.attempts[1].storage_id);
    expect(state.totals[0]).toMatchObject({ total_ingresos: 200, total_count: 2 });
    expect(await f.writer.query(api.incomeImportHistory.findPreviousFile, { proyecto: f.ids.project, file_hash: hash })).toMatchObject({ file_name: fileName });
  });

  it("requires the original and rejects hash/size/ownership mismatches before any financial write", async () => {
    const f = await fixture(); const p = await f.start();
    const wrong = await f.store(p.attempt_id, Buffer.from("wrong bytes"));
    await expect(f.writer.mutation(api.incomeImportHistory.attachFile, { attempt_id: p.attempt_id, storage_id: wrong })).rejects.toThrow("SHA-256");
    const correct = await f.store(p.attempt_id);
    await f.t.run(ctx => ctx.db.patch(correct, { size: bytes.length + 1 }));
    await expect(f.writer.mutation(api.incomeImportHistory.attachFile, { attempt_id: p.attempt_id, storage_id: correct })).rejects.toThrow("tamaño");
    const foreign = await f.store(p.attempt_id, bytes, `${INCOME_IMPORT_STORAGE_TYPE};attempt=other`);
    await expect(f.writer.mutation(api.incomeImportHistory.attachFile, { attempt_id: p.attempt_id, storage_id: foreign })).rejects.toThrow("no pertenece");
    await expect(f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id })).rejects.toThrow("Archivo original no disponible");
    const state = await f.state(); expect(state.incomes).toEqual([]); expect(state.totals).toEqual([]); expect(state.attempts[0].status).toBe("failed");
  });

  it("rolls back income/link/total writes and persists the failure separately while retaining the original", async () => {
    const f = await fixture(); const p = await f.prepare({ review_json: review([valid, { ...valid, rowIndex: 8 }]) });
    const state = await f.state();
    await f.t.run(ctx => ctx.db.patch(state.items[1]._id, { monto: -1 }));
    await expect(f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id })).rejects.toThrow("fila guardada");
    const after = await f.state(); expect(after.incomes).toEqual([]); expect(after.totals).toEqual([]);
    expect(after.items.every(item => item.outcome === "pending" && !item.ingreso_id)).toBe(true);
    expect(after.attempts[0]).toMatchObject({ status: "failed", storage_id: p.storageId });
    expect(await f.writer.query(api.incomeImportHistory.getDownloadUrl, { attempt_id: p.attempt_id })).toMatchObject({ file_name: fileName });
  });

  it("retains source snapshots after editing/deleting one of the imported incomes and after deleting a receipt", async () => {
    const f = await fixture(); const p = await f.prepare({ review_json: review([valid, { ...valid, monto: 250, moneda: "USD" }]) });
    await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id });
    const before = await f.state();
    const id = before.incomes[0]._id;
    await f.writer.mutation(api.ingresos.update, { id, monto: 500, descripcion: "Editado" });
    const items = await f.writer.query(api.incomeImportHistory.listAttemptItems, { attempt_id: p.attempt_id, paginationOpts: f.page });
    expect(items.page[0]).toMatchObject({ monto: 100, modified: true, deleted: false });
    const source = await f.writer.query(api.incomeImportHistory.getIngresoSource, { ingreso_id: id });
    expect(source.item.monto).toBe(100);
    const receipt = await f.store(p.attempt_id, Buffer.from("receipt"), "application/pdf");
    await expect(f.writer.mutation(api.ingresos_documentos.create, { ingreso_id: id, proyecto: f.ids.project, storage_id: p.storageId, nombre: "Excel", type: "comprobante", size: bytes.length })).rejects.toThrow("no puede usarse como comprobante");
    await f.writer.mutation(api.ingresos_documentos.create, { ingreso_id: id, proyecto: f.ids.project, storage_id: receipt, nombre: "Factura", type: "factura", size: 7 });
    // Defensive support for an older/bad link: removing the receipt record must
    // still keep the original referenced by the import attempt.
    await f.t.run(ctx => ctx.db.insert("ingresos_documentos", { ingreso_id: id, proyecto: f.ids.project, storage_id: p.storageId, nombre: "Referencia anterior", type: "comprobante", size: bytes.length, uploaded_at: Date.now(), uploaded_by_id: f.ids.user, uploaded_by_name: "Actor" }));
    await f.writer.mutation(api.ingresos_documentos.removeByIngreso, { ingreso_id: id });
    await f.writer.mutation(api.ingresos.remove, { id });
    const after = await f.writer.query(api.incomeImportHistory.listAttemptItems, { attempt_id: p.attempt_id, paginationOpts: f.page });
    expect(after.page[0]).toMatchObject({ monto: 100, deleted: true });
    expect((await f.state()).totals[0]).toMatchObject({ total_ingresos: 250, total_count: 1 });
    expect(await f.t.run(async ctx => Boolean(await ctx.storage.get(p.storageId)))).toBe(true);
  });

  it("shows no invented import for legacy/manual income", async () => {
    const f = await fixture(); const id = await f.writer.mutation(api.ingresos.create, { proyecto: f.ids.project, monto: 10, fecha: "01/10/2026", moneda: "MXN" });
    expect(await f.writer.query(api.incomeImportHistory.getIngresoSource, { ingreso_id: id })).toBeNull();
    expect((await f.writer.query(api.incomeImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: f.page })).page).toEqual([]);
  });

  it.each(["user", "viewer", "contratista", "almacenista", "unknown"])("denies every import write to %s while retaining project reads", async role => {
    const f = await fixture(); const p = await f.prepare();
    await f.t.run(ctx => ctx.db.patch(f.ids.user, { role }));
    for (const [fn, args] of [[api.incomeImportHistory.startAttempt, { proyecto: f.ids.project, request_id: randomUUID(), file_name: fileName, file_hash: hash, size: bytes.length, content_type: mime, review_json: review() }], [api.incomeImportHistory.prepareUpload, { attempt_id: p.attempt_id }], [api.incomeImportHistory.attachFile, { attempt_id: p.attempt_id, storage_id: p.storageId }], [api.incomeImportHistory.failAttempt, { attempt_id: p.attempt_id, error: "x" }], [api.incomeImportHistory.recordTransferError, { attempt_id: p.attempt_id, error: "x" }], [api.ingresos.bulkCreate, { attempt_id: p.attempt_id, clerk_id: "second" }]]) await expect(f.writer.mutation(fn, args)).rejects.toThrow("Solo finance y admin");
    expect((await f.writer.query(api.incomeImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: f.page })).page).toHaveLength(1);
    expect(await f.writer.query(api.incomeImportHistory.getDownloadUrl, { attempt_id: p.attempt_id })).toMatchObject({ file_name: fileName });
    expect((await f.state()).incomes).toEqual([]);
  });

  it.each(["finance", "admin"])("accepts a backed-up import by %s using the session actor despite a spoofed clerk_id", async role => {
    const f = await fixture(role); const p = await f.prepare();
    await f.writer.mutation(api.ingresos.bulkCreate, { attempt_id: p.attempt_id, clerk_id: "second" });
    expect((await f.state()).incomes[0]).toMatchObject({ added_by_id: f.ids.user, added_by_name: "Actor de sesión" });
  });

  it("denies another initiator, revoked access and unauthenticated access across queries and writes", async () => {
    const f = await fixture(); const p = await f.prepare();
    const second = f.t.withIdentity({ subject: "second" });
    await expect(second.mutation(api.incomeImportHistory.attachFile, { attempt_id: p.attempt_id, storage_id: p.storageId })).rejects.toThrow("Solo quien inició");
    await expect(second.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id })).rejects.toThrow("Solo quien inició");
    await f.t.run(ctx => ctx.db.patch(f.ids.user, { allowed_desarrollos: [] }));
    const queries = [[api.incomeImportHistory.getAttempt, { attempt_id: p.attempt_id }], [api.incomeImportHistory.getRequestAttempt, { proyecto: f.ids.project, request_id: "x" }], [api.incomeImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: f.page }], [api.incomeImportHistory.listAttemptItems, { attempt_id: p.attempt_id, paginationOpts: f.page }], [api.incomeImportHistory.getDownloadUrl, { attempt_id: p.attempt_id }], [api.incomeImportHistory.findPreviousFile, { proyecto: f.ids.project, file_hash: hash }]];
    for (const [fn, args] of queries) { await expect(f.writer.query(fn, args)).rejects.toThrow(); await expect(f.t.query(fn, args)).rejects.toThrow(); }
    await expect(f.writer.mutation(api.incomeImportHistory.prepareUpload, { attempt_id: p.attempt_id })).rejects.toThrow("No tienes acceso");
    await expect(f.t.mutation(api.incomeImportHistory.prepareUpload, { attempt_id: p.attempt_id })).rejects.toThrow("Not authenticated");
    expect((await f.state()).attempts[0].status).toBe("processing");
    await expect(f.start({ proyecto: f.ids.other })).rejects.toThrow("No tienes acceso");
  });

  it("retains a transfer error for recovery, expires abandoned attempts, and never downgrades success", async () => {
    vi.useFakeTimers(); const f = await fixture(); const p = await f.prepare();
    await f.writer.mutation(api.incomeImportHistory.recordTransferError, { attempt_id: p.attempt_id, error: "Transferencia interrumpida" });
    expect((await f.state()).attempts[0]).toMatchObject({ status: "processing", error: "Transferencia interrumpida" });
    vi.advanceTimersByTime(INCOME_IMPORT_TIMEOUT + 1);
    await f.t.mutation(internal.incomeImportHistory.expireAttempt, { attempt_id: p.attempt_id });
    expect((await f.state()).attempts[0]).toMatchObject({ status: "failed", storage_id: p.storageId });
    await expect(f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id })).rejects.toThrow("30 minutos");
    const completed = await f.prepare();
    await f.writer.mutation(api.incomeImportHistory.recordTransferError, { attempt_id: completed.attempt_id, error: "Respuesta de adjunto perdida" });
    await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: completed.attempt_id });
    expect((await f.writer.query(api.incomeImportHistory.getAttempt, { attempt_id: completed.attempt_id })).error).toBeUndefined();
    vi.advanceTimersByTime(INCOME_IMPORT_TIMEOUT + 1); await f.t.mutation(internal.incomeImportHistory.expireAttempt, { attempt_id: completed.attempt_id });
    expect((await f.writer.query(api.incomeImportHistory.getAttempt, { attempt_id: completed.attempt_id })).status).toBe("completed");
  });

  it("supports 1,000 returned rows, partitions amounts by currency, and paginates snapshots", async () => {
    const f = await fixture(); const rows = Array.from({ length: 1000 }, (_, i) => ({ ...valid, monto: i + 1, rowIndex: i + 2, moneda: i % 2 ? "USD" : "MXN" }));
    const p = await f.prepare({ review_json: review(rows) });
    const result = await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id });
    expect(result.created).toBe(1000); expect(result.amounts).toEqual([{ moneda: "MXN", monto: 250000 }, { moneda: "USD", monto: 250500 }]);
    const first = await f.writer.query(api.incomeImportHistory.listAttemptItems, { attempt_id: p.attempt_id, paginationOpts: f.page });
    expect(first.page).toHaveLength(25); expect(first.isDone).toBe(false);
    const second = await f.writer.query(api.incomeImportHistory.listAttemptItems, { attempt_id: p.attempt_id, paginationOpts: { ...f.page, cursor: first.continueCursor } }); expect(second.page[0].position).toBe(26);
    expect((await f.state()).totals[0]).toMatchObject({ total_count: 1000, total_ingresos: 500500 });
  });

  it("purges income data/originals in bounded batches when the project is permanently deleted", async () => {
    vi.useFakeTimers(); const f = await fixture("admin");
    const p = await f.prepare({ review_json: review(Array.from({ length: 130 }, () => valid)) });
    await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id });
    await f.t.mutation(internal.incomeImportHistory.purgeDeletedProjectHistory, { proyecto: f.ids.project });
    expect((await f.state()).incomes).toHaveLength(130);
    await f.writer.mutation(api.desarrollos.deleteProject, { id: f.ids.project });
    await expect(f.writer.query(api.incomeImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: f.page })).rejects.toThrow("No tienes acceso");
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await f.state()).toEqual({ incomes: [], items: [], attempts: [], totals: [] });
    expect(await f.t.run(ctx => ctx.db.query("income_import_reviews").collect())).toEqual([]);
    expect(await f.t.run(ctx => ctx.storage.get(p.storageId))).toBeNull();
  });

  it("reconciles only unattached income upload objects and keeps shared/attached files", async () => {
    vi.useFakeTimers(); const f = await fixture(); const p = await f.prepare();
    const orphan = await f.store(p.attempt_id); const ordinary = await f.store(p.attempt_id, bytes, mime);
    vi.advanceTimersByTime(INCOME_IMPORT_TIMEOUT * 2 + 1);
    await f.t.mutation(internal.incomeImportHistory.cleanupUnattachedUploads, {});
    expect(await f.t.run(async ctx => Boolean(await ctx.storage.get(orphan)))).toBe(false);
    expect(await f.t.run(async ctx => Boolean(await ctx.storage.get(ordinary)))).toBe(true);
    expect(await f.t.run(async ctx => Boolean(await ctx.storage.get(p.storageId)))).toBe(true);
    const second = await f.start();
    await expect(f.writer.mutation(api.incomeImportHistory.attachFile, { attempt_id: second.attempt_id, storage_id: p.storageId })).rejects.toThrow("no pertenece");
  });

  it("retains a shared original until its last project's history is purged", async () => {
    vi.useFakeTimers(); const f = await fixture("admin"); const p = await f.prepare();
    const state = await f.state(); const { _id, _creationTime, ...metadata } = state.attempts[0];
    await f.t.run(ctx => ctx.db.insert("income_import_attempts", { ...metadata, proyecto: f.ids.other, request_id: randomUUID() }));
    await f.writer.mutation(api.desarrollos.deleteProject, { id: f.ids.project });
    await f.t.mutation(internal.incomeImportHistory.purgeDeletedProjectHistory, { proyecto: f.ids.project });
    expect(await f.t.run(async ctx => Boolean(await ctx.storage.get(p.storageId)))).toBe(true);
    await f.t.run(ctx => ctx.db.delete(f.ids.other));
    await f.t.mutation(internal.incomeImportHistory.purgeDeletedProjectHistory, { proyecto: f.ids.other });
    expect(await f.t.run(async ctx => Boolean(await ctx.storage.get(p.storageId)))).toBe(false);
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  it("keeps history metadata small and finishes purging large reviews even when a byte-limited batch has few rows", async () => {
    vi.useFakeTimers(); const f = await fixture("admin");
    for (let i = 0; i < 3; i++) {
      const p = await f.prepare({ review_json: review([{ ...valid, parser_note: "x".repeat(300 * 1024) }]) });
      await f.writer.action(api.incomeImportHistory.confirmImport, { attempt_id: p.attempt_id });
    }
    const history = await f.writer.query(api.incomeImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: f.page });
    expect(history.page).toHaveLength(3);
    expect(JSON.stringify(history).length).toBeLessThan(10000);
    await f.writer.mutation(api.desarrollos.deleteProject, { id: f.ids.project });
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await f.state()).toEqual({ incomes: [], items: [], attempts: [], totals: [] });
    expect(await f.t.run(ctx => ctx.db.query("income_import_reviews").collect())).toEqual([]);
  });

  it("validates formats, size, hash, row limits and review size without inventing history", async () => {
    const f = await fixture();
    for (const override of [{ file_name: "a.csv" }, { size: 0 }, { size: 10 * 1024 * 1024 + 1 }, { file_hash: "bad" }, { review_json: review([]) }, { review_json: review(Array.from({ length: 1001 }, () => valid)) }, { review_json: review([{ ...valid, descripcion: "x".repeat(512 * 1024) }]) }, { review_json: review([{ ...valid, descripcion: "x".repeat(400 * 1024) }]) }]) await expect(f.start(override)).rejects.toThrow();
    for (const ext of ["xls", "xlsm"]) await f.start({ file_name: `Original.${ext}` });
    expect((await f.state()).attempts).toHaveLength(2);
    // Existing normalization stays explicit: no calendar-rule or currency change.
    expect(parseIncomeReview(review([{ ...valid, fecha: "31/2/2026", moneda: "other" }])).rows[0]).toMatchObject({ fecha: "31/02/2026", moneda: "MXN", status: "valid" });
  });
});
