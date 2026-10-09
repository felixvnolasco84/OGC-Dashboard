import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = `${root}/output/indirectos-ui-build`;
await build({ configFile: false, root, plugins: [react()], resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/indirectos/convex-stub.ts` } }, build: { outDir, emptyOutDir: true, rollupOptions: { input: `${root}/e2e/indirectos/preview.html` } }, logLevel: "error" });
const server = await preview({ configFile: false, root, build: { outDir }, preview: { host: "127.0.0.1", port: 4197, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(`${root}/output/indirectos-ui`, { recursive: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
    await page.goto("http://127.0.0.1:4197/e2e/indirectos/preview.html?view=budget");
    await expect(page.getByText("Indirectos automáticos", { exact: true })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "Indirectos automáticos" });
    await expect(row).toContainText("10%");
    await expect(row).toContainText("10,000");
    await page.getByRole("button", { name: "Editar proyecto de prueba" }).click();
    const field = page.getByLabel("Indirectos (%)", { exact: true });
    await expect(field).toHaveValue("10");
    await field.fill("20");
    await page.getByRole("button", { name: /Guardar/ }).click();
    await expect.poll(() => page.evaluate(() => window.indirectosMutation?.args.indirectos_porcentaje)).toBe(20);
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.screenshot({ path: `${root}/output/indirectos-ui/budget-${width}.png`, fullPage: true });
    await page.goto("http://127.0.0.1:4197/e2e/indirectos/preview.html");
    await expect(page.getByText("INDIRECTOS COBRADOS", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("SALDO DE INDIRECTOS", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    const balanceRows = page.getByRole("row").filter({ hasText: "SALDO DE INDIRECTOS" });
    await expect(balanceRows.last()).toContainText(width === 1440 ? "3.0k" : "3,000");
    await page.screenshot({ path: `${root}/output/indirectos-ui/pnl-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Indirectos UI passed: budget charge, editable percentage, P&L balance, desktop and mobile.");
} finally {
  await browser?.close(); await server.httpServer.close();
}
