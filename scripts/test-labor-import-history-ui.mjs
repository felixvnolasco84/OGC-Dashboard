import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import * as XLSX from "xlsx";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: `${root}/e2e/labor-import-history/vite.config.ts` });
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ["ADMINISTRACIÓN", "PARTIDA", "FAMILIA", "SUBPARTIDA", "MONTO", "FECHA", "PROVEEDOR", "FACTURA", "CATEGORÍA", "TIPO DE PAGO", "MONEDA", "NO. PERSONAS"],
  ["Obra", "OBRA", "MATERIAL", "ACERO", 100, "05/10/2026", "Proveedor de prueba", "FACTURA-100", "MATERIAL", "TRANSFERENCIA", "MXN", 0],
]), "Pagos");
const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
const originalName = "Pagos originales · revisión 2.xlsx";
await server.listen();
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(`${root}/output/labor-import-history`, { recursive: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    let uploaded;
    await page.route("**/mock-original.xlsx", route => route.fulfill({ body: bytes, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    await page.route("**/mock-upload", route => {
      uploaded = route.request().postDataBuffer();
      return route.fulfill({ status: page.url().includes("upload-error") ? 500 : 200, json: { storageId: "original" } });
    });
    const open = scenario => page.goto(`http://127.0.0.1:4205/e2e/labor-import-history/preview.html?case=${scenario}`);
    const history = async () => {
      await page.getByRole("button", { name: "Historial de cargas", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
    };
    const validate = async () => {
      await page.getByRole("button", { name: "Subir Excel de prueba", exact: true }).click();
      await page.locator('input[type="file"]').setInputFiles({ name: originalName,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bytes });
      await page.getByRole("button", { name: "Validar datos", exact: true }).click();
      await expect(page.getByRole("button", { name: "Confirmar carga (1)", exact: true })).toBeEnabled();
      assert.equal(await page.evaluate(() => window.laborImportRecorded.mutations.length), 0, "Validation must not create an attempt");
    };
    const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
    await open("history");
    await history();
    await expect(page.getByText("Fallida", { exact: true })).toBeVisible();
    await expect(page.getByText("Sin cambios", { exact: true })).toBeVisible();
    await expect(page.getByText("Archivo original no disponible", { exact: true })).toBeVisible();
    await overflow();
    await page.screenshot({ path: `${root}/output/labor-import-history/history-${width}.png`, fullPage: true });
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar Excel", exact: true }).first().click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), "Pagos originales de la obra · revisión octubre 2026.xlsx");
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes, "Download must preserve the original bytes");
    await page.getByRole("button", { name: "Ver movimientos", exact: true }).first().click();
    await expect(page.getByText("FACTURA-ELIMINADA · Transacción eliminada", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "FACTURA-100", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Archivos Excel de origen", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Descargar Excel", exact: true })).toBeVisible();
    await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
    await overflow();
    await page.screenshot({ path: `${root}/output/labor-import-history/source-${width}.png`, fullPage: true });
    await open("pagination");
    await history();
    await expect(page.getByRole("article")).toHaveCount(25);
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(25);
    await open("empty");
    await history();
    await expect(page.getByText("Todavía no hay cargas en el historial.", { exact: true })).toBeVisible();
    for (const scenario of ["success", "upload-error", "import-error", "lost-response"]) {
      await open(scenario);
      await validate();
      await page.getByRole("button", { name: "Confirmar carga (1)", exact: true }).click();
      if (["success", "lost-response"].includes(scenario)) {
        await expect(page.getByText("Carga completada correctamente", { exact: true })).toBeVisible();
        assert.deepEqual(uploaded, bytes, "Upload must send the selected File unchanged");
        const recorded = await page.evaluate(() => window.laborImportRecorded);
        assert.deepEqual(recorded.mutations.map(call => call.name), ["laborImportHistory:startAttempt", "laborImportHistory:attachFile"]);
        assert.equal(recorded.mutations[0].args.source.file_name, originalName);
        assert.equal(recorded.mutations[0].args.source.file_hash, createHash("sha256").update(bytes).digest("hex"));
        assert.equal(recorded.actions.length, 1);
        await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      } else {
        await expect(page.getByText("No se pudo completar la carga", { exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => window.laborImportRecorded.actions.length), scenario === "upload-error" ? 0 : 1);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      await history();
      const first = page.getByRole("article").first();
      await expect(first).toContainText(originalName);
      if (scenario === "upload-error") await expect(first).toContainText("Archivo original no disponible");
      else await expect(first.getByRole("button", { name: "Descargar Excel" })).toBeVisible();
      await overflow();
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("Labor import UI passed at 1440/390/320px: history, pagination, original upload/download bytes and filenames, deleted transactions, source references, validation, failures and lost-response recovery.");
} finally {
  if (browser) await browser.close();
  await server.close();
}
