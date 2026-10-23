import { expect, test } from "@playwright/test";

import { seedOfflineBitacora } from "./seed-offline";

test("captura offline con archivo y conserva la entrada y su cola al recargar", async ({ page, context, browserName }) => {
  test.skip(browserName === "webkit", "La siembra de Blob/File en IndexedDB requiere Chromium en Windows.");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await seedOfflineBitacora(page);
  await context.setOffline(true);
  await page.goto("/proyecto/layout-project/bitacora");
  await expect(page.getByRole("heading", { name: "Larena - Acceso" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar reporte", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Instalaciones", exact: true }).click();
  await page.locator("#bitacora-partida").click();
  await page.getByRole("option").first().click();
  await page.locator("#bitacora-avance").fill("Captura sintética conservada sin conexión");
  await page.locator('input[accept=".pdf,.doc,.docx,.xls,.xlsx"]').setInputFiles({
    name: "prueba-offline.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba offline"),
  });
  await page.getByRole("button", { name: "Crear Entrada" }).click();
  await expect(page.getByText("Guardado localmente", { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Larena - Acceso" })).toBeVisible();
  await page.getByRole("button", { name: /Expandir reporte del/ }).first().click();
  await expect(page.getByText("Captura sintética conservada sin conexión")).toBeVisible();
  const attachment = page.getByRole("link", { name: /^prueba-offline/ }).first();
  await expect(attachment).toBeVisible();
  const attachmentUrl = await attachment.getAttribute("href");
  expect(await page.evaluate(async url => (await fetch(url!)).text(), attachmentUrl)).toBe("%PDF-1.4 prueba offline");
  const queued = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ogc-bitacora-offline");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction("outbox").objectStore("outbox").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  });
  expect(queued).toBeGreaterThan(0);
});

test("galería desktop y modal de detalle no crean scroll exterior", async ({ page, context, browserName }) => {
  test.skip(browserName === "webkit", "Playwright WebKit para Windows no permite sembrar Blob/File en IndexedDB; el flujo autenticado cubre WebKit con datos reales.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await seedOfflineBitacora(page);
  await context.setOffline(true);
  await page.goto("/proyecto/layout-project/bitacora");

  await expect(page.getByRole("heading", { name: "Larena - Acceso" })).toBeVisible();
  await page.getByRole("button", { name: /Expandir reporte del/ }).first().click();
  await page.getByTitle("Abrir en la galería").first().click();

  const gallery = page.getByRole("dialog");
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText("LUMINARIAS - Foto")).toBeVisible();
  const gallerySize = await gallery.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
  }));
  expect(gallerySize.width).toBe(1440);
  expect(gallerySize.height).toBe(900);
  expect(gallerySize.scrollWidth).toBe(gallerySize.width);
  expect(gallerySize.scrollHeight).toBe(gallerySize.height);
  await gallery.getByRole("button", { name: "Cerrar galería" }).click();
  await page.getByRole("button", { name: /Acciones del reporte del/ }).click();
  await page.getByRole("menuitem", { name: "Ver detalles" }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByRole("heading", { name: "Detalle de Entrada" })).toBeVisible();
  await expect.poll(() => details.evaluate((element) => element.clientWidth)).toBe(1152);
  const detailsOverflow = await details.evaluate((element) => ({
    outerScrolls: element.scrollHeight > element.clientHeight,
    overflowingVerticalRegions: Array.from(element.querySelectorAll("*")).filter((child) => {
      const style = getComputedStyle(child);
      return ["auto", "scroll"].includes(style.overflowY) && child.scrollHeight > child.clientHeight;
    }).length,
  }));
  expect(detailsOverflow.outerScrolls).toBe(false);
  expect(detailsOverflow.overflowingVerticalRegions).toBe(1);
});
