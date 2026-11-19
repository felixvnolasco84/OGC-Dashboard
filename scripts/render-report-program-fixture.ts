import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReportSnapshot } from "../convex/reportSnapshot";
import { renderReportPdf } from "../convex/reportPdf";
import { reportProgramDelayFixture } from "./fixtures/report-program.mjs";

const fixture = reportProgramDelayFixture();
const snapshot = await buildReportSnapshot(fixture.ctx, fixture.args);
const outputDirectory = resolve("output/pdf");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "reporte-programa-retrasos-fixture.pdf");
writeFileSync(outputPath, await renderReportPdf(snapshot, { executive_summary: "Datos sintéticos para revisión visual.", insights: [] }, ["program"]));
console.log(outputPath);
