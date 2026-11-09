import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}test-results/whatsapp`;
const server = await createServer({
  configFile: false, root, cacheDir: `${root}node_modules/.vite-whatsapp-test`,
  optimizeDeps: { entries: ["e2e/whatsapp/preview.html"] }, plugins: [react()],
  resolve: { alias: [{ find: "convex/react", replacement: `${root}e2e/whatsapp/convex-stub.ts` }, { find: "@", replacement: `${root}src` }] },
  server: { host: "127.0.0.1", port: 4195, strictPort: true },
});
await server.listen();
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(output, { recursive: true });
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:4195/e2e/whatsapp/preview.html");
    await expect(page.getByRole("button", { name: "Guardar WhatsApp" })).toBeEnabled();
    await page.getByRole("checkbox", { name: "Recibir notificaciones de requisiciones por WhatsApp" }).check();
    await expect(page.getByRole("button", { name: "Guardar WhatsApp" })).toBeDisabled();
    await page.getByLabel("Teléfono internacional").fill("+525512345678");
    await page.getByRole("checkbox", { name: /^Confirmo/ }).check();
    await page.getByRole("button", { name: "Guardar WhatsApp" }).click();
    await expect(page.getByText(/Autorización registrada el/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.whatsappMutations[0])).toEqual({ name: "whatsapp:saveContact", args: { user_id: "user", phone: "+525512345678", enabled: true, confirm_consent: true } });
    await page.getByLabel("Teléfono internacional").fill("+525599998888");
    await expect(page.getByRole("button", { name: "Guardar WhatsApp" })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "WhatsApp automático" })).not.toBeChecked();
    await page.getByRole("switch", { name: "WhatsApp automático" }).check();
    await expect(page.getByRole("switch", { name: "WhatsApp automático" })).toBeChecked();
    await expect(page.getByText("Leídos: 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Aceptado por WhatsApp", { exact: true })).toBeVisible();
    await expect(page.getByText("Sin autorización vigente", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
    await page.close();
  }
  const finance = await browser.newPage();
  await finance.goto("http://127.0.0.1:4195/e2e/whatsapp/preview.html?role=finance");
  await expect(finance.getByRole("switch", { name: "WhatsApp automático" })).toBeDisabled();
  expect(errors).toEqual([]);
  console.log("WhatsApp UI passed: contact consent, project activation, channel states, finance permissions, 320px/1440px layouts.");
} finally { await browser?.close(); await server.close(); }
