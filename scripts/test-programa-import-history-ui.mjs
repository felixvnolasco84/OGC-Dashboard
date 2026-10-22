import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import * as XLSX from "xlsx";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
const output = `${root}/output/programa-import-history`;
const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-programa-import`, optimizeDeps: { entries: ["e2e/programa/import-preview.html"] }, plugins: [react()], resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/programa/import-convex-stub.ts` } }, server: { host: "127.0.0.1", port: 4191, strictPort: true, watch: null } });
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Nivel", "Partida", "Familia", "Inicio", "Fin"], [1, "Estructura", "", "01/10/2026", "31/10/2026"], [2, "Estructura", "Excavación", "01/10/2026", "03/11/2026"]]), "Programa");
const files = Object.fromEntries(["xls", "xlsx"].map(ext => [ext, Buffer.from(XLSX.write(book, { type: "buffer", bookType: ext === "xls" ? "biff8" : "xlsx" }))]));
await mkdir(output, { recursive: true }); await server.listen();
let browser; const results = [], errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390, 320]) {
    console.log(`Programa originals UI: ${width}px`);
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    let upload, downloadBytes = files.xlsx, uploadCount = 0;
    await page.route("**/upload/programa-obra", route => route.fulfill({ json: { sheetName: "Programa", partidas: [{ partida: "Estructura", fecha_inicio: "01/10/2026", fecha_fin: "31/10/2026", children: [{ nivel: 2, familia: "Excavación", fecha_inicio: "01/10/2026", fecha_fin: "03/11/2026" }] }] } }));
    await page.route("**/mock-program-upload", route => {
      upload = route.request().postDataBuffer(); uploadCount++;
      return route.fulfill({ status: page.url().includes("upload-error") ? 500 : 200, json: { storageId: "original" } });
    });
    await page.route("**/mock-program-original", route => route.fulfill({ body: downloadBytes, contentType: "application/octet-stream" }));
    const open = scenario => page.goto(`http://127.0.0.1:4191/e2e/programa/import-preview.html?case=${scenario}`);
    const overflow = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow at ${width}`);
      const dialog = page.getByRole("dialog");
      if (await dialog.count()) assert.equal(await dialog.last().evaluate(el => el.scrollWidth > el.clientWidth), false, `dialog overflow at ${width}`);
    };
    const capture = async name => { await page.waitForTimeout(240); await overflow(); await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: false }); };
    const history = async () => { await page.getByRole("button", { name: "Historial de cargas", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("heading", { name: "Historial de cargas · Programa de obra" })).toBeVisible(); };
    const read = () => page.evaluate(() => window.programImportTest);
    const validate = async ext => {
      await page.getByRole("button", { name: "Archivo", exact: true }).click();
      await page.getByRole("menuitem", { name: "Cargar Excel", exact: true }).click();
      await page.locator('input[type="file"]').setInputFiles({ name: `Programa original · revisión ñ.${ext}`, mimeType: ext === "xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: files[ext] });
      await expect(page.getByRole("heading", { name: "Vista previa de datos del Excel" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continuar a revisión" })).toBeDisabled();
      await page.getByRole("radio", { name: /Usar fecha de la partida/ }).click();
      await page.getByRole("button", { name: "Continuar a revisión" }).click();
      await expect(page.getByRole("heading", { name: "Revisar cambios del Excel" })).toBeVisible();
      await page.getByRole("combobox", { name: "Coincidencia existente de Estructura / Excavación", exact: true }).click();
      await page.getByRole("option", { name: "Estructura · Excavación", exact: true }).click();
      assert.equal((await read()).mutations.length, 0, "Parsing and both reviews must not create an attempt");
    };

    await open("history"); await capture("program"); await history();
    await expect(page.getByText("Fallida", { exact: true })).toBeVisible(); await expect(page.getByText("Sin cambios", { exact: true })).toBeVisible();
    await expect(page.getByText("Archivo original no disponible", { exact: true })).toBeVisible(); await capture("history");
    const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar Excel", exact: true }).first().click();
    const download = await downloading; assert.equal(download.suggestedFilename(), "Programa original · revisión de cimentación y columnas octubre 2026.xlsx");
    const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk); assert.deepEqual(Buffer.concat(chunks), downloadBytes);
    await page.getByRole("button", { name: "Ver detalle de carga", exact: true }).first().click();
    await expect(page.getByText("Estructura / Cimentación anterior · Registro eliminado", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decisiones de fechas" })).toBeVisible(); await capture("details");
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Expandir Estructura", exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Opciones de Excavación", exact: true }).filter({ visible: true }).click();
    await page.getByRole("menuitem", { name: "Fuentes de Excel" }).click(); await expect(page.getByRole("heading", { name: "Archivos Excel de origen", exact: true })).toBeVisible(); await capture("sources");
    await open("pagination"); await history(); await expect(page.getByRole("article")).toHaveCount(25);
    await page.getByRole("button", { name: "Siguiente", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Anterior", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(25);
    await open("empty"); await history(); await expect(page.getByText("Todavía no hay cargas en el historial.")).toBeVisible();

    for (const ext of ["xls", "xlsx"]) {
      await open("success"); upload = undefined; uploadCount = 0; downloadBytes = files[ext];
      await validate(ext); await capture(`review-${ext}`);
      await page.getByRole("button", { name: "Aplicar cambios revisados", exact: true }).dblclick();
      await expect(page.getByText("Carga completada", { exact: true })).toBeVisible();
      assert.deepEqual(upload, files[ext], "Upload must send exact original bytes, before the date correction"); assert.equal(uploadCount, 1);
      const state = await read(); assert.equal(state.attempts.length, 1); assert.equal(state.items.length, 1);
      const started = state.mutations.find(m => m.name.endsWith(":startAttempt"));
      assert.equal(started.args.rows[1].fecha_fin, "31/10/2026"); assert.equal(started.args.rows[1].detalle_id, "familyA");
      assert.equal(started.args.review.date_resolutions[0].child_finish, "03/11/2026"); assert.equal(started.args.source.sheet_name, "Programa");
      await history(); const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
      const saved = await pending; assert.equal(saved.suggestedFilename(), `Programa original · revisión ñ.${ext}`);
      const downloaded = []; for await (const chunk of await saved.createReadStream()) downloaded.push(chunk); assert.deepEqual(Buffer.concat(downloaded), files[ext]);
    }
    for (const scenario of ["upload-error", "metadata-error", "import-error", "lost-response", "lost-start", "uncertain"]) {
      await open(scenario); await validate("xlsx"); await page.getByRole("button", { name: "Aplicar cambios revisados", exact: true }).click();
      if (["lost-start", "uncertain"].includes(scenario)) {
        await expect(page.getByRole("button", { name: "Comprobar resultado", exact: true })).toBeEnabled();
        await page.getByRole("button", { name: "Comprobar resultado", exact: true }).click();
      }
      const success = scenario.startsWith("lost") || scenario === "uncertain";
      await expect(page.getByText(success ? "Carga completada" : "Error en la carga", { exact: true })).toBeVisible();
      const state = await read(); assert.equal(state.attempts.length, 1, scenario); assert.equal(state.attempts[0].status, success ? "completed" : "failed", scenario);
      if (["lost-start", "uncertain"].includes(scenario)) {
        const starts = state.mutations.filter(m => m.name.endsWith(":startAttempt")); assert.equal(starts.length, 2); assert.equal(starts[0].args.request_id, starts[1].args.request_id);
      }
      results.push({ width, scenario, status: state.attempts[0].status });
    }
    await open("success"); await validate("xlsx"); await page.getByRole("button", { name: "Cancelar", exact: true }).click(); assert.equal((await read()).attempts.length, 0);
    await open("viewer&viewer=1"); await history(); await expect(page.getByRole("button", { name: "Descargar Excel", exact: true }).first()).toBeEnabled();
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Archivo", exact: true }).click(); await expect(page.getByRole("menuitem", { name: "Cargar Excel", exact: true })).toBeDisabled();
    await page.close();
  }
  assert.deepEqual(errors, []); await writeFile(`${output}/ui-results.json`, JSON.stringify({ passed: true, fixtures: "Datos ficticios en localhost; transporte simulado, componentes reales", bytes: ["xls", "xlsx"], results }, null, 2));
  console.log("Programa import UI passed: exact bytes/names, reviews, sources, pagination, permissions, failures, single confirmation and response recovery at 1440/390/320px.");
} finally { if (browser) await browser.close(); await server.close(); }
