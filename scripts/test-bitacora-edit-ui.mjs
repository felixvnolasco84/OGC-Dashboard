import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/test-results/bitacora-edit`;
const server = await createServer({ configFile: `${root}/e2e/bitacora/preview/vite.config.ts` });
await server.listen();
let browser;
const errors = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const open = async (page, query = "") => {
  await page.clock.setFixedTime(new Date("2026-10-27T18:00:00Z"));
  await page.goto(`http://127.0.0.1:4186/?scenario=edit${query}`);
  await expect(page.getByRole("heading", { name: "Proyecto de prueba", exact: true })).toBeVisible();
};
const edit = async page => {
  await page.getByRole("button", { name: /^Acciones del reporte/ }).first().click();
  await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editar Entrada", exact: true })).toBeVisible();
};
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 } });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await open(page); await edit(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox").first()).toBeDisabled();
    await expect(dialog.getByRole("combobox").last()).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Eliminar fotografía", exact: true })).toHaveCount(0);
    await expect(dialog.locator('input[type="file"][accept*=".pdf"]')).toHaveCount(0);
    await page.locator("#bitacora-avance").fill(`Nota corregida ${width}`);
    await page.locator("#bitacora-incidencias").fill("Incidencia corregida");
    await page.screenshot({ path: `${output}/autor-${width}.png`, animations: "disabled" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const saveButton = dialog.getByRole("button", { name: "Guardar Cambios", exact: true });
    const box = await saveButton.boundingBox();
    assert.ok(box && box.y + box.height <= (width < 500 ? 844 : 1000), "Guardar visible sin scroll exterior");
    // A historical photo without a description must not block a text correction.
    await saveButton.click(); await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: /^Expandir reporte/ }).first().click();
    await expect(page.getByText(`Nota corregida ${width}`, { exact: true })).toBeVisible();

    await edit(page);
    await page.getByLabel("Descripción de foto 1", { exact: true }).fill("Descripción corregida");
    await dialog.locator('input[type="file"][accept="image/jpeg,image/png"]').setInputFiles({ name: "adicional.png", mimeType: "image/png", buffer: png });
    await expect(dialog.getByRole("button", { name: "Eliminar fotografía", exact: true })).toHaveCount(1);
    await page.getByLabel(/Descripción de foto 2/).fill("Fotografía adicional");
    await page.getByLabel("Descripción de foto 1", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/fotos-${width}.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: "Guardar Cambios", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await edit(page);
    await expect(page.getByLabel("Descripción de foto 1", { exact: true })).toHaveValue("Descripción corregida");
    await expect(page.getByLabel("Descripción de foto 2", { exact: true })).toHaveValue("Fotografía adicional");
    await expect(dialog.getByRole("button", { name: "Eliminar fotografía", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

    // Calendar opens details; the detail footer now offers the same editor.
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    await page.getByRole("button", { name: "Estructura", exact: true }).first().click();
    await dialog.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page.locator("#bitacora-avance")).toHaveValue(`Nota corregida ${width}`);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await context.close();
  }
  for (const query of ["&owner=other", "&owner=legacy", "&role=viewer"]) {
    const context = await browser.newContext(); const page = await context.newPage();
    await open(page, query);
    await page.getByRole("button", { name: /^Acciones del reporte/ }).first().click();
    await expect(page.getByRole("menuitem", { name: "Editar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Eliminar", exact: true })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Ver detalles", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
    await context.close();
  }
  {
    const context = await browser.newContext(); const page = await context.newPage();
    await open(page, "&role=admin&owner=legacy"); await edit(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox").first()).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Eliminar fotografía", exact: true })).toBeVisible();
    await expect(dialog.locator('input[type="file"][accept*=".pdf"]')).toHaveCount(1);
    await context.close();
  }
  {
    const context = await browser.newContext(); const page = await context.newPage();
    await open(page); await edit(page); await page.locator("#bitacora-avance").fill("Borrador que se conserva");
    // Fire the fixture control through the DOM while the modal makes the page inert.
    await page.getByRole("button", { name: "Cambiar revisión remota", exact: true, includeHidden: true }).evaluate(button => button.click());
    await page.getByRole("dialog").getByRole("button", { name: "Guardar Cambios", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("cambió");
    await expect(page.locator("#bitacora-avance")).toHaveValue("Borrador que se conserva");
    await page.screenshot({ path: `${output}/conflicto.png` });
    await page.getByRole("button", { name: "Revocar edición", exact: true, includeHidden: true }).evaluate(button => button.click());
    await expect(page.getByRole("dialog").getByRole("button", { name: "Guardar Cambios", exact: true })).toHaveCount(0);
    await expect(page.locator("#bitacora-avance")).toHaveValue("Borrador que se conserva");
    await context.close();
  }
  {
    const context = await browser.newContext(); const page = await context.newPage();
    await open(page, "&reject=1"); await edit(page); await page.locator("#bitacora-avance").fill("Corrección conservada tras rechazo");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar Cambios", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("servidor rechazó");
    await expect(page.locator("#bitacora-avance")).toHaveValue("Corrección conservada tras rechazo");
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
    await open(page, "&offline=1"); await edit(page); await page.locator("#bitacora-avance").fill("Edición guardada sin conexión");
    await page.getByRole("dialog").locator('input[type="file"][accept="image/jpeg,image/png"]').setInputFiles({ name: "offline.png", mimeType: "image/png", buffer: png });
    await page.getByLabel(/Descripción de foto 2/).fill("Evidencia sin conexión");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar Cambios", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await page.reload();
    await edit(page); await expect(page.locator("#bitacora-avance")).toHaveValue("Edición guardada sin conexión");
    await expect.poll(() => page.locator('textarea[id^="bitacora-photo-"]').evaluateAll(inputs => inputs.map(input => input.value))).toContain("Evidencia sin conexión");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Reconectar backend simulado", exact: true }).click();
    await expect(page.getByTestId("repository-state")).toContainText('"mode":"online"');
    await expect(page.getByTestId("repository-state")).toContainText('"pending":0');
    await edit(page); await expect(page.locator("#bitacora-avance")).toHaveValue("Edición guardada sin conexión");
    await expect.poll(() => page.locator('textarea[id^="bitacora-photo-"]').evaluateAll(inputs => inputs.map(input => input.value))).toContain("Evidencia sin conexión");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Bitácora: edición por autor y administrador, calendario, fotos, conflictos, revocación y reconexión verificados en escritorio y móvil.");
} finally {
  await browser?.close(); await server.close();
}
