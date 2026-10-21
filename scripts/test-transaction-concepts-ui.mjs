import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: `${root}/e2e/payment-edits/vite.config.ts`, server: { port: 4204, strictPort: true } });
await server.listen();
let browser;
const errors = [];
const screenshotDir = join(tmpdir(), "ogc-transaction-concepts");
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(screenshotDir, { recursive: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:4204/e2e/payment-edits/preview.html?case=concepts");
    await expect(page.getByTestId("transaction-card").getByText(/Entrega de acero para losa/)).toBeVisible();
    await expect(page.getByTestId("transaction-card").getByText("$300.00", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Card overflow at ${width}`);
    await page.screenshot({ path: `${screenshotDir}/card-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Ver desglose", exact: true }).click();
    assert.deepEqual(await page.getByRole("columnheader").allTextContents(), ["#", "Partida", "Familia", "Subpartida", "Monto"]);
    await expect(page.getByRole("dialog").getByText("Entrega original", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    for (const button of ["Crear con subpartida", "Crear directo a familia"]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      const concept = page.getByLabel("Concepto (opcional)", { exact: true });
      await expect(concept).toHaveCount(1);
      await expect(concept).toHaveValue("");
      await concept.fill("  Entrega manual de octubre  ");
      await page.getByRole("combobox", { name: "Categoría", exact: true }).click();
      await page.getByRole("option", { name: "Material", exact: true }).click();
      await page.getByRole("combobox", { name: "Método de pago", exact: true }).click();
      await page.getByRole("option", { name: "Efectivo", exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Form overflow at ${width}`);
      await page.screenshot({ path: `${screenshotDir}/${button.includes("directo") ? "family" : "subpartida"}-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Guardar 1 pago(s)", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const saved = await page.evaluate(() => window.paymentEditRecorded.mutations.filter(c => c.name === "transacciones:createTransaction").at(-1));
      assert.equal(saved.args.concepto_adicional, "Entrega manual de octubre");
      assert.equal(saved.args.lineItems[0].concepto_adicional, undefined);
      assert.equal(saved.args.lineItems[0].sub_partida, button.includes("directo") ? "" : "VARILLA");
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("Transaction concepts UI passed at 1440/390/320px: long-text cards, legacy blanks, column order, subpartida and family creation.");
} finally {
  if (browser) await browser.close();
  await server.close();
}
