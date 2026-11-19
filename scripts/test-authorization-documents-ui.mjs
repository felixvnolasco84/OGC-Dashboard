import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
const output = `${root}/outputs/P20-implementacion-2026-11-19`;
const server = await createServer({ configFile: `${root}/e2e/authorization-documents/vite.config.ts`, server: { port: 4321 } });
const results = [], errors = [];
let browser;
let activePage;
const mutations = page => page.evaluate(() => window.p20Fixture.mutations);
const docs = page => page.getByRole("button", { name: /^Documento:/ });
const menu = page => page.locator('[role="menu"][data-state="open"]');
async function shot(page, name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" }); }
async function open(page, tab, query = "") {
  await page.goto(`http://127.0.0.1:4321/e2e/authorization-documents/preview.html?tab=${tab}&${query}`);
  if (tab === "permisos") {
    for (const name of ["Licencia de construcción vigente", "Poliza de seguro de obra activa", "Trámites de conexión CFE y agua potable", "Plan de seguridad e higiene en obra"]) {
      await page.getByRole("heading", { name, exact: true }).click();
    }
  } else if (tab === "contratos") {
    await page.getByRole("heading", { name: "Contratos firmados con subcontratistas principales", exact: true }).click();
  } else {
    await page.getByText("Instalaciones de prueba", { exact: true }).click();
  }
  const details = page.getByRole("button", { name: "Ver detalle completo", exact: true }).filter({ visible: true });
  while (await details.count()) {
    await details.first().click();
  }
  await expect(page.getByText("Sin conexión al backend", { exact: false })).toBeVisible();
}
async function layout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "Sin desbordamiento horizontal");
  for (const trigger of await docs(page).all()) {
    const box = await trigger.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1, "Control documental dentro del viewport");
  }
}
async function choose(page, trigger, empty = false) {
  await trigger.click();
  const pending = page.waitForEvent("filechooser");
  await menu(page).getByRole("menuitem", { name: empty ? "Agregar documento" : "Reemplazar documento", exact: true }).click();
  const chooser = await pending;
  await expect(page.getByRole("menu")).toHaveCount(0);
  return chooser;
}

