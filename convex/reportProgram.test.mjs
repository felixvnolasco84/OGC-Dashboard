import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildReportSnapshot } from "./reportSnapshot.ts";
import { getReportProgramGeometry, paginateProgramActivities, renderReportPdf } from "./reportPdf.ts";
import { reportProgramDelayFixture, reportProgramFixture } from "../scripts/fixtures/report-program.mjs";
import { getExecutionTiming, aggregateExecutionTiming, getProgramBarDates, getProgramDelay } from "../src/lib/programa-obra-delay.ts";

const insights = { executive_summary: "Datos sintéticos", insights: [] };
const build = (f) => buildReportSnapshot(f.ctx, f.args);
const paginate = (snapshot) => paginateProgramActivities(new jsPDF({ unit: "mm", format: "letter" }), snapshot.program.activities, snapshot.period.end);
async function readPdf(bytes) {
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      pages.push(items.filter((i) => "str" in i));
    }
    return { pages, text: pages.flat().map((i) => i.str).join(" ") };
  } finally { await task.destroy(); }
}

describe("original programme format with full-page pagination", () => {
  it("fits substantially more partidas on the first sheet and preserves every family in order", async () => {
    const snapshot = await build(reportProgramFixture());
    const pages = paginate(snapshot);
    expect(pages[0].rows.length).toBeGreaterThan(12);
    expect(pages[0].rows.filter((r) => r.level === 1).length).toBeGreaterThanOrEqual(6);
    expect(pages[0].matrixHeight).toBeGreaterThan(150);
    expect(pages).toHaveLength(2);
    const expectedFamilies = snapshot.program.activities.filter((r) => r.level > 1).map((r) => r.id);
    expect(pages.flatMap((page) => page.rows.filter((r) => r.level > 1).map((r) => r.id))).toEqual(expectedFamilies);
    for (const page of pages) {
      expect(page.rows[0].level).toBe(1);
      expect(40.5 + page.matrixHeight + 7 + page.narrativeHeight).toBeLessThanOrEqual(266.4);
    }
    expect(266.4 - (40.5 + pages[0].matrixHeight + 7 + pages[0].narrativeHeight)).toBeLessThan(5.3);
  });

  it("repeats the parent of a large desglose on each continuation without losing or repeating families", async () => {
    const snapshot = await build(reportProgramFixture({ partidas: 1, familias: 90 }));
    const pages = paginate(snapshot);
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      expect(page.rows[0].id).toBe("schedule-0");
      expect(page.rows.length).toBeGreaterThan(1);
      expect(40.5 + page.matrixHeight + 7 + page.narrativeHeight).toBeLessThanOrEqual(266.4);
    }
    const families = pages.flatMap((page) => page.rows.filter((r) => r.level > 1).map((r) => r.id));
    expect(families).toHaveLength(90);
    expect(new Set(families).size).toBe(90);
  });

  it("retains the original 72 mm matrix for short reports", async () => {
    const snapshot = await build(reportProgramFixture({ partidas: 3, familias: 3 }));
    const pages = paginate(snapshot);
    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toHaveLength(12);
    expect(pages[0].matrixHeight).toBe(72);
  });

  it("keeps the cutoff filter, adding previous pending work and its parent context", async () => {
    const snapshot = await build(reportProgramFixture({ partidas: 1, familias: 3 }));
    const parent = { ...snapshot.program.activities[0], bar_start: undefined, bar_end: undefined };
    const child = { ...snapshot.program.activities[1], bar_start: undefined, bar_end: undefined };
    const input = [
      { ...parent, start: "2026-08-01", end: "2026-09-30" },
      { ...child, start: "2026-11-01", end: "2026-11-30" },
      { ...child, id: "old", start: "2026-08-01", end: "2026-09-30" },
      { ...child, id: "old-completed", start: "2026-08-01", end: "2026-09-30", delayed: false, actual_progress_percent: 100 },
      { ...child, id: "future", start: "2027-01-01", end: "2027-02-01" },
      { ...child, id: "invalid", start: null },
      { ...child, id: "reversed", start: "2026-11-30", end: "2026-11-01" },
    ];
    const pages = paginateProgramActivities(new jsPDF(), input, snapshot.period.end);
    expect(pages[0].rows.map((r) => r.id)).toEqual([parent.id, child.id, "old"]);
  });

  it("handles an empty programme without emitting blank continuation pages", async () => {
    const snapshot = await build(reportProgramFixture({ partidas: 0 }));
    expect(paginate(snapshot)).toHaveLength(1);
    const pdf = await readPdf(await renderReportPdf(snapshot, insights, ["program"]));
    expect(pdf.pages).toHaveLength(2);
    expect(pdf.text).toContain("No hay actividades con fechas válidas para mostrar.");
  });

  it("renders the original Gantt, comments and every family across full-height sheets", async () => {
    const fixture = reportProgramFixture();
    const snapshot = await build(fixture);
    const result = await readPdf(await renderReportPdf(snapshot, insights, ["program"]));
    expect(result.pages).toHaveLength(3);
    const leftColumnText = result.pages.flat().filter((item) => item.transform[4] < 150).map((item) => item.str).join(" ");
    for (const family of fixture.details) expect(leftColumnText.split(family.familia)).toHaveLength(2);
    for (const parent of fixture.partidas) expect(result.text).toContain(parent.nombre);
    expect(result.text).toContain("registra");
    expect(result.text).toContain("real frente a");
    expect(result.text).not.toContain("Panorama por partida");
    expect(result.text).not.toContain("Detalle operativo");
    expect(result.text).not.toContain("Estado actual consultado");
    expect(result.text).toContain("CONTINUACIÓN 2");
    for (const page of result.pages.slice(1)) {
      const text = page.map((item) => item.str).join(" ");
      expect(text).toContain("PROGRAMA DE OBRA - AVANCE POR CONCEPTO");
      expect(text).toContain("PARTIDA · FAMILIA");
      expect(text).toContain("PRESUPUESTO");
      expect(text).toContain("Avance:");
      expect(text).toContain("Octubre");
      expect(text).toContain("Noviembre");
      expect(text).toContain("Diciembre");
      for (const item of page) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(35);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(579);
        expect(item.transform[5]).toBeGreaterThan(30);
        expect(item.transform[5]).toBeLessThan(780);
      }
    }
  });

  it("keeps monetary fields hidden in the contractor's expanded Gantt", async () => {
    const f = reportProgramFixture();
    const snapshot = await buildReportSnapshot(f.ctx, { ...f.args, profile: "contractor" });
    expect(snapshot.program.activities.every((r) => r.approved_budget === null)).toBe(true);
    const result = await readPdf(await renderReportPdf(snapshot, insights, ["program"]));
    expect(result.text).not.toContain("$290,780");
    expect(result.text).toContain("FAMILIA 12.3");
  });
});

