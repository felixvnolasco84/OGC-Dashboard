import { convexTest } from "convex-test";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { deleteProjectProgramHistory } from "./programaObraImportHistory";
import { PROGRAM_IMPORT_TIMEOUT } from "./programaObraImportValidators";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const page = { cursor: null, numItems: 25 };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const test = convexTest(schema, modules);
  const ids = await test.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra ficticia", descripcion: "", image: "" });
    const other = await ctx.db.insert("desarrollos", { nombre: "Otra obra", descripcion: "", image: "" });
    const user = await ctx.db.insert("users", { clerkId: "writer", name: "Planeador", role: "admin", email: "writer@example.test", allowed_desarrollos: [project], created_at: 0 });
    const outsider = await ctx.db.insert("users", { clerkId: "outsider", name: "Sin acceso", role: "user", email: "other@example.test", allowed_desarrollos: [other], created_at: 0 });
    const root = await ctx.db.insert("partidas", { proyecto: project, nivel: 1, nombre: "ESTRUCTURA", familia: "", sub_partida: "", unidad: "", cantidad: 0, precio_unitario: 0, presupuesto_original: 1000, presupuesto_aprobado: 1000, pagado: 0, por_gastar: 1000, archivo_origen: "" });
    return { project, other, user, outsider, root };
  });
  const writer = test.withIdentity({ subject: "writer" });
  const rows = () => [
    { nivel: 1, partida: "ESTRUCTURA", fecha_inicio: "01/10/2026", fecha_fin: "31/12/2026", peso: 100 },
    { nivel: 2, partida: "ESTRUCTURA", familia: "Cimentación", fecha_inicio: "01/10/2026", fecha_fin: "10/10/2026", peso: 50 },
    { nivel: 2, partida: "ESTRUCTURA", familia: "Columnas", fecha_inicio: "12/10/2026", fecha_fin: "20/10/2026", peso: 50 },
  ];
  const prepare = async (input = rows(), options = {}) => {
    const preview = await writer.query(api.programa_obra.previewExcelImport, { proyecto: ids.project, rows: input });
    const payload = { proyecto: ids.project, rows: input, expected_fingerprint: options.fingerprint ?? preview.fingerprint, review: options.review ?? { date_resolutions: [] } };
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(input), "Programa");
    const ext = options.ext ?? "xlsx";
    const bytes = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: ext === "xls" ? "biff8" : "xlsx" }));
    const file = new Blob([bytes], { type: ext === "xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const startArgs = { ...payload, request_id: options.request ?? randomUUID(), source: { file_name: `Programa original · revisión ñ.${ext}`, file_hash: digest(bytes), sheet_name: "Programa" }, size: file.size, content_type: file.type };
    const started = await writer.mutation(api.programaObraImportHistory.startAttempt, startArgs);
    const inputArgs = { ...payload, attempt_id: started.attempt_id };
    const attach = async (blob = file) => {
      const storage_id = await test.run(async ctx => {
        const id = await ctx.storage.store(blob);
        // Real Storage returns hex; convex-test 0.0.41 returns base64.
        await ctx.db.patch(id, { sha256: digest(new Uint8Array(await blob.arrayBuffer())), contentType: blob.type });
        return id;
      });
      await writer.mutation(api.programaObraImportHistory.attachFile, { attempt_id: started.attempt_id, storage_id });
      return storage_id;
    };
    if (options.attach !== false && started.upload_url) await attach();
    return { input: inputArgs, started, startArgs, bytes, attach };
  };
  const snapshot = () => test.run(async ctx => Object.fromEntries(await Promise.all(["programa_obra", "programa_obra_detalle", "programa_obra_activities", "programa_obra_config", "programa_obra_import_items", "programa_obra_revisions"].map(async table => [table, await ctx.db.query(table).collect()]))));
  const apply = async input => writer.action(api.programaObraImportHistory.confirmImport, input);
  return { test, writer, ids, rows, prepare, snapshot, apply };
}

