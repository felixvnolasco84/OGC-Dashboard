import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/outputs/P24-implementacion-2026-11-19`;
const baseline = process.argv.includes("--baseline");
const server = await createServer({ configFile: `${root}/e2e/sales-budget-header/vite.config.ts` });
await server.listen();
let browser;
const errors = [];
const checks = [];
const trigger = page => page.locator('button[aria-label="Más acciones del presupuesto de ventas"]');
const item = page => page.getByRole("menuitem", { name: "Sincronizar datos", exact: true });
const count = page => page.evaluate(() => window.p24Fixture.mutations.length);
const set = (page, values) => page.evaluate(values => window.p24Fixture.set(values), values);
async function shot(page, name) { await page.screenshot({ path: `${output}/${name}.png`, animations: "disabled" }); }
async function open(width) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("http://127.0.0.1:4224/e2e/sales-budget-header/preview.html");
  await expect(page.getByRole("heading", { name: "Proyecto A · Ventas ficticias" })).toBeVisible();
  return page;
}
async function layout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const box = await trigger(page).boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44);
  if (await page.getByRole("menu").count()) assert.equal(await page.getByRole("menu").evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  }), true);
}
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of baseline ? [1440, 390] : [1440, 1024, 390]) {
    const page = await open(width);
    if (baseline) {
      await shot(page, `fixture-antes-${width}`);
      await page.close();
      continue;
    }
    await layout(page);
    await shot(page, `fixture-cerrado-${width}`);
    const metrics = await page.locator(".responsive-metrics").innerText();
    assert.match(metrics, /USD/);
    assert.match(metrics, /3,000/);
    await trigger(page).focus();
    await trigger(page).press("ArrowDown");
    await expect(item(page)).toBeFocused();
    await expect(page.getByRole("group", { name: "Mantenimiento" })).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveCount(1);
    assert.equal(await count(page), 0, "Opening the menu never synchronizes");
    await layout(page);
    await shot(page, `fixture-menu-${width}`);
    await page.keyboard.press("Escape");
    await expect(trigger(page)).toBeFocused();
    assert.equal(await count(page), 0);
    await trigger(page).press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger(page)).toHaveAttribute("aria-busy", "true");
    await trigger(page).click();
    await expect(page.getByRole("menuitem", { name: "Sincronizando...", exact: true })).toHaveAttribute("data-disabled", "");
    await page.keyboard.press("Enter");
    assert.equal(await count(page), 1, "Busy selection must not launch a second request");
    await shot(page, `fixture-sincronizando-${width}`);
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.p24Fixture.finish());
    await expect(page.getByText("Sincronización exitosa", { exact: true })).toBeVisible();
    await expect(trigger(page)).toHaveAttribute("aria-busy", "false");
    assert.deepEqual(await page.evaluate(() => window.p24Fixture.mutations), [{ name: "sales_partidas_sync:syncSalesPartidasFromTransactions", args: { salesProjectId: "fixture-a" } }]);
    assert.equal(await page.locator(".responsive-metrics").innerText(), metrics);

    // Exercise the existing multiselect and hierarchy with unchanged real JSX.
    await page.getByRole("button", { name: "Expandir Unidad A (ficticia)", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expandir Interior (ficticio)", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expandir Interior (ficticio)", exact: true }).click();
    await expect(page.getByText("Acabados (ficticios)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Todas", exact: true }).first().click();
    await page.getByPlaceholder("Buscar unidades...").fill("Unidad A");
    await page.getByRole("checkbox", { name: "Unidad A (ficticia)", exact: true }).check();
    await page.getByPlaceholder("Buscar unidades...").fill("");
    await page.getByRole("checkbox", { name: "Unidad B (ficticia)", exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "2 seleccionadas", exact: true })).toBeVisible();
    assert.equal(await page.locator(".responsive-metrics").innerText(), metrics);
    assert.equal(await count(page), 1);
    checks.push({ width, status: "passed", checks: "closed/open/busy, keyboard and focus, no writes on open, one mock request, unchanged USD metrics, multiselect and hierarchy" });
    await page.close();
  }
  if (!baseline) {
    const page = await open(1440);
    await set(page, { fail: true });
    await trigger(page).click(); await item(page).click();
    await page.evaluate(() => window.p24Fixture.finish());
    await expect(page.getByText("Error al sincronizar", { exact: true })).toBeVisible();
    await expect(trigger(page)).toHaveAttribute("aria-busy", "false");
    await shot(page, "fixture-error-1440");
    await set(page, { fail: false });
    await trigger(page).click(); await item(page).click();
    await page.evaluate(() => window.p24Fixture.navigate("fixture-b"));
    await expect(page.getByRole("heading", { name: "Proyecto B · Ventas ficticias" })).toBeVisible();
    await page.evaluate(() => window.p24Fixture.finish());
    await expect(trigger(page)).toHaveAttribute("aria-busy", "false");
    await expect(page.getByText("Sincronización exitosa", { exact: true })).toHaveCount(0);
    await trigger(page).click(); await item(page).click();
    await page.evaluate(() => window.p24Fixture.finish());
    await expect(page.getByText("Sincronización exitosa", { exact: true })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.p24Fixture.mutations.map(call => call.args.salesProjectId)), ["fixture-a", "fixture-a", "fixture-b"]);
    for (const role of ["viewer", "almacenista", "finance", "contratista"]) {
      await set(page, { role }); await expect(trigger(page)).toHaveCount(0);
    }
    await set(page, { role: "admin" }); await expect(trigger(page)).toBeVisible();
    await set(page, { mode: "permissions-loading" }); await expect(trigger(page)).toHaveCount(0);
    await set(page, { mode: "loading" }); await expect(page.getByText("Cargando datos...")).toBeVisible(); await expect(trigger(page)).toHaveCount(0);
    await set(page, { mode: "missing" }); await expect(trigger(page)).toHaveCount(0);
    await set(page, { mode: "ready", access: false }); await expect(trigger(page)).toHaveCount(0);
    await set(page, { access: true, mode: "empty" }); await expect(trigger(page)).toBeVisible();
    checks.push({ status: "passed", checks: "error unlocks, retry, navigation keeps request context, suppresses stale notification, admin/user only, pending/absent/denied project, empty budget" });
    assert.deepEqual(errors, []);
    await writeFile(`${output}/resultados-ui.json`, JSON.stringify({ fixture: true, realSyncs: 0, checks, errors }, null, 2));
  }
  console.log(JSON.stringify({ baseline, checks, errors }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
