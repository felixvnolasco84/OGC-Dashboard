import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import * as XLSX from "xlsx";
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: `${root}/e2e/budget-creation/vite.config.ts` });
const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([["Concepto", "Cantidad", "Precio", "Importe"], ["VARILLA", 1000, 0.12, 120]]);
sheet.D2 = { t: "n", f: "B2*C2", v: 120, z: "$#,##0.00" };
XLSX.utils.book_append_sheet(book, sheet, "Presupuesto original");
const originalName = "Presupuesto original · revisión octubre 2026.xlsx";
const bytes = XLSX.write(book, { bookType: "xlsx", type: "buffer" });
await mkdir(`${root}/output/budget-creation`, { recursive: true });
await server.listen(); let browser; const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }); page.on("pageerror", error => errors.push(error.message));
    let uploaded, downloadBytes = bytes;
    await page.route("**/initial-budget/original?*", async route => {
      if (route.request().method() === "POST") {
        uploaded = route.request().postDataBuffer();
        await route.fulfill({ status: page.url().includes("upload-error") ? 500 : 200, body: page.url().includes("upload-error") ? "Fallo al guardar el original" : '{"ok":true}' });
      } else await route.fulfill({ body: downloadBytes, contentType: "application/octet-stream" });
    });
    const open = scenario => page.goto(`http://127.0.0.1:4207/e2e/budget-creation/preview.html?case=${scenario}`);
    const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
    await open("history"); await expect(page.getByRole("article")).toHaveCount(1);
    const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
    const download = await downloading; assert.equal(download.suggestedFilename(), originalName);
    const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk); assert.deepEqual(Buffer.concat(chunks), bytes);
    await page.getByRole("button", { name: "Ver registros de origen", exact: true }).click();
    await expect(page.getByText("Registro interpretado 3 · Pago semanal · Registro eliminado", { exact: true })).toBeVisible();
    await overflow(); await page.screenshot({ path: `${root}/output/budget-creation/documentos-${width}.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Excel de origen", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `${root}/output/budget-creation/presupuesto-${width}.png`, fullPage: true, animations: "disabled" }); await page.keyboard.press("Escape");
    await open("source"); await expect(page.getByText("Origen: registro interpretado 3.", { exact: true })).toBeVisible(); await overflow();
    await page.screenshot({ path: `${root}/output/budget-creation/partida-${width}.png`, fullPage: true, animations: "disabled" });
    await open("legacy"); await expect(page.getByText(/Referencia histórica sin respaldo verificable/)).toBeVisible();
    await open("pagination"); await page.getByRole("button", { name: "Siguiente", exact: true }).click(); await expect(page.getByRole("article")).toHaveCount(1); await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
    for (const scenario of ["success", "lost-response", "partial", "upload-error"]) {
      await open(scenario); await page.getByRole("button", { name: "Agregar proyecto de prueba", exact: true }).click();
      const dialog = page.getByRole("dialog"); await dialog.getByLabel("Nombre del Proyecto *", { exact: true }).fill("Residencia del Parque");
      await dialog.getByLabel("Descripción del Proyecto *", { exact: true }).fill("Presupuesto original de prueba");
      await dialog.locator('input[type="file"]').setInputFiles({ name: originalName, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bytes });
      await dialog.getByRole("button", { name: "Crear proyecto y guardar Excel", exact: true }).click();
      if (scenario === "success" || scenario === "lost-response") await expect(dialog).toHaveCount(0);
      else {
        await expect(dialog.getByText(scenario === "partial" ? "Creación incompleta" : "Fallida", { exact: true })).toBeVisible();
        await dialog.getByRole("article").scrollIntoViewIfNeeded();
        await overflow(); await page.screenshot({ path: `${root}/output/budget-creation/${scenario}-${width}.png`, fullPage: true, animations: "disabled" });
        if (scenario === "partial") { await dialog.getByRole("button", { name: "Reanudar creación", exact: true }).click(); await expect(dialog.getByText("Completada", { exact: true })).toBeVisible(); }
        await dialog.getByRole("button", { name: "Cerrar y conservar intento", exact: true }).click();
      }
      assert.deepEqual(uploaded, bytes, "The upload must preserve every byte including formulas and formats");
      const recorded = await page.evaluate(() => window.budgetRecorded);
      assert.equal(recorded.mutations[0].args.file_name, originalName);
      assert.equal(recorded.mutations[0].args.file_hash, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(recorded.mutations.filter(call => call.name === "budgetCreationHistory:start").length, 1);
      if (scenario === "upload-error") assert.equal(recorded.actions.length, 0);
      await overflow();
    }
    // A real BIFF .xls workbook follows exactly the same original-byte path.
    await open("xls"); downloadBytes = Buffer.from(XLSX.write(book, { bookType: "xls", type: "buffer" }));
    const xlsName = "Presupuesto original con fórmulas.xls";
    await page.getByRole("button", { name: "Agregar proyecto de prueba", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre del Proyecto *", { exact: true }).fill("Obra XLS");
    await dialog.getByLabel("Descripción del Proyecto *", { exact: true }).fill("Prueba de original XLS");
    await dialog.locator('input[type="file"]').setInputFiles({ name: xlsName, mimeType: "application/vnd.ms-excel", buffer: downloadBytes });
    await dialog.getByRole("button", { name: "Crear proyecto y guardar Excel", exact: true }).click();
    await expect(dialog).toHaveCount(0); assert.deepEqual(uploaded, downloadBytes);
    const xlsDownloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
    const xlsDownload = await xlsDownloading; assert.equal(xlsDownload.suggestedFilename(), xlsName);
    const xlsChunks = []; for await (const chunk of await xlsDownload.createReadStream()) xlsChunks.push(chunk); assert.deepEqual(Buffer.concat(xlsChunks), downloadBytes);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("Budget creation UI passed at 1440/390/320 px: original upload/download bytes and name, formula workbook, source snapshots, history, pagination, legacy, upload failures, partial recovery and lost responses.");
} finally { if (browser) await browser.close(); await server.close(); }
