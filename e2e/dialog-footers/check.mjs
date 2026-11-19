import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import * as XLSX from "xlsx";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = `${root}/outputs/implementacion-P23-2026-11-19/formularios`;
const server = await createServer({ configFile: `${root}/e2e/dialog-footers/vite.config.ts` });
await mkdir(output, { recursive: true });
await server.listen();
let browser;
const errors = [], report = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Concepto"], ["Prueba P23"]]), "Presupuesto");
  const bytes = XLSX.write(book, { bookType: "xlsx", type: "buffer" });
  for (const width of [1440, 390]) {
    const height = width === 390 ? 844 : 1000;
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", error => errors.push(error.message));
    const open = path => page.goto(`http://127.0.0.1:4236/e2e/${path}/preview.html`);
    const capture = name => page.screenshot({ path: `${output}/${name}-${width}.png`, animations: "disabled" });
    const checkFooter = async (primaryName, secondaryName = "Cancelar") => {
      const dialog = page.getByRole("dialog");
      const primary = dialog.getByRole("button", { name: primaryName, exact: true });
      const secondary = dialog.getByRole("button", { name: secondaryName, exact: true });
      await primary.scrollIntoViewIfNeeded();
      const a = await primary.boundingBox(), b = await secondary.boundingBox();
      for (const box of [a, b]) {
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
        assert.equal(box.height, width === 390 ? 44 : 36);
      }
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
      report.push({ width, primary: primaryName, secondary: secondaryName, height: a.height });
    };
    await open("document-row-actions");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.getByRole("menuitem", { name: "Nueva carpeta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Crear carpeta", exact: true })).toBeDisabled();
    await checkFooter("Crear carpeta"); await capture("carpeta-vacia");
    await page.getByLabel("Nombre", { exact: true }).fill("Carpeta ficticia P23");
    await expect(page.getByRole("button", { name: "Crear carpeta", exact: true })).toBeEnabled();
    await capture("carpeta-lista");
    await page.getByRole("button", { name: "Cancelar", exact: true }).press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    for (const edit of [false, true]) {
      await page.goto(`http://127.0.0.1:4236/e2e/dialog-footers/preview.html${edit ? "?edit=1" : ""}`);
      await page.getByRole("button", { name: "Abrir formulario", exact: true }).click();
      const primary = edit ? "Guardar proveedor" : "Crear proveedor";
      if (!edit) {
        await expect(page.getByRole("button", { name: primary, exact: true })).toBeDisabled();
        await page.getByRole("textbox").first().fill("Proveedor ficticio P23");
      }
      await checkFooter(primary); await capture(edit ? "proveedor-edicion" : "proveedor-alta");
      await page.getByRole("button", { name: primary, exact: true }).press("Enter");
      await expect(page.getByRole("button", { name: edit ? "Guardando proveedor…" : "Creando proveedor…", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
      await capture(edit ? "proveedor-guardando" : "proveedor-creando");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.footerProviderCalls.length), 1);
    }
    await page.goto("http://127.0.0.1:4236/e2e/dialog-footers/preview.html?viewer=1");
    await page.getByRole("button", { name: "Abrir formulario", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    for (const scenario of ["success", "partial", "upload-error"]) {
      let uploaded;
      await page.route("**/initial-budget/original?*", async route => {
        uploaded = route.request().postDataBuffer();
        await new Promise(resolve => setTimeout(resolve, 900));
        await route.fulfill({ status: scenario === "upload-error" ? 500 : 200, body: scenario === "upload-error" ? "Fallo de prueba" : '{"ok":true}' });
      });
      await page.goto(`http://127.0.0.1:4236/e2e/budget-creation/preview.html?case=${scenario}`);
      await page.getByRole("button", { name: "Agregar proyecto de prueba", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await checkFooter("Crear proyecto y guardar Excel");
      await expect(dialog.getByRole("button", { name: "Crear proyecto y guardar Excel", exact: true })).toBeDisabled();
      await capture("proyecto-vacio");
      await dialog.getByLabel("Nombre del Proyecto *", { exact: true }).fill("Obra ficticia P23");
      await dialog.getByLabel("Descripción del Proyecto *", { exact: true }).fill("Prueba de pie de formulario");
      await dialog.locator('input[type="file"]').setInputFiles({ name: "original-p23.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bytes });
      await dialog.getByRole("button", { name: "Crear proyecto y guardar Excel", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Guardando y creando…", exact: true })).toBeDisabled();
      await checkFooter("Guardando y creando…", "Cerrar y conservar intento");
      await capture(`proyecto-ocupado-${scenario}`);
      if (scenario === "success") await expect(dialog).toHaveCount(0);
      else {
        await expect(dialog.getByText(scenario === "partial" ? "Creación incompleta" : "Fallida", { exact: true })).toBeVisible();
        if (scenario === "partial") {
          await expect(dialog.getByRole("button", { name: "Crear proyecto y guardar Excel", exact: true })).toHaveCount(0);
          await dialog.getByRole("button", { name: "Cerrar y conservar intento", exact: true }).scrollIntoViewIfNeeded();
          await capture("proyecto-incompleto");
          await dialog.getByRole("button", { name: "Reanudar creación", exact: true }).click();
          await expect(dialog.getByText("Completada", { exact: true })).toBeVisible();
        } else { await checkFooter("Crear proyecto y guardar Excel", "Cerrar y conservar intento"); await capture("proyecto-reintentable"); }
        await dialog.getByRole("button", { name: "Cerrar y conservar intento", exact: true }).click();
      }
      assert.deepEqual(uploaded, bytes, "The original Excel bytes are preserved");
      await page.unroute("**/initial-budget/original?*");
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/resultados.json`, JSON.stringify({ errors, checks: report }, null, 2));
  console.log(`P23 footers passed at 1440/390: sizes, labels, empty/ready/busy, keyboard, permissions, original Excel and recovery. ${output}`);
} finally { if (browser) await browser.close(); await server.close(); }
