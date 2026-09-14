import { expect, test } from "@playwright/test";

const bitacoraPath = process.env.E2E_BITACORA_PATH;

test.describe("Bitácora PWA offline", () => {
  test.skip(!bitacoraPath, "Define E2E_BITACORA_PATH y E2E_STORAGE_STATE con una sesión preparada.");

  test("prepara, recarga offline y conserva un reporte con archivo", async ({ page, context }) => {
    await page.goto(bitacoraPath!);
    await expect(page.getByRole("heading", { name: /Bitácora/ })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByText(/Sincronizado|pendiente|Sincronizando/).first()).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Sin conexión")).toBeVisible();
    await page.getByRole("button", { name: "Agregar reporte" }).click();
    await page.locator("#bitacora-partida").click();
    await page.getByRole("option").first().click();
    await page.locator("#bitacora-avance").fill("Reporte E2E creado sin conexión");
    await page.locator('input[accept=".pdf,.doc,.docx,.xls,.xlsx"]').setInputFiles({
      name: "evidencia.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 prueba offline"),
    });
    await page.getByRole("button", { name: "Crear Entrada" }).click();
    await expect(page.getByText("Guardado localmente", { exact: false }).first()).toBeVisible();

    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(bitacoraPath!);
    await reopened.locator('article > [role="button"]').first().click();
    await expect(reopened.getByText("Reporte E2E creado sin conexión")).toBeVisible();
  });
});
