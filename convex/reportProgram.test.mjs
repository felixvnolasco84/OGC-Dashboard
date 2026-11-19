import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildReportSnapshot } from "./reportSnapshot.ts";
import { paginateProgramActivities, renderReportPdf } from "./reportPdf.ts";
import { reportProgramFixture } from "../scripts/fixtures/report-program.mjs";

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

  it("keeps the three-month cutoff filter and includes a parent's context for an eligible family", async () => {
    const snapshot = await build(reportProgramFixture({ partidas: 1, familias: 3 }));
    const parent = snapshot.program.activities[0];
    const child = snapshot.program.activities[1];
    const input = [
      { ...parent, start: "2026-08-01", end: "2026-09-30" },
      { ...child, start: "2026-11-01", end: "2026-11-30" },
      { ...child, id: "old", start: "2026-08-01", end: "2026-09-30" },
      { ...child, id: "future", start: "2027-01-01", end: "2027-02-01" },
      { ...child, id: "invalid", start: null },
      { ...child, id: "reversed", start: "2026-11-30", end: "2026-11-01" },
    ];
    const pages = paginateProgramActivities(new jsPDF(), input, snapshot.period.end);
    expect(pages[0].rows.map((r) => r.id)).toEqual([parent.id, child.id]);
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
