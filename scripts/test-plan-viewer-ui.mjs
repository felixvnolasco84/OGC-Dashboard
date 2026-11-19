import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/outputs/P15-implementacion-2026-11-18`;
const externalBase = process.env.P15_BASE_URL;
const base = externalBase || "http://127.0.0.1:4215/e2e/plan-viewer/preview.html";
const server = externalBase ? null : await createServer({ configFile: `${root}/e2e/plan-viewer/vite.config.ts` });
await mkdir(`${output}/capturas`, { recursive: true });
let browser;
const errors = [];
const checks = [];
const more = (page, title = "Planta arquitectónica") => page.getByRole("button", { name: `Acciones del archivo: ${title}`, exact: true });
const item = (page, name) => page.getByRole("menuitem", { name, exact: true });
const calls = (page) => page.evaluate(() => window.p15Fixture.calls);
const shot = (page, name) => page.screenshot({ path: `${output}/capturas/${name}.png`, fullPage: true, animations: "disabled" });
async function cancel(page, role = "dialog", title) {
  await page.getByRole(role).getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole(role)).toHaveCount(0);
  await expect(more(page, title)).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.pointerEvents)).not.toBe("none");
}
async function edit(page, title) {
  await more(page, title).click();
  await item(page, "Editar datos").click();
  await expect(page.getByRole("dialog", { name: "Editar datos del plano" })).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const box = await page.getByRole("menu").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width);
}
async function checkDeleteContrast(page) {
  const colors = await item(page, "Eliminar plano").evaluate((node) => ({
    text: getComputedStyle(node).color,
    background: getComputedStyle(node.closest('[role="menu"]')).backgroundColor,
  }));
  const luminance = (rgb) => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(colors.text), luminance(colors.background)].sort((a, b) => b - a);
  assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `Delete text contrast: ${JSON.stringify(colors)}`);
}
try {
  await server?.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, acceptDownloads: true });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await expect(page.getByRole("img", { name: "Plano arquitectónico", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planta arquitectónica" })).toBeVisible();
    await expect(page.getByText("No. A-01 · Arquitectura · Rev. R1 · 889 KB", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar datos", exact: true })).toHaveCount(0);
    assert.ok((await more(page).boundingBox()).height >= 44);
    await shot(page, `visor-${width}`);
    await more(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Descargar plano")).toBeFocused();
    await noOverflow(page);
    await checkDeleteContrast(page);
    assert.deepEqual(await calls(page), []);
    const download = item(page, "Descargar plano");
    await expect(download).toHaveAttribute("href", /^data:image\/svg\+xml,/);
    await expect(download).toHaveAttribute("download", "A-01.svg");
    await expect(download).toHaveAttribute("target", "_blank");
    await expect(download).toHaveAttribute("rel", "noreferrer");
    await shot(page, `archivo-${width}`);
    await page.keyboard.press("Escape");
    await expect(more(page)).toBeFocused();
    await more(page).press("ArrowDown");
    await expect(item(page, "Descargar plano")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Editar datos")).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Editar datos del plano" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(dialog.getByLabel("Título", { exact: true })).toHaveValue("Planta arquitectónica");
    await expect(dialog.getByLabel("Número de plano")).toHaveValue("A-01");
    await expect(dialog.getByLabel("Disciplina")).toHaveValue("Arquitectura");
    await expect(dialog.getByLabel("Revisión")).toHaveValue("R1");
    await expect(dialog.getByRole("combobox")).toHaveText("Vigente");
    await expect(dialog.getByLabel("Título", { exact: true })).toBeFocused();
    await shot(page, `editar-${width}`);
    await dialog.getByLabel("Título", { exact: true }).fill(" ");
    await expect(dialog.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    await cancel(page);
    await edit(page);
    await expect(dialog.getByLabel("Título", { exact: true })).toHaveValue("Planta arquitectónica");
    await page.keyboard.press("Escape");
    await expect(more(page)).toBeFocused();

    await more(page).press("ArrowDown");
    await expect(item(page, "Descargar plano")).toBeFocused();
    await page.keyboard.press("End");
    await expect(item(page, "Eliminar plano")).toBeFocused();
    await page.keyboard.press("Enter");
    const confirmation = page.getByRole("alertdialog", { name: "Eliminar plano" });
    await expect(confirmation).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(confirmation.getByText(/todas sus anotaciones, comentarios y el archivo. Esta acción no se puede deshacer/)).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
    await shot(page, `confirmacion-${width}`);
    await cancel(page, "alertdialog");
    assert.deepEqual(await calls(page), []);

    // Viewer tools stay outside the file menu; exercise only local state.
    await page.getByRole("button", { name: "Acercar", exact: true }).click();
    await expect(page.getByRole("button", { name: "125%", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "125%", exact: true }).click();
    await expect(page.getByRole("button", { name: "100%", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Nube", exact: true }).click();
    await page.getByRole("button", { name: "Trazo libre", exact: true }).click();
    await page.getByRole("button", { name: "Seleccionar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Página anterior", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Página siguiente", exact: true })).toBeDisabled();
    assert.deepEqual(await calls(page), []);

    await page.getByRole("button", { name: /^Menciones/ }).click();
    await expect(page.getByRole("dialog", { name: "Menciones en planos" })).toBeVisible();
    await expect.poll(() => calls(page)).toEqual([{ name: "planos:markMentionNotificationsRead", args: { proyecto: "project" } }]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menciones", exact: true })).toBeFocused();
    // Download uses only the fictitious asset, keeping link behavior intact.
    await more(page).click();
    const downloaded = page.waitForEvent("download");
    await item(page, "Descargar plano").click();
    assert.equal((await downloaded).suggestedFilename(), "A-01.svg");
    await expect(page.getByRole("menu")).toHaveCount(0);
    assert.equal((await calls(page)).length, 1);
    checks.push(`${width}: composición, menú, enlace/descarga, teclado/foco, edición precargada/validación/cancelación, confirmación sin borrar, herramientas y menciones por proyecto`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  for (const scenario of [
    { query: "role=admin", manage: true, draw: true, label: "admin" },
    { query: "role=contratista&owner", manage: true, draw: true, label: "autor" },
    { query: "role=contratista", manage: false, draw: true, label: "otro-usuario" },
    { query: "role=viewer", manage: false, draw: false, label: "lector" },
    { query: "role=viewer&missing", manage: false, draw: false, label: "lector-sin-url" },
    { query: "role=admin&missing", manage: true, draw: true, label: "admin-sin-url" },
  ]) {
    await page.goto(`${base}?${scenario.query}`);
    await expect(more(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Nube", exact: true })).toBeEnabled({ enabled: scenario.draw });
    await more(page).click();
    await expect(item(page, "Editar datos")).toHaveCount(scenario.manage ? 1 : 0);
    await expect(item(page, "Eliminar plano")).toHaveCount(scenario.manage ? 1 : 0);
    await expect(page.getByRole("separator")).toHaveCount(scenario.manage ? 1 : 0);
    await noOverflow(page);
    if (scenario.query.includes("missing")) {
      await expect(item(page, "Descargar plano")).toHaveAttribute("aria-disabled", "true");
      await expect(item(page, "Descargar plano")).not.toHaveAttribute("href");
      await expect(page.getByRole("menuitem")).toHaveCount(scenario.manage ? 3 : 1);
    } else await expect(item(page, "Descargar plano")).toBeEnabled();
    await shot(page, `permisos-${scenario.label}-390`);
    assert.deepEqual(await calls(page), []);
    await page.keyboard.press("Escape");
    await expect(more(page)).toBeFocused();
    checks.push(`Permisos ${scenario.label}: opciones y herramientas correctas, apertura sin mutaciones`);
  }

  await page.goto(base);
  await edit(page);
  await page.getByRole("dialog").getByLabel("Título", { exact: true }).fill("Borrador cancelado");
  await cancel(page);
  await page.getByRole("link", { name: "Otro plano ficticio", exact: true }).click();
  await edit(page, "Detalle de cimentación");
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Detalle de cimentación");
  await expect(page.getByLabel("Número de plano")).toHaveValue("E-02");
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveText("Archivado");
  await cancel(page, "dialog", "Detalle de cimentación");
  await more(page, "Detalle de cimentación").click();
  await item(page, "Eliminar plano").click();
  await expect(page.getByRole("alertdialog")).toContainText("Detalle de cimentación");
  await cancel(page, "alertdialog", "Detalle de cimentación");
  assert.deepEqual(await calls(page), []);
  checks.push("Cambio de plano: edición y confirmación usan metadatos/identidad actuales sin arrastrar el borrador anterior");

  // A menu cannot survive losing access or a detail loading/unmount boundary.
  await page.goto(base);
  await more(page).click();
  await page.evaluate(() => window.p15Fixture.setRole("contratista"));
  await expect(item(page, "Editar datos")).toHaveCount(0);
  await expect(item(page, "Eliminar plano")).toHaveCount(0);
  await page.evaluate(() => window.p15Fixture.setLoading(true));
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() => window.p15Fixture.setLoading(false));
  await expect(more(page)).toBeVisible();
  assert.deepEqual(await calls(page), []);
  checks.push("Revocar gestión retira opciones; loading desmonta el menú sin ejecutar acciones");

  // Only this in-memory stub accepts metadata writes, to exercise the real busy UI.
  await page.goto(base);
  await edit(page);
  await page.evaluate(() => { window.p15Fixture.holdEdit = true; });
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await expect.poll(() => calls(page)).toEqual([{ name: "planos:updateMetadata", args: { plano_id: "plan", titulo: "Planta arquitectónica", numero: "A-01", disciplina: "Arquitectura", revision: "R1", status: "Vigente" } }]);
  await page.evaluate(() => window.p15Fixture.releaseEdit());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more(page)).toBeFocused();
  checks.push("Guardado simulado en memoria conserva validación, payload y busy; ningún backend conectado");

  await page.goto(base);
  await page.getByRole("button", { name: "Biblioteca de planos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cargar planos", exact: true })).toBeVisible();
  await expect(more(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Cargar planos", exact: true }).click();
  await item(page, "Cargar plano").click();
  await expect(page.getByRole("dialog", { name: "Cargar plano", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cargar planos", exact: true })).toBeFocused();
  await page.getByRole("button", { name: /Planta arquitectónica/ }).click();
  await expect(more(page)).toBeVisible();
  assert.deepEqual(await calls(page), []);
  checks.push("Convivencia P14: vuelta a biblioteca, carga/cancelación/foco y reapertura del visor intactas");

  assert.deepEqual(errors, []);
  await writeFile(`${output}/resultado.json`, JSON.stringify({ checks, pageErrors: errors, backend: "No conectado. Datos y descarga ficticios; única escritura de metadatos interceptada en memoria; sin borrados, anotaciones ni comentarios." }, null, 2));
  console.log(checks.join("\n"));
  await page.close();
} finally {
  await browser?.close();
  await server?.close();
}