describe("shared delay rules and cropped report intervals", () => {
  const input = { start: "2026-11-01", end: "2026-12-10", cutoff: "2026-11-19", overdue: false };

  it("preserves the full seven-day grace period and never substitutes capture time for real dates", () => {
    expect(getProgramDelay({ ...input, cutoff: "2026-11-08", timing: { has_reported_progress: false } })).toBeNull();
    expect(getProgramDelay({ ...input, cutoff: "2026-11-09", timing: { has_reported_progress: false } })).toMatchObject({ kind: "late_start", end: "2026-11-09" });
    expect(getProgramDelay({ ...input, timing: { has_reported_progress: true, actual_start: "2026-11-08" } })).toBeNull();
    expect(getProgramDelay({ ...input, timing: { has_reported_progress: true, actual_start: "2026-11-09" } })).toMatchObject({ kind: "late_start", end: "2026-11-09" });
    expect(getProgramDelay({ ...input, timing: { has_reported_progress: true, actual_start: "2026-11-01" } })).toBeNull();
    expect(getProgramDelay({ ...input, timing: { has_reported_progress: true } })).toBeNull();
    expect(getProgramDelay(input)).toBeNull();
  });

  it("uses the saved finish for overdue and late completion without extending it to the cutoff", () => {
    expect(getProgramDelay({ ...input, overdue: true })).toEqual({ kind: "overdue", start: input.start, end: input.end });
    expect(getProgramDelay({ ...input, timing: { actual_finish: "2026-12-10" } })).toBeNull();
    expect(getProgramDelay({ ...input, timing: { actual_finish: "2026-12-11" } })).toMatchObject({ kind: "late_finish", end: input.end });
    expect(getProgramDelay({ ...input, timing: { actual_finish: null } })).toBeNull();
  });

  it("keeps finish dates inclusive and marks 100 percent pending acceptance as overdue", async () => {
    const f = reportProgramFixture({ partidas: 1, familias: 1 });
    Object.assign(f.schedules[0], { fecha_inicio: "2026-11-01", fecha_fin: "2026-11-19" });
    Object.assign(f.details[0], { fecha_inicio: "2026-11-01", fecha_fin: "2026-11-19", avance_porcentaje: 50, actual_start: "2026-11-01" });
    let snapshot = await build(f);
    expect(snapshot.program.activities[1].delayed).toBe(false);
    expect(getReportProgramGeometry(snapshot.program.activities[1], f.args.periodEnd).delay_kind).toBeNull();
    f.tables.programa_obra_activities = [{ _id: "front-activity", proyecto: "project", detalle_id: f.details[0]._id, front_id: "front", name: "Frente", progress: 100, share: 100, mandatory: true, archived: false, requires_review: true, current_start: "2026-11-01", current_finish: "2026-11-18", actual_start: "2026-11-01", actual_finish: "2026-11-18" }];
    snapshot = await build(f);
    expect(snapshot.program.activities[1].actual_progress_percent).toBe(100);
    expect(snapshot.program.activities[1].delayed).toBe(true);
    expect(getReportProgramGeometry(snapshot.program.activities[1], f.args.periodEnd).delay_kind).toBe("overdue");
  });

  it("requires complete real-date evidence when aggregating front and partida timing", () => {
    const unknown = getExecutionTiming([{ progress: 50, actual_start: "2026-11-10" }, { progress: 25 }]);
    expect(unknown).toEqual({ has_reported_progress: true, actual_start: null, actual_finish: null });
    const known = getExecutionTiming([{ progress: 100, actual_start: "2026-11-03", actual_finish: "2026-11-14" }, { progress: 100, actual_start: "2026-11-05", actual_finish: "2026-11-18" }]);
    expect(known).toMatchObject({ actual_start: "2026-11-03", actual_finish: "2026-11-18" });
    expect(aggregateExecutionTiming([known, unknown])).toEqual({ has_reported_progress: true, actual_start: null, actual_finish: null });
  });

  it("uses legacy history as proof of reported work without treating its timestamp as a start date", async () => {
    const f = reportProgramFixture({ partidas: 1, familias: 1 });
    Object.assign(f.schedules[0], { fecha_inicio: input.start, fecha_fin: input.end });
    Object.assign(f.details[0], { fecha_inicio: input.start, fecha_fin: input.end, avance_porcentaje: 0 });
    f.tables.programa_obra_avance_historial = [{ _id: "history", proyecto: "project", detalle_id: f.details[0]._id, old_value: 40, new_value: 0, created_at: Date.parse("2026-11-19T12:00:00Z") }];
    const snapshot = await build(f);
    expect(snapshot.program.activities[1].execution_timing).toEqual({ has_reported_progress: true, actual_start: null, actual_finish: null });
    expect(getReportProgramGeometry(snapshot.program.activities[1], f.args.periodEnd).delay_kind).toBeNull();
  });

  it("keeps mixed front dates unknown in the family and parent and excludes archived fronts", async () => {
    const f = reportProgramFixture({ partidas: 1, familias: 2 });
    const leaf = (id, family, patch) => ({ _id: id, proyecto: "project", detalle_id: family, front_id: id, name: id, progress: 50, share: 50, mandatory: true, archived: false, requires_review: false, current_start: "2026-11-01", current_finish: "2026-12-10", ...patch });
    f.tables.programa_obra_activities = [
      leaf("a", "family-0-0", { actual_start: "2026-11-10" }),
      leaf("b", "family-0-0", {}),
      leaf("c", "family-0-1", { progress: 100, share: 100, actual_start: "2026-11-01", actual_finish: "2026-11-18" }),
      leaf("archived", "family-0-1", { archived: true }),
    ];
    const snapshot = await build(f);
    const parent = snapshot.program.activities[0];
    const first = snapshot.program.activities.find((r) => r.id === "family-0-0");
    const second = snapshot.program.activities.find((r) => r.id === "family-0-1");
    expect(first.execution_timing).toEqual({ has_reported_progress: true, actual_start: null, actual_finish: null });
    expect(parent.execution_timing).toEqual({ has_reported_progress: true, actual_start: null, actual_finish: null });
    expect(second.execution_timing.actual_finish).toBe("2026-11-18");
    expect(getReportProgramGeometry(first, snapshot.period.end).delay_kind).toBeNull();
  });

  it("crops progress from the full interval and marks late-start fragments prior to the window", async () => {
    const snapshot = await build(reportProgramDelayFixture());
    const row = snapshot.program.activities.find((r) => r.id === "family-3-0");
    const geometry = getReportProgramGeometry(row, snapshot.period.end);
    expect(geometry.prior_late_start).toBe(true);
    expect(geometry.delay).toBeNull();
    expect(geometry.bar.start).toBe(0);
    expect(geometry.progress.end).toBeGreaterThan(0);
    expect(geometry.progress.end).toBeLessThan(geometry.bar.end * 0.55);
    expect(getReportProgramGeometry({ ...row, actual_progress_percent: 20 }, snapshot.period.end).progress).toBeNull();
    const oneDay = getReportProgramGeometry({ ...row, start: "2026-11-19", end: "2026-11-19", bar_start: "2026-11-19", bar_end: "2026-11-19" }, snapshot.period.end);
    expect(oneDay.bar.end).toBeGreaterThan(oneDay.bar.start);
    const oneDayLate = getReportProgramGeometry({ ...row, start: "2026-11-01", end: "2026-11-01", bar_start: "2026-11-01", bar_end: "2026-11-01", execution_timing: { has_reported_progress: true, actual_start: "2026-11-10" } }, snapshot.period.end);
    expect(oneDayLate.delay_kind).toBe("late_start");
    expect(oneDayLate.delay).toEqual(oneDayLate.bar);
  });

  it("normalizes saved extra time once and retains the original delayed interval", () => {
    expect(getProgramBarDates({ start: "2026-09-01", end: "2026-09-30", parent_start: "2026-09-05", parent_end: "2026-09-25", extra_amount: 5, extra_unit: "dias" }))
      .toEqual({ start: "2026-09-05", end: "2026-09-25", extension_end: "2026-09-30" });
    expect(getProgramBarDates({ start: "2026-09-01", end: "2026-09-20", parent_end: "2026-09-30", extra_amount: 5, extra_unit: "dias" }))
      .toMatchObject({ end: "2026-09-20", extension_end: "2026-09-25" });
  });

  it("renders previous pending markers, historical delays and the original paginated format", async () => {
    const f = reportProgramDelayFixture();
    const snapshot = await build(f);
    const pages = paginate(snapshot);
    const selectedIds = pages.flatMap((p) => p.rows.map((r) => r.id));
    expect(selectedIds).toContain("family-0-0");
    expect(selectedIds).not.toContain("schedule-7");
    expect(selectedIds).not.toContain("family-7-0");
    const previous = getReportProgramGeometry(snapshot.program.activities.find((r) => r.id === "family-0-0"), snapshot.period.end);
    expect(previous).toMatchObject({ previous_pending: true, bar: null, progress: null, delay: null });
    expect(getReportProgramGeometry(snapshot.program.activities.find((r) => r.id === "family-4-0"), snapshot.period.end).delay_kind).toBe("late_finish");
    expect(getReportProgramGeometry(snapshot.program.activities.find((r) => r.id === "family-5-0"), snapshot.period.end).delay_kind).toBeNull();
    expect(getReportProgramGeometry(snapshot.program.activities.find((r) => r.id === "family-10-0"), snapshot.period.end).delay_kind).toBeNull();
    const result = await readPdf(await renderReportPdf(snapshot, insights, ["program"]));
    expect(result.text).toContain("Pendiente anterior · venció 15 jul 2026");
    expect(result.text).toContain("Inicio tardío anterior");
    expect(result.text).toContain("Fondo rojo: atraso");
    expect(result.text).toContain("corte 19 nov 2026");
    expect(result.text).not.toContain("TERMINADA ANTERIOR");
    expect(result.text).toContain("CONTINUACIÓN 2");
    expect(result.text).toContain("inicio real tardío registrado");
    for (const page of result.pages.slice(1)) for (const item of page) {
      expect(item.transform[4]).toBeGreaterThanOrEqual(35);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(579);
      expect(item.transform[5]).toBeGreaterThan(30);
    }
  });

  it("renders old snapshots with only the saved delayed flag", async () => {
    const snapshot = await build(reportProgramDelayFixture());
    for (const row of snapshot.program.activities) {
      delete row.execution_timing;
      delete row.bar_start;
      delete row.bar_end;
    }
    const previous = snapshot.program.activities[0];
    expect(getReportProgramGeometry(previous, snapshot.period.end)).toMatchObject({ previous_pending: true, delay_kind: "overdue" });
    const lateCompletion = snapshot.program.activities.find((r) => r.id === "schedule-4");
    expect(getReportProgramGeometry(lateCompletion, snapshot.period.end).delay_kind).toBeNull();
    const pdf = await readPdf(await renderReportPdf(snapshot, insights, ["program"]));
    expect(pdf.text).toContain("Pendiente anterior");
  });
});
