import { describe, it, expect, vi } from "vitest";
import * as program from "./programaObraExecution.ts";
import { previewProgramImport } from "./programaObraImport.ts";
import { bulkUpsertFromExcel, updateDetalleAvance, updateSchedulePeso, updateDetallePeso, previewWeightChange } from "./programa_obra.ts";
import { previewProgramWeight, programWeightSource, parseProgramWeight } from "../src/lib/programa-obra-weight.ts";
import { DEFAULT_PROGRAM_CALENDAR, summarizeProgram } from "../src/lib/programa-obra-rules.ts";
import { programToday } from "../src/lib/programa-obra-rules.ts";
import { getRecordedProgressTiming, resolveProgressRecord } from "../src/lib/programa-obra-progress.ts";
import { buildReportSnapshot } from "./reportSnapshot.ts";

const weightReview = (f, target, peso, proyecto = "project") => f.call(previewWeightChange, { proyecto, target, peso, refresh_day: programToday() });
const weightSave = (f, target, peso, review) => f.call(target.kind === "detail" ? updateDetallePeso : updateSchedulePeso,
  { [target.kind === "detail" ? "detalle_id" : "schedule_id"]: target.id, peso, review_token: review.reviewToken });

describe("weight impact review and protected persistence", () => {
  it("reviews without writes, then records one family change without altering physical progress or baseline", async () => {
    const f = fixture(); f.as("admin");
    f.get("A").progress = 100;
    f.list("programa_obra_revisions").push({ _id: "approved", proyecto: "project", kind: "baseline", snapshot_json: "approved weights" });
    const activities = structuredClone(f.list("programa_obra_activities"));
    const config = structuredClone(f.get("config"));
    const target = { kind: "detail", id: "familyA" };
    const review = await weightReview(f, target, 100);
    expect(review.ok).toBe(true); expect(review.baseline).toBe(true);
    expect(review.impact.schedule.before.progress).toBe(50);
    expect(review.impact.schedule.after.progress).toBeCloseTo(100 / 1.5);
    expect(review.impact.overall.after.progress).toBe(review.impact.schedule.after.progress);
    expect(f.get("familyA").peso).toBe(50); expect(f.get("config")).toEqual(config);
    expect(f.list("programa_obra_events")).toHaveLength(0);
    expect(await weightSave(f, target, 100, review)).toEqual({ success: true, changed: true });
    expect(await weightSave(f, target, 100, review)).toEqual({ success: true, changed: false });
    expect(f.get("config").version).toBe(2);
    expect(f.list("programa_obra_events")).toHaveLength(1);
    expect(JSON.parse(f.list("programa_obra_events")[0].payload_json)).toEqual({ id: "familyA", old_weight: 50, weight: 100 });
    expect(f.list("programa_obra_activities")).toEqual(activities);
    expect(f.get("familyA").avance_porcentaje).toBe(0);
    expect(f.get("approved").snapshot_json).toBe("approved weights");
    expect(f.list("programa_obra_avance_historial")).toHaveLength(0);
  });

  it("changes a partida's general contribution using all active partidas without changing its own advance", async () => {
    const f = fixture(); f.as("admin"); f.list("programa_obra_activities").length = 0;
    f.get("familyA").avance_porcentaje = 100; f.get("familyB").avance_porcentaje = 100;
    f.get("schedule").peso = 20;
    f.list("partidas").push({ _id: "budget2", proyecto: "project", nivel: 1, nombre: "Oculta por filtro" });
    f.list("programa_obra").push({ _id: "schedule2", proyecto: "project", partida_id: "budget2", orden: 1, peso: 80 });
    f.list("programa_obra_detalle").push({ _id: "familyC", proyecto: "project", programa_obra_id: "schedule2", nivel: 2, orden: 0, peso: 100, avance_porcentaje: 0 });
    const target = { kind: "schedule", id: "schedule" }, review = await weightReview(f, target, 40);
    expect(review.impact.overall.before.progress).toBe(20); expect(review.impact.overall.after.progress).toBeCloseTo(100 / 3);
    expect(review.impact.schedule.before.progress).toBe(review.impact.schedule.after.progress);
    expect(review.impact.participation.after.sum).toBe(120);
    await weightSave(f, target, 40, review);
    expect((await f.call(program.getExecutionProgram, { proyecto: "project" })).summaries.overall.progress).toBe(review.impact.overall.after.progress);
  });

  it.each(["weight", "progress", "calendar", "date", "membership", "candidate"])("rejects a stale %s review without any writes", async (change) => {
    const f = fixture(); f.as("admin"); const target = { kind: "detail", id: "familyA" };
    const review = await weightReview(f, target, 75);
    if (change === "weight") f.get("familyB").peso = 10;
    if (change === "progress") f.get("B").progress = 30;
    if (change === "calendar") f.get("config").holidays.push(programToday());
    if (change === "date") f.get("C").current_finish = "2026-12-01";
    if (change === "membership") f.get("familyB").archived = true;
    await expect(weightSave(f, target, change === "candidate" ? 80 : 75, review)).rejects.toThrow(/programa cambió/);
    expect(f.get("familyA").peso).toBe(50); expect(f.get("config").version).toBe(1);
    expect(f.list("programa_obra_events")).toHaveLength(0);
    const fresh = await weightReview(f, target, 75); await weightSave(f, target, 75, fresh);
    expect(f.get("familyA").peso).toBe(75);
  });

  it("invalidates a review when the Mexico City cutoff rolls to the next day", async () => {
    const f = fixture(); f.as("admin"); const target = { kind: "detail", id: "familyA" };
    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(Date.parse("2026-10-14T05:59:59Z"));
      const review = await weightReview(f, target, 75);
      expect(review.impact.cutoff).toBe("2026-10-13");
      clock.mockReturnValue(Date.parse("2026-10-14T06:00:01Z"));
      await expect(weightSave(f, target, 75, review)).rejects.toThrow(/programa cambió/);
      expect(f.get("familyA").peso).toBe(50); expect(f.list("programa_obra_events")).toHaveLength(0);
    } finally { clock.mockRestore(); }
  });

  it("protects legacy physical progress even with no config/version", async () => {
    const f = fixture(); f.as("admin"); f.list("programa_obra_config").length = 0; f.list("programa_obra_activities").length = 0;
    const target = { kind: "detail", id: "familyA" }, review = await weightReview(f, target, 25);
    f.get("familyB").avance_porcentaje = 65;
    await expect(weightSave(f, target, 25, review)).rejects.toThrow(/programa cambió/);
    const fresh = await weightReview(f, target, 25); await weightSave(f, target, 25, fresh);
    expect(f.list("programa_obra_config")).toHaveLength(0); expect(f.list("programa_obra_events")).toHaveLength(1);
  });

  it("binds the review to its project even if the complete hierarchy is moved", async () => {
    const f = fixture(); f.as("admin"); const target = { kind: "detail", id: "familyA" };
    const review = await weightReview(f, target, 75);
    for (const table of ["partidas", "programa_obra_config", "programa_obra", "programa_obra_detalle", "programa_obra_activities"]) {
      for (const row of f.list(table)) row.proyecto = "other";
    }
    await expect(weightSave(f, target, 75, review)).rejects.toThrow(/programa cambió/);
    expect(f.get("familyA").peso).toBe(50); expect(f.list("programa_obra_events")).toHaveLength(0);
  });

  it("enforces planning permissions on preview and save, including revocation and no-config admin access", async () => {
    const f = fixture(), target = { kind: "detail", id: "familyA" };
    expect((await weightReview(f, target, 75)).ok).toBe(false);
    f.list("programa_obra_permissions").push({ _id: "permission", proyecto: "project", user_id: "editor", plan: true });
    const review = await weightReview(f, target, 75); expect(review.ok).toBe(true);
    f.get("permission").plan = false;
    await expect(weightSave(f, target, 75, review)).rejects.toThrow(/autorización/);
    f.get("permission").plan = true; f.list("programa_obra_config").length = 0;
    expect((await weightReview(f, target, 75)).ok).toBe(false);
    f.as("viewer"); expect((await weightReview(f, target, 75)).ok).toBe(false);
    await expect(weightSave(f, target, 75, review)).rejects.toThrow(/read-only/);
    f.as("admin"); expect((await weightReview(f, target, 75)).ok).toBe(true);
    f.as("editor"); f.get("editor").allowed_desarrollos = []; expect((await weightReview(f, target, 75)).ok).toBe(false);
    expect(f.list("programa_obra_events")).toHaveLength(0);
  });

  it.each(["missing", "archived", "level", "parent", "project", "excluded"])("rejects an invalid %s destination", async (mode) => {
    const f = fixture(); f.as("admin"); const target = { kind: "detail", id: mode === "missing" ? "absent" : "familyA" };
    if (mode === "archived") f.get("familyA").archived = true;
    if (mode === "level") f.get("familyA").nivel = 3;
    if (mode === "parent") f.get("schedule").archived = true;
    if (mode === "project") f.get("budget").proyecto = "other";
    if (mode === "excluded") { delete f.get("familyA").orden; f.list("programa_obra_activities").length = 0; }
    expect((await weightReview(f, target, 20)).ok).toBe(false);
    await expect(weightSave(f, target, 20, { reviewToken: "invalid" })).rejects.toThrow();
    expect(f.list("programa_obra_events")).toHaveLength(0);
  });

  it.each([NaN, Infinity, -Infinity, -1, 101])("rejects invalid numeric weight %s", async (peso) => {
    const f = fixture(); f.as("admin"); const target = { kind: "detail", id: "familyA" };
    expect((await weightReview(f, target, peso)).ok).toBe(false);
    await expect(weightSave(f, target, peso, { reviewToken: "invalid" })).rejects.toThrow();
    expect(f.get("familyA").peso).toBe(50); expect(f.list("programa_obra_events")).toHaveLength(0);
  });

  it("keeps missing weights, all-zero groups, inherited provisionality and zero-weight required release distinct", () => {
    const schedules = [{ _id: "s", orden: 0, peso: 100 }];
    const details = [{ _id: "a", programa_obra_id: "s", nivel: 2, orden: 0, peso: 20, avance_porcentaje: 100 }, { _id: "b", programa_obra_id: "s", nivel: 2, orden: 1, avance_porcentaje: 0 }];
    const preview = (peso) => previewProgramWeight(schedules, details, [], { kind: "detail", id: "b" }, peso, "2026-10-13", DEFAULT_PROGRAM_CALENDAR);
    expect(preview(80).schedule.before.progress).toBe(50); expect(preview(80).schedule.after.progress).toBe(20);
    expect(preview(80).overall.before.inherited).toBe(true); expect(preview(80).overall.after.provisional).toBe(false);
    expect(preview(0).schedule.after.progress).toBe(100);
    expect(summarizeProgram(schedules, [{ ...details[0] }, { ...details[1], peso: 0 }], []).overall.released).toBe(false);
    details[0].peso = 0;
    expect(preview(0).schedule.after.progress).toBe(50); expect(preview(0).participation.after.simple).toBe(true);
    expect(preview(40).participation.after.percent).toBe(100);
  });

  it("reuses calendar-aware planned aggregation, excludes archives, and makes source order irrelevant", () => {
    const schedules = [{ _id: "s", peso: 100, orden: 0 }, { _id: "archived", peso: 100, orden: 1, archived: true }];
    const details = [{ _id: "a", programa_obra_id: "s", nivel: 2, orden: 0, peso: 20, avance_porcentaje: 100, fecha_inicio: "2026-10-12", fecha_fin: "2026-10-16" }, { _id: "b", programa_obra_id: "s", nivel: 2, orden: 1, peso: 80, avance_porcentaje: 0, fecha_inicio: "2026-11-01", fecha_fin: "2026-11-10" }, { _id: "x", programa_obra_id: "s", nivel: 2, orden: 2, peso: 99, avance_porcentaje: 100, archived: true }];
    const calendar = { weekdays: [1, 2, 3, 4, 5], holidays: ["2026-10-13"] }, cutoff = "2026-10-14";
    const review = previewProgramWeight(schedules, details, [], { kind: "detail", id: "a" }, 40, cutoff, calendar);
    expect(review.participation.after.count).toBe(2);
    expect(review.overall.after.planned).toBe(summarizeProgram(schedules, details.map((d) => d._id === "a" ? { ...d, peso: 40 } : d), [], cutoff, calendar).overall.planned);
    expect(review.overall.after.planned).not.toBe(review.overall.before.planned);
    expect(programWeightSource(schedules, details, [], cutoff, calendar)).toBe(programWeightSource([...schedules].reverse(), [...details].reverse(), [], cutoff, calendar));
    for (const raw of ["", " ", "20abc", "1e2", "NaN", "Infinity", "-1", "100.01"]) expect(parseProgramWeight(raw)).toBeUndefined();
    expect(parseProgramWeight("0")).toBe(0); expect(parseProgramWeight("20.25")).toBe(20.25);
  });
});

