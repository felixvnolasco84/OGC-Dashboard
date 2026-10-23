import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import * as XLSX from "xlsx";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/output/projection-import-history`;
const server = await createServer({ configFile: `${root}/e2e/projection-import-history/vite.config.ts` });
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([["ADMINISTRACIÓN", "TOTAL", 46300, 46307], ["OBRA", 1500, 1000, 500]]);
sheet.B2 = { t: "n", f: "SUM(C2:D2)", v: 1500, z: "$#,##0.00" };
XLSX.utils.book_append_sheet(workbook, sheet, "Proyección");
const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const name = "Proyecciones originales de la obra · revisión octubre 2026.xlsx";
const raw = format => ({ success: true, sheetName: "Proyección", weekHeaders: [{ weekDate: "5/10/2026", weekDateRaw: 46300, position: 0, columnLetter: "C" }, { weekDate: "12/10/2026", weekDateRaw: 46307, position: 1, columnLetter: "D" }],
  [format === "projections" ? "projections" : "flujos"]: [{ ...(format === "projections" ? { partida: "OBRA" } : { label: "COBRO", declaredTotal: 1500, calculatedTotal: 1500 }), total: 1500, rowIndex: 2,
    [format === "projections" ? "weeklyProjections" : "weeklyAmounts"]: [{ week: "5/10/2026", amount: 1000, position: 0, columnLetter: "C" }, { week: "12/10/2026", amount: 500, position: 1, columnLetter: "D" }] }] });
let browser; const errors = [];
try {
  await server.listen(); await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    let uploaded; let uploadCount = 0; let selectedCase = "";
    await page.route("**/projection-mock-original.xlsx", route => route.fulfill({ body: bytes }));
    await page.route("**/projection-mock-upload", route => {
      uploaded = route.request().postDataBuffer(); uploadCount++;
      assert.match(route.request().headers()["content-type"], /application\/x-ogc-projection/);
      return route.fulfill(selectedCase === "upload-error" ? { status: 500, json: { error: "failed" } } : { json: { storageId: "original" } });
    });
    await page.route("https://ogc-excel-reader.vercel.app/upload/*", route => {
      assert.ok(route.request().postDataBuffer().includes(bytes), "Reader must receive the selected original");
      return route.fulfill({ json: raw(route.request().url().split("/").pop()) });
    });
    const open = async (screen, scenario = "empty") => {
      selectedCase = scenario; uploaded = undefined; uploadCount = 0;
      await page.goto(`http://127.0.0.1:4215/e2e/projection-import-history/preview.html?screen=${screen}&case=${scenario}`);
      await page.evaluate(() => sessionStorage.clear());
      if (screen === "modal") await page.getByRole("button", { name: "Subir Excel de prueba", exact: true }).click();
      if (screen.endsWith("admin")) { await page.getByRole("combobox").click(); await page.getByRole("option").first().click(); }
    };
    const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
    const settledDialog = async () => { await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1"); };
    const select = async () => {
      await page.getByLabel("Archivo Excel de proyecciones").setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bytes });
      await expect(page.getByRole("button", { name: "Confirmar carga", exact: true })).toBeEnabled();
      assert.deepEqual(await page.evaluate(() => window.projectionRecorded.mutations), [], "Review must not create attempts");
      await overflow();
    };
    for (const screen of ["modal", "expense-admin", "collection-admin"]) {
      await open(screen); await select();
      if (screen === "modal") await settledDialog();
      await page.screenshot({ path: `${output}/review-${screen}-${width}.png`, fullPage: screen !== "modal" });
      await page.getByRole("button", { name: "Confirmar carga", exact: true }).click();
      await expect(page.getByText("Proyecciones guardadas", { exact: true })).toBeVisible();
      assert.deepEqual(uploaded, bytes); assert.equal(uploadCount, 1);
      const calls = await page.evaluate(() => window.projectionRecorded);
      assert.deepEqual(calls.mutations.map(call => call.name), ["projectionImportHistory:startAttempt", "projectionImportHistory:attachFile"]);
      assert.equal(calls.mutations[0].args.file_hash, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(calls.mutations[0].args.file_name, name);
      assert.equal(calls.mutations[0].args.target.kind, screen === "collection-admin" ? "collection" : "expense");
      assert.equal(calls.mutations[0].args.format, screen === "modal" ? "projections" : "flujo");
      await overflow();
    }
    for (const screen of ["expense-page", "collection-page"]) {
      await open(screen, "history"); await page.getByRole("button", { name: "Historial de cargas", exact: true }).click();
      await expect(page.getByText("Fallida", { exact: true })).toBeVisible();
      await expect(page.getByText("Sin cambios", { exact: true })).toBeVisible();
      await expect(page.getByText("Archivo original no disponible", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Ver valores importados", exact: true }).first().click();
      await expect(page.getByText(/Fila 2/)).toBeVisible(); await overflow();
      await settledDialog(); await page.getByRole("dialog").locator(".min-h-0.overflow-y-auto").evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: `${output}/history-${screen}-${width}.png`, fullPage: false });
      const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar Excel", exact: true }).first().click();
      const download = await downloading; assert.equal(download.suggestedFilename(), name);
      const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), bytes);
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Ver origen", exact: true }).first().click();
      await expect(page.getByRole("button", { name: "Descargar Excel", exact: true })).toBeVisible();
      await expect(page.getByText(/Columna C/)).toBeVisible(); await overflow();
      await settledDialog(); await page.screenshot({ path: `${output}/source-${screen}-${width}.png`, fullPage: false });
    }
    await open("expense-page", "empty"); await page.getByRole("button", { name: "Historial de cargas", exact: true }).click();
    await expect(page.getByText("Todavía no hay cargas en el historial.", { exact: true })).toBeVisible();
    await open("expense-page", "pagination"); await page.getByRole("button", { name: "Historial de cargas", exact: true }).click();
    await expect(page.getByRole("dialog").locator("article")).toHaveCount(25);
    await page.getByRole("button", { name: "Siguiente", exact: true }).click(); await expect(page.getByRole("dialog").locator("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Anterior", exact: true }).click(); await expect(page.getByRole("dialog").locator("article")).toHaveCount(25);
    for (const scenario of ["upload-error", "import-error", "lost-response", "lost-start", "lost-attach"]) {
      await open("expense-admin", scenario); await select(); await page.getByRole("button", { name: "Confirmar carga", exact: true }).click();
      if (scenario.startsWith("lost-") && scenario !== "lost-response") {
        await expect(page.getByRole("button", { name: "Reintentar confirmación", exact: true })).toBeEnabled();
        await page.getByRole("button", { name: "Reintentar confirmación", exact: true }).click();
      }
      if (scenario.startsWith("lost-")) {
        await expect(page.getByText("Proyecciones guardadas", { exact: true })).toBeVisible();
        assert.equal(uploadCount, 1);
        const ids = await page.evaluate(() => window.projectionRecorded.mutations.filter(call => call.name.endsWith(":startAttempt")).map(call => call.args.request_id));
        assert.equal(new Set(ids).size, 1);
      } else {
        await expect(page.getByRole("alert")).toBeVisible();
        await page.getByRole("button", { name: "Historial de cargas", exact: true }).click();
        const entry = page.getByRole("dialog").locator("article").first(); await expect(entry.getByText("Fallida", { exact: true })).toBeVisible();
        if (scenario === "upload-error") await expect(entry.getByText("Archivo original no disponible", { exact: true })).toBeVisible();
        else await expect(entry.getByRole("button", { name: "Descargar Excel", exact: true })).toBeVisible();
        await settledDialog(); await page.screenshot({ path: `${output}/${scenario}-${width}.png`, fullPage: false });
      }
      await overflow();
    }
    await open("legacy", "history"); await expect(page.getByRole("button", { name: "Cargar Datos", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Eliminar", exact: true })).toBeDisabled();
    await page.close();
  }
  assert.deepEqual(errors, []); console.log("Projection import UI passed: 3 entry points, history, exact bytes/name, source, failures, lost responses and 1440/390/320 px.");
} finally { if (browser) await browser.close(); await server.close(); }
