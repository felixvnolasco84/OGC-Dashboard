import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildReportLogbook, reportPhotoNotes } from "./reportLogbook.ts";
import { buildReportSnapshot } from "./reportSnapshot.ts";
import { renderReportPdf } from "./reportPdf.ts";
import { reportLogbookArgs, reportLogbookFixture } from "../scripts/fixtures/report-logbook.mjs";

async function readPdf(bytes) {
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await task.promise;
  try {
    const pages = [];
    let imageCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const operators = await page.getOperatorList();
      imageCount += operators.fnArray.filter((operation) => operation === OPS.paintImageXObject || operation === OPS.paintInlineImageXObject).length;
      pages.push(content.items.filter((item) => "str" in item));
    }
    return { pages, imageCount, text: pages.flat().map((item) => item.str).join(" ") };
  } finally { await task.destroy(); }
}

const insights = { executive_summary: "Prueba de cobertura de bitácora.", insights: [] };

describe("complete daily report evidence", () => {
  it("keeps every day and photo past the old category/global limits, including days with only photo progress", async () => {
    const f = reportLogbookFixture(5);
    const snapshot = await buildReportSnapshot(f.ctx, reportLogbookArgs);
    const section = snapshot.logbook.sections[0];
    expect(snapshot.logbook.entries_in_period).toBe(6);
    expect(snapshot.logbook.incidents_in_period).toBe(0);
    expect(section.entries.map((entry) => entry.date)).toEqual([5, 6, 7, 8, 9, 10].map((day) => `2026-10-${String(day).padStart(2, "0")}`));
    expect(section.photos).toHaveLength(30);
    expect(f.photoReads).toHaveLength(30);
    expect(section.entries[3].progress).toContain("ARMADO DE LOSA PARA CUARTO DE MÁQUINAS");
    expect(section.entries[4].progress).toEqual([]);
    expect(section.entries[4].photo_ids).toHaveLength(5);
    expect(section.photos.find((photo) => photo.id === section.entries[4].photo_ids[1]).notes)
      .toEqual(expect.arrayContaining([expect.objectContaining({ text: "Detalle adicional exclusivo del comentario 21." })]));

    const parsed = await readPdf(await renderReportPdf(snapshot, insights, ["logbook"]));
    for (const day of [5, 6, 7, 8, 9, 10]) expect(parsed.text).toContain(`${String(day).padStart(2, "0")} oct 2026`);
    expect(parsed.text).toContain("ARMADO DE LOSA PARA CUARTO DE MÁQUINAS");
    expect(parsed.text).toContain("Detalle adicional exclusivo del comentario 21.");
    for (let number = 1; number <= 30; number++) expect(parsed.text).toMatch(new RegExp(`Foto ${number} ·`));
    // The uploaded description copied into the first comment is printed once.
    expect(parsed.text.split(f.photos[0].descripcion)).toHaveLength(2);
  }, 20000);

  it("does not load deleted/out-of-period evidence and retains multiple entries on the same date", async () => {
    const f = reportLogbookFixture();
    f.logs[0].deleted_at = 100;
    f.logs[5].fecha = "11/10/2026";
    f.photos[2].deleted_at = 100;
    f.logs.push({ ...f.logs[3], _id: "second-entry", avance_dia: "Otra captura del mismo día", uploaded_at: 200 });
    const result = await buildReportLogbook(f.ctx, f.logs.reverse(), f.photos, "2026-10-05", "2026-10-10");
    expect(result.entries_in_period).toBe(5);
    expect(result.sections[0].entries.map((entry) => entry.id)).toEqual(["log-1", "log-2", "log-3", "second-entry", "log-4"]);
    expect(f.photoReads).not.toContain("photo-0-0");
    expect(f.photoReads).not.toContain("photo-1-0");
    expect(f.photoReads).not.toContain("photo-5-0");
    expect(result.sections[0].photos).toHaveLength(7);
  });

  it("includes legacy descriptions, legacy comments and all thread comments, deduplicating only legacy copies per photo", () => {
    const notes = reportPhotoNotes({ descripcion: "Resane terminado", comment: "Otra actividad" }, [
      { _id: "second", comment: "Revisión adicional", user_name: "Ana", created_at: 2 },
      { _id: "first", comment: " Resane terminado ", user_name: "Sergio", created_at: 1 },
      { _id: "third", comment: "Revisión adicional", user_name: "Luis", created_at: 3 },
    ]);
    expect(notes.map((note) => note.text)).toEqual(["Otra actividad", "Resane terminado", "Revisión adicional", "Revisión adicional"]);
    expect(notes[1].author).toBe("Sergio");
    expect(notes[3].author).toBe("Luis");
    expect(reportPhotoNotes({ descripcion: "", comment: "Texto antiguo" }, [])).toEqual([{ text: "Texto antiguo", source: "comment" }]);
  });

  it("retains repeated work on different days and every incident across categories", async () => {
    const f = reportLogbookFixture(1);
    f.logs[0].comentarios = "Incidencia del lunes conservada.";
    f.logs[1].comentarios = "Incidencia del martes conservada.";
    f.logs[4].categoria = "Acabados";
    const snapshot = await buildReportSnapshot(f.ctx, reportLogbookArgs);
    expect(snapshot.logbook.incidents_in_period).toBe(2);
    expect(snapshot.logbook.sections).toHaveLength(2);
    const parsed = await readPdf(await renderReportPdf(snapshot, insights, ["logbook"]));
    expect(parsed.text).toContain(f.logs[0].comentarios);
    expect(parsed.text).toContain(f.logs[1].comentarios);
    expect(parsed.text.split("ARMADO DE MURO PARA TERRAZA EN PB")).toHaveLength(3);
    expect(parsed.text).toContain("ACABADOS");
  });

  it("paginates long progress, incidents and photo comments without losing their final lines or crossing page margins", async () => {
    const f = reportLogbookFixture(1);
    f.logs.splice(1);
    f.photos.splice(1);
    f.comments.splice(1);
    f.logs[0].avance_dia = `TORRE H:\n${"Narrativa completa de obra y revisión de los trabajos. ".repeat(300)}FIN DEL AVANCE`;
    f.logs[0].comentarios = `${"Incidencia documentada para seguimiento. ".repeat(100)}FIN DE INCIDENCIA`;
    f.comments[0].comment = `${"Comentario fotográfico con avance adicional y detalles de obra. ".repeat(250)}FIN DEL COMENTARIO`;
    const snapshot = await buildReportSnapshot(f.ctx, reportLogbookArgs);
    expect(snapshot.logbook.incidents_in_period).toBe(1);
    const parsed = await readPdf(await renderReportPdf(snapshot, insights, ["logbook"]));
    for (const ending of ["FIN DEL AVANCE", "FIN DE INCIDENCIA", "FIN DEL COMENTARIO"]) expect(parsed.text).toContain(ending);
    expect(parsed.pages.length).toBeGreaterThan(5);
    for (const item of parsed.pages.flat()) {
      if (!item.str.trim()) continue;
      expect(item.transform[4]).toBeGreaterThanOrEqual(36);
      expect(item.transform[5]).toBeGreaterThanOrEqual(36);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(578);
      expect(item.transform[5]).toBeLessThanOrEqual(721);
    }
  }, 20000);

  it("fetches and embeds photos after number 24, loading at most two images at once", async () => {
    const f = reportLogbookFixture(5);
    const image = readFileSync("src/assets/img/slider/Altadependencia.png");
    f.ctx.storage.getUrl = async (id) => `https://fixture.invalid/${id}`;
    let concurrent = 0, peak = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      concurrent++; peak = Math.max(peak, concurrent);
      await Promise.resolve(); concurrent--;
      return new Response(image, { headers: { "content-type": "image/png" } });
    });
    try {
      const snapshot = await buildReportSnapshot(f.ctx, reportLogbookArgs);
      const parsed = await readPdf(await renderReportPdf(snapshot, insights, ["logbook"]));
      expect(fetchMock).toHaveBeenCalledTimes(30);
      expect(peak).toBeLessThanOrEqual(2);
      expect(parsed.text).toContain("Foto 30 ·");
      expect(parsed.text).not.toContain("Vista previa no disponible");
      expect(parsed.imageCount).toBe(31); // Thirty photo placements and the cover logo.
    } finally { fetchMock.mockRestore(); }
  }, 20000);

  it("supports saved summaries without daily entries and prints all their captions", async () => {
    const f = reportLogbookFixture();
    const snapshot = await buildReportSnapshot(f.ctx, reportLogbookArgs);
    const section = snapshot.logbook.sections[0];
    delete section.entries;
    section.photos.forEach((photo) => { delete photo.notes; });
    const parsed = await readPdf(await renderReportPdf(snapshot, insights, ["logbook"]));
    expect(parsed.text).toContain("ARMADO DE LOSA PARA CUARTO DE MÁQUINAS");
    expect(parsed.text).toContain(section.photos.at(-1).caption);
  });

  it("keeps visibility restrictions and handles an empty period", async () => {
    const f = reportLogbookFixture();
    for (const profile of ["viewer", "finance"]) {
      const snapshot = await buildReportSnapshot(f.ctx, { ...reportLogbookArgs, profile });
      expect(snapshot.logbook.sections).toEqual([]);
    }
    const empty = await buildReportSnapshot(f.ctx, { ...reportLogbookArgs, periodStart: "2026-10-11", periodEnd: "2026-10-12" });
    expect(empty.logbook.entries_in_period).toBe(0);
    const parsed = await readPdf(await renderReportPdf(empty, insights, ["logbook"]));
    expect(parsed.text).toContain("No hay entradas de Bitácora en el periodo seleccionado.");
  });
});
