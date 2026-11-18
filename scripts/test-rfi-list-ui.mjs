import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
const output = `${root}/outputs/P12-implementacion-2026-11-18`;
const server = await createServer({ configFile: `${root}/e2e/rfi/vite.config.ts`, server: { port: 4216 } });
await mkdir(output, { recursive: true });
await server.listen();
let browser;
const results = [], errors = [];
const formName = "Creación rápida de RFI";
const form = page => page.getByRole("form", { name: formName });
const subject = page => page.getByRole("textbox", { name: "Asunto (obligatorio)", exact: true });
const question = page => page.getByRole("textbox", { name: "Pregunta (obligatoria)", exact: true });
const continueButton = page => page.getByRole("button", { name: /^Continuar: crear borrador/ });
const rows = page => page.getByRole("region", { name: "Tabla de RFIs" }).getByRole("button", { name: /RFI-\d/ });
const mine = page => page.getByRole("button", { name: /^Mi responsabilidad/ });
const requests = async page => JSON.parse(await page.getByTestId("rfi-requests").textContent());
async function state(page, label) {
  await page.getByRole("combobox", { name: "Estado", exact: true }).click();
  await page.getByRole("option", { name: new RegExp(`^${label} \\(`) }).click();
}
async function controls(page) { await page.locator("summary").click(); }
async function open(page, query = "") {
  await page.goto(`http://127.0.0.1:4216/e2e/rfi/list-preview.html?list&${query}`);
  if (!query.includes("listState=loading")) await expect(page.getByRole("heading", { name: /^RFIs / })).toBeVisible();
}
async function layout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No horizontal overflow");
  for (const control of [page.getByRole("combobox", { name: "Estado", exact: true }), mine(page)]) {
    const box = await control.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1);
  }
}
async function snapshot(page, name, fullPage = true) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: "disabled" });
}
async function fill(page) {
  await subject(page).fill("  Consulta de prueba P12  ");
  await subject(page).press("Enter");
  await expect(question(page)).toBeFocused();
  await question(page).fill("  ¿Se confirma la especificación?  ");
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await open(page);
    await expect(rows(page)).toHaveCount(6);
    await page.getByRole("combobox", { name: "Estado", exact: true }).press("Enter");
    await expect(page.getByRole("option", { name: /^Todas / })).toBeFocused();
    await page.getByRole("option", { name: /^Todas / }).press("ArrowDown");
    await expect(page.getByRole("option", { name: /^Abiertas / })).toBeFocused();
    await page.getByRole("option", { name: /^Abiertas / }).press("Enter");
    await expect(rows(page)).toHaveCount(4);
    await state(page, "Todas");
    await layout(page);
    await snapshot(page, `registro-${width}`, false);
    const totals = page.locator('[aria-label="Totales del registro"]');
    for (const text of ["Total 6", "Abiertas 4", "Vencidas 2", "Borradores 1", "Cerradas 1"]) await expect(totals).toContainText(text);
    await expect(mine(page)).toContainText("(4)");
    await mine(page).click();
    await expect(mine(page)).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(4);
    await state(page, "Abiertas");
    await expect(rows(page)).toHaveCount(2);
    await state(page, "Vencidas");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("RFI-032");
    await snapshot(page, `vencidas-mias-${width}`, false);
    for (const label of ["Borradores", "Cerradas"]) { await state(page, label); await expect(rows(page)).toHaveCount(1); }
    await state(page, "Todas");
    await expect(rows(page)).toHaveCount(4);
    await mine(page).click();
    await state(page, "Abiertas");
    await expect(rows(page)).toHaveCount(4);
    await expect(page.getByRole("button", { name: /RFI-028/ })).toBeVisible();
    await state(page, "Vencidas");
    await expect(rows(page)).toHaveCount(2);
    await state(page, "Todas");
    for (const term of [" RfI-027 ", "confirmar especificación", "encuentros con pretiles", "azotea norte", "losa nervada", "cubiertas", "impermeabilización", "CARLOS MENDOZA", "ANA LÓPEZ"]) {
      await page.getByRole("textbox", { name: "Buscar RFI", exact: true }).fill(term);
      await expect(page.getByRole("button", { name: /RFI-027/ })).toBeVisible();
      await expect(totals).toContainText("Total 6");
    }
    await page.getByRole("textbox", { name: "Buscar RFI", exact: true }).fill("sin coincidencias P12");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("No hay RFIs con los filtros actuales.")).toBeVisible();
    await expect(page.getByText("Resultados: 0", { exact: true })).toBeVisible();
    await snapshot(page, `sin-resultados-${width}`, false);
    await page.getByRole("textbox", { name: "Buscar RFI", exact: true }).fill("");
    await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
    await expect(subject(page)).toBeFocused();
    await expect(form(page)).toContainText("Al continuar se creará un borrador y se abrirá el editor");
    await continueButton(page).click();
    await expect(page.getByText("Agrega el asunto de la RFI", { exact: true })).toBeVisible();
    await expect(subject(page)).toBeFocused();
    await subject(page).fill("Sólo asunto");
    await subject(page).press("Enter");
    await expect(question(page)).toBeFocused();
    await question(page).press("Enter");
    await expect(page.getByText("Agrega la pregunta de la RFI", { exact: true })).toBeVisible();
    assert.deepEqual(await requests(page), []);
    await fill(page);
    await form(page).getByRole("group", { name: "Responsables", exact: true }).getByRole("button").click();
    await page.getByRole("button", { name: /Ana López · Instalaciones user/ }).click();
    await page.keyboard.press("Escape");
    await expect(form(page)).toBeVisible();
    await page.getByRole("button", { name: "Vencimiento", exact: true }).click();
    await page.getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(form(page)).toBeVisible();
    await layout(page);
    await continueButton(page).scrollIntoViewIfNeeded();
    const bounds = await continueButton(page).boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1);
    await form(page).screenshot({ path: `${output}/creacion-rapida-${width}.png`, animations: "disabled" });
    await snapshot(page, `creacion-rapida-contexto-${width}`, false);
    await page.getByRole("button", { name: "Cancelar nueva RFI", exact: true }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nueva RFI", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Agregar RFI", exact: true }).click();
    await expect(subject(page)).toHaveValue("");
    await expect(question(page)).toHaveValue("");
    await expect(form(page).getByRole("button", { name: "Vencimiento", exact: true })).toContainText("Sin fecha");
    await expect(form(page).getByRole("group", { name: "Responsables", exact: true })).toContainText("Sin asignar");
    await subject(page).press("Escape");
    await expect(form(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nueva RFI", exact: true })).toBeFocused();
    await page.getByRole("button", { name: /RFI-027/ }).click();
    await expect(page.getByRole("dialog", { name: "Detalle de RFI", exact: true })).toBeVisible();
    await page.getByRole("dialog").press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    results.push(`${width}: filtros, intersección, búsqueda, contadores, foco, validación, opciones, cancelación y detalle`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await open(page, "delay=1600");
  await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
  await fill(page);
  await form(page).getByRole("group", { name: "Responsables", exact: true }).getByRole("button").click();
  await page.getByRole("button", { name: /Ana López · Instalaciones user/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Vencimiento", exact: true }).click();
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await question(page).press("Enter");
  await expect(page.getByRole("button", { name: "Creando borrador...", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancelar nueva RFI", exact: true })).toBeDisabled();
  await expect(subject(page)).toBeDisabled();
  await form(page).press("Escape");
  await form(page).press("Enter");
  await expect(form(page)).toBeVisible();
  await snapshot(page, "creando-1440", false);
  await expect(page.getByRole("dialog", { name: "Editar RFI", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: /^Asunto/ })).toHaveValue("Consulta de prueba P12");
  const sent = await requests(page);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, "rfis:create");
  assert.deepEqual(sent[0].args, {
    proyecto: "project", subject: "Consulta de prueba P12", question: "¿Se confirma la especificación?", assignee_ids: ["assignee"],
    required_assignee_ids: [], distribution_user_ids: [], due_date: sent[0].args.due_date,
    cost_impact: "unknown", schedule_impact: "unknown", is_private: false, submit_for_review: false,
  });
  assert.match(sent[0].args.due_date, /^\d{4}-\d{2}-\d{2}$/);
  await snapshot(page, "editor-tras-continuar-1440", false);
  results.push("Creación: llamada única, datos recortados, responsables/fecha, submit_for_review=false y editor real");

  await open(page, "fail=action");
  await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
  await fill(page);
  await continueButton(page).click();
  await expect(page.getByText("No se pudo aplicar la acción. Error de prueba.", { exact: true })).toBeVisible();
  await expect(subject(page)).toHaveValue("  Consulta de prueba P12  ");
  await expect(continueButton(page)).toBeEnabled();
  await snapshot(page, "error-reintentable-1440", false);
  await controls(page);
  await page.getByRole("button", { name: "Desactivar error simulado", exact: true }).click();
  await continueButton(page).click();
  await expect(page.getByRole("dialog", { name: "Editar RFI", exact: true })).toBeVisible();
  assert.equal((await requests(page)).length, 2);
  results.push("Error de mutation conserva datos y permite reintentar");

  for (const role of ["finance", "viewer"]) {
    await open(page, `role=${role}`);
    await expect(page.getByRole("button", { name: "Nueva RFI", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agregar RFI", exact: true })).toHaveCount(0);
    await expect(rows(page)).toHaveCount(6);
    assert.deepEqual(await requests(page), []);
  }
  await open(page);
  await controls(page);
  await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
  await fill(page);
  await page.getByRole("button", { name: "Revocar creación", exact: true }).click();
  await expect(form(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Permitir creación", exact: true }).click();
  await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
  await expect(subject(page)).toHaveValue("");
  await expect(question(page)).toHaveValue("");
  await page.getByRole("button", { name: "Cancelar nueva RFI", exact: true }).click();
  await mine(page).click();
  await state(page, "Vencidas");
  await page.getByRole("textbox", { name: "Buscar RFI", exact: true }).fill("Revisión");
  await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
  await fill(page);
  await page.getByRole("button", { name: "Cambiar proyecto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "RFIs Otro proyecto", exact: true })).toBeVisible();
  await expect(form(page)).toHaveCount(0);
  await expect(mine(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toContainText("Todas (1)");
  await expect(page.getByRole("textbox", { name: "Buscar RFI", exact: true })).toHaveValue("");
  await expect(rows(page)).toHaveCount(1);
  results.push("Permisos finance/viewer, revocación/restitución y cambio de proyecto limpian estado");

  for (const change of ["Cambiar proyecto", "Revocar creación"]) {
    await open(page, "delay=1600");
    await controls(page);
    await page.getByRole("button", { name: "Nueva RFI", exact: true }).click();
    await fill(page);
    await continueButton(page).click();
    await page.getByRole("button", { name: change, exact: true }).click();
    await expect(form(page)).toHaveCount(0);
    await expect.poll(async () => (await requests(page)).length).toBe(1);
    // Wait past the mocked response to catch a late editor/success from the old context.
    await page.waitForTimeout(1800);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Borrador creado. Completa los detalles de la RFI.", { exact: true })).toHaveCount(0);
  }
  results.push("Mutation en curso: cambio de proyecto/permisos no abre un editor de contexto anterior");

  await open(page, "listState=empty");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Resultados: 0", { exact: true })).toBeVisible();
  await snapshot(page, "registro-vacio-1440", false);
  await open(page, "listState=loading");
  await expect(page.getByLabel("Cargando RFIs", { exact: true })).toBeVisible();
  await snapshot(page, "cargando-1440", false);
  await page.goto("http://127.0.0.1:4216/e2e/rfi/list-preview.html?list&listState=error");
  await expect(page.getByRole("heading", { name: "No se pudo abrir RFIs", exact: true })).toBeVisible();
  await expect(page.getByText("El proyecto no existe o no tienes acceso.", { exact: true })).toBeVisible();
  await snapshot(page, "sin-acceso-1440", false);
  await open(page);
  await controls(page);
  await page.getByRole("button", { name: "Sin proyecto", exact: true }).click();
  await expect(page.getByText("No se identificó el proyecto.", { exact: true })).toBeVisible();
  results.push("Estados vacío, sin resultados, carga, proyecto sin acceso y parámetro faltante");
  assert.deepEqual(errors, []);
  await writeFile(`${output}/verificacion-ui.json`, JSON.stringify({ passed: true, results, errors, creationRequest: sent[0] }, null, 2));
  console.log(`P12 UI: ${results.length} grupos de comprobaciones aprobados; sin errores de página. Evidencia: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
