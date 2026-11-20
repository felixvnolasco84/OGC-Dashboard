import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const phase = process.argv[2] || "after";
const output = `${root}/output/button-alignment/${phase}`;
await mkdir(output, { recursive: true });
const cases = [
  { id: "pnl", entry: "indirectos", query: "?reportScenario=tools", buttons: ["Cargar movimientos", "Herramientas de P&L"], field: "Filtrar Profit & Loss por ubicación" },
  { id: "providers", config: "provider-header", buttons: ["Nuevo proveedor", "Herramientas del catálogo de proveedores"] },
  { id: "documents", config: "document-header", buttons: ["Agregar"], field: null },
  { id: "tasks", config: "task-filters", buttons: ["Notificaciones", "Nueva tarea"] },
  { id: "rfi", config: "rfi", query: "?embedded=1", buttons: ["Nueva RFI"] },
  { id: "sales-budget", config: "sales-budget-header", buttons: ["Más acciones del presupuesto de ventas"] },
  { id: "rfi-detail", config: "rfi", query: "?state=draft", buttons: ["Enviar a revisión", "Más acciones de RFI-027"] },
  { id: "plans", config: "plan-library", buttons: ["Cargar planos", { match: "^Más acciones de la biblioteca de planos" }] },
  { id: "program", entry: "programa", html: "toolbar-preview.html", stub: "toolbar-convex-stub.ts", buttons: ["Actividades por frente", "Archivo"] },
  { id: "requisitions", entry: "requisiciones", html: "header-preview.html", stub: "header-convex-stub.ts", aliases: [
    { find: "@/components/modals/RequisicionModal", replacement: `${root}/e2e/requisiciones/requisicion-modal-stub.tsx` },
    { find: "@/components/providers/ProviderFormDialog", replacement: `${root}/e2e/requisiciones/shared-modal-stub.tsx` },
  ], buttons: ["Nueva requisición", "Acciones de requisiciones"] },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const measurements = [];
try {
  for (const [index, item] of cases.entries()) {
    if (process.argv[3] && !process.argv[3].split(",").includes(item.id)) continue;
    const entry = item.entry || item.config;
    const html = item.html || "preview.html";
    const server = await createServer({
      ...(item.config ? { configFile: `${root}/e2e/${item.config}/vite.config.ts` } : {
        configFile: false, root, plugins: [react()],
        resolve: { alias: [...(item.aliases || []), { find: "convex/react", replacement: `${root}/e2e/${entry}/${item.stub || "convex-stub.ts"}` }, { find: "@", replacement: `${root}/src` }] },
      }),
      ...(item.route ? { plugins: [{ name: "local-preview-route", configureServer(server) {
        server.middlewares.use((req, _res, next) => { if (req.url?.startsWith(item.route)) req.url = `/e2e/${entry}/${html}`; next(); });
      } }] } : {}),
      optimizeDeps: { entries: [`e2e/${entry}/${html}`] },
      server: { host: "127.0.0.1", port: 5290 + index, strictPort: true, hmr: false, watch: null },
      logLevel: "error",
    });
    await server.listen();
    try {
      for (const width of [320, 390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 1000 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
        await page.goto(`http://127.0.0.1:${5290 + index}${item.route || `/e2e/${entry}/${html}`}${item.query || ""}`);
        const button = name => page.getByRole("button", typeof name === "string" ? { name, exact: true } : { name: new RegExp(name.match) });
        await expect(button(item.buttons[0])).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const controls = [];
        for (const name of item.buttons) {
          const locator = button(name);
          await expect(locator).toBeVisible();
          controls.push(await locator.evaluate((element, name) => {
            const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
            return { name: element.getAttribute("aria-label") || element.textContent.trim(), size: element.getAttribute("data-button-size"), x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: css.fontSize, padding: css.paddingInline, gap: css.gap };
          }, name));
        }
        if (item.field) controls.push(await page.getByRole("combobox", { name: item.field }).evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { name: element.getAttribute("aria-label"), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        measurements.push({ id: item.id, width, controls, overflow, errors });
        if (phase.startsWith("after")) {
          for (const control of controls) assert.equal(control.height, 48, `${item.id}/${width}/${control.name}: height`);
          for (const control of controls) {
            if (control.size === "actionIcon") assert.equal(control.width, 48, `${item.id}/${width}: square tools button`);
            if (control.size === "action") assert(control.width >= 192, `${item.id}/${width}: shared action width`);
          }
          if (width === 1440 && controls.length > 1) assert(controls.every(control => Math.abs(control.y - controls[0].y) < 1), `${item.id}: toolbar alignment`);
          assert.equal(overflow, false, `${item.id}/${width}: document overflow`);
          assert.deepEqual(errors, [], `${item.id}/${width}: runtime errors`);
          for (const control of controls) assert(control.x >= 0 && control.x + control.width <= width + 1, `${item.id}/${width}: control outside viewport`);
        }
        if (width !== 320) await page.screenshot({ path: `${output}/${item.id}-${width}.png`, animations: "disabled" });
        console.log(`${phase}: ${item.id} ${width}px ${controls.map(c => `${c.name}=${c.width}x${c.height}`).join(", ")}`);
        await page.close();
      }
    } finally { await server.close(); }
  }
} finally {
  await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  await browser.close();
}
