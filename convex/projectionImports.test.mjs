import { convexTest } from "convex-test";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { normalizeProjectionResponse, projectionReviewHash, PROJECTION_READER } from "./projectionImportRules";
import { projectionStorageType } from "./projectionImportHistory";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
const paginationOpts = { cursor: null, numItems: 25 };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function response(amount = 100, format = "projections") {
  const data = { success: true, fileName: "Lector.xlsx", sheetName: "Proyección", weekHeaders: [{ weekDate: "5/10/2026", weekDateRaw: 46300, columnLetter: "C", position: 0 }] };
  return format === "projections" ? { ...data, projections: [{ partida: "OBRA", rowIndex: 2, total: amount, weeklyProjections: [{ week: "5/10/2026", amount, position: 0, columnLetter: "C" }] }] }
    : { ...data, flujos: [{ label: "COBRO", rowIndex: 3, total: amount, declaredTotal: amount + 10, calculatedTotal: amount,
      weeklyAmounts: [{ week: "5/10/2026", amount, position: 0, columnLetter: "C" }] }] };
}
async function fixture(kind = "expense") {
  const test = convexTest(schema, modules);
  const ids = await test.run(async ctx => {
    const project = kind === "expense" ? await ctx.db.insert("desarrollos", { nombre: "Obra", descripcion: "", image: "", organization_id: "org-a" })
      : await ctx.db.insert("sales_projects", { nombre: "Ventas", descripcion: "", image: "", organization_id: "org-a" });
    const user = await ctx.db.insert("users", { clerkId: "writer", email: "writer@example.test", name: "María", role: "user", organization_id: "org-a",
      allowed_desarrollos: kind === "expense" ? [project] : [], allowed_sales_projects: kind === "collection" ? [project] : [], created_at: 0 });
    return { project, user };
  });
  return { test, ids, target: { kind, project_id: ids.project }, writer: test.withIdentity({ subject: "writer" }), format: kind === "expense" ? "projections" : "flujo" };
}
async function prepare(f, options = {}) {
  const raw = options.raw || response(options.amount ?? 100, f.format);
  const review = normalizeProjectionResponse(raw, f.format);
  const bytes = new TextEncoder().encode(options.bytes || `original:${options.amount ?? 100}`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const state = await f.writer.query(api.projectionImportHistory.getCurrentState, { target: f.target });
  const input = { target: f.target, format: f.format, request_id: options.request || randomUUID(), file_name: "Original · revisión 2.xlsx",
    file_hash: hash, size: bytes.length, content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    review_hash: await projectionReviewHash(review), expected_revision: state.revision };
  const started = await f.writer.mutation(api.projectionImportHistory.startAttempt, input);
  if (started.upload_url && options.attach !== false) {
    const storage_id = await f.test.run(async ctx => {
      const id = await ctx.storage.store(new Blob([bytes], { type: projectionStorageType(started.attempt_id) }));
      await ctx.db.patch(id, { sha256: hash, contentType: projectionStorageType(started.attempt_id) });
      return id;
    });
    await f.writer.mutation(api.projectionImportHistory.attachFile, { attempt_id: started.attempt_id, storage_id });
  }
  return { ...started, input, raw, review, bytes };
}
function reader(prepared, override) {
  const fetchMock = vi.fn(async (url, options) => {
    if (String(url).startsWith(PROJECTION_READER)) {
      const file = options.body.get("file");
      expect(file.name).toBe(prepared.input.file_name);
      expect(file.type).toBe(prepared.input.content_type);
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(prepared.bytes);
      return override ? override() : Response.json(prepared.raw);
    }
    return new Response(prepared.bytes);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
async function confirm(f, prepared) { reader(prepared); return f.writer.action(api.projectionImports.confirmImport, { attempt_id: prepared.attempt_id }); }
const attempt = (f, id) => f.writer.query(api.projectionImportHistory.getAttempt, { attempt_id: id });
const history = f => f.writer.query(api.projectionImportHistory.listHistory, { target: f.target, paginationOpts });
const live = f => f.test.run(ctx => ctx.db.query(f.target.kind === "expense" ? "projected_transactions" : "sales_projected_transactions").collect());

describe("projection reader contracts", () => {
  it("maps text dates through actual raw headers and preserves source metadata", () => {
    const result = normalizeProjectionResponse(response(100, "flujo"), "flujo");
    expect(result.rows[0]).toMatchObject({ rowIndex: 3, declaredTotal: 110, calculatedTotal: 100, weeklyProjections: [{ week: 46300, columnLetter: "C", amount: 100, position: 0 }] });
  });
  it("accepts numeric periods without inventing coordinates", () => {
    const result = normalizeProjectionResponse({ success: true, projections: [{ partida: "A", weeklyProjections: [{ week: 46300, amount: 0, position: 0 }] }] }, "projections");
    expect(result.rows[0].rowIndex).toBeUndefined(); expect(result.rows[0].weeklyProjections[0].columnLetter).toBeUndefined();
  });
  it.each(["missing date", "row errors", "empty", "invalid amount"])("rejects %s instead of replacing with partial data", cause => {
    const raw = response();
    if (cause === "missing date") raw.weekHeaders = [];
    if (cause === "row errors") raw.errors = [{ row: 4, error: "Invalid row" }];
    if (cause === "empty") raw.projections = [];
    if (cause === "invalid amount") raw.projections[0].weeklyProjections[0].amount = NaN;
    expect(() => normalizeProjectionResponse(raw, "projections")).toThrow();
  });
  it("limits imported cells before starting a replacement", () => {
    const raw = response(); raw.projections[0].weeklyProjections = Array.from({ length: 5001 }, () => ({ week: 46300, amount: 1, position: 0 }));
    expect(() => normalizeProjectionResponse(raw, "projections")).toThrow(/5000/);
  });
});

it("replaces a supported 5000-cell projection without counting current and historic versions together", async () => {
  const f = await fixture();
  function large(amount) {
    return { success: true, sheetName: "Proyección", projections: Array.from({ length: 100 }, (_, i) => ({ partida: `Partida ${i}`, rowIndex: i + 2,
      weeklyProjections: Array.from({ length: 50 }, (_, position) => ({ week: 46300 + position * 7, amount, position })) })) };
  }
  await confirm(f, await prepare(f, { raw: large(1) }));
  const next = await prepare(f, { raw: large(2), bytes: "second large original" });
  expect((await confirm(f, next)).outcome).toBe("replaced");
  const rows = await live(f); expect(rows).toHaveLength(5000); expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(10000);
  const totals = await f.test.run(ctx => ctx.db.query("weekly_projected_totals").collect());
  expect(totals).toHaveLength(50); expect(totals.reduce((sum, row) => sum + row.weekly_total, 0)).toBe(10000);
});

describe.each(["expense", "collection"])("audited %s projections", kind => {
  it("saves exact originals, snapshots and only the current financial data", async () => {
    const f = await fixture(kind); const first = await prepare(f);
    expect((await confirm(f, first)).outcome).toBe("created");
    const second = await prepare(f, { amount: 250 }); await confirm(f, second);
    expect((await live(f)).map(row => row.amount)).toEqual([250]);
    expect((await history(f)).page).toHaveLength(2);
    const old = await f.writer.query(api.projectionImportHistory.listAttemptItems, { attempt_id: first.attempt_id, paginationOpts });
    expect(old.page[0].row.weeklyProjections[0].amount).toBe(100);
    expect((await f.writer.query(api.projectionImportHistory.getDownloadUrl, { attempt_id: first.attempt_id })).file_name).toBe(first.input.file_name);
    const source = await f.writer.query(api.projectionImportHistory.getCurrentSource, { target: f.target, week: 46300 });
    expect(source.attempt._id).toBe(second.attempt_id); expect(source.rows[0].rowIndex).toBe(kind === "expense" ? 2 : 3);
    const totals = await f.test.run(ctx => ctx.db.query(kind === "expense" ? "weekly_projected_totals" : "sales_weekly_projected_totals").collect());
    expect(totals.map(row => row.weekly_total)).toEqual(kind === "expense" ? [250] : []);
    expect(await f.test.run(ctx => ctx.db.query("documentos").collect())).toEqual([]);
  });
  it("recovers the same request after commit and makes a separate unchanged confirmation", async () => {
    const f = await fixture(kind); const first = await prepare(f); const result = await confirm(f, first);
    const retry = await prepare(f, { request: first.input.request_id });
    expect(retry.attempt_id).toBe(first.attempt_id); expect(retry.result).toEqual(result);
    expect(await f.writer.action(api.projectionImports.confirmImport, { attempt_id: first.attempt_id })).toEqual(result);
    const next = await prepare(f); expect(next.attempt_id).not.toBe(first.attempt_id);
    expect((await confirm(f, next)).outcome).toBe("unchanged");
    expect((await attempt(f, next.attempt_id)).storage_id).toBe((await attempt(f, first.attempt_id)).storage_id);
    expect((await history(f)).page.filter(row => row.active).map(row => row._id)).toEqual([first.attempt_id]);
    expect(await live(f)).toHaveLength(1);
  });
  it("retains the backup and failure without changing current figures when the reader fails", async () => {
    const f = await fixture(kind); await confirm(f, await prepare(f)); const before = await live(f);
    const next = await prepare(f, { amount: 300 }); reader(next, () => new Response("failure", { status: 500 }));
    await expect(f.writer.action(api.projectionImports.confirmImport, { attempt_id: next.attempt_id })).rejects.toThrow(/lector/);
    expect(await live(f)).toEqual(before); expect((await attempt(f, next.attempt_id)).status).toBe("failed");
    expect((await f.writer.query(api.projectionImportHistory.getDownloadUrl, { attempt_id: next.attempt_id })).url).toBeTruthy();
    expect((await f.writer.query(api.projectionImportHistory.listAttemptItems, { attempt_id: next.attempt_id, paginationOpts })).page).toEqual([]);
  });
  it("rejects a changed reader response and a concurrent replacement", async () => {
    const f = await fixture(kind); const first = await prepare(f); const concurrent = await prepare(f, { amount: 400 });
    await confirm(f, first);
    await expect(confirm(f, concurrent)).rejects.toThrow(/cambiaron/);
    const next = await prepare(f, { amount: 200 }); reader(next, () => Response.json(response(900, f.format)));
    await expect(f.writer.action(api.projectionImports.confirmImport, { attempt_id: next.attempt_id })).rejects.toThrow(/cambió desde/);
    expect((await live(f))[0].amount).toBe(100);
  });
  it("requires an original and expires abandoned attempts without overwriting success", async () => {
    const f = await fixture(kind); const missing = await prepare(f, { attach: false });
    await expect(f.writer.action(api.projectionImports.confirmImport, { attempt_id: missing.attempt_id })).rejects.toThrow(/original no disponible/);
    expect((await history(f)).page.find(row => row._id === missing.attempt_id).file_available).toBe(false);
    if (kind === "expense") await expect(f.writer.mutation(api.weekly_projected_totals.uploadWeeklyTotals, { proyecto: f.ids.project, weeklyData: [] })).rejects.toThrow(/historial/);
    const pending = await prepare(f, { amount: 200, attach: false });
    await f.test.run(ctx => ctx.db.patch(pending.attempt_id, { created_at: Date.now() - 31 * 60000 }));
    await f.test.mutation(internal.projectionImportHistory.expireAttempt, { attempt_id: pending.attempt_id });
    expect((await attempt(f, pending.attempt_id)).status).toBe("failed");
    const completed = await prepare(f); await confirm(f, completed);
    await f.writer.mutation(api.projectionImportHistory.failAttempt, { attempt_id: completed.attempt_id, error: "lost response" });
    expect((await attempt(f, completed.attempt_id)).status).toBe("completed");
  });
  it.each(["hash", "size", "owner"])("rejects a storage object with wrong %s", async mismatch => {
    const f = await fixture(kind); const pending = await prepare(f, { attach: false });
    const storage_id = await f.test.run(async ctx => {
      const id = await ctx.storage.store(new Blob([mismatch === "size" ? "longer wrong bytes" : pending.bytes]));
      await ctx.db.patch(id, { sha256: mismatch === "hash" ? "a".repeat(64) : pending.input.file_hash,
        contentType: mismatch === "owner" ? "application/octet-stream" : projectionStorageType(pending.attempt_id) });
      return id;
    });
    await expect(f.writer.mutation(api.projectionImportHistory.attachFile, { attempt_id: pending.attempt_id, storage_id })).rejects.toThrow();
    expect(await live(f)).toEqual([]);
  });
  it("enforces project, organization, author and current write permissions", async () => {
    const f = await fixture(kind); const pending = await prepare(f);
    const identities = await f.test.run(async ctx => {
      const users = {};
      for (const [name, role, org, allowed] of [["other", "user", "org-a", true], ["viewer", "viewer", "org-a", true], ["foreign", "admin", "org-b", false]]) {
        users[name] = await ctx.db.insert("users", { clerkId: name, email: `${name}@example.test`, name, role, organization_id: org,
          allowed_desarrollos: allowed && kind === "expense" ? [f.ids.project] : [], allowed_sales_projects: allowed && kind === "collection" ? [f.ids.project] : [], created_at: 0 });
      }
      return users;
    });
    for (const name of ["other", "viewer"]) {
      const actor = f.test.withIdentity({ subject: name });
      expect((await actor.query(api.projectionImportHistory.listHistory, { target: f.target, paginationOpts })).page).toHaveLength(1);
      await expect(actor.action(api.projectionImports.confirmImport, { attempt_id: pending.attempt_id })).rejects.toThrow();
      await expect(actor.mutation(api.projectionImportHistory.attachFile, { attempt_id: pending.attempt_id, storage_id: (await attempt(f, pending.attempt_id)).storage_id })).rejects.toThrow();
    }
    for (const actor of [f.test, f.test.withIdentity({ subject: "foreign" })]) {
      await expect(actor.query(api.projectionImportHistory.getDownloadUrl, { attempt_id: pending.attempt_id })).rejects.toThrow();
      await expect(actor.query(api.projectionImportHistory.listHistory, { target: f.target, paginationOpts })).rejects.toThrow();
    }
    await f.test.run(ctx => ctx.db.patch(f.ids.user, { role: "viewer" }));
    await expect(f.writer.action(api.projectionImports.confirmImport, { attempt_id: pending.attempt_id })).rejects.toThrow();
    expect(await live(f)).toEqual([]); expect(identities.other).toBeTruthy();
  });
  it("captures legacy values before replacement and blocks bypasses afterwards", async () => {
    const f = await fixture(kind);
    await f.test.run(ctx => ctx.db.insert(kind === "expense" ? "projected_transactions" : "sales_projected_transactions", {
      [kind === "expense" ? "proyecto" : "sales_proyecto"]: f.ids.project, partida: "ANTERIOR", week_date: 46300, amount: 40, position: 0,
      file_name: "Anterior.xls", sheet_name: "Hoja", upload_id: "legacy-upload", uploaded_at: 100,
    }));
    await confirm(f, await prepare(f));
    const legacy = (await history(f)).page.find(row => row.status === "legacy");
    expect(legacy).toMatchObject({ file_name: "Anterior.xls", imported_by_name: "Autor no disponible", file_available: false });
    const items = await f.writer.query(api.projectionImportHistory.listAttemptItems, { attempt_id: legacy._id, paginationOpts });
    expect(items.page[0].row).toEqual({ partida: "ANTERIOR", weeklyProjections: [{ week: 46300, amount: 40, position: 0 }] });
    if (kind === "expense") {
      await expect(f.writer.mutation(api.weekly_projected_totals.uploadWeeklyTotals, { proyecto: f.ids.project, weeklyData: [] })).rejects.toThrow(/historial/);
      await expect(f.writer.mutation(api.weekly_projected_totals.deleteByProject, { proyecto: f.ids.project })).rejects.toThrow(/historial/);
    }
    await expect(f.writer.mutation(kind === "expense" ? api.projected_transactions.uploadProjections : api.sales_projected_transactions.uploadSalesProjections, {})).rejects.toThrow(/Recarga/);
  });
  it("purges archives and shared files in batches after project deletion", async () => {
    vi.useFakeTimers();
    const f = await fixture(kind); const first = await prepare(f); await confirm(f, first);
    await confirm(f, await prepare(f));
    const storage = (await attempt(f, first.attempt_id)).storage_id;
    await f.test.run(async ctx => {
      await ctx.db.patch(f.ids.user, { role: "admin" });
      for (let i = 0; i < 55; i++) await ctx.db.insert("projection_import_items", { scope: `${kind}:${f.ids.project}`, attempt_id: first.attempt_id, row: { partida: `Histórica ${i}`, weeklyProjections: [{ week: 46300, amount: 1, position: 0 }] } });
    });
    await f.writer.mutation(kind === "expense" ? api.desarrollos.deleteProject : api.sales_projects.deleteProject, { id: f.ids.project });
    await expect(f.writer.query(api.projectionImportHistory.getDownloadUrl, { attempt_id: first.attempt_id })).rejects.toThrow();
    await f.test.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await f.test.run(ctx => ctx.db.query("projection_import_attempts").collect())).toEqual([]);
    expect(await f.test.run(ctx => ctx.db.query("projection_import_items").collect())).toEqual([]);
    expect(await f.test.run(ctx => ctx.db.system.get(storage))).toBeNull();
    expect(await live(f)).toEqual([]);
  });
  it("cleans unassociated upload objects while retaining attached and unrelated files", async () => {
    const f = await fixture(kind); const current = await prepare(f); const saved = await attempt(f, current.attempt_id);
    const ids = await f.test.run(async ctx => {
      const orphan = await ctx.storage.store(new Blob(["unassociated"], { type: projectionStorageType(current.attempt_id) }));
      const unrelated = await ctx.storage.store(new Blob(["other feature"], { type: "application/octet-stream" }));
      await ctx.db.patch(orphan, { contentType: projectionStorageType(current.attempt_id) });
      return { orphan, unrelated };
    });
    await f.test.mutation(internal.projectionImportHistory.cleanupUploadObjects, { attempt_id: current.attempt_id, created_at: saved.created_at, cursor: null });
    expect(await f.test.run(ctx => ctx.db.system.get(ids.orphan))).toBeNull();
    expect(await f.test.run(ctx => ctx.db.system.get(ids.unrelated))).not.toBeNull();
    expect(await f.test.run(ctx => ctx.db.system.get(saved.storage_id))).not.toBeNull();
  });
  it("keeps legacy migration diagnostic and repeatable, including mixed old upload IDs", async () => {
    const f = await fixture(kind);
    await f.test.run(async ctx => {
      for (const upload_id of ["old-a", "old-b"]) await ctx.db.insert(kind === "expense" ? "projected_transactions" : "sales_projected_transactions", {
        [kind === "expense" ? "proyecto" : "sales_proyecto"]: f.ids.project, partida: "LEGACY", week_date: 46300, amount: 10, position: 0,
        file_name: `${upload_id}.xls`, sheet_name: "Hoja", upload_id, uploaded_at: 100,
      });
    });
    const before = await live(f);
    const input = { kind, cursor: null, dry_run: true };
    expect((await f.test.mutation(internal.projectionImports.migrateLegacy, input)).pending).toBe(1);
    expect((await history(f)).page).toEqual([]);
    await f.test.mutation(internal.projectionImports.migrateLegacy, { ...input, dry_run: false });
    expect((await f.test.mutation(internal.projectionImports.migrateLegacy, input)).pending).toBe(0);
    await f.test.mutation(internal.projectionImports.migrateLegacy, { ...input, dry_run: false });
    expect((await history(f)).page).toHaveLength(2); expect(await live(f)).toEqual(before);
    const source = await f.writer.query(api.projectionImportHistory.getCurrentSource, { target: f.target });
    expect(source.attempt).toBeNull(); expect(source.legacy_file_names.sort()).toEqual(["old-a.xls", "old-b.xls"]);
  });
  it("rejects request reuse for different reviewed contents", async () => {
    const f = await fixture(kind); const first = await prepare(f);
    await expect(prepare(f, { request: first.input.request_id, amount: 777 })).rejects.toThrow(/otro archivo/);
    expect((await history(f)).page).toHaveLength(1);
  });
});
