import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/outputs/P18-implementacion-2026-11-18`;
const server = await createServer({ configFile: `${root}/e2e/provider-header/vite.config.ts` });
await server.listen();
let browser;
const errors = [];
const checks = [];
const trigger = page => page.getByRole("button", { name: "Herramientas del catálogo de proveedores", exact: true });
const form = page => page.getByRole("dialog", { name: "Nuevo proveedor", exact: true });
const sync = page => page.getByRole("dialog", { name: "Sincronizar proveedores", exact: true });
const excel = page => page.getByRole("dialog", { name: "Actualizar proveedores desde Excel", exact: true });
async function openPage(width) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("http://127.0.0.1:4218/e2e/provider-header/preview.html");
  await expect(page.getByRole("heading", { name: "Proveedores", exact: true })).toBeVisible();
  return page;
}
async function shot(page, name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: false, animations: "disabled" }); }
async function menuAction(page, name) {
  await trigger(page).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
async function cancel(page) {
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function noWrites(page) { assert.deepEqual(await page.evaluate(() => window.p18Fixture.mutations), []); }
async function layout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "No page overflow");
  const primary = await page.getByRole("button", { name: "Nuevo proveedor", exact: true, includeHidden: true }).boundingBox();
  const more = await page.locator('button[aria-label="Herramientas del catálogo de proveedores"]').boundingBox();
  assert.equal(primary.y, more.y, "Primary and tools stay on the same line");
  assert.ok(more.width >= 44 && more.height >= 44);
  if (await page.getByRole("menu").count()) assert.equal(await page.getByRole("menu").evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 16 && box.right <= innerWidth - 16 && box.top >= 0 && box.bottom <= innerHeight;
  }), true);
}
async function choose(page, locator, name) {
  await locator.click();
  await page.getByRole("option", { name, exact: true }).click();
}
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 1024, 390]) {
    const page = await openPage(width);
    await expect(page.getByText("Mostrando: 25+", { exact: true })).toBeVisible();
    await layout(page);
    await shot(page, `cabecera-${width}`);
    assert.equal(await page.evaluate(() => window.p18Fixture.queries.length), 0);
    await trigger(page).press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Actualizar desde Excel", exact: true })).toBeFocused();
    await expect(page.getByRole("group", { name: "Importación", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Mantenimiento", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveCount(2);
    assert.equal(await page.evaluate(() => window.p18Fixture.queries.length), 0, "Opening the menu never prepares a preview");
    await layout(page);
    await shot(page, `menu-${width}`);
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Sincronizar transacciones", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger(page)).toBeFocused();
    await trigger(page).press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(excel(page)).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(excel(page).getByRole("combobox")).toHaveText("Todos los proyectos incluidos en el Excel");
    await expect(excel(page).getByRole("button", { name: "Analizar Excel", exact: true })).toBeDisabled();
    await expect(excel(page).locator('input[type="file"]')).toHaveValue("");
    assert.equal(await excel(page).evaluate(element => element.contains(document.activeElement)), true, "Focus enters the dialog");
    await shot(page, `excel-global-${width}`);
    await cancel(page);
    await expect(trigger(page)).toBeFocused();
    await menuAction(page, "Sincronizar transacciones");
    await expect(sync(page)).toBeVisible();
    await expect(sync(page).getByRole("combobox")).toHaveText("Todos los proyectos");
    await expect(sync(page).getByText("Se vinculará", { exact: true })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.p18Fixture.queries.at(-1)), { name: "transacciones:previewProviderSyncPage", args: { proyecto_id: undefined, cursor: null } });
    await cancel(page);
    await expect(trigger(page)).toBeFocused();

    await choose(page, page.getByRole("combobox").nth(0), "Proyecto B");
    await menuAction(page, "Sincronizar transacciones");
    await expect(sync(page).getByRole("combobox")).toHaveText("Proyecto B");
    await expect(sync(page).getByRole("button", { name: /Sincronizar 2 transacciones/ })).toBeEnabled();
    await expect(sync(page).getByText("Conflicto", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.p18Fixture.queries.at(-1).args.proyecto_id), "project-b");
    await shot(page, `sincronizar-proyecto-${width}`);
    await cancel(page);
    await expect(trigger(page)).toBeFocused();
    await menuAction(page, "Actualizar desde Excel");
    await expect(excel(page).getByRole("combobox")).toHaveText("Proyecto B");
    await shot(page, `excel-proyecto-${width}`);
    await excel(page).locator('input[type="file"]').setInputFiles({ name: "archivo-ficticio.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("Fixture P18; no analizar") });
    await expect(excel(page).getByText("archivo-ficticio.xlsx", { exact: true })).toBeVisible();
    await cancel(page);
    await menuAction(page, "Actualizar desde Excel");
    await expect(excel(page).locator('input[type="file"]')).toHaveValue("");
    await expect(excel(page).getByRole("button", { name: "Analizar Excel", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(excel(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();

    const rowTrigger = page.getByRole("button", { name: /Acciones para Proveedor de prueba/ }).filter({ visible: true }).first();
    await rowTrigger.click();
    await expect(page.getByRole("menuitem", { name: "Ver transacciones", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Fusionar", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Archivar", exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: "Editar / completar", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Editar proveedor", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("textbox").first()).not.toHaveValue("");
    await cancel(page);
    await page.getByRole("button", { name: "Nuevo proveedor", exact: true }).click();
    await expect(form(page)).toBeVisible();
    for (const input of await form(page).getByRole("textbox").all()) await expect(input).toHaveValue("");
    await expect(form(page).getByRole("button", { name: "Guardar", exact: true })).toBeDisabled();
    await shot(page, `nuevo-proveedor-${width}`);
    await cancel(page);
    await noWrites(page);
    checks.push({ width, status: "passed", checks: "layout, grouped menu, keyboard, focus return, real dialogs, global/project scope, preview without mutation, file reset, empty create after edit, contextual actions" });
    await page.close();
  }
  const page = await openPage(1440);
  await page.evaluate(() => { window.p18Fixture.holdPreview = true; });
  await menuAction(page, "Sincronizar transacciones");
  await expect(sync(page).getByText("Analizando transacciones y proveedores…", { exact: true })).toBeVisible();
  await expect(sync(page).getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(sync(page)).toBeVisible();
  await shot(page, "sincronizar-analizando-bloqueado");
  await page.evaluate(() => { window.p18Fixture.holdPreview = false; window.p18Fixture.releasePreview(); });
  await expect(sync(page).getByRole("button", { name: "Cancelar", exact: true })).toBeEnabled();
  await cancel(page);
  await expect(trigger(page)).toBeFocused();
  for (const [label, status] of [["Todos los estados", "all"], ["Archivados", "archived"], ["Incompletos", "incomplete"], ["Genéricos", "generic"], ["Activos", "active"]]) {
    await choose(page, page.getByRole("combobox").nth(1), label);
    assert.equal(await page.evaluate(() => window.p18Fixture.pages.at(-1).status), status);
  }
  for (const [label, field, direction] of [["Más transacciones", "transactions", "desc"], ["Más proyectos", "projects", "desc"], ["Mayor monto", "amount", "desc"], ["Razón social: Z–A", "name", "desc"], ["Razón social: A–Z", "name", "asc"]]) {
    await choose(page, page.getByRole("combobox", { name: "Ordenar proveedores" }), label);
    const args = await page.evaluate(() => window.p18Fixture.pages.at(-1));
    assert.equal(args.sort, field); assert.equal(args.direction, direction);
  }
  await page.getByPlaceholder("Buscar proveedor").fill("sin coincidencias P18");
  await expect(page.getByRole("combobox", { name: "Ordenar proveedores" })).toBeDisabled();
  await expect(page.getByText("No se encontraron proveedores", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByPlaceholder("Buscar proveedor").fill("");
  await page.getByRole("button", { name: "Cargar más proveedores", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cargando…", exact: true })).toBeDisabled();
  await expect(page.getByText("Mostrando: 29", { exact: true })).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.p18Fixture.loads), [25]);
  assert.equal(await page.evaluate(() => window.p18Fixture.pages[0].initialNumItems), 25);
  await page.evaluate(() => window.p18Fixture.setMode("loading"));
  await expect(page.getByText("Cargando proveedores...", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.evaluate(() => window.p18Fixture.setMode("empty"));
  await expect(page.getByText("Mostrando: 0", { exact: true })).toBeVisible();
  await shot(page, "lista-vacia-1440");
  await menuAction(page, "Actualizar desde Excel");
  await expect(excel(page).getByRole("combobox")).toHaveText("Todos los proyectos incluidos en el Excel");
  await cancel(page);
  await noWrites(page);
  await page.close();
  checks.push({ status: "passed", checks: "analysis busy/cancel guards, filters, sorting, relevance, empty/loading list, page size and load-more, preserved showing count" });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/resultados-ui.json`, JSON.stringify({ checks, errors, mutationCalls: 0 }, null, 2));
  console.log(JSON.stringify({ checks, errors, mutationCalls: 0 }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
