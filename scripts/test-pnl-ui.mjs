import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = `${root}/node_modules/.cache/pnl-loading-ui-${process.pid}`;
const port = Number(process.env.PNL_UI_PORT || 4198);
const screenshotDir = process.env.PNL_UI_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
await build({
  configFile: false, root, plugins: [react()],
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/indirectos/convex-stub.ts` } },
  build: { outDir, emptyOutDir: true, rollupOptions: { input: `${root}/e2e/indirectos/preview.html` } },
  logLevel: "error",
});
const server = await preview({ configFile: false, root, build: { outDir }, preview: { host: "127.0.0.1", port, strictPort: true } });
const fixtureUrl = `http://127.0.0.1:${port}/e2e/indirectos/preview.html`;
const openTools = page => page.getByRole("button", { name: "Herramientas de P&L", exact: true }).click();
const openLedger = async page => {
  await openTools(page);
  await page.getByRole("menuitem", { name: "Movimientos OGC", exact: true }).click();
};
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // A pending secondary ledger cannot delay or blank the visible report.
    await page.goto(`${fixtureUrl}?reportLoading=ledger`);
    await expect(page.getByText("Ingresos OGC YTD", { exact: true })).toBeVisible();
    await openLedger(page);
    await expect(page.getByRole("dialog").getByText("Cargando datos...", { exact: true })).toBeVisible();
    await page.evaluate(() => window.feeFixtureChange({ reportLoading: null }));
    await expect(page.getByText("No hay movimientos OGC cargados.", { exact: true })).toBeVisible();

    // A stalled, inactive report must not block the initial monthly report.
    await page.goto(`${fixtureUrl}?reportLoading=profitability`);
    await expect(page.getByText("Ingresos OGC YTD", { exact: true })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.pnlFixtureQueries), ["desarrollos:getPnlSummary"]);

    await page.getByRole("button", { name: "Work in progress", exact: true }).click();
    await expect(page.getByText("Cargando datos...", { exact: true })).toBeVisible();
    // Navigation stays available while the selected report is pending.
    await page.getByRole("button", { name: "P&L Mensual", exact: true }).click();
    await expect(page.getByText("Ingresos OGC YTD", { exact: true })).toBeVisible();

    await page.evaluate(() => window.feeFixtureChange({ reportLoading: null }));
    await page.getByRole("button", { name: "Work in progress", exact: true }).click();
    await expect(page.getByText("Backlog total contratado", { exact: true })).toBeVisible();
    await expect(page.getByText("Obra de prueba", { exact: true }).first()).toBeVisible();
    const beforeProfitability = await page.evaluate(() => window.pnlFixtureQueries.length);
    await page.getByRole("button", { name: "Project profitability", exact: true }).click();
    await expect(page.getByText("Margen bruto total OGC", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.pnlFixtureQueries.length), beforeProfitability);

    await page.evaluate(() => window.feeFixtureChange({ reportLoading: "pnl" }));
    await page.getByRole("button", { name: "P&L Mensual", exact: true }).click();
    await expect(page.getByText("Cargando datos...", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Work in progress", exact: true })).toBeVisible();
    await page.evaluate(() => window.feeFixtureChange({ reportLoading: null }));
    await expect(page.getByText("Ingresos OGC YTD", { exact: true })).toBeVisible();

    // Imported informatives remain visible even without income. Historical
    // costs appear with real indirect costs and reduce EBITDA only once.
    await page.goto(`${fixtureUrl}?reportScenario=importedCosts`);
    if (width === 390) await page.getByRole("button", { name: "Mostrar matriz comparativa", exact: true }).click();
    const monthlyTable = page.getByRole("table").first();
    const monthlyRow = label => monthlyTable.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });
    await expect(monthlyRow("COSTOS REALES DE INDIRECTOS").getByText("(9,000)", { exact: true })).toBeVisible();
    await expect(monthlyRow("TOTAL ESTRUCTURA").getByText("(21,000)", { exact: true })).toBeVisible();
    await expect(monthlyRow("SALDO DE INDIRECTOS").getByText("1,000", { exact: true })).toBeVisible();
    await expect(monthlyRow("EBITDA").getByText("4,000", { exact: true })).toBeVisible();
    await expect(monthlyRow("UTILIDAD NETA").getByText("3,800", { exact: true })).toBeVisible();
    const sirocRow = monthlyRow("CARGA SOCIAL OBRA (SIROC - RECUPERABLE)");
    await expect(sirocRow.getByText("(150)", { exact: true })).toBeVisible();
    await expect(sirocRow.getByText("(8,500)", { exact: true })).toBeVisible();
    await expect(monthlyRow("FLUJO FISCAL (IVA + RETENCIONES)").getByText("(1,250)", { exact: true })).toBeVisible();
    await expect(page.getByText("COSTO HISTÓRICO DE INDIRECTOS", { exact: true })).toHaveCount(0);
    const annualStructure = page.getByRole("table").nth(1);
    const annualIndirects = annualStructure.getByRole("row").filter({ hasText: "COSTOS REALES DE INDIRECTOS" });
    await expect(annualIndirects.locator('[title="$9,000.00"]')).toBeVisible();
    await expect(annualIndirects.getByText("43%", { exact: true })).toBeVisible();
    await openTools(page);
    await page.getByRole("menuitem", { name: "Configurar P&L", exact: true }).click();
    const importedSettings = page.getByRole("dialog");
    await expect(importedSettings.getByLabel("SIROC", { exact: true })).toHaveCount(0);
    await expect(importedSettings.getByLabel("IVA/Ret", { exact: true })).toHaveCount(0);
    await importedSettings.getByLabel("ISR", { exact: true }).fill("12");
    await importedSettings.getByRole("button", { name: "Listo", exact: true }).click();
    await expect(monthlyRow("UTILIDAD NETA").getByText("3,480", { exact: true })).toBeVisible();
    await expect(sirocRow.getByText("(8,500)", { exact: true })).toBeVisible();

    // Accumulated income, corporate costs and excluded dispersions render in
    // both responsive layouts, including the secondary ledger.
    await page.goto(`${fixtureUrl}?reportScenario=profitabilityFixes`);
    await expect(page.getByText("Ingresos OGC YTD", { exact: true })).toBeVisible();
    await expect(page.getByText("DISP HONORARIOS", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Project profitability", exact: true }).click();
    const projectRow = page.getByRole("row").filter({ hasText: "Obra de prueba" });
    await expect(projectRow.locator('[title="$13,735,506.49"]')).toBeVisible();
    const corporateRow = page.getByRole("row").filter({ hasText: "OGC sin obra asignada" });
    await expect(corporateRow).toHaveCount(0);
    const nominaRow = page.getByRole("row").filter({ has: page.getByText("NOMINA", { exact: true }) });
    await expect(nominaRow.locator('[title="$12,000.00"]')).toBeVisible();
    await expect(page.getByText("DISP HONORARIOS", { exact: true })).toHaveCount(0);
    await openLedger(page);
    const ledger = page.getByRole("dialog");
    await expect(ledger.getByText("Nómina corporativa de prueba", { exact: true })).toBeVisible();
    await expect(ledger.getByText(/DISP|Dispersión excluida/)).toHaveCount(0);

    // The tools menu only navigates. Settings apply immediately, and closing
    // either dialog returns keyboard focus to the persistent toolbar button.
    await page.goto(`${fixtureUrl}?reportScenario=tools`);
    const tools = page.getByRole("button", { name: "Herramientas de P&L", exact: true });
    const location = page.getByRole("combobox", { name: "Filtrar Profit & Loss por ubicación", exact: true });
    await expect(location).toHaveText("Los Cabos");
    for (const name of ["P&L Mensual", "Work in progress", "Project profitability", "Cargar movimientos"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const originalArgs = await page.evaluate(() => window.pnlFixtureQueryArgs.at(-1).args);
    await tools.focus();
    await tools.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Movimientos OGC", exact: true })).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.pnlFixtureQueryArgs.at(-1).args), originalArgs);
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/p19-menu-${width}.png`, animations: "disabled" });
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Configurar P&L", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    const settings = page.getByRole("dialog", { name: "Configuracion P&L", exact: true });
    await expect(settings).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(settings.getByRole("button", { name: "Restablecer", exact: true })).toBeFocused();
    await expect(settings.getByRole("button", { name: /Guardar/ })).toHaveCount(0);
    const originalUsd = await settings.getByLabel("USD/MXN", { exact: true }).inputValue();
    const originalIsr = await settings.getByLabel("ISR", { exact: true }).inputValue();
    await settings.getByLabel("USD/MXN", { exact: true }).fill("22");
    await expect.poll(() => page.evaluate(() => window.pnlFixtureQueryArgs.at(-1).args.usdToMxn)).toBe(22);
    const isrRow = page.locator("tr").filter({ hasText: "ISR CORPORATIVO" });
    const beforeIsr = await isrRow.textContent();
    await settings.getByLabel("ISR", { exact: true }).fill("12");
    await expect(isrRow).not.toHaveText(beforeIsr);
    if (screenshotDir) {
      await settings.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: `${screenshotDir}/p19-settings-${width}.png`, animations: "disabled" });
    }
    await settings.getByRole("button", { name: "Listo", exact: true }).click();
    await expect(settings).toHaveCount(0);
    await expect(tools).toBeFocused();
    await openTools(page);
    await page.getByRole("menuitem", { name: "Configurar P&L", exact: true }).click();
    await expect(settings.getByLabel("USD/MXN", { exact: true })).toHaveValue("22");
    await expect(settings.getByLabel("ISR", { exact: true })).toHaveValue("12");
    await settings.getByRole("button", { name: "Restablecer", exact: true }).click();
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel("USD/MXN", { exact: true })).toHaveValue(originalUsd);
    await expect(settings.getByLabel("ISR", { exact: true })).toHaveValue(originalIsr);
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(tools).toBeFocused();

    await openLedger(page);
    await expect(ledger).toBeVisible();
    await expect(ledger.getByText("Movimiento Cabos de prueba", { exact: true })).toBeVisible();
    await expect(ledger.getByText("Movimiento CDMX de prueba", { exact: true })).toHaveCount(0);
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/p19-ledger-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(ledger).toHaveCount(0);
    await expect(tools).toBeFocused();
    await location.click();
    await page.getByRole("option", { name: "Ciudad de México", exact: true }).click();
    await expect(location).toHaveText("Ciudad de México");
    await openLedger(page);
    await expect(ledger.getByText("Movimiento CDMX de prueba", { exact: true })).toBeVisible();
    await expect(ledger.getByText("Movimiento Cabos de prueba", { exact: true })).toHaveCount(0);
    await ledger.getByRole("button", { name: "Close", exact: true }).click();
    await expect(tools).toBeFocused();
    await page.getByRole("button", { name: "Cargar movimientos", exact: true }).click();
    const upload = page.getByRole("dialog", { name: "Cargar movimientos OGC", exact: true });
    await expect(upload).toBeVisible();
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/p19-upload-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(upload).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.indirectosMutation), undefined);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("P&L UI passed: report navigation/loading, financial regression, tools menu, keyboard/focus, immediate settings, reset, location-scoped ledger and original upload, mobile and desktop. Synthetic fixtures only; no mutations.");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
