import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-partida-deletion-test`, optimizeDeps: { entries: ["e2e/partida-deletion/preview.html"] }, plugins: [react()], resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/partida-deletion/convex-stub.ts` } }, server: { host: "127.0.0.1", port: 4198, strictPort: true } });
await server.listen();
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(`${root}/output/partida-deletion`, { recursive: true });
  const open = async (page, scenario = "", nivel = 1) => {
    await page.goto(`http://127.0.0.1:4198/e2e/partida-deletion/preview.html${scenario ? `?case=${scenario}` : ""}`);
    if (nivel > 1) await page.getByRole("button", { name: "Expandir OBRA", exact: true }).click();
    if (nivel > 2) await page.getByRole("button", { name: "Expandir ACERO", exact: true }).click();
    const name = nivel === 1 ? "OBRA" : nivel === 2 ? "ACERO" : "VARILLA";
    await page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) }).getByRole("button", { name: "Abrir menú", exact: true }).click();
    await page.getByRole("menuitem", { name: `Eliminar ${nivel === 1 ? "partida" : nivel === 2 ? "familia" : "subpartida"}`, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
  };
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    await open(page);
    await expect(page.getByText(/Se eliminarían 2 partidas, 1 familia y 2 subpartidas/)).toBeVisible();
    await expect(page.getByText(/registro duplicado/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.deletionRecorded.mutations.length), 0);
    await open(page, "blocked");
    await expect(page.getByText("2 pagos", { exact: true })).toBeVisible();
    assert.equal(await page.getByRole("button", { name: "Eliminar definitivamente" }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Dialog overflow at ${width}px`);
    await page.screenshot({ path: `${root}/output/partida-deletion/blocked-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    for (const scenario of ["limit", "honorarios"]) {
      await open(page, scenario);
      await expect(page.getByText(scenario === "limit" ? "El volumen de datos excede el límite de verificación segura." : "La rama HONORARIOS está protegida.", { exact: true })).toBeVisible();
      assert.equal(await page.getByRole("button", { name: "Eliminar definitivamente" }).count(), 0);
      if (scenario === "limit") assert.equal(await page.getByText(/Se eliminarían/).count(), 0);
    }
    for (const nivel of [1, 2, 3]) {
      await open(page, "", nivel);
      await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
      await expect(page.getByRole("button", { name: "Eliminando..." })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByTestId("remaining-records")).toHaveText(String(nivel - 1));
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.deletionRecorded.mutations.length), 1);
      assert.equal(await page.evaluate(() => window.deletionRecorded.mutations[0].expectedScope), "snapshot-1");
    }
    await open(page, "missing");
    await expect(page.getByRole("alertdialog", { name: "El concepto ya no existe" })).toBeVisible();
    assert.equal(await page.getByRole("button", { name: "Eliminar definitivamente" }).count(), 0);
    await open(page, "preview-error");
    await expect(page.getByRole("alert")).toContainText("Error temporal");
    await page.getByRole("button", { name: "Volver a verificar" }).click();
    await expect(page.getByRole("button", { name: "Eliminar definitivamente" })).toBeVisible();
    for (const scenario of ["changed", "dependency"]) {
      await open(page, scenario);
      await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
      await expect(page.getByRole("alert")).toContainText(scenario === "changed" ? "cambió" : "pago asociado");
      assert.equal(await page.getByRole("button", { name: "Eliminar definitivamente" }).count(), 0);
      await page.getByRole("button", { name: "Volver a verificar" }).click();
      await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.deletionRecorded.mutations[1].expectedScope), "snapshot-2");
    }
    for (const scenario of ["viewer", "writer"]) {
      await page.goto(`http://127.0.0.1:4198/e2e/partida-deletion/preview.html?case=${scenario}`);
      await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
      assert.equal(await page.getByRole("menuitem", { name: /Eliminar/ }).count(), 0);
    }
    await open(page);
    await expect(page.getByRole("button", { name: "Eliminar definitivamente" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("deletion-revoke")));
    await expect(page.getByRole("alert")).toContainText("Necesitas permisos de administración");
    assert.equal(await page.getByRole("button", { name: "Eliminar definitivamente" }).count(), 0);
    assert.equal(await page.evaluate(() => window.deletionRecorded.mutations.length), 0);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("Partida deletion UI: desktop, mobile, keyboard, roles, retry, stale confirmation and row removal OK");
} finally {
  if (browser) await browser.close();
  await server.close();
}
