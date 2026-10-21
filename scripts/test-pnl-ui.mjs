import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = `${root}/node_modules/.cache/pnl-loading-ui`;
await build({
  configFile: false, root, plugins: [react()],
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/indirectos/convex-stub.ts` } },
  build: { outDir, emptyOutDir: true, rollupOptions: { input: `${root}/e2e/indirectos/preview.html` } },
  logLevel: "error",
});
const server = await preview({ configFile: false, root, build: { outDir }, preview: { host: "127.0.0.1", port: 4198, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // A stalled, inactive report must not block the initial monthly report.
    await page.goto("http://127.0.0.1:4198/e2e/indirectos/preview.html?reportLoading=profitability");
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
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("P&L UI passed: lazy report queries, pending report navigation, WIP and profitability, mobile and desktop. Synthetic fixtures only.");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
