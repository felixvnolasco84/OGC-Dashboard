import { convexTest } from "convex-test";
import { createHash, randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { budgetNumber, parseBudgetResponse, budgetStorageType, BUDGET_RETENTION_MS, BUDGET_IDLE_MS } from "./budgetImportRules";
import * as partidaModule from "./partida";
import * as historyModule from "./budgetCreationHistory";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
const rows = [
  { nivel: 1, nombre: "OBRA", familia: "", sub_partida: "", unidad: "", cantidad: 1, precio_unitario: 100, presupuesto_original: 100, presupuesto_aprobado: 120, pagado: 0 },
  { nivel: 2, nombre: "OBRA", familia: "ACERO", sub_partida: "", unidad: "", cantidad: 1, precio_unitario: 100, presupuesto_original: 100, presupuesto_aprobado: 120, pagado: 0 },
  { nivel: 3, nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA", unidad: "kg", cantidad: "1,000", precio_unitario: "$0.10", presupuesto_original: 100, presupuesto_aprobado: 120, pagado: 0,
    weeklyPayments: [{ week: 46315, amount: 40, position: 1, columnLetter: "M" }, { week: 46322, amount: 0, position: 2, columnLetter: "N" }, { week: 46329, amount: -5, position: 3, columnLetter: "O" }] },
];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T18:00:00Z")); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function store(t, content, type) {
  const file = new Blob([content], { type });
  return t.run(async ctx => {
    const id = await ctx.storage.store(file);
    // Match real Convex metadata; convex-test 0.0.41 omits MIME and uses base64.
    await ctx.db.patch(id, { contentType: type, sha256: createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex") });
    return id;
  });
}
async function fixture(name = "Presupuesto original · revisión 2.xlsx") {
  const t = convexTest(schema, modules);
  const users = await t.run(async ctx => {
    const add = (clerkId, organization_id, role = "admin") => ctx.db.insert("users", { clerkId, organization_id, role, email: `${clerkId}@test.invalid`, name: clerkId, allowed_desarrollos: [], created_at: 0 });
    return { owner: await add("owner", "org"), colleague: await add("colleague", "org"), outsider: await add("outsider", "other"), viewer: await add("viewer", "org", "viewer") };
  });
  const owner = t.withIdentity({ subject: "owner" });
  const bytes = new TextEncoder().encode("original bytes, formulas and format preserved");
  const args = { request_id: randomUUID(), form: { nombre: "Obra de prueba", descripcion: "Presupuesto inicial", honorarios_porcentaje: 10 },
    file_name: name, file_hash: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, content_type: "application/octet-stream" };
  const attemptId = await owner.mutation(api.budgetCreationHistory.start, args);
  const get = () => owner.query(api.budgetCreationHistory.get, { attempt_id: attemptId });
  const attach = async (kind, contents, extra = {}) => {
    const storage_id = await store(t, contents, budgetStorageType(attemptId, kind));
    await owner.mutation(internal.budgetCreationHistory.attachStored, { attempt_id: attemptId, kind, storage_id, ...extra });
    return storage_id;
  };
  const prepare = async () => {
    await attach("original", bytes);
    const manifest = parseBudgetResponse({ success: true, data: structuredClone(rows) });
    await attach("manifest", JSON.stringify(manifest), { row_count: 3, payment_count: 1 });
    return manifest;
  };
  const begin = async () => { await owner.mutation(api.budgetCreation.claim, { attempt_id: attemptId }); return owner.mutation(internal.budgetCreation.beginProject, { attempt_id: attemptId }); };
  const snapshot = () => t.run(async ctx => Object.fromEntries(await Promise.all(["desarrollos", "partidas", "transacciones", "pagos", "budget_creation_items"].map(async name => [name, await ctx.db.query(name).collect()]))));
  return { t, users, owner, args, bytes, attemptId, get, attach, prepare, begin, snapshot };
}

describe("initial construction budgets with preserved originals", () => {
  it("rejects old unbacked creation calls and invalid file metadata", async () => {
    const f = await fixture();
    await expect(f.owner.mutation(api.desarrollos.create, { ...f.args.form, image: "" })).rejects.toThrow(/Actualiza/);
    for (const extra of [{ size: 0 }, { size: 11 * 1024 * 1024 }, { file_name: "not-an-excel.pdf" }, { file_hash: "invalid" }]) {
      await expect(f.owner.mutation(api.budgetCreationHistory.start, { ...f.args, request_id: randomUUID(), ...extra })).rejects.toThrow(/inválidos/);
    }
    expect((await f.snapshot()).desarrollos).toHaveLength(0);
  });
  it("uploads and interprets the exact stored bytes once before creating the project", async () => {
    const f = await fixture();
    // Adapt only the convex-test metadata representation at the storage boundary.
    const attach = historyModule.attachStored._handler;
    vi.spyOn(historyModule.attachStored, "_handler").mockImplementation(async (ctx, args) => {
      const metadata = await ctx.db.system.get(args.storage_id);
      if (!metadata.contentType) await ctx.db.patch(args.storage_id, { contentType: budgetStorageType(args.attempt_id, args.kind), sha256: Buffer.from(metadata.sha256, "base64").toString("hex") });
      return attach(ctx, args);
    });
    const response = await f.owner.fetch(`/initial-budget/original?attempt_id=${f.attemptId}`, { method: "POST", headers: { Origin: "http://localhost:4207" }, body: f.bytes });
    expect(response.status).toBe(200);
    let processed;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const file = init.body.get("file"); processed = new Uint8Array(await file.arrayBuffer()); expect(file.name).toBe(f.args.file_name);
      expect((await f.snapshot()).desarrollos).toHaveLength(0);
      return Response.json({ success: true, data: rows });
    }));
    expect(await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).toMatchObject({ completed: true });
    expect(processed).toEqual(f.bytes);
    expect((await f.get()).manifest_id).toBeTruthy();
    await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("starts only on confirmation, recovers the request and rejects changed inputs", async () => {
    const f = await fixture();
    expect((await f.snapshot()).desarrollos).toHaveLength(0);
    expect(await f.owner.mutation(api.budgetCreationHistory.start, f.args)).toBe(f.attemptId);
    await expect(f.owner.mutation(api.budgetCreationHistory.start, { ...f.args, form: { ...f.args.form, nombre: "Different" } })).rejects.toThrow(/otro archivo o formulario/);
    expect((await f.get()).file_available).toBe(false);
  });
  it.each(["xls", "xlsx"])("preserves original bytes and filename for %s downloads with authorization", async extension => {
    const f = await fixture(`Origen con fórmulas · revisión.${extension}`);
    await f.attach("original", f.bytes);
    const path = `/initial-budget/original?attempt_id=${f.attemptId}`;
    const response = await f.owner.fetch(path, { headers: { Origin: "http://localhost:4207" } });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(f.bytes);
    expect(response.headers.get("Content-Disposition")).toContain(encodeURIComponent(f.args.file_name));
    expect((await f.t.fetch(path, { headers: { Origin: "http://localhost:4207" } })).status).toBe(401);
    expect((await f.t.withIdentity({ subject: "outsider" }).fetch(path, { headers: { Origin: "http://localhost:4207" } })).status).toBe(400);
  });
  it("requires original verification before project creation and rejects mismatching bytes", async () => {
    const f = await fixture();
    await expect(f.begin()).rejects.toThrow(/original/);
    await expect(f.attach("original", "different")).rejects.toThrow(/no coincide/);
    expect((await f.snapshot()).desarrollos).toHaveLength(0);
  });
  it("imports sequential hierarchy, original values, weekly pending transactions and snapshots", async () => {
    const f = await fixture(); await f.prepare();
    const result = await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    expect(result.completed).toBe(true);
    const state = await f.snapshot();
    expect(state.desarrollos).toHaveLength(1); expect(state.partidas).toHaveLength(3); expect(state.transacciones).toHaveLength(1); expect(state.pagos).toHaveLength(1);
    expect(state.partidas.find(p => p.nivel === 3)).toMatchObject({ cantidad: 1000, precio_unitario: 0.1, partida_nombre: "OBRA", familia: "ACERO", archivo_origen: f.args.file_name });
    expect(state.partidas.find(p => p.nivel === 1)).toMatchObject({ presupuesto_original: 100, presupuesto_aprobado: 120 });
    expect(state.transacciones[0]).toMatchObject({ monto_total: 40, status: "Pendiente", moneda: "MXN", codigo_referencia: "Week-1", factura: "", comprobante: "", presupuesto_archivo: "" });
    expect(state.desarrollos[0].initial_budget_status).toBe("completed");
    expect((await f.get())).toMatchObject({ partidas_created: 3, payments_created: 1, status: "completed" });
    expect(state.budget_creation_items).toHaveLength(4);
  });
  it("does not duplicate projects, rows or transactions on concurrent retries", async () => {
    const f = await fixture(); await f.prepare();
    await Promise.all([f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId }), f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })]);
    const before = await f.snapshot();
    await f.owner.mutation(api.budgetCreationHistory.pause, { attempt_id: f.attemptId, error: "lost response" });
    expect(await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).toMatchObject({ completed: true });
    expect(await f.snapshot()).toEqual(before);
    expect(before.desarrollos).toHaveLength(1); expect(before.partidas).toHaveLength(3); expect(before.transacciones).toHaveLength(1);
  });
  it("rolls back a failed step, retains partial work and resumes the exact manifest", async () => {
    const f = await fixture(); const manifest = await f.prepare(); await f.begin();
    await f.owner.mutation(internal.budgetCreation.applyNext, { attempt_id: f.attemptId, row_index: 0, payment_index: -1, row: manifest.rows[0] });
    // Simulate a transient failure in an existing financial operation.
    const failure = vi.spyOn(partidaModule, "createBudgetPartidaRecord").mockRejectedValueOnce(new Error("transient failure"));
    await expect(f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).rejects.toThrow(/transient/);
    expect((await f.snapshot()).partidas).toHaveLength(1);
    expect((await f.get())).toMatchObject({ row_cursor: 1, status: "failed", partidas_created: 1 });
    failure.mockRestore();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Must use frozen manifest"); }));
    expect(await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).toMatchObject({ completed: true });
    expect((await f.snapshot()).partidas).toHaveLength(3);
  });
  it("fences a repeated operation after a lost step response", async () => {
    const f = await fixture(); const manifest = await f.prepare(); await f.begin();
    const args = { attempt_id: f.attemptId, row_index: 0, payment_index: -1, row: manifest.rows[0] };
    await f.owner.mutation(internal.budgetCreation.applyNext, args); await f.owner.mutation(internal.budgetCreation.applyNext, args);
    expect((await f.snapshot()).partidas).toHaveLength(1); expect((await f.get()).row_cursor).toBe(1);
  });
  it("continues a larger creation in bounded calls without losing its position", async () => {
    const f = await fixture(); await f.attach("original", f.bytes);
    const manifest = parseBudgetResponse({ success: true, data: Array.from({ length: 14 }, (_, index) => ({ ...rows[0], nombre: `PARTIDA ${index}` })) });
    await f.attach("manifest", JSON.stringify(manifest), { row_count: 14, payment_count: 0 });
    expect(await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).toMatchObject({ completed: false });
    expect((await f.get()).partidas_created).toBe(10);
    expect(await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).toMatchObject({ completed: true });
    expect((await f.snapshot()).partidas).toHaveLength(14);
  });
  it("blocks manual budget/payment changes during an incomplete creation", async () => {
    const f = await fixture(); const manifest = await f.prepare(); const projectId = await f.begin();
    await expect(f.owner.mutation(api.partida.createPartida, { ...manifest.rows[0], payments: undefined, raw_json: undefined, proyecto: projectId, archivo_origen: "manual" })).rejects.toThrow();
    await expect(f.owner.mutation(api.partida.syncProjectData, { projectId })).rejects.toThrow(/incompleta/);
    await expect(f.owner.mutation(api.desarrollos.update, { id: projectId, nombre: "Changed" })).rejects.toThrow(/incompleta/);
  });
  it("enforces creator, organization and current role for writes", async () => {
    const f = await fixture(); await f.prepare();
    await expect(f.t.withIdentity({ subject: "outsider" }).query(api.budgetCreationHistory.get, { attempt_id: f.attemptId })).rejects.toThrow(/acceso/);
    await expect(f.t.withIdentity({ subject: "colleague" }).action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).rejects.toThrow(/quien inició/);
    await f.t.run(ctx => ctx.db.patch(f.users.owner, { role: "viewer" }));
    await expect(f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).rejects.toThrow();
    expect((await f.snapshot()).desarrollos).toHaveLength(0);
  });
  it("allows assigned viewers to download but never resume or browse organization attempts", async () => {
    const f = await fixture(); await f.prepare(); await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    const proyecto = (await f.get()).proyecto;
    await f.t.run(ctx => ctx.db.patch(f.users.viewer, { allowed_desarrollos: [proyecto] }));
    const viewer = f.t.withIdentity({ subject: "viewer" });
    expect(await viewer.query(api.budgetCreationHistory.get, { attempt_id: f.attemptId })).toMatchObject({ file_available: true, can_resume: false });
    expect((await viewer.fetch(`/initial-budget/original?attempt_id=${f.attemptId}`, { headers: { Origin: "http://localhost:4207" } })).status).toBe(200);
    await expect(viewer.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).rejects.toThrow(/quien inició/);
    await expect(viewer.query(api.budgetCreationHistory.list, { paginationOpts: { cursor: null, numItems: 25 } })).rejects.toThrow(/administrador/);
  });
  it("returns provenance for partidas and payments, preserving snapshots after deletion", async () => {
    const f = await fixture(); await f.prepare(); await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    const state = await f.snapshot(), leaf = state.partidas.find(p => p.nivel === 3), tx = state.transacciones[0];
    expect(await f.owner.query(api.budgetCreationHistory.source, { partida_id: leaf._id })).toMatchObject({ attempt_id: f.attemptId });
    expect(await f.owner.query(api.budgetCreationHistory.source, { transaccion_id: tx._id })).toMatchObject({ attempt_id: f.attemptId });
    await f.owner.mutation(api.transacciones.deleteTransaction, { id: tx._id });
    const items = await f.owner.query(api.budgetCreationHistory.items, { attempt_id: f.attemptId, paginationOpts: { cursor: null, numItems: 25 } });
    expect(items.page.find(i => i.transaccion_id)).toMatchObject({ deleted: true });
    expect((await f.get()).file_available).toBe(true);
  });
  it("retains the original on reader failure without creating a project", async () => {
    const f = await fixture(); await f.attach("original", f.bytes);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("reader down", { status: 503 })));
    await expect(f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).rejects.toThrow(/503/);
    expect((await f.get())).toMatchObject({ status: "failed", file_available: true });
    expect((await f.snapshot()).desarrollos).toHaveLength(0);
  });
  it("expires unbound attempts after 30 days, but preserves incomplete projects", async () => {
    const f = await fixture(); await f.prepare(); const original = (await f.get()).storage_id;
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + BUDGET_RETENTION_MS + 1);
    await f.t.mutation(internal.budgetCreationHistory.expireUnbound, { attempt_id: f.attemptId });
    expect(await f.t.run(ctx => ctx.db.get(f.attemptId))).toBeNull(); expect(await f.t.run(ctx => ctx.db.system.get(original))).toBeNull();
    vi.setSystemTime(new Date("2026-10-21T18:00:00Z"));
    const g = await fixture(); await g.prepare(); await g.begin();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + BUDGET_RETENTION_MS + 1);
    await g.t.mutation(internal.budgetCreationHistory.expireUnbound, { attempt_id: g.attemptId });
    expect((await g.get()).file_available).toBe(true);
  });
  it("expires inactivity without losing progress and allows recovery", async () => {
    const f = await fixture(); await f.prepare(); await f.begin();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + BUDGET_IDLE_MS + 1);
    await f.t.mutation(internal.budgetCreation.expireIdle, { attempt_id: f.attemptId });
    expect((await f.get()).status).toBe("failed");
    expect(await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId })).toMatchObject({ completed: true });
  });
  it("cleans originals and snapshots after definitive project deletion", async () => {
    const f = await fixture(); await f.prepare(); await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    const attempt = await f.get(); await f.owner.mutation(api.desarrollos.deleteProject, { id: attempt.proyecto });
    await expect(f.get()).rejects.toThrow(/acceso/);
    await f.t.mutation(internal.budgetCreationHistory.purgeDeleted, { attempt_id: f.attemptId });
    expect(await f.t.run(ctx => ctx.db.get(f.attemptId))).toBeNull();
    expect(await f.t.run(ctx => ctx.db.system.get(attempt.storage_id))).toBeNull();
    expect(await f.t.run(ctx => ctx.db.system.get(attempt.manifest_id))).toBeNull();
    expect((await f.snapshot()).budget_creation_items).toHaveLength(0);
  });
  it("reconciles only unreferenced files marked as budget uploads", async () => {
    const f = await fixture(); const kept = await f.attach("original", f.bytes);
    const orphan = await store(f.t, "unattached", budgetStorageType(f.attemptId, "original"));
    const unrelated = await store(f.t, "unrelated document", "application/pdf");
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3 * BUDGET_IDLE_MS);
    await f.t.mutation(internal.budgetCreationHistory.cleanup, {});
    expect(await f.t.run(ctx => ctx.db.system.get(orphan))).toBeNull();
    expect(await f.t.run(ctx => ctx.db.system.get(kept))).not.toBeNull(); expect(await f.t.run(ctx => ctx.db.system.get(unrelated))).not.toBeNull();
  });
  it("purges histories in bounded batches after project removal", async () => {
    const f = await fixture(); await f.prepare(); await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    const state = await f.snapshot(); const attempt = await f.get();
    await f.t.run(async ctx => {
      for (let index = 0; index < 110; index++) await ctx.db.insert("budget_creation_items", { attempt_id: f.attemptId, proyecto: attempt.proyecto,
        source_index: index + 10, partida_id: state.partidas[0]._id, snapshot_json: "{}" });
      await ctx.db.delete(attempt.proyecto);
    });
    await f.t.mutation(internal.budgetCreationHistory.purgeDeleted, { attempt_id: f.attemptId });
    expect((await f.snapshot()).budget_creation_items).toHaveLength(14);
    expect(await f.t.run(ctx => ctx.db.get(f.attemptId))).not.toBeNull();
    await f.t.mutation(internal.budgetCreationHistory.purgeDeleted, { attempt_id: f.attemptId });
    expect((await f.snapshot()).budget_creation_items).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.system.get(attempt.storage_id))).toBeNull();
  });
  it("preserves legacy filename references without inventing an original", async () => {
    const f = await fixture(); await f.prepare(); await f.owner.action(api.budgetCreation.continueCreation, { attempt_id: f.attemptId });
    const project = (await f.get()).proyecto;
    const id = await f.t.run(ctx => ctx.db.insert("partidas", { proyecto: project, ...rows[0], archivo_origen: "Histórico.xls" }));
    expect(await f.owner.query(api.budgetCreationHistory.source, { partida_id: id })).toMatchObject({ attempt_id: null, legacy_name: "Histórico.xls" });
  });
  it("normalizes known numeric formats and rejects invalid data before any creation", () => {
    expect(["$1,234.56", "1.234,56", "(2,50)", "1,000", ""].map(budgetNumber)).toEqual([1234.56, 1234.56, -2.5, 1000, 0]);
    expect(() => budgetNumber("invalid")).toThrow(/interpretar/);
    expect(() => parseBudgetResponse({ success: true, data: [rows[2]] })).toThrow(/padre/);
    expect(() => parseBudgetResponse({ success: true, data: [{ ...rows[0], cantidad: "invalid" }] })).toThrow(/interpretar/);
  });
});