// Execute the registered Convex handlers against a transactional in-memory DB.
// Auth and permission helpers remain real; this does not deploy or touch a project.
function fixture() {
  let tables = {
    users: [{ _id: "editor", clerkId: "editor", role: "user", email: "editor@test.mx", name: "Editor", allowed_desarrollos: ["project"] }, { _id: "admin", clerkId: "admin", role: "admin", email: "admin@test.mx", name: "Admin", allowed_desarrollos: ["project"] }, { _id: "viewer", clerkId: "viewer", role: "viewer", email: "viewer@test.mx", name: "Lector", allowed_desarrollos: ["project"] }],
    desarrollos: [{ _id: "project" }, { _id: "other" }],
    partidas: [{ _id: "budget", proyecto: "project", nivel: 1, nombre: "Instalaciones" }],
    programa_obra_config: [{ _id: "config", proyecto: "project", enabled: true, version: 1, weekdays: [1, 2, 3, 4, 5, 6], holidays: [] }],
    programa_obra_fronts: [{ _id: "floor2", proyecto: "project", name: "Piso 2", archived: false }, { _id: "floor3", proyecto: "project", name: "Piso 3", archived: false }],
    programa_obra: [{ _id: "schedule", proyecto: "project", partida_id: "budget", orden: 0, peso: 100 }],
    programa_obra_detalle: [{ _id: "familyA", proyecto: "project", programa_obra_id: "schedule", partida: "Instalaciones", familia: "Pruebas", nivel: 2, orden: 0, peso: 50, avance_porcentaje: 0 }, { _id: "familyB", proyecto: "project", programa_obra_id: "schedule", partida: "Instalaciones", familia: "Muebles", nivel: 2, orden: 1, peso: 50, avance_porcentaje: 0 }],
    programa_obra_activities: ["A", "B", "C"].map((id, i) => ({ _id: id, proyecto: "project", detalle_id: i === 0 ? "familyA" : "familyB", front_id: i === 2 ? "floor3" : "floor2", name: id, progress: 0, share: i === 0 ? 100 : 50, mandatory: true, archived: false, requires_review: false, responsible_id: "editor", current_start: "2026-09-01", current_finish: "2026-09-02" })),
    programa_obra_dependencies: [{ _id: "dependency", proyecto: "project", predecessor_id: "A", successor_id: "B", kind: "FS", lag_days: 0, lag_unit: "working" }],
  };
  let actor = "editor", seq = 0;
  const list = (table) => tables[table] ??= [];
  const get = (id) => Object.values(tables).flat().find((row) => row._id === id);
  const ctx = { auth: { getUserIdentity: async () => ({ subject: actor }) }, db: {
    get: async (id) => structuredClone(get(id) ?? null),
    query: (table) => {
      const filters = [], options = { desc: false };
      const rows = () => list(table).filter((row) => filters.every(([key, value]) => row[key] === value)).sort((a, b) => (options.desc ? -1 : 1) * ((a._creationTime ?? 0) - (b._creationTime ?? 0)));
      const query = {
        withIndex: (_name, predicate) => { const q = { eq: (key, value) => { filters.push([key, value]); return q; } }; predicate(q); return query; },
        collect: async () => structuredClone(rows()), first: async () => structuredClone(rows()[0] ?? null),
        unique: async () => { if (rows().length > 1) throw new Error("Not unique"); return structuredClone(rows()[0] ?? null); },
        order: (order) => { options.desc = order === "desc"; return query; }, take: async (n) => structuredClone(rows().slice(0, n)),
        filter: (predicate) => { predicate({ field: (key) => key, eq: (key, value) => { filters.push([key, value]); } }); return query; },
      }; return query;
    },
    insert: async (table, data) => { const id = `${table}-${++seq}`; list(table).push({ _id: id, _creationTime: Date.now() + seq, ...structuredClone(data) }); return id; },
    patch: async (id, changes) => { const row = get(id); if (!row) throw new Error("Missing document"); for (const [key, value] of Object.entries(changes)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); } },
    delete: async (id) => { for (const table of Object.keys(tables)) tables[table] = tables[table].filter((row) => row._id !== id); },
    normalizeId: (table, id) => list(table).some((row) => row._id === id) ? id : null,
  } };
  const call = async (fn, args) => { const before = structuredClone(tables); try { return await fn._handler(ctx, args); } catch (e) { tables = before; throw e; } };
  const advance = (id, progress, date = "2026-09-15", reason) => call(program.updateExecutionProgress, { activity_id: id, progress, execution_date: date, reason });
  return { ctx, call, advance, get, list, as: (user) => { actor = user; } };
}

