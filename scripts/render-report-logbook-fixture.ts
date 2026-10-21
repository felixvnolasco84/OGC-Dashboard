import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReportSnapshot } from "../convex/reportSnapshot";
import { renderReportPdf } from "../convex/reportPdf";
import { reportLogbookArgs, reportLogbookFixture } from "./fixtures/report-logbook.mjs";

// This preview uses synthetic records and local sample images, not production data.
const fixture = reportLogbookFixture();
const images = [
  "src/assets/img/slider/Altadependencia.png",
  "src/assets/img/slider/vidaAsistida.png",
].map((path) => `data:image/png;base64,${readFileSync(resolve(path)).toString("base64")}`);
fixture.ctx.storage.getUrl = async (storageId: string) => images[Number(storageId.split("-").at(-1)) % images.length];
fixture.comments.push({
  _id: "long-comment", photo_id: "photo-5-1", user_id: "reviewer", user_name: "Equipo de obra", created_at: 1000,
  comment: `${"Detalle de prueba para verificar la continuación de comentarios largos en las páginas siguientes. ".repeat(75)}FIN DEL COMENTARIO EXTENSO.`,
});
const snapshot = await buildReportSnapshot(fixture.ctx, reportLogbookArgs);
snapshot.logbook.sections?.forEach((section) => { section.title += " (datos de prueba)"; });
const pdf = await renderReportPdf(snapshot, { executive_summary: "Datos sintéticos para revisión visual.", insights: [] }, ["logbook"]);
const outputDirectory = resolve(process.env.REPORT_FIXTURE_OUTPUT_DIR || "output/pdf");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "reporte-bitacora-torre-h-fixture.pdf");
writeFileSync(outputPath, pdf);
console.log(outputPath);
