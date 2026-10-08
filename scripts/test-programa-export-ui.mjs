import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/output/programa-export`;
await mkdir(output, { recursive: true });
// Observe the actual capture DOM, and inject one capture failure after temporary
// styles are applied. The exporter, html2canvas and jsPDF otherwise run unchanged.
const observeExport = {
  name: "observe-programa-pdf-test",
  enforce: "pre",
  transform(source, id) {
    if (!id.replaceAll("\\", "/").endsWith("/ProgramaObraPdfExport.ts")) return;
    return source.replace("await waitForLayout(120);", `
      await waitForLayout(120);
      const testRows = Array.from(leftColumnsEl.children).slice(1);
      window.__captures ??= [];
      window.__captures.push({
        includeNotices,
        names: Array.from(leftColumnsEl.querySelectorAll("span[title]")).map(el => el.title),
        leftRows: testRows.map(el => ({ top: el.offsetTop, height: el.offsetHeight })),
        timelineRows: Array.from(timelineEl.children).slice(1).map(el => ({ top: el.offsetTop, height: el.offsetHeight })),
        markers: timelineEl.querySelectorAll('button[aria-label*=" de "]').length,
        commentBars: Array.from(timelineEl.querySelectorAll("div")).filter(el => el.classList.contains("bg-[#3B82F6]")).length,
        delayBars: Array.from(timelineEl.querySelectorAll("div")).filter(el => el.classList.contains("bg-[#B17C7C]")).length,
      });
      if (window.__failCapture) throw new Error("Fallo de captura de prueba");
    `);
  },
};
const server = await createServer({
  configFile: false, root, cacheDir: `${root}/node_modules/.vite-programa-export-test`,
  optimizeDeps: { entries: ["e2e/programa/export-preview.html"] },
  plugins: [observeExport, react()],
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/programa/export-convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 4187, strictPort: true },
});
await server.listen();
let browser;
const captures = [];
async function openExport(page) {
  await page.getByRole("button", { name: "Archivo", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exportar PDF", exact: true }).click();
  await page.getByRole("dialog", { name: "Exportar programa a PDF" }).waitFor();
}
async function exportPdf(page, filename) {
  const downloaded = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  const download = await downloaded;
  await download.saveAs(`${output}/${filename}.pdf`);
  assert.ok((await stat(`${output}/${filename}.pdf`)).size > 20000, "PDF must contain captured Gantt images");
  await page.getByRole("button", { name: "Archivo", exact: true }).waitFor();
  const capture = await page.evaluate(() => window.__captures.at(-1));
  captures.push({ filename, ...capture });
  assert.equal(capture.leftRows.length, capture.timelineRows.length, "Both halves must capture the same rows");
  capture.leftRows.forEach((row, i) => {
    assert.equal(row.height, 56);
    assert.equal(capture.timelineRows[i].height, 56);
    assert.equal(row.top - capture.leftRows[0].top, capture.timelineRows[i].top - capture.timelineRows[0].top);
  });
  assert.equal(await page.locator("[data-pdf-export-active]").count(), 0);
  assert.equal(await page.locator("#__pdf-export-overrides__").count(), 0);
  return capture;
}
async function scrollState(page, set = false) {
  return page.evaluate((set) => {
    const columns = document.querySelector('span[title="Estructura"]').closest('.overflow-y-auto');
    const timeline = columns.nextElementSibling;
    if (set) { columns.scrollTop = 700; timeline.scrollTop = 700; timeline.scrollLeft = 140; }
    return [columns.scrollTop, timeline.scrollTop, timeline.scrollLeft];
  }, set);
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4187/e2e/programa/export-preview.html");
  await page.getByRole("button", { name: "Expandir Estructura", exact: true }).click();
  const originalScroll = await scrollState(page, true);
  await openExport(page);
  assert.equal(await page.getByRole("checkbox").count(), 3, "Only partidas with families should be selectable");
  assert.equal(await page.getByRole("checkbox", { name: "Desglosar Estructura" }).isChecked(), true);
  assert.equal(await page.getByRole("checkbox", { name: "Incluir avisos y comentarios" }).isChecked(), true);
  await page.getByRole("button", { name: "Quitar selección" }).click();
  await page.getByRole("button", { name: "Seleccionar todas" }).click();
  await page.screenshot({ path: `${output}/dialog-desktop.png` });
  const full = await exportPdf(page, "completo-con-avisos");
  assert.equal(full.names.length, 59);
  assert.deepEqual(full.names.slice(-4), ["Instalaciones", "Red 01", "Red 02", "Acabados"]);
  assert.equal(full.markers, 9);
  assert.equal(full.commentBars, 2);
  assert.deepEqual(await scrollState(page), originalScroll);
  assert.equal(await page.getByRole("button", { name: "Contraer Estructura", exact: true }).count(), 1);

  await page.getByRole("textbox", { name: "Buscar partida o familia" }).fill("Red");
  await openExport(page);
  await page.getByRole("checkbox", { name: "Desglosar Estructura" }).uncheck();
  await page.getByRole("checkbox", { name: "Incluir avisos y comentarios" }).uncheck();
  const partial = await exportPdf(page, "selectivo-sin-avisos");
  assert.deepEqual(partial.names, ["Estructura", "Instalaciones", "Red 01", "Red 02", "Acabados"]);
  assert.equal(partial.markers, 0);
  assert.equal(partial.commentBars, 0);
  assert.equal(await page.getByRole("textbox", { name: "Buscar partida o familia" }).inputValue(), "Red");
  await page.getByRole("combobox", { name: "Filtrar programa por estado" }).click();
  await page.getByRole("option", { name: "En progreso", exact: true }).click();
  await openExport(page);
  await page.getByRole("button", { name: "Quitar selección" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Buscar partida o familia" }).inputValue(), "Red");
  assert.match(await page.getByRole("combobox", { name: "Filtrar programa por estado" }).innerText(), /En progreso/);
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await scrollState(page, true);
  await openExport(page);
  assert.equal(await page.getByRole("checkbox", { name: "Desglosar Estructura" }).isChecked(), true, "Opening must reset selection");
  assert.equal(await page.getByRole("checkbox", { name: "Incluir avisos y comentarios" }).isChecked(), true);
  await page.getByRole("button", { name: "Quitar selección" }).click();
  await page.getByRole("checkbox", { name: "Incluir avisos y comentarios" }).uncheck();
  const summary = await exportPdf(page, "resumido-sin-avisos");
  assert.deepEqual(summary.names, ["Estructura", "Instalaciones", "Acabados"]);
  assert.equal(summary.markers, 0);
  assert.deepEqual(await scrollState(page), originalScroll, "Restore scroll after a capture with fewer rows");

  await page.evaluate(() => { window.__failCapture = true; });
  await openExport(page);
  await page.getByRole("button", { name: "Quitar selección" }).click();
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  await page.getByText("No se pudo exportar el programa", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Archivo", exact: true }).waitFor();
  assert.equal(await page.locator("[data-pdf-export-active]").count(), 0);
  assert.equal(await page.locator("#__pdf-export-overrides__").count(), 0);
  assert.deepEqual(await scrollState(page), originalScroll);
  assert.equal(await page.getByRole("button", { name: "Contraer Estructura", exact: true }).count(), 1);
  await page.close();

  const reader = await browser.newPage({ viewport: { width: 390, height: 844 } });
  reader.on("pageerror", (error) => errors.push(error.message));
  await reader.goto("http://127.0.0.1:4187/e2e/programa/export-preview.html?viewer=1");
  await openExport(reader);
  assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await reader.getByRole("checkbox", { name: "Desglosar Estructura" }).focus();
  await reader.keyboard.press("Space");
  await reader.getByRole("checkbox", { name: "Incluir avisos y comentarios" }).uncheck();
  await reader.getByRole("checkbox", { name: "Incluir avisos y comentarios" }).check();
  await reader.screenshot({ path: `${output}/dialog-mobile-reader.png` });
  const mobile = await exportPdf(reader, "selectivo-con-avisos-lector-movil");
  assert.deepEqual(mobile.names, partial.names);
  assert.equal(mobile.markers, 9);
  assert.equal(mobile.commentBars, 1, "Collapsed-family comment should remain only in the appendix");
  await reader.getByRole("button", { name: "Expandir Estructura", exact: true }).waitFor();
  assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
  console.log("Exportación PDF: todas/algunas/ninguna, avisos, filtros, cancelación, fallo, scroll, móvil y lector OK");
} finally {
  if (browser) await browser.close();
  await server.close();
}
