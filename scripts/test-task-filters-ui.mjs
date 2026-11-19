import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/outputs/P26-implementacion-2026-11-19`;
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: `${root}/e2e/task-filters/vite.config.ts`, server: { port: 5326, strictPort: true } });
await server.listen();
let browser;
const checks = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, timezoneId: "America/Mexico_City" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The fixture has no Convex client. Fail if a future change attempts network IO.
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || url.protocol === "data:") return route.continue();
      errors.push(`Unexpected external request: ${url.origin}`);
      return route.abort();
    });
    const go = async (path = "/tareas") => {
      await page.goto(`http://127.0.0.1:5326${path}`);
      await expect(page.getByRole("heading", { name: "Tareas", exact: true })).toBeVisible();
    };
    const results = (count) => expect(page.getByRole("status")).toHaveText(`${count} ${count === 1 ? "resultado" : "resultados"}`);
    const select = async (label, option) => {
      await page.getByRole("combobox", { name: label, exact: true }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    };
    const overdue = () => page.getByRole("button", { name: /^Vencidas ·/ });
    const chip = (label) => page.getByRole("button", { name: `Quitar filtro ${label}`, exact: true });
    const advanced = () => page.getByRole("button", { name: /^Más filtros/ });
    const closeAdvanced = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Aplicar", exact: true }).click();
      await expect(advanced()).toBeFocused();
    };
    const clear = () => page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    const noMutations = async () => assert.deepEqual(await page.evaluate(() => window.taskFiltersFixture.calls), []);
    const noOverflow = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      const bounds = await page.getByRole("region", { name: "Filtros de tareas" }).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    };
    await go();
    await results(11);
    await expect(page.getByLabel("Resumen del alcance")).toHaveText("Total 11 · Abiertas 9 · Completas 1");
    await expect(overdue()).toHaveText("Vencidas · 5");
    await expect(overdue()).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Nueva tarea", exact: true })).toBeVisible();
    await noOverflow();
    await page.screenshot({ path: `${output}/root-${width}.png` });

    // Aggregate open includes custom/blocked statuses; cancelled and completed are excluded.
    await select("Estado", "Abiertas");
    await results(9);
    await expect(page.locator('input[value="Visita cancelada"]')).toHaveCount(0);
    await expect(page.locator('input[value="Entrega terminada"]')).toHaveCount(0);
    await expect(page.locator('input[value="Revisión de estructura"]')).toBeVisible();
    await overdue().click();
    await results(5);
    await select("Estado", "En revisión técnica");
    await results(2);
    await expect(overdue()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Resumen del alcance")).toHaveText("Total 11 · Abiertas 9 · Completas 1");
    await select("Responsable", "Ana Prueba");
    await results(1);
    await noOverflow();
    await page.screenshot({ path: `${output}/status-overdue-assignee-${width}.png` });
    await chip("Estado: En revisión técnica").click();
    await results(3);
    await expect(overdue()).toHaveAttribute("aria-pressed", "true");
    await chip("Responsable: Ana Prueba").click();
    await results(5);
    await chip("Vencidas").click();
    await results(11);
    await select("Estado", "Completas");
    await results(1);
    await overdue().click();
    await results(0);
    await expect(page.getByText("No hay tareas con los filtros actuales.", { exact: true })).toBeVisible();
    await chip("Vencidas").click();
    await select("Estado", "Cancelada");
    await results(1);
    await overdue().click();
    await results(0);
    await clear();
    checks.push(`${width}: aggregate/custom/completed/cancelled states, overdue intersections, assignee, individual chips`);

    await page.getByRole("textbox", { name: "Buscar tareas", exact: true }).fill("cimentación");
    await results(1);
    await expect(page.getByLabel("Resumen del alcance")).toContainText("Total 11");
    await chip("Búsqueda: cimentación").click();
    await results(11);
    // All fields apply immediately and intersect, without a mutation or URL write.
    await advanced().click();
    await select("Vista", "Mis tareas");
    await closeAdvanced();
    await results(6);
    await advanced().click();
    await select("Vista", "Creadas por mí");
    await closeAdvanced();
    await results(4);
    await advanced().click();
    await select("Prioridad", "Alta");
    await select("Especialidad", "Obra");
    await select("Partida", "Estructura");
    await select("Proyecto", "Obra de prueba");
    await page.screenshot({ path: `${output}/advanced-${width}.png` });
    await closeAdvanced();
    await results(2);
    await expect(advanced()).toContainText("5");
    await chip("Prioridad: Alta").click();
    await expect(advanced()).toContainText("4");
    await results(2);
    await chip("Especialidad: Obra").click();
    await results(2);
    await chip("Partida: Estructura").click();
    await results(3);
    await chip("Creadas por mí").click();
    await results(7);
    await chip("Proyecto: Obra de prueba").click();
    await results(11);
    checks.push(`${width}: search, ownership distinction, all advanced intersections and chips, focus restored`);

    await advanced().click();
    await select("Proyecto", "General");
    await closeAdvanced();
    await results(3);
    await expect(page.getByLabel("Resumen del alcance")).toHaveText("Total 3 · Abiertas 3 · Completas 0");
    await expect(overdue()).toHaveText("Vencidas · 1");
    await page.screenshot({ path: `${output}/general-${width}.png` });
    await chip("Proyecto: General").click();
    await results(11);

    // Project wrapper keeps its URL and context; the minute parent affects the summary only.
    await go("/proyecto/obra/tareas");
    await expect(page).toHaveURL(/\/tareas\?proyecto=obra$/);
    await results(7);
    await expect(page.getByLabel("Resumen del alcance")).toHaveText("Total 8 · Abiertas 6 · Completas 1");
    await expect(overdue()).toHaveText("Vencidas · 4");
    await expect(chip("Proyecto: Obra de prueba")).toHaveCount(0);
    await advanced().click();
    await expect(page.getByRole("combobox", { name: "Proyecto", exact: true })).toBeDisabled();
    await select("Prioridad", "Baja");
    await page.getByRole("dialog").getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Proyecto", exact: true })).toHaveText("Obra de prueba");
    await closeAdvanced();
    await select("Estado", "En revisión técnica");
    await overdue().click();
    await page.getByRole("textbox", { name: "Buscar tareas", exact: true }).fill("estructura");
    await results(1);
    await clear();
    await results(7);
    await expect(page).toHaveURL(/\/tareas\?proyecto=obra$/);
    await page.screenshot({ path: `${output}/project-${width}.png` });
    await noMutations();
    await go("/board-scoped");
    await results(7);
    await go("/tareas?proyecto=__general__");
    await results(3);
    await advanced().click();
    await expect(page.getByRole("combobox", { name: "Proyecto", exact: true })).toBeDisabled();
    await closeAdvanced();
    checks.push(`${width}: root/general/project and wrapper/prop scopes, summary includes minute parent, cleanup retains URL`);

    // Escape closes popups; keyboard can choose state without moving into task editors.
    await go();
    await page.getByRole("combobox", { name: "Estado", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Todos los estados", exact: true })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(page.getByRole("option", { name: "Todos los estados", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "Abiertas", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await results(9);
    await clear();
    await noMutations();
    await go("/tareas?role=viewer");
    await expect(page.getByRole("button", { name: "Nueva tarea", exact: true })).toHaveCount(0);
    await select("Estado", "Abiertas");
    await results(9);
    await overdue().click();
    await results(5);
    await noMutations();
    await go("/tareas?state=empty");
    await results(0);
    await noOverflow();
    await page.screenshot({ path: `${output}/empty-${width}.png` });
    await page.goto("http://127.0.0.1:5326/tareas?state=loading");
    await expect(page.locator("svg.animate-spin")).toBeVisible();
    await expect(page.getByRole("region", { name: "Filtros de tareas" })).toHaveCount(0);
    await page.screenshot({ path: `${output}/loading-${width}.png` });
    assert.deepEqual(errors, []);
    checks.push(`${width}: keyboard, viewer permissions, empty/loading, no overflow, no JS errors or mutations`);
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  await page.goto("http://127.0.0.1:5326/tareas");
  await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: `${output}/tablet-1024.png` });
  checks.push("1024: rendered compact toolbar, no horizontal overflow");
  await writeFile(`${output}/checks.json`, JSON.stringify({ passed: true, implementation: "src/pages/Tareas/TareasPage.tsx", fixture: "e2e/task-filters", checks }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
