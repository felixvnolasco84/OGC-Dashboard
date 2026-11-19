import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/outputs/P14-implementacion-2026-11-18`;
await mkdir(`${output}/capturas`, { recursive: true });
await mkdir(`${output}/archivos-ficticios/Arquitectura`, { recursive: true });
// Minimal valid one-page PDF for the existing local preview.
const pdfObjects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  "<< /Length 57 >>\nstream\nBT /F1 14 Tf 30 240 Td (Plano ficticio P14 - sin carga) Tj ET\nendstream",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
pdfObjects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF\n`;
await writeFile(`${output}/archivos-ficticios/Arquitectura/A-01.pdf`, pdf);
await writeFile(`${output}/archivos-ficticios/Arquitectura/falso.pdf`, "Contenido que no es PDF");
await writeFile(`${output}/archivos-ficticios/Arquitectura/notas.txt`, "Archivo ficticio descartable");
const server = await createServer({ configFile: `${root}/e2e/plan-library/vite.config.ts` });
const base = "http://127.0.0.1:4214/e2e/plan-library/preview.html";
let browser;
const errors = [];
const checks = [];
const upload = (page) => page.getByRole("button", { name: "Cargar planos", exact: true });
const more = (page) => page.getByRole("button", { name: /^Más acciones de la biblioteca de planos/ });
const calls = (page) => page.evaluate(() => window.p14Fixture.calls);
const shot = (page, name) => page.screenshot({ path: `${output}/capturas/${name}.png`, fullPage: false, animations: "disabled" });
async function closeDialog(page, trigger) {
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.pointerEvents)).not.toBe("none");
}
async function chooseUpload(page, name) {
  await upload(page).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  return page.getByRole("dialog");
}
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "Planos Proyecto de prueba" })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(page, `biblioteca-${width}`);
    await expect(page.getByRole("button", { name: "Cargar plano", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cargar carpeta", exact: true })).toHaveCount(0);
    assert.equal((await upload(page).boundingBox()).height >= 44, true);
    assert.equal((await more(page).boundingBox()).height >= 44, true);

    await upload(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Cargar plano", exact: true })).toBeFocused();
    await shot(page, `cargar-${width}`);
    assert.deepEqual(await calls(page), []);
    await page.keyboard.press("Escape");
    await expect(upload(page)).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Cargar plano", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Cargar carpeta", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("menuitem", { name: "Cargar plano", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    const single = page.getByRole("dialog", { name: "Cargar plano", exact: true });
    await expect(single).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(single.getByText(/PDF, JPG, PNG o WebP de hasta 50 MB/)).toBeVisible();
    await expect(single.locator('input[type="file"]')).toHaveAttribute("accept", /image\/webp/);
    await single.getByLabel("Título", { exact: true }).fill("Borrador ficticio");
    await single.locator('input[type="file"]').setInputFiles({ name: "prueba.png", mimeType: "image/png", buffer: Buffer.from("ficticio") });
    await shot(page, `dialogo-plano-${width}`);
    await closeDialog(page, upload(page));
    await chooseUpload(page, "Cargar plano");
    await expect(single.getByLabel("Título", { exact: true })).toHaveValue("");
    await expect(single.getByText("Seleccionar archivo", { exact: true })).toBeVisible();
    await closeDialog(page, upload(page));

    const folder = await chooseUpload(page, "Cargar carpeta");
    await expect(folder.getByRole("heading", { name: "Cargar carpeta de planos" })).toBeVisible();
    await shot(page, `dialogo-carpeta-${width}`);
    await folder.locator('input[type="file"]').setInputFiles(`${output}/archivos-ficticios/Arquitectura`);
    await expect(folder.getByLabel("Nombre de la carpeta")).toHaveValue("Arquitectura");
    await expect(folder.getByText("La extensión es PDF, pero el contenido no es un PDF válido")).toBeVisible();
    await expect(folder.getByText("Formato no compatible; solo se admiten archivos PDF")).toBeVisible();
    await expect(folder.getByRole("button", { name: "Subir 1 plano", exact: true })).toBeDisabled();
    await folder.getByLabel("Disciplina", { exact: true }).fill("Arquitectura");
    await expect(folder.getByRole("button", { name: "Subir 1 plano", exact: true })).toBeEnabled();
    await shot(page, `revision-carpeta-${width}`);
    assert.deepEqual(await calls(page), []);
    await closeDialog(page, upload(page));
    await chooseUpload(page, "Cargar carpeta");
    await expect(folder.getByText("Suelta aquí la carpeta de planos", { exact: true })).toBeVisible();
    await expect(folder.getByRole("button", { name: /^Subir/ })).toHaveCount(0);
    await closeDialog(page, upload(page));

    await more(page).click();
    await expect(page.getByRole("menuitem", { name: "Menciones de planos" })).toBeVisible();
    await shot(page, `seguimiento-${width}`);
    assert.deepEqual(await calls(page), []);
    await page.keyboard.press("Escape");
    await expect(more(page)).toBeFocused();
    await more(page).press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Menciones en planos" })).toBeVisible();
    await expect.poll(() => calls(page)).toEqual([{ name: "planos:markMentionNotificationsRead", args: { proyecto: "project" } }]);
    await shot(page, `menciones-proyecto-${width}`);
    await page.keyboard.press("Escape");
    await expect(more(page)).toBeFocused();
    // Global default trigger retains its independent count and scope.
    await expect(page.getByRole("button", { name: "Menciones en planos", exact: true })).toContainText("9+");
    await page.getByRole("button", { name: "Menciones en planos", exact: true }).click();
    await expect.poll(async () => (await calls(page)).at(-1)).toEqual({ name: "planos:markMentionNotificationsRead", args: {} });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menciones en planos", exact: true })).toBeFocused();
    checks.push(`${width}: layout, teclado, foco, diálogos, reset, selección/validación/revisión de carpeta, cero cargas y alcances de menciones`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?role=viewer&empty`);
  await expect(more(page)).toBeVisible();
  await expect(upload(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cargar/ })).toHaveCount(0);
  await more(page).click();
  assert.deepEqual(await calls(page), []);
  await page.getByRole("menuitem", { name: "Menciones de planos" }).click();
  await expect(page.getByRole("dialog", { name: "Menciones en planos" })).toBeVisible();
  await shot(page, "lector-menciones-390");
  await page.keyboard.press("Escape");
  await expect(more(page)).toBeFocused();
  checks.push("Lector: sin modalidades de carga, acceso a menciones a través de la protección de lectura");

  await page.goto(`${base}?empty`);
  await expect(page.getByRole("button", { name: "Cargar plano", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar carpeta", exact: true })).toBeVisible();
  await upload(page).click();
  await page.evaluate(() => window.p14Fixture.setRole("viewer"));
  await expect(upload(page)).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /Cargar/ })).toHaveCount(0);
  assert.deepEqual(await calls(page), []);
  checks.push("Estado vacío conserva llamadas contextuales; revocar escritura retira los items del portal");

  await page.goto(base);
  await page.getByRole("button", { name: /^Arquitectura/ }).click();
  await expect(page.getByRole("heading", { name: "Arquitectura", exact: true })).toBeVisible();
  const locatedUpload = await chooseUpload(page, "Cargar plano");
  await expect(locatedUpload.locator('input[type="file"]')).toHaveAttribute("accept", ".pdf,application/pdf");
  await expect(locatedUpload.getByText(/Se cargará en Arquitectura/)).toBeVisible();
  await locatedUpload.locator('input[type="file"]').setInputFiles({ name: "rechazado.png", mimeType: "image/png", buffer: Buffer.from("ficticio") });
  await expect(locatedUpload.getByText("Seleccionar archivo", { exact: true })).toBeVisible();
  await closeDialog(page, upload(page));
  await more(page).click();
  assert.deepEqual(await calls(page), []);
  await page.getByRole("menuitem", { name: "Menciones de planos" }).click();
  await expect.poll(() => calls(page)).toEqual([{ name: "planos:markMentionNotificationsRead", args: { proyecto: "project" } }]);
  await page.keyboard.press("Escape");
  checks.push("Ubicación actual conserva destino PDF y validación; menciones dentro de carpeta siguen abarcando el proyecto");

  await page.goto(base);
  await expect(more(page)).toBeVisible();
  // Exercise the real library drop handler and its initialEntries contract.
  await page.locator("div.relative.min-h-screen").evaluate((library) => {
    const transfer = new DataTransfer();
    const file = new File(["%PDF-1.4\n%%EOF"], "Arrastrado.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Carpeta de prueba/Subcarpeta/Arrastrado.pdf" });
    transfer.items.add(file);
    library.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole("dialog").getByLabel("Nombre de la carpeta")).toHaveValue("Carpeta de prueba");
  await expect(page.getByRole("dialog").getByText(/Carpeta de prueba \/ Subcarpeta\/Arrastrado.pdf/)).toBeVisible();
  assert.deepEqual(await calls(page), []);
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await chooseUpload(page, "Cargar carpeta");
  await expect(page.getByRole("dialog").getByText("Suelta aquí la carpeta de planos", { exact: true })).toBeVisible();
  await closeDialog(page, upload(page));
  checks.push("Arrastrar conserva initialEntries y rutas relativas; el menú Cargar carpeta vuelve a abrir sin archivos residuales");

  await page.goto(base);
  await expect(more(page)).toBeVisible();
  await page.evaluate(() => window.p14Fixture.setUnread("project", undefined));
  await expect(more(page)).toHaveAccessibleName(/Cargando menciones/);
  await page.evaluate(() => window.p14Fixture.setUnread("project", 0));
  await expect(more(page)).toHaveAccessibleName(/Sin menciones sin leer/);
  await page.evaluate(() => window.p14Fixture.setUnread("project", 15));
  await expect(more(page)).toContainText("9+");
  await expect(more(page)).toHaveAccessibleName(/15 menciones sin leer/);
  await more(page).click();
  await page.locator('a[href="/proyecto/other/planos"]').evaluate((link) => link.click());
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more(page)).toHaveAccessibleName(/7 menciones sin leer/);
  assert.deepEqual(await calls(page), []);
  await more(page).click();
  await page.getByRole("menuitem", { name: "Menciones de planos" }).click();
  await expect.poll(() => calls(page)).toEqual([{ name: "planos:markMentionNotificationsRead", args: { proyecto: "other" } }]);
  await page.keyboard.press("Escape");
  checks.push("Contador cargando/cero/9+ accesible y cambio de proyecto con menú abierto sin marcar otro alcance");

  await page.goto(base);
  await expect(more(page)).toBeVisible();
  await page.evaluate(() => { window.p14Fixture.holdRead = true; });
  await more(page).click();
  await page.getByRole("menuitem", { name: "Menciones de planos" }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await page.locator('a[href="/proyecto/other/planos"]').evaluate((link) => link.click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more(page)).toHaveAccessibleName(/7 menciones sin leer/);
  await page.evaluate(() => window.p14Fixture.releaseRead());
  await page.waitForTimeout(100);
  assert.equal((await calls(page)).length, 1, "Old project batches stop after scope unmount");
  checks.push("Cambio de proyecto cierra Sheet y detiene lotes pendientes del alcance anterior");

  await page.goto(base);
  await expect(more(page)).toBeVisible();
  await page.getByRole("button", { name: /Planta arquitectónica/ }).click();
  await expect(page.getByRole("button", { name: /^Menciones/, exact: false })).toHaveCount(2);
  await expect(upload(page)).toHaveCount(0);
  await page.getByRole("button", { name: /^Menciones\s*3$/ }).click();
  await expect(page.getByRole("dialog", { name: "Menciones en planos" })).toBeVisible();
  await expect.poll(async () => (await calls(page)).at(-1)).toEqual({ name: "planos:markMentionNotificationsRead", args: { proyecto: "project" } });
  await page.keyboard.press("Escape");
  checks.push("Visor conserva botón compacto de menciones y alcance por proyecto");
  assert.deepEqual(errors, []);
  await writeFile(`${output}/resultado.json`, JSON.stringify({ checks, pageErrors: errors, backend: "simulado; se rechazan todas las mutaciones salvo marcar menciones ficticias" }, null, 2));
  console.log(checks.join("\n"));
  await page.close();
} finally {
  await browser?.close();
  await server.close();
}