try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 } });
    activePage = page;
    page.setDefaultTimeout(8000);
    page.on("pageerror", error => errors.push(String(error)));
    for (const tab of ["permisos", "contratos", "imss"]) {
      await open(page, tab);
      await layout(page);
      const count = await docs(page).count();
      assert.equal(count, { permisos: 4, contratos: 2, imss: 7 }[tab], `Documentos esperados en ${tab}`);
      await shot(page, `${tab}-${width}`);
      for (let i = 0; i < count; i++) {
        const trigger = docs(page).nth(i);
        const name = await trigger.getAttribute("aria-label");
        await trigger.press("Enter");
        await expect(menu(page)).toBeVisible();
        await expect(menu(page).getByRole("menuitem", { name: "Reemplazar documento", exact: true })).toBeVisible();
        const hasHistory = tab !== "permisos" || !name.includes("Comprobante:");
        const canRemove = tab === "contratos" || (tab === "imss" && /Comprobante:|Soporte:/.test(name));
        await expect(menu(page).getByRole("menuitem", { name: "Ver historial", exact: true })).toHaveCount(hasHistory ? 1 : 0);
        await expect(menu(page).getByRole("menuitem", { name: "Eliminar documento", exact: true })).toHaveCount(canRemove ? 1 : 0);
        if (i === 0) await shot(page, `${tab}-menu-${width}`);
        await menu(page).press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(trigger).toBeFocused();
        assert.deepEqual(await mutations(page), [], "Abrir/cerrar menús no muta datos");
        if (hasHistory) {
          await trigger.click();
          await menu(page).getByRole("menuitem", { name: "Ver historial", exact: true }).click();
          await expect(page.getByRole("menu")).toHaveCount(0);
          const historyLink = page.getByRole("link", { name: /^anterior-/ }).last();
          await expect(historyLink).toBeVisible();
          if (i === 0) await shot(page, `${tab}-historial-${width}`);
          await trigger.click();
          await menu(page).getByRole("menuitem", { name: "Ocultar historial", exact: true }).click();
          await expect(page.getByRole("menu")).toHaveCount(0);
          await expect(historyLink).toHaveCount(0);
        }
      }
      // Native chooser opens from the menu selection. Empty selection cancels without a mutation.
      const first = docs(page).first();
      const cancelled = await choose(page, first);
      await cancelled.setFiles([]);
      await expect(menu(page)).toHaveCount(0);
      await expect(first).toBeFocused();
      assert.deepEqual(await mutations(page), []);
      results.push(`${width} ${tab}: menus, capacidades, historial, teclado/Escape/foco, cancelación, sin escrituras al abrir`);

      // Same mounted tabs for a reader; admin callbacks cannot be reached through the inputs or menu.
      await open(page, tab, "readonly");
      for (const trigger of await docs(page).all()) {
        await trigger.press("Enter");
        await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
        assert.deepEqual(await menu(page).getByRole("menuitem").allTextContents(), ["Ver historial"]);
        await menu(page).press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
      }
      for (const input of await page.locator('input[type="file"]').all()) await expect(input).toBeDisabled();
      await expect(page.getByRole("button", { name: /Asignar responsable|Cambiar responsable/ })).toHaveCount(0);
      assert.deepEqual(await mutations(page), []);
      await shot(page, `${tab}-lector-${width}`);

      await open(page, tab, "empty");
      for (const trigger of await docs(page).all()) {
        await trigger.press("Enter");
        await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
        assert.deepEqual(await menu(page).getByRole("menuitem").allTextContents(), ["Agregar documento"]);
        await menu(page).press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
      }
      const emptyChooser = await choose(page, docs(page).first(), true);
      await emptyChooser.setFiles([]);
      assert.deepEqual(await mutations(page), []);
      await shot(page, `${tab}-sin-archivo-${width}`);
      await open(page, tab, "nohistory");
      await docs(page).first().press("Enter");
      await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
      await expect(menu(page).getByRole("menuitem", { name: "Ver historial", exact: true })).toHaveCount(0);
      await menu(page).press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await open(page, tab, "readonly&empty");
      await expect(docs(page)).toHaveCount(0);
      assert.deepEqual(await mutations(page), []);
      results.push(`${width} ${tab}: lector, sin archivo, sin historial`);
    }
    await open(page, "permisos");
    const responsable = page.getByRole("button", { name: "Cambiar responsable: Ana de prueba", exact: true });
    await responsable.click();
    await menu(page).getByRole("menuitem", { name: /Luis de prueba/ }).click();
    assert.deepEqual(await mutations(page), [{ name: "autorizaciones_obra:updateResponsable", args: { id: "section-licencia", responsable_id: "other-p20" } }]);
    await expect(responsable).toBeFocused();
    results.push(`${width}: responsable conserva callback y sección destinataria`);

    // Exercise every real upload callback with a tiny fictitious file and local in-memory transport.
    for (const tab of ["permisos", "contratos", "imss"]) {
      await open(page, tab);
      const expected = {
        permisos: ["autorizaciones_obra:attachDocument", "autorizaciones_obra:attachDocument", "autorizaciones_obra:attachTramiteDocument", "autorizaciones_obra:attachDocument"],
        contratos: ["subcontratistas:attachPresupuesto", "subcontratistas:attachContrato"],
        imss: ["subcontratistas:attachContratistaGeneralContrato", "subcontratistas:attachContratistaGeneralSiroc", "imss_siroc:attachComprobante", "imss_siroc:attachSoporte", "subcontratistas:attachSubcontratistaSiroc", "imss_siroc:attachComprobante", "imss_siroc:attachSoporte"],
      }[tab];
      for (let i = 0; i < expected.length; i++) {
        console.log(`${width} ${tab}: archivo ${i + 1}/${expected.length}`);
        const trigger = docs(page).nth(i);
        const chooser = await choose(page, trigger);
        await chooser.setFiles({ name: `p20-${i}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("P20 archivo ficticio") });
        await expect(trigger).toHaveAttribute("aria-busy", "true");
        await trigger.press("Enter");
        if (!(tab === "permisos" && i === 2)) {
          await expect(menu(page).getByRole("menuitem", { name: "Ver historial", exact: true })).toBeFocused();
        }
        await expect(menu(page).getByRole("menuitem", { name: "Reemplazar documento", exact: true })).toBeDisabled();
        const deletion = menu(page).getByRole("menuitem", { name: "Eliminar documento", exact: true });
        if (await deletion.count()) await expect(deletion).toBeDisabled();
        if (i === 0) await shot(page, `${tab}-subiendo-${width}`);
        // Allow portal passive effects to register the Escape layer, including menus with no enabled items.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await menu(page).press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(trigger).toHaveAttribute("aria-busy", "false");
        const calls = await mutations(page);
        const attachment = calls.filter(call => call.name.includes(":attach")).at(-1);
        assert.equal(attachment.name, expected[i]);
        assert.equal(attachment.args.nombre, `p20-${i}.pdf`);
        if (tab === "permisos") {
          assert.equal(attachment.args.seccion || attachment.args.tramite_id, ["licencia", "poliza", "tramite-p20", "plan_seguridad"][i]);
        } else {
          assert.equal(attachment.args.id, tab === "contratos" ? "sub-p20" : ["cg-p20", "cg-p20", "pago-cg-p20", "pago-cg-p20", "sub-p20", "pago-sub-p20", "pago-sub-p20"][i]);
        }
      }
      results.push(`${width} ${tab}: reemplazos con picker real, carga bloqueada y destinatarios correctos (mock)`);
    }
    for (const [tab, pattern, operation, id] of [
      ["contratos", /^Documento: Presupuesto:/, "subcontratistas:removePresupuesto", "sub-p20"],
      ["contratos", /^Documento: Contrato:/, "subcontratistas:removeContrato", "sub-p20"],
      ["imss", /^Documento: Comprobante:/, "imss_siroc:removeComprobante", "pago-cg-p20"],
      ["imss", /^Documento: Soporte:/, "imss_siroc:removeSoporte", "pago-cg-p20"],
    ]) {
      await open(page, tab);
      await page.getByRole("button", { name: pattern }).first().click();
      await menu(page).getByRole("menuitem", { name: "Eliminar documento", exact: true }).click();
      assert.deepEqual(await mutations(page), [{ name: operation, args: { id } }]);
    }
    results.push(`${width}: quitar archivo usa sólo removePresupuesto/removeContrato/removeComprobante/removeSoporte, nunca delete de entidad`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.length, results, errors }, null, 2));
} catch (error) {
  errors.push(String(error));
  if (activePage && !activePage.isClosed()) {
    await shot(activePage, "fallo");
    await writeFile(`${output}/fallo.html`, await activePage.content());
  }
  throw error;
} finally {
  await writeFile(`${output}/resultados.json`, JSON.stringify({ results, errors }, null, 2));
  await browser?.close();
  await server.close();
}
