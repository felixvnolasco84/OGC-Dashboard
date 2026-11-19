import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/outputs/implementacion-P27-2026-11-19`;
const url = "http://127.0.0.1:4227/e2e/partida-menu/preview.html";
const server = process.argv.includes("--existing-server") ? null : await createServer({ configFile: `${root}/e2e/partida-menu/vite.config.ts` });
await server?.listen();
if (process.argv.includes("--serve")) {
  console.log(`P27 fixture: ${url}`);
  await new Promise(() => {});
}
let browser;
const errors = [];
const names = ["OBRA", "ACERO", "VARILLA"];
const types = ["partida", "familia", "subpartida"];
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  const prepare = async (level = 0, query = "") => {
    await page.goto(`${url}${query ? `?${query}` : ""}`);
    if (level > 0) await page.getByRole("button", { name: "Expandir OBRA", exact: true }).click();
    if (level > 1) await page.getByRole("button", { name: "Expandir ACERO", exact: true }).click();
    return page.getByRole("button", { name: `Acciones de la ${types[level]}: ${names[level]}`, exact: true });
  };
  const recorded = () => page.evaluate(() => window.partidaMenuRecorded);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const level of [0, 1, 2]) {
      const trigger = await prepare(level);
      assert.deepEqual((await recorded()).queries, [], "Payments stay lazy before opening");
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      const paymentLabel = level === 2 ? "Ver pagos" : "Ver transacciones";
      await expect(page.getByRole("menuitem", { name: paymentLabel, exact: true })).toBeFocused();
      const consultation = [paymentLabel, "Excel de origen", ...(level === 2 ? ["Detalle de partida"] : [])];
      const editLabel = `Editar ${level === 2 ? "sub-partida" : types[level]}`;
      assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [...consultation, editLabel, `Eliminar ${types[level]}`]);
      await expect(page.getByRole("separator")).toHaveCount(2);
      const query = (await recorded()).queries.at(-1);
      assert.deepEqual(query, level === 0
        ? { name: "pagos:getByPartidaName", args: { partida_name: "OBRA", proyecto_id: "project" } }
        : level === 1 ? { name: "pagos:getByFamilia", args: { partida_name: "OBRA", familia_name: "ACERO", proyecto_id: "project" } }
          : { name: "pagos:getByPartidaId", args: { partida_id: "leaf" } });
      const box = await page.getByRole("menu").boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= (width === 390 ? 844 : 1000), "Menu remains within viewport");
      await page.screenshot({ animations: "disabled", path: `${output}/menu-${types[level]}-${width}.png` });
      await page.keyboard.press("End");
      await expect(page.getByRole("menuitem", { name: `Eliminar ${types[level]}`, exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      assert.deepEqual((await recorded()).deletes, [], "Opening and traversing menu never requests deletion");

      await trigger.click();
      if (level === 2) await expect(page.getByRole("menuitem", { name: "Detalle de partida" })).toHaveAttribute("href", "/proyecto/project/partidas/leaf");
      await page.getByRole("menuitem", { name: paymentLabel, exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.partidaMenuPaymentState().isOpen)).toBe(true);
      const context = await page.evaluate(() => window.partidaMenuPaymentState().paymentContext);
      assert.equal(context.relatedPartida._id, ["root", "family", "leaf"][level]);
      assert.equal(context.totalAmount, [900, 600, 400][level]);
      assert.equal(context.payments[0]._id, query.name);
      await expect(page.getByRole("menu")).toHaveCount(0);
      const queryCount = (await recorded()).queries.length;
      await page.evaluate(() => window.dispatchEvent(new Event("menu-payments-ready")));
      assert.equal((await recorded()).queries.length, queryCount, "Closed menus no longer query payments");

      await trigger.click();
      await page.getByRole("menuitem", { name: "Excel de origen", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Excel de origen", exact: true })).toContainText("presupuesto-ficticio.xlsx");
      assert.deepEqual((await recorded()).queries.at(-1), { name: "budgetCreationHistory:source", args: { partida_id: ["root", "family", "leaf"][level], transaccion_id: undefined } });
      await page.screenshot({ animations: "disabled", path: `${output}/origen-${types[level]}-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await trigger.click();
      await page.getByRole("menuitem", { name: editLabel, exact: true }).click();
      await expect(page.getByLabel("Presupuesto aprobado", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await trigger.click();
      await page.getByRole("menuitem", { name: `Eliminar ${types[level]}`, exact: true }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
      await expect(page.getByRole("button", { name: "Eliminar definitivamente", exact: true })).toBeVisible();
      assert.deepEqual((await recorded()).deletes, [["root", "family", "leaf"][level]]);
      await page.screenshot({ animations: "disabled", path: `${output}/revision-borrado-${types[level]}-${width}.png` });
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.partidaEditRecorded.writes), 0);
      assert.deepEqual(await page.evaluate(() => window.deletionRecorded.mutations), []);
    }
    for (const role of ["viewer", "almacenista", "finance", "loading", "null"]) {
      const trigger = await prepare(0, `role=${role}`);
      await expect(trigger).toHaveAttribute("data-viewer-readonly-allow", "true");
      await trigger.click();
      await expect(page.getByRole("menuitem", { name: /^Eliminar / })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: /^Editar / })).toHaveCount(role === "finance" ? 1 : 0);
      const consultations = page.getByRole("menuitem").filter({ hasText: /Ver transacciones|Excel de origen/ });
      for (const item of await consultations.all()) await expect(item).toHaveAttribute("data-viewer-readonly-allow", "true");
      if (role === "viewer") await page.screenshot({ animations: "disabled", path: `${output}/menu-viewer-${width}.png` });
      if (role === "loading") {
        await page.evaluate(() => window.dispatchEvent(new Event("menu-user-ready")));
        await expect(page.getByRole("menuitem", { name: "Eliminar partida", exact: true })).toBeVisible();
      }
    }
    const trigger = await prepare(2, "loading");
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Cargando...", exact: true })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Cargando...", exact: true })).toHaveAttribute("aria-busy", "true");
    await page.screenshot({ animations: "disabled", path: `${output}/pagos-cargando-${width}.png` });
    await page.evaluate(() => window.dispatchEvent(new Event("menu-payments-ready")));
    await expect(page.getByRole("menuitem", { name: "Ver pagos", exact: true })).toBeEnabled();
    for (const [query, level] of [["temp", 2], ["no-project", 0]]) {
      await (await prepare(level, query)).click();
      if (query === "temp") {
        await expect(page.getByRole("menuitem", { name: "Detalle de partida", exact: true })).toHaveCount(0);
        assert.deepEqual((await recorded()).queries, []);
      } else await expect(page.getByRole("menuitem", { name: /^Eliminar / })).toHaveCount(0);
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/validacion-menu.json`, JSON.stringify({ widths: [1440, 390], levels: types, roles: ["admin", "finance", "viewer", "almacenista", "loading", "null"], errors, realWrites: 0, passed: true }, null, 2));
  console.log(`P27 menu UI passed: levels, roles, lazy queries, payment context, loading, source/edit/delete cancellation, keyboard, viewport. Screenshots: ${output}`);
} finally {
  if (browser) await browser.close();
  await server?.close();
}
