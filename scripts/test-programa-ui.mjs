import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

// Exercise real UI components with the isolated transport in e2e/programa.
// Backend business rules are exercised separately in programaObraExecution.test.mjs.
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-programa-test`, optimizeDeps: { entries: ["e2e/programa/preview.html"] }, plugins: [react()], resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/programa/convex-stub.ts` } }, server: { host: "127.0.0.1", port: 4186, strictPort: true } });
await server.listen();
let browser;
async function ganttGeometry(page) {
  return page.locator("[data-programa-item]").evaluateAll((bars) => Object.fromEntries(bars.map((bar) => {
    const rect = bar.getBoundingClientRect();
    const relative = (el) => {
      const span = el.getBoundingClientRect();
      return { left: span.left - rect.left, width: span.width, right: span.right - rect.left };
    };
    return [bar.dataset.programaItem, {
      left: rect.left - bar.parentElement.getBoundingClientRect().left, width: rect.width,
      delays: Array.from(bar.querySelectorAll("[data-delay-kind]")).map((el) => ({ kind: el.dataset.delayKind, ...relative(el) })),
      redLines: Array.from(bar.querySelectorAll("div")).filter((el) => el.classList.contains("bg-[#B17C7C]")).map(relative),
    }];
  })));
}
function assertPlannedDelay(bar) {
  const finish = bar.delays.find((span) => span.kind === "finish");
  assert.ok(finish, "Overdue and historically late work must remain red");
  assert.ok(Math.abs(finish.left) < 0.1);
  assert.ok(Math.abs(finish.width - bar.width) < 0.1, "Red delay must cover exactly the planned range");
  assert.ok(bar.redLines.length > 0);
  for (const line of bar.redLines) {
    assert.ok(line.left >= -0.1 && line.right <= bar.width + 0.1, "Actual red lines must not escape the programmed range");
  }
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(`${root}/output/programa-obra-execution`, { recursive: true });
  await mkdir(`${root}/test-results/programa-date-bounds`, { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4186/e2e/programa/preview.html");
    await page.getByRole("heading", { name: "Actividades por frente" }).waitFor();
    await page.getByRole("combobox", { name: "Frente", exact: true }).click();
    await page.getByRole("option", { name: "Piso 2", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /Piso 3/ }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `List overflow at ${width}px`);
    await page.screenshot({ path: `${root}/output/programa-obra-execution/list-${width}.png`, fullPage: true });
    const row = page.getByRole("button", { name: /Instalación de muebles · Piso 2/ });
    await row.focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.getByText("Para iniciar o avanzar: Falta terminar o aceptar Pruebas hidrosanitarias.").waitFor();
    await page.getByLabel("Inicio real", { exact: true }).fill(await page.getByLabel("Avance al día", { exact: true }).inputValue());
    await page.getByLabel("Avance acumulado (%)", { exact: true }).fill("25");
    await page.getByLabel("Motivo · obligatorio para corregir o solicitar excepción").fill("Frente segregado verificado en sitio");
    await page.getByRole("button", { name: "Solicitar excepción para este avance" }).click();
    const request = await page.evaluate(() => window.recordedMutations[0]);
    assert.match(request.name, /requestExecutionException$/); assert.equal(request.args.progress, 25); assert.equal(request.args.activity_id, "muebles2");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Detail overflow at ${width}px`);
    await page.screenshot({ path: `${root}/output/programa-obra-execution/detail-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-activity-id") === "muebles2");
    await page.getByRole("button", { name: "Ver Gantt", exact: true }).click();
    await page.getByRole("button", { name: /Pruebas hidrosanitarias: 2026/ }).click();
    await page.getByRole("button", { name: "Abrir detalle seleccionado" }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, "Selecting a Gantt relationship does not obscure it with a sheet");
    assert.deepEqual(errors, []); await page.close();
  }
  const reader = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await reader.goto("http://127.0.0.1:4186/e2e/programa/preview.html?viewer=1");
  await reader.getByRole("combobox", { name: "Frente", exact: true }).click();
  await reader.getByRole("option", { name: "Piso 2", exact: true }).click();
  await reader.getByRole("button", { name: /Instalación de muebles · Piso 2/ }).click();
  assert.equal(await reader.getByRole("heading", { name: "Registrar avance" }).count(), 0);
  await reader.getByRole("button", { name: "Ver pendiente", exact: true }).click();
  await reader.getByRole("heading", { name: "Pruebas hidrosanitarias · Piso 2" }).waitFor();
  const importer = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const importErrors = []; importer.on("pageerror", (error) => importErrors.push(error.message));
  await importer.goto("http://127.0.0.1:4186/e2e/programa/preview.html?import=1");
  const mapping = importer.getByRole("combobox", { name: "Coincidencia existente de Instalaciones / Pruebas nuevas" });
  await mapping.click();
  await importer.getByRole("option", { name: "Instalaciones · Pruebas", exact: true }).click();
  await importer.getByRole("button", { name: "Aplicar cambios revisados" }).click();
  assert.equal(await importer.evaluate(() => window.importedRows[0].detalle_id), "familyA");
  await mapping.focus(); await importer.keyboard.press("Enter");
  await importer.getByRole("option", { name: "Detectar por nombre", exact: true }).click();
  await importer.getByRole("button", { name: "Aplicar cambios revisados" }).click();
  assert.equal(await importer.evaluate(() => window.importedRows[0].detalle_id), undefined);
  assert.equal(await importer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(importErrors, []);
  for (const width of [1440, 390]) {
    for (const mode of ["legacy", "single", "multiple"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:4186/e2e/programa/preview.html?progress=${mode}`);
      await page.getByRole("heading", { name: "Programa de obra · prueba de captura" }).waitFor().catch(async (error) => { console.error({ mode, width, errors, body: await page.locator("body").innerText() }); throw error; });
      const open = () => width >= 850
        ? page.getByRole("button", { name: "Registrar avance de Colocación caliza" }).click()
        : page.getByRole("button", { name: /Editar avance real de Colocación caliza/ }).click();
      await open(); await page.getByRole("dialog").waitFor();
      if (mode === "multiple") {
        assert.equal(await page.getByLabel("Inicio real", { exact: true }).count(), 0, "Multiple fronts require an explicit selection");
        await page.getByRole("combobox", { name: "Frente de ejecución" }).click();
        await page.getByRole("option", { name: /Piso 3/ }).click();
        assert.equal(await page.getByLabel("Avance acumulado (%)", { exact: true }).inputValue(), "35");
        await page.getByLabel("Avance acumulado (%)", { exact: true }).fill("45");
        await page.getByLabel("Avance al día", { exact: true }).fill("2026-09-30");
        await page.getByLabel("Avance acumulado (%)", { exact: true }).press("Enter");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal((await page.evaluate(() => window.recordedMutations[0])).args.activity_id, "piso3");
      } else {
        await page.getByLabel("Inicio real", { exact: true }).fill("2099-01-01");
        await page.getByLabel("Avance acumulado (%)", { exact: true }).fill("100");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click();
        await page.getByRole("alert").getByText(/fecha futura/).waitFor();
        assert.equal(await page.evaluate(() => (window.recordedMutations ?? []).length), 0);
        await page.getByLabel("Inicio real", { exact: true }).fill("2026-09-01");
        await page.getByLabel("Avance al día", { exact: true }).fill("2026-09-30");
        assert.equal(await page.getByLabel("Terminación real", { exact: true }).inputValue(), "2026-09-30");
        await page.getByLabel("Terminación real", { exact: true }).fill("2026-09-29");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `${root}/output/programa-obra-execution/progress-${mode}-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const capture = await page.evaluate(() => window.recordedMutations[0]);
        assert.match(capture.name, mode === "legacy" ? /updateDetalleAvance$/ : /updateExecutionProgress$/);
        assert.equal(capture.args.actual_start, "2026-09-01"); assert.equal(capture.args.actual_finish, "2026-09-29"); assert.equal(capture.args.execution_date, "2026-09-30");
        assert.equal(await page.locator('[data-testid="progress-gantt"] [data-delay-kind]').count(), 0, "Late capture of on-time work must not appear red");
        await open();
        await page.getByLabel("Inicio real", { exact: true }).fill("2026-09-08");
        await page.getByLabel("Motivo · obligatorio para corregir o solicitar excepción").fill("Fecha verificada");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator('[data-delay-kind="start"]').count(), 0, "Seven-day start tolerance is preserved");
        await open();
        await page.getByLabel("Inicio real", { exact: true }).fill("2026-09-12");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click();
        await page.getByRole("alert").getByText(/motivo/).waitFor();
        await page.getByLabel("Motivo · obligatorio para corregir o solicitar excepción").fill("Inicio confirmado");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator('[data-delay-kind="start"]').count(), 1);
        await open();
        await page.getByLabel("Inicio real", { exact: true }).fill("2026-09-01");
        await page.getByLabel("Avance al día", { exact: true }).fill("2026-10-06");
        await page.getByLabel("Terminación real", { exact: true }).fill("2026-10-05");
        await page.getByLabel("Motivo · obligatorio para corregir o solicitar excepción").fill("Terminación confirmada");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator('[data-delay-kind="start"]').count(), 0);
        assert.equal(await page.locator('[data-delay-kind="finish"]').count(), 1);
        assertPlannedDelay((await ganttGeometry(page))["fam-familyA"]);
        await open();
        await page.getByLabel("Avance acumulado (%)", { exact: true }).fill("50");
        assert.equal(await page.getByLabel("Terminación real", { exact: true }).count(), 0);
        await page.getByLabel("Motivo · obligatorio para corregir o solicitar excepción").fill("Corrección de porcentaje");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator('[data-delay-kind="finish"]').count(), 1, "Incomplete overdue work remains delayed");
        assertPlannedDelay((await ganttGeometry(page))["fam-familyA"]);
      }
      assert.deepEqual(errors, []); await page.close();
    }
  }
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    const openBars = async (query = "") => {
      await page.goto(`http://127.0.0.1:4186/e2e/programa/preview.html?bars=1${query}`);
      await page.locator('[data-programa-item="editable"]').waitFor();
      return ganttGeometry(page);
    };
    const initial = await openBars();
    for (const level of [0, 1]) {
      for (const state of ["pending", "partial", "completed-late", "started-late"]) {
        assertPlannedDelay(initial[`${state}-${level}`]);
      }
      await page.locator(`[data-programa-item="partial-${level}"]`).getByText("50%", { exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.locator(`[data-programa-item="started-late-${level}"] button[aria-label^="Inicio real:"]`).count(), 0, "A real start beyond the planned end stays in the detail");
    }
    assert.equal(initial["one-day"].width, 4);
    assertPlannedDelay(initial["one-day"]);
    for (const id of ["manual-days", "manual-weeks", "manual-legacy", "manual-parent", "manual-months"]) {
      const bar = initial[id];
      const reference = initial[id === "manual-months" ? "reference-months" : "reference-days"];
      assert.equal(bar.delays.filter((span) => span.kind === "extension").length, 1);
      assert.ok(Math.abs(Math.max(...bar.redLines.map((line) => line.right)) - reference.width) < 0.1, `${id} must stop at its saved manual end`);
    }
    const labelsOverlap = await page.locator('[data-programa-item="partial-0"]').evaluate(bar => {
      const labels = Array.from(bar.querySelectorAll("span"));
      const real = labels.find(el => el.textContent.trim() === "50%").getBoundingClientRect();
      const financial = labels.find(el => el.textContent.trim() === "25%").getBoundingClientRect();
      return real.bottom > financial.top;
    });
    assert.equal(labelsOverlap, false, "Physical and financial percentages must remain legible");
    await page.screenshot({ path: `${root}/test-results/programa-date-bounds/bounded-bars-${width}.png`, fullPage: true });
    const later = await openBars("&day=2026-11-22");
    for (const id of Object.keys(initial).filter((id) => !id.startsWith("reference-"))) {
      assert.deepEqual(later[id], initial[id], `${id} must not grow as the clock advances`);
    }
    const extended = await openBars("&extra=1");
    assert.ok(Math.abs(extended.editable.delays.find((span) => span.kind === "extension").right - initial["reference-days"].width) < 0.1);
    const reprogrammed = await openBars("&reprogram=1");
    assert.ok(reprogrammed.editable.left > initial.editable.left, "Manual reprogramming moves the saved bar");
    assert.equal(reprogrammed.editable.delays.length, 0, "A new future finish clears the overdue appearance");
    const grace = await openBars("&day=2026-09-08");
    assert.equal(grace["pending-1"].delays.length, 0, "No late-start red during the seven-day reporting window");
    const afterGrace = await openBars("&day=2026-09-09");
    assert.equal(afterGrace["pending-1"].delays[0].kind, "start");
    assert.ok(afterGrace["pending-1"].delays[0].right < afterGrace["pending-1"].width);
    const dueToday = await openBars("&day=2026-09-30");
    assert.equal(dueToday["partial-1"].delays.length, 0, "The finish date remains inclusive");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Programa de Obra UI: escritorio, móvil, fechas reales, frentes, Gantt, teclado y lector OK");
} finally { if (browser) await browser.close(); await server.close(); }