describe("program workbook originals and atomic audit", () => {
  for (const ext of ["xls", "xlsx"]) it(`preserves exact ${ext} bytes/name before configuration and links only reviewed rows`, async () => {
    const f = await fixture(), p = await f.prepare(undefined, { ext });
    const result = await f.apply(p.input);
    expect(result).toMatchObject({ status: "created", created: 3, updated: 0, unchanged: 0, version: 0 });
    const attempt = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id });
    const download = await f.writer.query(api.programaObraImportHistory.getDownloadUrl, { attempt_id: attempt._id });
    expect(download.file_name).toBe(p.startArgs.source.file_name);
    const stored = await f.test.run(async ctx => (await ctx.storage.get(attempt.storage_id)).arrayBuffer());
    expect(Buffer.from(stored)).toEqual(p.bytes);
    const state = await f.snapshot(); expect(state.programa_obra_revisions).toHaveLength(1);
    expect(state.programa_obra_revisions[0].import_attempt_id).toBe(attempt._id);
    expect(state.programa_obra_import_items).toHaveLength(3);
    expect(state.programa_obra_import_items.every(i => i.kind === "row")).toBe(true);
    expect(state.programa_obra_import_items.map(i => i.review_index)).toEqual([0, 1, 2]);
    const response = await f.writer.query(api.programaObraImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: page });
    expect(response.page[0].file_available).toBe(true); expect(response.page[0].reviewed_json).toBeUndefined();
  });

  it("recovers one terminal confirmation before stale fingerprint checks; new confirmation creates a separate unchanged event", async () => {
    const f = await fixture(), p = await f.prepare();
    const [first, simultaneous] = await Promise.all([f.apply(p.input), f.apply(p.input)]);
    expect(simultaneous).toEqual(first);
    expect(await f.apply(p.input)).toEqual(first);
    const restarted = await f.writer.mutation(api.programaObraImportHistory.startAttempt, p.startArgs);
    expect(restarted.result).toEqual(first); expect(restarted.upload_url).toBeNull();
    const next = await f.prepare(); expect(next.started.upload_url).toBeNull();
    expect(next.started.attempt_id).not.toBe(p.input.attempt_id);
    expect(await f.apply(next.input)).toMatchObject({ status: "unchanged", created: 0, updated: 0, unchanged: 3 });
    const state = await f.snapshot(); expect(state.programa_obra_import_items).toHaveLength(6); expect(state.programa_obra_revisions).toHaveLength(2);
    await expect(f.writer.mutation(api.programaObraImportHistory.startAttempt, { ...p.startArgs, source: { ...p.startArgs.source, file_name: "otro.xlsx" } })).rejects.toThrow(/identificador/);
    await expect(f.writer.mutation(api.programa_obra.bulkUpsertFromExcel, { ...p.input, rows: p.input.rows.slice(0, 1) })).rejects.toThrow(/otra revisión/);
  });

  it("keeps omissions out of direct sources and preserves identity, actual dates and audit after rename/archive/delete", async () => {
    const f = await fixture(); await f.apply((await f.prepare()).input);
    const state = await f.snapshot(), [a, b] = state.programa_obra_detalle;
    await f.test.run(ctx => ctx.db.patch(a._id, { avance_porcentaje: 50, actual_start: "2026-10-01", progress_as_of: "2026-10-05" }));
    const review = { date_resolutions: [{ partida_index: 0, child_index: 0, partida: "ESTRUCTURA", child: "Renombrada", parent_finish: "31/12/2026", child_finish: "02/01/2027", choice: "parent" }] };
    const p = await f.prepare([{ ...f.rows()[1], familia: "Renombrada", detalle_id: a._id }], { review });
    await f.apply(p.input);
    const after = await f.test.run(ctx => ctx.db.get(a._id)); expect(after.familia).toBe("Renombrada"); expect(after.actual_start).toBe("2026-10-01"); expect(after.avance_porcentaje).toBe(50);
    const items = await f.writer.query(api.programaObraImportHistory.listAttemptItems, { attempt_id: p.input.attempt_id, paginationOpts: page });
    expect(items.page).toHaveLength(1); expect(items.page[0].target_key).toBe(`detail:${a._id}`);
    const absentSources = await f.writer.query(api.programaObraImportHistory.listSources, { proyecto: f.ids.project, target: { kind: "detail", id: b._id }, paginationOpts: page });
    expect(absentSources.page).toHaveLength(1);
    await f.test.run(ctx => ctx.db.patch(a._id, { archived: true }));
    expect((await f.writer.query(api.programaObraImportHistory.listAttemptItems, { attempt_id: p.input.attempt_id, paginationOpts: page })).page[0].archived).toBe(true);
    await f.test.run(ctx => ctx.db.delete(a._id));
    const sources = await f.writer.query(api.programaObraImportHistory.listSources, { proyecto: f.ids.project, target: { kind: "detail", id: a._id }, paginationOpts: page });
    expect(sources.page).toHaveLength(2);
    expect((await f.writer.query(api.programaObraImportHistory.listAttemptItems, { attempt_id: p.input.attempt_id, paginationOpts: page })).page[0].deleted).toBe(true);
    expect((await f.writer.query(api.programaObraImportHistory.getDownloadUrl, { attempt_id: p.input.attempt_id })).file_name).toMatch(/original/);
    expect(JSON.parse((await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id })).reviewed_json).review).toEqual(review);
  });

  it("checks concurrency after file upload and records failure outside rollback", async () => {
    const f = await fixture(); await f.apply((await f.prepare()).input);
    const p = await f.prepare(undefined, { attach: false });
    const state = await f.snapshot();
    await f.test.run(ctx => ctx.db.patch(state.programa_obra[0]._id, { peso: 99 }));
    if (p.started.upload_url) await p.attach();
    const before = await f.snapshot();
    await expect(f.apply(p.input)).rejects.toThrow(/programa cambió/);
    expect(await f.snapshot()).toEqual(before);
    const failed = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id });
    expect(failed.status).toBe("failed"); expect(failed.storage_id).toBeTruthy();
    await expect(f.apply(p.input)).rejects.toThrow(/programa cambió/);
  });

  it("rolls back rows, effects, revision and result on a late import error, retaining original and separate failure", async () => {
    const f = await fixture();
    await f.test.run(ctx => ctx.db.insert("programa_obra_config", { proyecto: f.ids.project, enabled: false, version: 1, weekdays: [1, 2, 3, 4, 5], holidays: [] }));
    const p = await f.prepare(), before = await f.snapshot();
    await expect(f.apply(p.input)).rejects.toThrow(/General/);
    expect(await f.snapshot()).toEqual(before);
    expect((await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id })).status).toBe("failed");
  });

  it("requires initiator, current planning capability even while disabled, project access and verified file", async () => {
    const f = await fixture(), p = await f.prepare(undefined, { attach: false });
    await expect(f.apply(p.input)).rejects.toThrow(/original no disponible/);
    const missing = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id }); expect(missing.status).toBe("failed");
    const p2 = await f.prepare();
    const outsider = f.test.withIdentity({ subject: "outsider" });
    for (const fn of [api.programaObraImportHistory.getAttempt, api.programaObraImportHistory.getDownloadUrl]) {
      await expect(outsider.query(fn, { attempt_id: p2.input.attempt_id })).rejects.toThrow(/acceso/);
    }
    await f.test.run(async ctx => { await ctx.db.patch(f.ids.outsider, { role: "admin", allowed_desarrollos: [f.ids.project] }); });
    await expect(outsider.mutation(api.programa_obra.bulkUpsertFromExcel, p2.input)).rejects.toThrow(/quien inició/);
    await expect(f.writer.mutation(api.programa_obra.bulkUpsertFromExcel, { ...p2.input, proyecto: f.ids.other })).rejects.toThrow(/pertenece/);
    await f.test.run(async ctx => {
      await ctx.db.patch(f.ids.user, { role: "user" });
      await ctx.db.insert("programa_obra_config", { proyecto: f.ids.project, enabled: false, version: 1, weekdays: [1, 2, 3, 4, 5], holidays: [] });
    });
    await expect(f.apply(p2.input)).rejects.toThrow(/autorización/);
    expect((await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p2.input.attempt_id })).status).toBe("failed");
    for (const role of ["viewer", "almacenista"]) {
      await f.test.run(ctx => ctx.db.patch(f.ids.user, { role }));
      await expect(f.writer.mutation(api.programaObraImportHistory.startAttempt, { ...p2.startArgs, request_id: randomUUID() })).rejects.toThrow();
    }
  });

  it("rejects invalid metadata, mismatched hash/size and missing Storage metadata without programme writes", async () => {
    const f = await fixture(), p = await f.prepare(undefined, { attach: false });
    for (const override of [{ size: 10 * 1024 * 1024 + 1 }, { source: { ...p.startArgs.source, file_hash: "x" } }, { source: { ...p.startArgs.source, file_name: "archivo.pdf" } }]) {
      await expect(f.writer.mutation(api.programaObraImportHistory.startAttempt, { ...p.startArgs, request_id: randomUUID(), ...override })).rejects.toThrow(/Excel/);
    }
    const before = await f.snapshot();
    await expect(p.attach(new Blob(["different bytes"]))).rejects.toThrow(/SHA-256/);
    expect(await f.snapshot()).toEqual(before);
    await p.attach();
    const attempt = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id });
    await f.test.run(ctx => ctx.storage.delete(attempt.storage_id));
    await expect(f.apply(p.input)).rejects.toThrow(/original no disponible/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("expires abandonment and never turns a committed result into a failure", async () => {
    const f = await fixture(), p = await f.prepare(); const first = await f.apply(p.input);
    expect(await f.writer.mutation(api.programaObraImportHistory.failAttempt, { attempt_id: p.input.attempt_id, error: "Respuesta perdida" })).toEqual(first);
    const next = await f.prepare();
    await f.test.run(ctx => ctx.db.patch(next.input.attempt_id, { created_at: Date.now() - PROGRAM_IMPORT_TIMEOUT - 1 }));
    await f.test.mutation(internal.programaObraImportHistory.expireAttempt, { attempt_id: next.input.attempt_id });
    const attempt = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: next.input.attempt_id }); expect(attempt.status).toBe("failed"); expect(attempt.storage_id).toBeTruthy();
    await expect(f.apply(next.input)).rejects.toThrow(/interrumpió/);
  });

  it("keeps divided fronts and real dates intact; unchanged confirmation does not bump version", async () => {
    const f = await fixture(); await f.apply((await f.prepare()).input);
    const s = await f.snapshot(), detail = s.programa_obra_detalle[0];
    const config = await f.test.run(async ctx => {
      const id = await ctx.db.insert("programa_obra_config", { proyecto: f.ids.project, enabled: true, version: 7, weekdays: [1, 2, 3, 4, 5], holidays: [] });
      const front = await ctx.db.insert("programa_obra_fronts", { proyecto: f.ids.project, name: "General", archived: false });
      for (const d of s.programa_obra_detalle) {
        for (let i = 0; i < (d._id === detail._id ? 2 : 1); i++) await ctx.db.insert("programa_obra_activities", { proyecto: f.ids.project, detalle_id: d._id, front_id: front, name: `${d.familia} frente ${i}`, progress: 40, actual_start: "2026-10-01", current_start: "2026-10-01", current_finish: "2026-10-10", share: 50, mandatory: true, archived: false, requires_review: false });
      }
      return id;
    });
    const p = await f.prepare([{ ...f.rows()[1], detalle_id: detail._id, fecha_fin: "15/10/2026" }]);
    const before = await f.snapshot(); await f.apply(p.input); const after = await f.snapshot();
    expect(after.programa_obra_activities).toEqual(before.programa_obra_activities);
    const again = await f.prepare([{ ...f.rows()[1], detalle_id: detail._id, fecha_fin: "2026-10-15" }]);
    expect((await f.apply(again.input)).status).toBe("unchanged");
    expect((await f.test.run(ctx => ctx.db.get(config))).version).toBe(8);
    expect(after.programa_obra_detalle.find(d => d._id === detail._id).avance_porcentaje).toBeUndefined();
  });

  for (const enabled of [false, true]) it(`imports into a ${enabled ? "active" : "prepared"} programme and keeps no-op confirmations at the same version`, async () => {
    const f = await fixture();
    const config = await f.test.run(async ctx => {
      await ctx.db.insert("programa_obra_fronts", { proyecto: f.ids.project, name: "General", archived: false });
      return ctx.db.insert("programa_obra_config", { proyecto: f.ids.project, enabled, version: 4, weekdays: [1, 2, 3, 4, 5], holidays: [] });
    });
    const p = await f.prepare(); expect(await f.apply(p.input)).toMatchObject({ status: "created", created: 3, activity_effects: 2, version: 5 });
    const again = await f.prepare(); expect(await f.apply(again.input)).toMatchObject({ status: "unchanged", unchanged: 3, activity_effects: 0, version: 5 });
    expect((await f.test.run(ctx => ctx.db.get(config))).version).toBe(5);
    const attempt = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id });
    expect(JSON.parse(attempt.snapshot_json).rows).toEqual(f.rows());
  });

  it("reuses matching bytes under a different original filename only inside the same project and verifies size separately", async () => {
    const f = await fixture(), p = await f.prepare(); await f.apply(p.input);
    const previous = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id });
    const renamed = await f.writer.mutation(api.programaObraImportHistory.startAttempt, { ...p.startArgs, request_id: randomUUID(), source: { ...p.startArgs.source, file_name: "Nombre original distinto ñ.xlsx" } });
    expect(renamed.upload_url).toBeNull();
    const download = await f.writer.query(api.programaObraImportHistory.getDownloadUrl, { attempt_id: renamed.attempt_id }); expect(download.file_name).toBe("Nombre original distinto ñ.xlsx");
    const cross = await f.writer.mutation(api.programaObraImportHistory.startAttempt, { ...p.startArgs, request_id: randomUUID(), proyecto: f.ids.other });
    expect(cross.upload_url).not.toBeNull();
    const wrongSize = await f.writer.mutation(api.programaObraImportHistory.startAttempt, { ...p.startArgs, request_id: randomUUID(), size: p.startArgs.size + 1 });
    await expect(f.writer.mutation(api.programaObraImportHistory.attachFile, { attempt_id: wrongSize.attempt_id, storage_id: previous.storage_id })).rejects.toThrow(/tamaño/);
  });

  it("separates dependency effects from the absent family's direct file provenance", async () => {
    const f = await fixture(); await f.apply((await f.prepare()).input); const s = await f.snapshot();
    const [a, b] = await f.test.run(async ctx => {
      await ctx.db.insert("programa_obra_config", { proyecto: f.ids.project, enabled: true, version: 1, weekdays: [1, 2, 3, 4, 5], holidays: [] });
      const front = await ctx.db.insert("programa_obra_fronts", { proyecto: f.ids.project, name: "General", archived: false });
      const ids = [];
      for (const [i, d] of s.programa_obra_detalle.entries()) ids.push(await ctx.db.insert("programa_obra_activities", { proyecto: f.ids.project, detalle_id: d._id, front_id: front, name: d.familia, progress: 0, current_start: i ? "2026-10-12" : "2026-10-01", current_finish: i ? "2026-10-20" : "2026-10-09", share: 100, mandatory: true, archived: false, requires_review: false }));
      await ctx.db.insert("programa_obra_dependencies", { proyecto: f.ids.project, predecessor_id: ids[0], successor_id: ids[1], kind: "FS", lag_days: 0, lag_unit: "working" });
      return ids;
    });
    const p = await f.prepare([{ ...f.rows()[1], fecha_inicio: "19/10/2026", fecha_fin: "23/10/2026" }]);
    expect((await f.apply(p.input)).activity_effects).toBe(2);
    const sources = await f.writer.query(api.programaObraImportHistory.listSources, { proyecto: f.ids.project, target: { kind: "activity", id: b }, paginationOpts: page });
    expect(sources.page[0].kind).toBe("activity_effect"); expect(sources.page[0].effect_reason).toMatch(/dependencias/);
    const family = await f.writer.query(api.programaObraImportHistory.listSources, { proyecto: f.ids.project, target: { kind: "detail", id: s.programa_obra_detalle[1]._id }, paginationOpts: page });
    expect(family.page).toHaveLength(1); expect(family.page[0].attempt_id).not.toBe(p.input.attempt_id); expect(a).toBeTruthy();
  });

  it("migrates only proven revisions idempotently without inventing originals, names or row relationships", async () => {
    const f = await fixture();
    const revision = await f.test.run(ctx => ctx.db.insert("programa_obra_revisions", { proyecto: f.ids.project, actor_id: f.ids.user, kind: "import", created_at: 1, version: 1, reason: "Importación previa", snapshot_json: JSON.stringify({ rows: f.rows() }) }));
    expect((await f.test.mutation(internal.programaObraImportHistory.migrateLegacyAttempts, { cursor: null, dry_run: true })).migrated).toBe(1);
    expect((await f.writer.query(api.programaObraImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: page })).page).toHaveLength(0);
    await f.test.mutation(internal.programaObraImportHistory.migrateLegacyAttempts, { cursor: null, dry_run: false });
    expect((await f.test.mutation(internal.programaObraImportHistory.migrateLegacyAttempts, { cursor: null, dry_run: false })).migrated).toBe(0);
    const history = await f.writer.query(api.programaObraImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: page });
    expect(history.page).toHaveLength(1); expect(history.page[0]).toMatchObject({ status: "legacy", file_available: false, revision_id: revision }); expect(history.page[0].source).toBeUndefined();
    expect((await f.snapshot()).programa_obra_import_items).toHaveLength(0);
  });

  it("paginates history and removes shared originals and old programme records only on definitive project deletion", async () => {
    const f = await fixture(); const p = await f.prepare(); await f.apply(p.input);
    const attempt = await f.writer.query(api.programaObraImportHistory.getAttempt, { attempt_id: p.input.attempt_id });
    await f.test.run(async ctx => {
      for (let i = 0; i < 52; i++) await ctx.db.insert("programa_obra_import_attempts", { proyecto: f.ids.project, request_id: `test:${i}`, source: attempt.source, storage_id: attempt.storage_id, size: attempt.size, status: "failed", imported_by: f.ids.user, imported_by_name: "Prueba", created_at: 2 + i });
    });
    const first = await f.writer.query(api.programaObraImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: { cursor: null, numItems: 100 } }); expect(first.page).toHaveLength(25); expect(first.isDone).toBe(false);
    const next = await f.writer.query(api.programaObraImportHistory.listHistory, { proyecto: f.ids.project, paginationOpts: { ...page, cursor: first.continueCursor } }); expect(next.page).toHaveLength(25);
    await f.test.run(async ctx => { await deleteProjectProgramHistory(ctx, f.ids.project); await ctx.db.delete(f.ids.project); });
    await expect(f.writer.query(api.programaObraImportHistory.getDownloadUrl, { attempt_id: attempt._id })).rejects.toThrow();
    for (let i = 0; i < 32; i++) await f.test.mutation(internal.programaObraImportHistory.purgeDeletedProjectProgram, { proyecto: f.ids.project });
    expect(await f.test.run(ctx => ctx.storage.get(attempt.storage_id))).toBeNull();
    expect((await f.snapshot()).programa_obra_import_items).toHaveLength(0); expect((await f.snapshot()).programa_obra_revisions).toHaveLength(0);
    expect(await f.test.run(ctx => ctx.db.query("programa_obra_import_attempts").collect())).toHaveLength(0);
    expect(await f.test.run(ctx => ctx.db.get(f.ids.other))).not.toBeNull();
  });
});
