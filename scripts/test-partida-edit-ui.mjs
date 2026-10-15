import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: `${root}/e2e/partida-edit/vite.config.ts` });
await server.listen();
let browser;
const errors = [];
const output = process.env.PARTIDA_EDIT_UI_OUTPUT || `${root}/output/partida-edit-impact`;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(output, { recursive: true });
  const open = async (page, scenario = "", level = "leaf") => {
    await page.goto(`http://127.0.0.1:4207/e2e/partida-edit/preview.html${scenario ? `?case=${scenario}` : ""}`);
    if (["leaf", "family", "empty"].includes(level)) await page.getByRole("button", { name: "Expandir OBRA", exact: true }).click();
    if (level === "leaf") await page.getByRole("button", { name: "Expandir ACERO", exact: true }).click();
    const name = level === "root" ? "OBRA" : level === "family" ? "ACERO" : level === "empty" ? "OTROS" : "VARILLA";
    const row = page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
    await row.getByRole("button", { name: "Abrir menú", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Editar / }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (scenario !== "denied") await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toBeVisible();
  };
  const fillApproved = async (page, value) => {
    const input = page.getByLabel("Presupuesto aprobado", { exact: true });
    await input.focus();
    await input.press("ControlOrMeta+A");
    await input.fill(value);
    await expect(input).toHaveValue(value);
  };
  const edit = async (page, value = "500") => {
    await fillApproved(page, value);
    await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
  };
  const discard = async page => {
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("region", { name: "Cambios pendientes" })).toBeVisible();
    await page.getByRole("button", { name: "Descartar cambios", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  };
  for (const width of [1440, 390, 320]) {
    const height = width < 500 ? 844 : 1000;
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", error => errors.push(error.message));
    await open(page, "usd");
    await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeDisabled();
    await page.screenshot({ path: `${output}/form-${width}.png`, fullPage: false });
    await edit(page);
    const review = page.getByRole("region", { name: "Comparación de impacto" });
    await expect(review).toContainText("USD");
    await expect(review).toContainText("Total del proyecto");
    await expect(review).toContainText("Se conserva");
    await review.evaluate(el => { const scroller = el.parentElement; scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top; });
    await page.screenshot({ path: `${output}/review-${width}.png`, fullPage: false });
    await review.getByRole("heading", { name: "Total del proyecto", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/totals-${width}.png`, fullPage: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}`);
    const footer = await page.getByRole("button", { name: "Actualizar", exact: true }).boundingBox();
    assert.ok(footer && footer.y + footer.height <= height, `Footer visible at ${width}`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Hay cambios sin guardar", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
    await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toBeFocused();
    await discard(page);
    assert.equal(await page.evaluate(() => window.partidaEditRecorded.writes), 0);
    // Reopen through the actual table/dropdown without reloading the fixture.
    await page.getByRole("row").filter({ has: page.getByText("VARILLA", { exact: true }) }).getByRole("button", { name: "Abrir menú", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Editar / }).click();
    await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toHaveValue("400.00");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await open(page, "", "leaf"); await edit(page, "0");
    await expect(page.getByRole("region", { name: "Comparación de impacto" })).toContainText("queda negativo");
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Guardando…", exact: true })).toBeDisabled();
    await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Subpartida actualizada.", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.partidaEditRecorded.mutations.length), 1);
    const args = await page.evaluate(() => window.partidaEditRecorded.mutations[0].args);
    assert.deepEqual(args.changes, { presupuesto_aprobado: 0 }); assert.ok(args.expectedReview);
    assert.equal("pagado" in args, false); assert.equal("presupuesto_original" in args, false);
    await page.screenshot({ path: `${output}/success-${width}.png`, fullPage: false });

    await open(page, "conflict"); await edit(page);
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("cambió después");
    await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toHaveValue(/500(?:\.00)?/);
    await page.getByRole("alert").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/conflict-${width}.png`, fullPage: false });
    await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeDisabled();
    assert.equal(await page.evaluate(() => window.partidaEditRecorded.writes), 0);
    await page.getByRole("button", { name: "Actualizar revisión", exact: true }).click();
    await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page); await edit(page);
  const smallFooter = await page.getByRole("button", { name: "Actualizar", exact: true }).boundingBox();
  assert.ok(smallFooter && smallFooter.y + smallFooter.height <= 640, "Footer visible on a short mobile viewport");
  await discard(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const level of ["root", "family", "empty"]) {
    await open(page, "", level); await edit(page, "700");
    await expect(page.getByLabel("Unidad", { exact: true })).toBeDisabled();
    if (level !== "empty") await expect(page.getByRole("region", { name: "Comparación de impacto" })).toContainText("no se distribuye");
    await discard(page);
  }
  for (const level of ["root", "family", "leaf"]) {
    await open(page, "", level);
    const original = page.getByLabel("Presupuesto original", { exact: true });
    await expect(original).toBeEnabled();
    const approved = await page.getByLabel("Presupuesto aprobado", { exact: true }).inputValue();
    await original.focus();
    await original.press("ControlOrMeta+A");
    await original.fill("0");
    await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toHaveValue(approved);
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const changes = await page.evaluate(() => window.partidaEditRecorded.mutations[0].args.changes);
    assert.deepEqual(changes, { presupuesto_original: 0 });
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    for (const withChildren of [false, true]) {
      await page.goto("http://127.0.0.1:4207/e2e/partida-edit/preview.html");
      await page.getByRole("button", { name: "Nueva partida de prueba", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Agregar Partida", exact: true }).click();
      await dialog.getByPlaceholder("Nombre de la partida (ej. ESTRUCTURA)").fill("NUEVA");
      if (withChildren) {
        await dialog.getByRole("button", { name: "Agregar Familia", exact: true }).click();
        await dialog.getByPlaceholder("Nombre de la familia (ej. CONCRETOS)").fill("NUEVA FAMILIA");
        await dialog.getByRole("button", { name: /Agregar Sub/ }).click();
        await dialog.getByPlaceholder("Nombre de la sub-partida (ej. COLUMNAS)").fill("NUEVA SUBPARTIDA");
      }
      await dialog.getByLabel("Unidad", { exact: true }).fill("LOTE");
      await dialog.getByLabel("Cantidad", { exact: true }).fill("2");
      await dialog.getByLabel("Precio unitario", { exact: true }).fill("600");
      await dialog.getByLabel("Presupuesto aprobado", { exact: true }).fill("1500");
      const original = dialog.getByLabel("Presupuesto original", { exact: true });
      await expect(original).toHaveValue("0");
      // Both an explicit amount and a subsequent explicit zero must persist in the draft.
      await original.fill("100"); await original.fill("0");
      await expect(dialog.getByRole("button", { name: /^Guardar \d+ elemento/ })).toBeEnabled();
      await original.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/create-original-zero-${withChildren ? "hierarchy" : "root"}-${width}.png` });
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false, `Creation overflow at ${width}`);
      await dialog.getByRole("button", { name: /^Guardar \d+ elemento/ }).click();
      await expect(dialog).toHaveCount(0);
      const payloads = await page.evaluate(() => window.partidaEditRecorded.mutations.map(m => m.args));
      assert.equal(payloads.length, withChildren ? 3 : 1);
      for (const payload of payloads) {
        assert.equal(payload.presupuesto_original, 0);
        assert.equal(payload.presupuesto_aprobado, 1500);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "filtered"); await edit(page);
  await expect(page.getByRole("region", { name: "Comparación de impacto" })).toContainText("$782.50");
  await expect(page.getByRole("region", { name: "Comparación de impacto" })).toContainText("Los filtros de la tabla no limitan");
  await discard(page);
  await open(page); await page.getByLabel("Subpartida", { exact: true }).fill("VARILLA NUEVA");
  await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Comparación de impacto" })).toContainText("1 detalle de Programa cambiará");
  await page.getByLabel("Subpartida", { exact: true }).fill(" MÁLLA ");
  await expect(page.getByRole("alert")).toContainText("equivalente");
  await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeDisabled();
  await discard(page);
  await open(page); await page.getByLabel("Cantidad", { exact: true }).fill("");
  await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeDisabled();
  await page.getByLabel("Cantidad", { exact: true }).fill("3.14");
  await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toHaveValue("400.00");
  await discard(page);
  for (const kind of ["preview-error", "save-error"]) {
    await open(page, kind);
    if (kind === "preview-error") {
      await fillApproved(page, "500");
      await expect(page.getByRole("alert")).toContainText("consultar");
      await page.getByRole("button", { name: "Reintentar revisión", exact: true }).click();
      await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
    } else {
      await edit(page); await page.getByRole("button", { name: "Actualizar", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("No se pudo guardar");
      await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toHaveValue(/500(?:\.00)?/);
      await page.getByRole("alert").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/error-1440.png`, fullPage: false });
    }
    await discard(page);
  }
  await open(page); await edit(page);
  await page.evaluate(() => window.dispatchEvent(new Event("partida-edit-change")));
  await expect(page.getByRole("alert")).toContainText("cambió mientras");
  await page.getByRole("button", { name: "Actualizar revisión", exact: true }).click();
  await expect(page.getByRole("button", { name: "Actualizar", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toHaveValue(/500(?:\.00)?/);
  await expect(page.getByLabel("Cantidad", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Subpartida", { exact: true })).toHaveValue("RENOMBRE EXTERNO");
  await discard(page);
  await open(page, "race"); await fillApproved(page, "500");
  await expect.poll(() => page.evaluate(() => window.partidaEditRecorded.previews)).toBe(1);
  await edit(page, "600");
  await expect(page.getByRole("region", { name: "Comparación de impacto" }).locator("strong").filter({ hasText: /^\$600\.00$/ })).toHaveCount(2);
  await page.waitForTimeout(1100);
  await expect(page.getByRole("region", { name: "Comparación de impacto" }).getByText("$500.00", { exact: true })).toHaveCount(0);
  await discard(page);
  await open(page, "denied");
  await expect(page.getByRole("alert")).toContainText("No tienes permiso");
  assert.equal(await page.getByRole("button", { name: "Actualizar", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  for (const role of ["viewer", "almacenista"]) {
    await page.goto(`http://127.0.0.1:4207/e2e/partida-edit/preview.html?case=${role}`);
    await page.getByRole("button", { name: "Abrir menú", exact: true }).first().click();
    await expect(page.getByRole("menuitem", { name: /^Editar / })).toHaveCount(0);
  }
  await page.close();
  assert.deepEqual(errors, []);
  console.log(`Partida UI passed: original editable to zero at all 3 levels, new root/hierarchy with zero original and independent approval, full/filtered totals, USD, cancellation, errors and concurrency at 1440/390/320px. Screenshots: ${output}.`);
} finally { if (browser) await browser.close(); await server.close(); }
