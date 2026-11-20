import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
const output = `${root}/outputs/P08-implementacion-2026-11-18`;
const fixtures = `${root}/e2e/programa`;
const baselineFocus = process.argv.includes("--baseline-focus");
const server = await createServer({
  configFile: false, root, cacheDir: `${root}/node_modules/.vite-programa-toolbar`,
  optimizeDeps: { entries: ["e2e/programa/toolbar-preview.html"] },
  plugins: [{
    name: "toolbar-local-busy-states", enforce: "pre",
    resolveId(source, importer) {
      if (source === "./useProgramaObraExcelImport" && importer?.replaceAll("\\", "/").endsWith("/ProgramaObra.tsx")) return `${fixtures}/toolbar-import-hook.ts`;
    },
    load(id) {
      if (baselineFocus && id.replaceAll("\\", "/").endsWith("/ProgramaObra.tsx")) return execFileSync("git", ["show", "HEAD:src/pages/Programa Obra/ProgramaObra.tsx"], { cwd: root, encoding: "utf8" });
      if (id.replaceAll("\\", "/").endsWith("/ProgramaObraPdfExport.ts")) return `
        export async function exportProgramaObraPdf() {
          window.toolbarExportCount = (window.toolbarExportCount || 0) + 1;
          await new Promise(resolve => { window.resolveToolbarExport = resolve; });
        }
      `;
    },
  }, react()],
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${fixtures}/toolbar-convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 4198, strictPort: true },
});
await mkdir(output, { recursive: true });
await server.listen();
let browser;
const results = [], errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of baselineFocus ? [1440] : [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
    });
    const trigger = () => page.getByRole("button", { name: /^Archivo/ });
    const item = name => page.getByRole("menuitem", { name, exact: true });
    const open = async (query = "") => {
      await page.goto(`http://127.0.0.1:4198/e2e/programa/toolbar-preview.html?case=history&${query}`);
      await trigger().waitFor();
    };
    const overflow = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px horizontal overflow`);
      const menu = page.getByRole("menu");
      if (await menu.count()) {
        const box = await menu.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, "Menu stays inside viewport");
      }
    };
    const capture = async name => { await overflow(); await page.screenshot({ path: `${output}/fixture-${name}-${width}.png`, animations: "disabled" }); };
    const closeDialog = async (cancel = false) => {
      await expect(page.getByRole("dialog")).toBeVisible();
      if (cancel) await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(trigger()).toBeFocused();
    };
    const history = async () => {
      await item("Historial de cargas").click();
      await expect(page.getByRole("heading", { name: "Historial de cargas · Programa de obra" })).toBeVisible();
      await expect(page.getByRole("menu")).toHaveCount(0);
    };
    const noWrites = async () => assert.deepEqual(await page.evaluate(() => window.toolbarTest.writes), []);

    await open();
    if (baselineFocus) {
      const before = await page.getByTestId("sidebar-state").textContent();
      await page.getByRole("button", { name: "Vista", exact: true }).click();
      await page.getByRole("menuitem", { name: "Ampliar programa" }).click();
      await expect(page.getByRole("button", { name: "Salir de enfoque", exact: true })).toBeVisible();
      const during = await page.getByTestId("sidebar-state").textContent();
      await page.getByRole("button", { name: "Salir de enfoque", exact: true }).click();
      const after = await page.getByTestId("sidebar-state").textContent();
      await writeFile(`${output}/baseline-focus.json`, JSON.stringify({ source: "git HEAD ProgramaObra.tsx", before, during, after }, null, 2));
      console.log(`Baseline sidebar: ${before} -> ${during} -> ${after}`);
      await page.close(); continue;
    }
    assert.equal(await page.getByRole("button", { name: "Historial de cargas", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.toolbarTest.queries.filter(q => q.name.endsWith(":listHistory")).length), 0, "History remains lazy");
    await expect(page.getByRole("button", { name: "Actividades por frente", exact: true })).toBeVisible();
    await expect(page.getByLabel("Resumen del programa")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Buscar partida o familia" })).toBeVisible();
    assert.equal(await page.getByRole("button", { name: "Hoy", exact: true }).isVisible(), width >= 850);
    assert.equal(await page.getByRole("button", { name: "Vista", exact: true }).isVisible(), width >= 850);
    assert.equal(await trigger().evaluate(el => el.getBoundingClientRect().height), 48);
    await capture("cerrado");
    await trigger().focus(); await page.keyboard.press("ArrowDown");
    await expect(item("Cargar Excel")).toBeFocused();
    assert.deepEqual((await page.getByRole("menuitem").allTextContents()).map(text => text.trim()), ["Cargar Excel", "Historial de cargas", "Exportar PDF"]);
    await expect(page.getByRole("group", { name: "Importar", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Exportar", exact: true })).toBeVisible();
    await expect(item("Historial de cargas")).toHaveCSS("min-height", width < 850 ? "44px" : "32px");
    await capture("archivo");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await capture("historial"); await closeDialog();
    await trigger().click(); await history(); await closeDialog();
    await trigger().click(); await page.keyboard.press("Escape"); await expect(trigger()).toBeFocused();
    await trigger().click(); await item("Exportar PDF").click();
    await expect(page.getByRole("dialog", { name: "Exportar programa a PDF" })).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await capture("pdf"); await closeDialog(true);
    await trigger().click(); await item("Exportar PDF").click(); await closeDialog();
    await trigger().click();
    const fileChooser = page.waitForEvent("filechooser");
    await item("Cargar Excel").click(); await fileChooser;
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger()).toBeFocused(); await noWrites();

    if (width >= 850) {
      const sidebarBefore = await page.getByTestId("sidebar-state").textContent();
      await page.getByRole("button", { name: "Vista", exact: true }).click();
      await page.getByRole("menuitem", { name: "Ampliar programa" }).click();
      await expect(page.getByRole("button", { name: "Salir de enfoque", exact: true })).toBeVisible();
      const sidebarDuring = await page.getByTestId("sidebar-state").textContent();
      await trigger().click(); await history(); await closeDialog();
      await page.getByRole("button", { name: "Salir de enfoque", exact: true }).click();
      await expect(page.getByTestId("sidebar-state")).toHaveText(sidebarBefore);
      results.push({ width, focusSidebar: { before: sidebarBefore, during: sidebarDuring, after: sidebarBefore } });
    }

    await trigger().click(); await history();
    await page.evaluate(() => window.toolbarNavigate("/programa/other"));
    await expect(page.getByRole("heading", { name: "Otra obra ficticia", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await trigger().click(); await history();
    assert.ok(await page.evaluate(() => window.toolbarTest.queries.some(q => q.name.endsWith(":listHistory") && q.args.proyecto === "other")));
    await closeDialog();
    await trigger().click(); await page.evaluate(() => window.toolbarNavigate("/programa/project"));
    await expect(page.getByRole("menu")).toHaveCount(0); await noWrites();

    for (const [query, allowed] of [["", true], ["no-plan=1", false], ["legacy=1&no-plan=1", true], ["no-write=1", false], ["viewer=1", false]]) {
      for (const empty of [false, true]) {
        await open(`${query}&${empty ? "no-program=1" : ""}`);
        if (empty) await expect(page.getByRole("heading", { name: "Aún no hay un programa cargado" })).toBeVisible();
        await trigger().click();
        await expect(item("Cargar Excel"))[allowed ? "toBeEnabled" : "toBeDisabled"]();
        await expect(item("Exportar PDF"))[empty ? "toBeDisabled" : "toBeEnabled"]();
        if (empty && query === "") await capture("vacio");
        await history(); await closeDialog();
        if (empty) await expect(page.getByRole("button", { name: "Cargar Excel", exact: true }))[allowed ? "toBeEnabled" : "toBeDisabled"]();
        await noWrites();
      }
    }
    for (const busy of ["parsing", "uploading"]) {
      await open(`busy=${busy}`);
      await expect(page.getByRole("status")).toHaveText(busy === "parsing" ? "· Leyendo archivo..." : "· Cargando...");
      await expect(trigger()).toBeEnabled(); await trigger().click();
      await expect(item("Cargar Excel")).toBeDisabled(); await expect(item("Exportar PDF")).toBeDisabled();
      await capture(busy); await history(); await closeDialog(); await noWrites();
    }
    await open(); await trigger().click(); await item("Exportar PDF").click();
    await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("· Exportando...");
    await trigger().click();
    await expect(item("Cargar Excel")).toBeDisabled(); await expect(item("Exportar PDF")).toBeDisabled();
    await history(); await closeDialog();
    assert.equal(await page.evaluate(() => window.toolbarExportCount), 1);
    await page.evaluate(() => window.resolveToolbarExport());
    await expect(page.getByRole("button", { name: "Archivo", exact: true })).toBeVisible();
    await noWrites();
    results.push({ width, passed: true, cases: "keyboard/focus, dialogs, empty, capabilities, busy, project switch, focus mode, file chooser without file" });
    console.log(`P08 toolbar ${width}px OK`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  if (!baselineFocus) await writeFile(`${output}/ui-results.json`, JSON.stringify({ passed: true, data: "Ficticios; sin archivos seleccionados ni escrituras", results }, null, 2));
} finally { if (browser) await browser.close(); await server.close(); }