describe("execution mutations and queries", () => {
  it("records past physical dates separately from today's capture in legacy details", async () => {
    const f = fixture(); f.list("programa_obra_activities").length = 0; f.get("config").enabled = false;
    await f.call(updateDetalleAvance, { detalle_id: "familyA", avance_porcentaje: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", execution_date: "2026-09-15" });
    expect(f.get("familyA")).toMatchObject({ avance_porcentaje: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", progress_as_of: "2026-09-15" });
    const entry = f.list("programa_obra_avance_historial")[0];
    expect(entry.execution_date).toBe("2026-09-15"); expect(programToday(entry.created_at)).toBe(programToday());
    const timing = getRecordedProgressTiming(100, f.get("familyA"), [entry]);
    expect(timing.progressStartedAt).toBe(new Date("2026-09-01T00:00:00").getTime());
    expect(timing.completedAt).toBe(new Date("2026-09-02T00:00:00").getTime());
    await expect(f.call(updateDetalleAvance, { detalle_id: "familyA", avance_porcentaje: 100, actual_start: "2026-08-31", execution_date: "2026-09-15" })).rejects.toThrow(/motivo/);
    await f.call(updateDetalleAvance, { detalle_id: "familyA", avance_porcentaje: 100, actual_start: "2026-08-31", execution_date: "2026-09-15", reason: "Inicio verificado en bitácora" });
    expect(f.list("programa_obra_avance_historial")).toHaveLength(2);
    expect(f.list("programa_obra_avance_historial")[1]).toMatchObject({ old_value: 100, new_value: 100, old_actual_start: "2026-09-01", actual_start: "2026-08-31" });
    f.as("admin"); await f.call(program.initializeExecutionProgram, { proyecto: "project" });
    expect(f.list("programa_obra_activities").find((a) => a.detalle_id === "familyA")).toMatchObject({ actual_start: "2026-08-31", actual_finish: "2026-09-02", progress_as_of: "2026-09-15" });
  });
  it("audits dates-only activity corrections and enforces planning permission", async () => {
    const f = fixture(); await f.advance("A", 100);
    const correction = { activity_id: "A", progress: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", execution_date: "2026-09-15", reason: "Trabajo realizado previamente" };
    await expect(f.call(program.updateExecutionProgress, correction)).rejects.toThrow(/autorización/);
    f.as("admin"); await f.call(program.updateExecutionProgress, correction);
    expect(f.get("A")).toMatchObject({ progress: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02" });
    const event = f.list("programa_obra_events").at(-1);
    expect(JSON.parse(event.payload_json)).toMatchObject({ old_progress: 100, progress: 100, old_actual_start: "2026-09-15", actual_start: "2026-09-01" });
    expect(f.list("programa_obra_avance_historial").at(-1)).toMatchObject({ old_value: 100, new_value: 100, actual_finish: "2026-09-02" });
  });
  it("validates real start and finish against dependencies rather than the reporting cutoff", async () => {
    const f = fixture(); await f.advance("A", 100, "2026-09-10");
    await expect(f.call(program.updateExecutionProgress, { activity_id: "B", progress: 20, actual_start: "2026-09-01", execution_date: "2026-09-15" })).rejects.toThrow(/bloqueado/);
    expect(f.get("B").progress).toBe(0);
    f.get("dependency").kind = "FF";
    await expect(f.call(program.updateExecutionProgress, { activity_id: "B", progress: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", execution_date: "2026-09-15" })).rejects.toThrow(/bloqueado/);
  });
  it("does not reopen successor reviews when only the reporting cutoff changes", async () => {
    const f = fixture(); await f.advance("A", 100); await f.advance("B", 100); f.as("admin");
    await f.call(program.updateExecutionProgress, { activity_id: "A", progress: 100, execution_date: "2026-09-16", reason: "Actualización del corte" });
    expect(f.get("B").review_incident).toBeUndefined();
    await f.call(program.updateExecutionProgress, { activity_id: "A", progress: 100, execution_date: "2026-09-16", actual_start: "2026-09-14", reason: "Inicio verificado" });
    expect(f.get("B").review_incident).toMatch(/A/);
  });
  it("retains proposed dates through exception approval", async () => {
    const f = fixture();
    const id = await f.call(program.requestExecutionException, { activity_id: "B", progress: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", execution_date: "2026-09-15", reason: "Trabajo previo verificado" });
    expect(f.get("B").progress).toBe(0);
    expect(f.get(id)).toMatchObject({ actual_start: "2026-09-01", actual_finish: "2026-09-02" });
    f.as("admin"); await f.call(program.decideExecutionException, { exception_id: id, approve: true, reason: "Verificado" });
    expect(f.get("B")).toMatchObject({ progress: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", progress_as_of: "2026-09-15" });
    expect(f.get("B").review_incident).toBeTruthy();
  });
  it("preserves recorded dates when reimporting schedules", async () => {
    const f = fixture(); await f.call(program.updateExecutionProgress, { activity_id: "A", progress: 100, actual_start: "2026-09-01", actual_finish: "2026-09-02", execution_date: "2026-09-15" });
    f.as("admin"); f.list("programa_obra_fronts").push({ _id: "general", proyecto: "project", name: "General", archived: false });
    const rows = [{ nivel: 1, partida: "Instalaciones" }, { nivel: 2, partida: "Instalaciones", familia: "Pruebas", detalle_id: "familyA" }];
    const preview = await previewProgramImport(f.ctx, "project", rows);
    await f.call(bulkUpsertFromExcel, { proyecto: "project", rows, expected_fingerprint: preview.fingerprint });
    expect(f.get("A")).toMatchObject({ actual_start: "2026-09-01", actual_finish: "2026-09-02", progress_as_of: "2026-09-15" });
    expect(f.get("familyA")).toMatchObject({ actual_start: "2026-09-01", actual_finish: "2026-09-02", progress_as_of: "2026-09-15" });
  });
  it("rejects invalid chronology, future dates, non-finite progress and unjustified reductions", () => {
    const previous = { progress: 25, actual_start: "2026-09-01", progress_as_of: "2026-09-15" };
    const base = { progress: 100, execution_date: "2026-09-15", actual_finish: "2026-09-10" };
    for (const change of [ { actual_start: "2026-02-30" }, { actual_finish: "2026-08-31" }, { actual_finish: "2026-09-16" }, { execution_date: "2026-10-09" }, { progress: NaN }, { progress: -1 }, { progress: 101 } ]) {
      expect(() => resolveProgressRecord(previous, { ...base, ...change }, "2026-10-08")).toThrow();
    }
    expect(() => resolveProgressRecord(previous, { progress: 10, execution_date: "2026-09-15" })).toThrow(/motivo/);
    expect(() => resolveProgressRecord(previous, { progress: 50, execution_date: "2026-09-14" })).toThrow(/motivo/);
    expect(resolveProgressRecord(previous, { progress: 10, execution_date: "2026-09-15", reason: "Corrección" }).actual_finish).toBeUndefined();
    expect(getRecordedProgressTiming(100, {}, [{ old_value: 0, new_value: 100, created_at: Date.now() }])).toMatchObject({ progressStartKnown: false, completionKnown: false });
  });
  it("enforces dependency, resolves only Piso 2 and synchronizes family progress", async () => {
    const f = fixture(); await expect(f.advance("B", 20)).rejects.toThrow(/bloqueado/);
    await f.advance("A", 100); await f.advance("B", 50);
    expect(f.get("C").progress).toBe(0); expect(f.get("familyB").avance_porcentaje).toBe(25);
    const result = await f.call(program.getExecutionProgram, { proyecto: "project" });
    expect(result.summaries.overall.progress).toBe(62.5);
    expect(result.activities.find((a) => a._id === "B").status).toBe("in_progress");
  });
  it("stores execution date independently of capture timestamp", async () => {
    const f = fixture(); await f.advance("A", 30, "2026-08-20");
    expect(f.get("A").actual_start).toBe("2026-08-20");
    expect(f.list("programa_obra_events")[0].execution_date).toBe("2026-08-20");
    expect(f.list("programa_obra_events")[0].created_at).toBeGreaterThan(Date.parse("2026-08-20"));
    await expect(f.advance("A", 40, "2026-08-19")).rejects.toThrow(/anterior/);
    await expect(f.advance("A", 40, "2099-01-01")).rejects.toThrow(/futura/);
  });
  it("technical 100% requires acceptance by an authorized user", async () => {
    const f = fixture(); f.get("A").requires_review = true; await f.advance("A", 100);
    await expect(f.advance("B", 5)).rejects.toThrow(/bloqueado/);
    await expect(f.call(program.acceptExecutionActivity, { activity_id: "A", accept: true, reason: "Prueba conforme", evidence: "Acta" })).rejects.toThrow(/autorización/);
    f.as("admin"); await f.call(program.acceptExecutionActivity, { activity_id: "A", accept: true, reason: "Prueba conforme", evidence: "Acta" });
    f.as("editor"); await expect(f.advance("B", 5, "2026-09-16")).rejects.toThrow(/espera/);
    await f.advance("B", 5, programToday());
    expect(f.get("A").accepted_by).toBe("admin");
  });
  it("requires a reason for reopening and keeps downstream work with a review incident", async () => {
    const f = fixture(); await f.advance("A", 100); await f.advance("B", 100);
    await expect(f.advance("A", 80)).rejects.toThrow(/motivo/);
    await f.advance("A", 80, "2026-09-15", "Corregir prueba");
    expect(f.get("B").progress).toBe(100); expect(f.get("B").review_incident).toMatch(/A/);
    await expect(f.advance("A", 90, "2026-09-14")).rejects.toThrow(/anterior/);
  });
  it("does not grant planning, acceptance or exceptions to the activity owner", async () => {
    const f = fixture();
    await expect(f.call(program.createExecutionFront, { proyecto: "project", name: "Azotea" })).rejects.toThrow(/autorización/);
    f.as("viewer"); await expect(f.advance("A", 10)).rejects.toThrow();
    expect((await f.call(program.getExecutionProgram, { proyecto: "project" })).capabilities.write).toBe(false);
    f.as("editor"); await expect(f.call(program.getExecutionProgram, { proyecto: "other" })).rejects.toThrow(/acceso/);
  });
  it("applies approved exception once, without deleting its dependency", async () => {
    const f = fixture();
    const id = await f.call(program.requestExecutionException, { activity_id: "B", progress: 30, execution_date: "2026-09-15", reason: "Frente segregado" });
    f.as("admin"); await f.call(program.decideExecutionException, { exception_id: id, approve: true, reason: "Verificación en sitio" });
    expect(f.get("B").progress).toBe(30); expect(f.get("dependency")).toBeDefined();
    expect(f.get(id).status).toBe("approved");
    await expect(f.call(program.decideExecutionException, { exception_id: id, approve: true, reason: "Reutilizar" })).rejects.toThrow(/atendida/);
    f.as("editor"); await expect(f.advance("B", 40)).rejects.toThrow(/bloqueado/);
  });
  it("an exception for 100% does not resolve requirements or release downstream work", async () => {
    const f = fixture(); const id = await f.call(program.requestExecutionException, { activity_id: "B", progress: 100, execution_date: "2026-09-15", reason: "Trabajo físico verificado" });
    f.as("admin"); await f.call(program.decideExecutionException, { exception_id: id, approve: true, reason: "Autorizar registro físico" });
    expect(f.get("B").progress).toBe(100); expect(f.get("B").review_incident).toMatch(/excepción/);
    await expect(f.call(program.acceptExecutionActivity, { activity_id: "B", accept: true, reason: "Liberar", evidence: "" })).rejects.toThrow(/Resuelve/);
    await f.advance("A", 100); await f.call(program.acceptExecutionActivity, { activity_id: "B", accept: true, reason: "Dependencias verificadas", evidence: "Acta" });
    expect(f.get("B").review_incident).toBeUndefined();
  });
  it("rejects an outdated exception and denied requests cannot advance", async () => {
    const f = fixture(); const id = await f.call(program.requestExecutionException, { activity_id: "B", progress: 20, execution_date: "2026-09-15", reason: "Solicitar excepción" });
    f.as("admin"); await f.call(program.createExecutionFront, { proyecto: "project", name: "Azotea" });
    await expect(f.call(program.decideExecutionException, { exception_id: id, approve: true, reason: "Autorizar" })).rejects.toThrow(/cambió/);
    await f.call(program.decideExecutionException, { exception_id: id, approve: false, reason: "Necesita revisión" });
    expect(f.get("B").progress).toBe(0);
  });
  it("rechecks requester's access before authorization", async () => {
    const f = fixture(); const id = await f.call(program.requestExecutionException, { activity_id: "B", progress: 10, execution_date: "2026-09-15", reason: "Solicitar" });
    f.get("editor").allowed_desarrollos = []; f.as("admin");
    await expect(f.call(program.decideExecutionException, { exception_id: id, approve: true, reason: "Aprobar" })).rejects.toThrow(/acceso/);
  });
  it("rejects cycles, self-dependencies and cross-project relations", async () => {
    const f = fixture(); f.as("admin"); const args = { kind: "FS", lag_days: 0, lag_unit: "working", reason: "Planificar" };
    await expect(f.call(program.upsertExecutionDependency, { ...args, predecessor_id: "B", successor_id: "A" })).rejects.toThrow(/ciclo/);
    await expect(f.call(program.upsertExecutionDependency, { ...args, predecessor_id: "A", successor_id: "A" })).rejects.toThrow(/sí misma/);
    f.get("C").proyecto = "other";
    await expect(f.call(program.upsertExecutionDependency, { ...args, predecessor_id: "C", successor_id: "A" })).rejects.toThrow(/diferentes/);
  });
  it("partial material receipt never resolves a blocking requirement automatically", async () => {
    const f = fixture(); f.list("requisiciones").push({ _id: "reqSource", proyecto: "project", status_entrega: "Parcial" }); f.as("admin");
    await f.call(program.upsertExecutionRequirement, { activity_id: "A", description: "Entrega completa", category: "materials", stage: "start", blocking: true, responsible_id: "editor", due_date: "2026-09-14", source_type: "requisicion", source_id: "reqSource", reason: "Material requerido" });
    f.as("editor"); await expect(f.advance("A", 10)).rejects.toThrow(/Entrega completa/);
    const requirement = f.list("programa_obra_requirements")[0];
    await f.call(program.resolveExecutionRequirement, { requirement_id: requirement._id, resolved: true, evidence: "Recepción completa verificada", reason: "Verificado en sitio" });
    await f.advance("A", 10);
  });
  it("migrates unknown historical dates without inferring capture as execution", async () => {
    const f = fixture(); f.list("programa_obra_activities").length = 0; f.get("familyA").avance_porcentaje = 45; f.get("familyA").tiempo_extra_cantidad = 2; f.as("admin");
    await f.call(program.initializeExecutionProgram, { proyecto: "project" });
    const a = f.list("programa_obra_activities").find((a) => a.detalle_id === "familyA");
    expect(a.progress).toBe(45); expect(a.actual_start).toBeUndefined(); expect(a.actual_finish).toBeUndefined(); expect(a.dates_need_review).toBe(true);
    await f.call(program.initializeExecutionProgram, { proyecto: "project" }); expect(f.list("programa_obra_activities")).toHaveLength(2);
  });
  it("requires an explicit progress distribution when splitting fronts", async () => {
    const f = fixture(); await f.advance("C", 40); f.as("admin");
    f.list("programa_obra_fronts").push({ _id: "floor4", proyecto: "project", name: "Piso 4", archived: false });
    const fronts = [{ front_id: "floor3", share: 50, progress: 20, responsible_id: "editor" }, { front_id: "floor4", share: 50, progress: 60, responsible_id: "editor" }];
    await expect(f.call(program.splitExecutionActivity, { activity_id: "C", fronts: fronts.map((r) => ({ ...r, progress: 0 })), reason: "Dividir" })).rejects.toThrow(/avance/);
    await f.call(program.splitExecutionActivity, { activity_id: "C", fronts, reason: "Distribución verificada" });
    expect(f.get("C").archived).toBe(true); expect(f.get("familyB").avance_porcentaje).toBe(20);
  });
  it("previews impact and refuses stale or incomplete date proposals", async () => {
    const f = fixture(); const edits = [{ activity_id: "A", start: "2026-09-10", finish: "2026-09-11" }]; f.as("admin");
    const preview = await f.call(program.previewExecutionReschedule, { proyecto: "project", edits });
    expect(preview.changes.some((c) => c.activity_id === "B")).toBe(true); expect(f.get("A").current_start).toBe("2026-09-01");
    await f.call(program.createExecutionFront, { proyecto: "project", name: "Azotea" });
    await expect(f.call(program.applyExecutionReschedule, { proyecto: "project", edits, version: preview.version, reason: "Cambio" })).rejects.toThrow(/desactualizada/);
    const fresh = await f.call(program.previewExecutionReschedule, { proyecto: "project", edits });
    await f.call(program.applyExecutionReschedule, { proyecto: "project", edits, version: fresh.version, reason: "Cambio aprobado" });
    expect(f.get("A").current_start).toBe("2026-09-10"); expect(f.list("programa_obra_revisions")).toHaveLength(1);
  });
  it("import preview preserves renamed identity, flags duplicates and reports omissions", async () => {
    const f = fixture();
    const renamed = [{ nivel: 1, partida: "Instalaciones" }, { nivel: 2, partida: "Instalaciones", familia: "Pruebas nuevas", detalle_id: "familyA" }];
    const preview = await previewProgramImport(f.ctx, "project", renamed);
    expect(preview.rows[1].existingId).toBe("familyA"); expect(preview.canApply).toBe(true); expect(preview.absent.some((r) => r.id === "familyB")).toBe(true);
    expect((await previewProgramImport(f.ctx, "project", [...renamed, renamed[1]])).canApply).toBe(false);
    expect((await previewProgramImport(f.ctx, "project", [{ ...renamed[1], detalle_id: "missing" }])).canApply).toBe(false);
  });
  it("import applies rename by ID, preserves omitted families and refuses a stale review", async () => {
    const f = fixture(); f.as("admin");
    f.list("programa_obra_fronts").push({ _id: "general", proyecto: "project", name: "General", archived: false });
    const rows = [{ nivel: 1, partida: "Instalaciones" }, { nivel: 2, partida: "Instalaciones", familia: "Pruebas nuevas", detalle_id: "familyA" }];
    const preview = await previewProgramImport(f.ctx, "project", rows);
    await f.call(bulkUpsertFromExcel, { proyecto: "project", rows, expected_fingerprint: preview.fingerprint });
    expect(f.get("familyA").familia).toBe("Pruebas nuevas");
    expect(f.get("familyB").orden).toBe(1); expect(f.get("familyB").archived).not.toBe(true);
    expect(f.get("A").detalle_id).toBe("familyA");
    await expect(f.call(bulkUpsertFromExcel, { proyecto: "project", rows, expected_fingerprint: preview.fingerprint })).rejects.toThrow(/cambió/);
  });
  it("legacy mutation cannot arbitrarily update an aggregate with several fronts", async () => {
    const f = fixture();
    await expect(f.call(updateDetalleAvance, { detalle_id: "familyB", avance_porcentaje: 20, execution_date: "2026-09-15" })).rejects.toThrow(/frente/);
    await expect(f.call(updateDetalleAvance, { detalle_id: "familyA", avance_porcentaje: 20 })).rejects.toThrow(/fecha/);
    await f.call(updateDetalleAvance, { detalle_id: "familyA", avance_porcentaje: 20, execution_date: "2026-09-15" });
    expect(f.get("A").progress).toBe(20);
  });
  it("reports and the program use the same progress including missing and zero weights", async () => {
    const f = fixture(); await f.advance("A", 100); await f.advance("B", 50);
    f.get("familyB").peso = 0;
    let model = await f.call(program.getExecutionProgram, { proyecto: "project" });
    const report = () => buildReportSnapshot(f.ctx, { proyecto: "project", periodStart: "2026-09-01", periodEnd: model.today, periodKey: "2026-09", profile: "full" });
    expect((await report()).program.physical_progress_percent).toBe(model.summaries.overall.progress);
    expect(model.summaries.overall.released).toBe(false);
    delete f.get("familyB").peso;
    model = await f.call(program.getExecutionProgram, { proyecto: "project" });
    const provisional = await report();
    expect(provisional.program.physical_progress_percent).toBe(model.summaries.overall.progress);
    expect(provisional.program.planned_progress_percent).toBe(model.summaries.overall.planned);
    expect(model.summaries.overall.provisional).toBe(true);
  });
  it("grants designated project authority and preserves the baseline after replanning", async () => {
    const f = fixture(); f.as("admin"); f.get("config").enabled = false;
    await f.call(program.configureExecutionProgram, { proyecto: "project", weekdays: [1, 2, 3, 4, 5, 6], holidays: [], enabled: true, reason: "Programa aprobado", version: 1 });
    const baseline = f.list("programa_obra_revisions")[0].snapshot_json;
    await f.call(program.setExecutionPermission, { proyecto: "project", user_id: "editor", plan: true, accept: false, exceptions: false });
    f.as("editor"); await f.call(program.createExecutionFront, { proyecto: "project", name: "Azotea" });
    const edits = [{ activity_id: "A", start: "2026-09-10", finish: "2026-09-11" }];
    const preview = await f.call(program.previewExecutionReschedule, { proyecto: "project", edits });
    await f.call(program.applyExecutionReschedule, { proyecto: "project", edits, version: preview.version, reason: "Aprobación de cambio" });
    expect(f.list("programa_obra_revisions")[0].snapshot_json).toBe(baseline);
    expect((await f.call(program.getExecutionProgram, { proyecto: "project" })).capabilities.accept).toBe(false);
  });
});
