import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import * as XLSX from "xlsx";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/output/income-import-history`;
const server = await createServer({ configFile: `${root}/e2e/income-import-history/vite.config.ts` });
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([["Monto", "Fecha", "Descripción", "Moneda"], [1000, "1/10/2026", "Anticipo ficticio", "MXN"], [50, "2/10/2026", "Cobro ficticio", "USD"], [-5, "3/10/2026", "Rechazado", "MXN"]]);
sheet.E2 = { t: "n", f: "A2*2", v: 2000, z: "$#,##0.00" }; sheet["!ref"] = "A1:E4";
XLSX.utils.book_append_sheet(workbook, sheet, "Ingresos");
const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const originalName = "Ingresos de prueba · fórmulas y formato.xlsx";
const parser = { success: true, summary: { totalRows: 9, validRows: 2, errors: 1, totalAmount: 1050 }, ingresos: [{ monto: 1000, fecha: "1/10/2026", descripcion: "Anticipo ficticio", moneda: "MXN", rowIndex: 2 }, { monto: 50, fecha: "2/10/2026", descripcion: "Cobro ficticio", moneda: "USD" }, { monto: -5, fecha: "3/10/2026", descripcion: "Rechazado", moneda: "MXN", rowIndex: 7 }] };
let browser;
const errors = [];
try {
  await server.listen(); await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    let uploaded; let failUpload = false;
    await page.route("**/income-mock-original.xlsx", route => route.fulfill({ body: bytes, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    await page.route("**/income-mock-upload", route => {
      uploaded = route.request().postDataBuffer();
      if (failUpload) { failUpload = false; return route.fulfill({ status: 500, json: { error: "Transferencia de prueba interrumpida" } }); }
      return route.fulfill({ status: 200, json: { storageId: "original" } });
    });
    await page.route("https://ogc-excel-reader.vercel.app/upload/ingresos", route => route.fulfill({ json: parser }));
    const open = async scenario => {
      await page.goto(`http://127.0.0.1:4212/e2e/income-import-history/preview.html?case=${scenario}`);
      await page.evaluate(() => sessionStorage.clear()); await page.reload();
      await page.getByRole("button", { name: "Abrir ingresos de prueba", exact: true }).click();
    };
    const bulk = () => page.getByRole("button", { name: "Carga masiva", exact: true }).click();
    const file = () => page.locator('#income-bulk-file').setInputFiles({ name: originalName, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bytes });
    const validate = async () => {
      await bulk(); await file(); await page.getByRole("button", { name: "Validar archivo", exact: true }).click();
      await expect(page.getByText("3 registros devueltos", { exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => window.incomeImportRecorded.mutations.length), 0, "Preview must not create an attempt");
      await expect(page.getByText("Registro 2 de la respuesta · fila de Excel no informada", { exact: true })).toBeVisible();
    };
    const history = async () => { await page.getByRole("button", { name: "Historial de cargas", exact: true }).click(); await expect(page.getByRole("heading", { name: "Historial de cargas de ingresos", exact: true })).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1"); };
    const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
    await open("history"); await history(); await overflow();
    await expect(page.getByText("Archivo original no disponible", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${output}/history-${width}.png`, fullPage: true });
    const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar Excel", exact: true }).first().click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), "Ingresos originales de la obra · octubre 2026.xlsx");
    const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes, "Download preserves workbook bytes");
    await page.getByRole("button", { name: "Ver registros", exact: true }).first().click();
    await expect(page.getByText(/Ingreso modificado después de la carga/)).toBeVisible();
    await expect(page.getByText(/Ingreso eliminado/, { exact: false }).last()).toBeVisible();
    await overflow(); await page.screenshot({ path: `${output}/records-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Archivo Excel de origen", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Archivo Excel de origen", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
    await expect(page.getByText("Fila reportada: 2", { exact: true })).toBeVisible();
    await overflow(); await page.screenshot({ path: `${output}/source-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Archivo Excel de origen", exact: true }).last().click();
    await expect(page.getByText(/Sin información de archivo de origen/)).toBeVisible();
    await open("viewer"); await expect(page.getByRole("button", { name: "Carga masiva", exact: true })).toHaveCount(0); await history(); await overflow();
    await open("pagination"); await history(); await expect(page.getByRole("article")).toHaveCount(25);
    await page.getByRole("button", { name: "Siguiente", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Anterior", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(25);
    await open("empty"); await history(); await expect(page.getByText(/Todavía no hay cargas/)).toBeVisible();
    for (const scenario of ["success", "lost-response", "import-error", "repeat"]) {
      await open(scenario); await validate();
      const confirm = page.getByRole("button", { name: "Cargar 2 ingreso(s)", exact: true });
      if (scenario === "repeat") { await expect(confirm).toBeDisabled(); await page.getByRole("checkbox").check(); }
      await expect(confirm).toBeEnabled(); await overflow();
      if (scenario === "success") await page.screenshot({ path: `${output}/preview-${width}.png`, fullPage: true });
      await confirm.click();
      if (scenario === "import-error") { await expect(page.getByRole("alert")).toContainText("Error financiero de prueba"); await history(); await expect(page.getByRole("article").first().getByRole("button", { name: "Descargar Excel" })).toBeVisible(); }
      else {
        await expect(page.getByText("Carga masiva completada", { exact: true })).toBeVisible();
        const recorded = await page.evaluate(() => window.incomeImportRecorded);
        assert.equal(recorded.actions.length, 1); const started = recorded.mutations.find(m => m.name === "incomeImportHistory:startAttempt");
        assert.equal(started.args.file_name, originalName); assert.equal(started.args.file_hash, createHash("sha256").update(bytes).digest("hex"));
        assert.equal(JSON.parse(started.args.review_json).ingresos.length, 3); assert.deepEqual(uploaded, bytes, "Storage receives the selected File unchanged");
        assert.equal(await page.evaluate(() => sessionStorage.getItem("income-import:writer:project")), null);
        const event = page.waitForEvent("download"); await history(); await page.getByRole("button", { name: "Descargar Excel", exact: true }).first().click(); assert.equal((await event).suggestedFilename(), originalName);
      }
      await overflow();
    }
    await open("upload-retry"); await validate(); failUpload = true;
    await page.getByRole("button", { name: "Cargar 2 ingreso(s)", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("No fue posible guardar el Excel original");
    const request = await page.evaluate(() => sessionStorage.getItem("income-import:writer:project")); assert.ok(request);
    assert.equal(await page.evaluate(() => window.incomeImportRecorded.actions.length), 0);
    await page.reload(); await page.getByRole("button", { name: "Abrir ingresos de prueba", exact: true }).click(); await bulk(); await file();
    await page.getByRole("button", { name: "Recuperar carga anterior", exact: true }).click();
    await expect(page.getByText("Carga masiva completada", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.incomeImportRecorded.mutations.filter(m => m.name === "incomeImportHistory:startAttempt").length), 0, "Recovery after refresh uses the stored review and request");
    assert.equal(await page.evaluate(() => window.incomeImportRecorded.actions.length), 1);
    await overflow(); await page.screenshot({ path: `${output}/recovery-${width}.png`, fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("Income import UI passed at 1440/390/320px: history, readers, pagination, original bytes/name/formulas, source/legacy metadata, preview, repeated confirmation warning, upload retry after refresh, financial errors and lost-response recovery. All data are fictional.");
} finally { if (browser) await browser.close(); await server.close(); }
