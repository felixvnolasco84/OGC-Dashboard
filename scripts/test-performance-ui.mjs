import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: false, root, plugins: [react()],
  cacheDir: `${root}/node_modules/.cache/performance-vite`,
  optimizeDeps: { entries: ["e2e/performance/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/performance/convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 4203, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
    await page.goto("http://127.0.0.1:4203/e2e/performance/preview.html");
    await expect(page.getByRole("button", { name: "Abrir importador" })).toBeVisible();
    assert.equal(await page.evaluate(() => window.performanceFixtureCalls.includes("desarrollos:getAll")), false);
    // Open before background preparation finishes; the request takes priority.
    await page.getByRole("button", { name: "Abrir importador" }).click();
    await expect(page.getByRole("dialog", { name: "Importar transacciones" })).toBeVisible();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Proyecto de prueba" }).click();
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Abrir importador" }).click();
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    // The counter remains live while the notification list is closed.
    await page.evaluate(() => window.changeUnread(3));
    await expect(page.getByRole("button", { name: /Menciones/ })).toContainText("3");
    await page.getByRole("button", { name: /Menciones/ }).click();
    await expect(page.getByText("Sin menciones", { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Performance UI passed: closed modals skip data, early open, close/reopen form reset, live unread counter, mobile and desktop.");
} finally {
  await browser?.close();
  await server.close();
}
