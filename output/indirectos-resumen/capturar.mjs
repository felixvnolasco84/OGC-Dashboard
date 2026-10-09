import { preview } from "vite";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = `${root}/output/indirectos-resumen`;
await mkdir(output, { recursive: true });
const server = await preview({ configFile: false, root, build: { outDir: `${root}/output/indirectos-ui-build` }, preview: { host: "127.0.0.1", port: 4197, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto("http://127.0.0.1:4197/e2e/indirectos/preview.html?view=budget");
  await expect(page.getByText("Indirectos automáticos", { exact: true })).toBeVisible();
  await page.locator("table").screenshot({ path: `${output}/02-indirectos-presupuesto.png` });
  await page.getByRole("button", { name: "Editar proyecto de prueba" }).click();
  const field = page.getByLabel("Indirectos (%)", { exact: true });
  await expect(field).toHaveValue("10");
  await field.scrollIntoViewIfNeeded();
  await page.getByRole("dialog").screenshot({ path: `${output}/01-porcentaje-indirectos.png` });
  await page.goto("http://127.0.0.1:4197/e2e/indirectos/preview.html");
  const summary = page.getByRole("heading", { name: "EBITDA OGC", exact: true }).locator("..").locator("..");
  await expect(summary).toContainText("SALDO DE INDIRECTOS");
  await summary.screenshot({ path: `${output}/03-saldo-indirectos-pnl.png` });
  console.log("Tres capturas generadas con datos de prueba, sin cambios en registros reales.");
} finally {
  await browser?.close(); await server.httpServer.close();
}
