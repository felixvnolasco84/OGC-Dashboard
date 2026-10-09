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
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(`${root}/output/programa-obra-execution`, { recursive: true });
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
        await open();
        await page.getByLabel("Avance acumulado (%)", { exact: true }).fill("50");
        assert.equal(await page.getByLabel("Terminación real", { exact: true }).count(), 0);
        await page.getByLabel("Motivo · obligatorio para corregir o solicitar excepción").fill("Corrección de porcentaje");
        await page.getByRole("button", { name: "Guardar avance", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator('[data-delay-kind="finish"]').count(), 1, "Incomplete overdue work remains delayed");
      }
      assert.deepEqual(errors, []); await page.close();
    }
  }
  console.log("Programa de Obra UI: escritorio, móvil, fechas reales, frentes, Gantt, teclado y lector OK");
} finally { if (browser) await browser.close(); await server.close(); }
