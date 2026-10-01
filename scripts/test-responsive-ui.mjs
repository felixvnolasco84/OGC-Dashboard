import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

// Isolated components and synthetic records: no Clerk session or Convex mutations.
const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = `${root}/output/responsive-test-build`;
await build({ configFile: false, root, plugins: [react()], resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/responsive/convex-stub.ts` } }, build: { outDir, emptyOutDir: true, rollupOptions: { input: `${root}/e2e/responsive/preview.html` } }, logLevel: "error" });
const server = await preview({ configFile: false, root, build: { outDir }, preview: { host: "127.0.0.1", port: 4188, strictPort: true } });
let browser;
const assertFits = async (page) => {
  const result = await page.evaluate(() => ({ document: document.documentElement.scrollWidth <= innerWidth + 1, main: [...document.querySelectorAll('main')].every((element) => element.scrollWidth <= element.clientWidth + 1) }));
  assert.deepEqual(result, { document: true, main: true });
};
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  await mkdir(`${root}/output/responsive-ui`, { recursive: true });
  const sizes = [320, 390, 639, 640, 767, 768, 849, 850, 1023, 1024, 1279, 1280, 1440];
  for (const width of sizes) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 900 } });
    const errors=[]; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4188/e2e/responsive/preview.html");
    await page.getByRole("heading", { name: "Operación de obra — datos de prueba" }).waitFor();
    await assertFits(page);
    assert.equal(await page.locator("#obra-1").getAttribute("role"), "button", "Row ID and interactive role are preserved");
    if (width < 1024) {
      await page.getByRole("button", { name: "Ver detalle completo", exact: true }).first().press("Enter");
      assert.equal(await page.getByTestId("row-opens").textContent(), "0", "Detail keyboard action does not activate the row");
      await page.getByText("Detalle financiero completo en EUR, USD y MXN", { exact: true }).waitFor();
      await page.getByRole("checkbox", { name: "Seleccionar visibles", exact: true }).check();
      assert.equal(await page.getByTestId("selection").textContent(), "2");
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.equal(await page.getByTestId("selection").textContent(), "2");
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
      await page.getByRole("link", { name: "Operación", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await page.getByRole("textbox", { name: "Buscar registros", exact: true }).fill("internacional");
    assert.equal(await page.getByRole("checkbox", { name: "Seleccionar obra-1", exact: true }).count(),0);
    await page.getByRole("textbox", { name: "Buscar registros", exact: true }).fill("sin coincidencia");
    await page.getByText("No hay registros", { exact: true }).waitFor();
    await assertFits(page);
    await page.getByRole("button", { name: "Crear proyecto de prueba", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await expect.poll(() => page.getByRole("dialog").evaluate((element) => { const r=element.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })).toBe(true);
    const bounds=await page.getByRole("dialog").evaluate((element) => { const r=element.getBoundingClientRect(); return { left:r.left, right:r.right, width:innerWidth, overflow:element.scrollWidth>element.clientWidth+1 }; });
    assert(bounds.left>=-1 && bounds.right<=bounds.width+1 && !bounds.overflow, `Sheet at ${width}px: ${JSON.stringify(bounds)}`);
    await page.getByRole("textbox", { name: "Campo 12", exact: true }).fill("Datos de prueba");
    if (width === 320) {
      await page.setViewportSize({width:320,height:320});
      await page.getByRole("textbox", { name:"Campo 12",exact:true }).fill("Formulario en viewport reducido");
      assert(await page.getByRole("dialog").evaluate((element)=>element.getBoundingClientRect().bottom<=innerHeight+1));
    }
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    if (width === 320) await page.setViewportSize({width:320,height:568});
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    if(width<1280) {
      await page.getByRole("button", { name:"Anotaciones y comentarios", exact:true }).click();
      await page.getByRole("textbox", { name:"Comentario", exact:true }).fill("Comentario local");
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name:"Abrir diálogo de prueba", exact:true }).click();
    await page.getByRole("dialog").waitFor();
    const dialogWidth=await page.getByRole("dialog").evaluate((element)=>element.getBoundingClientRect().width);
    assert(dialogWidth<=width-30 && dialogWidth<=512+1, `Dialog keeps desktop max width and mobile margins: viewport=${width}, dialog=${dialogWidth}`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name:"Abrir diálogo amplio", exact:true }).click();
    await page.getByRole("dialog").waitFor();
    const wideBounds = await page.getByRole("dialog").evaluate((element) => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right }; });
    assert(wideBounds.left >= 15 && wideBounds.right <= width - 15, `Wide dialog margins at ${width}px`);
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Buscar registros", exact: true }).fill("");
    await assertFits(page);
    await page.screenshot({ path:`${root}/output/responsive-ui/${width}.png`, fullPage:true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  const reader=await browser.newPage({ viewport:{width:390,height:844} });
  await reader.goto("http://127.0.0.1:4188/e2e/responsive/preview.html?viewer=1");
  await reader.getByRole("button",{name:"Ver detalle completo",exact:true}).first().click();
  await reader.getByText("Detalle financiero completo en EUR, USD y MXN",{exact:true}).waitFor();
  await assertFits(reader);
  const plan=await browser.newPage({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  await plan.goto("http://127.0.0.1:4188/e2e/responsive/preview.html?plan=1");
  await plan.getByRole("img",{name:"Plano arquitectónico"}).waitFor();
  await expect.poll(() => plan.getByRole("img",{name:"Plano arquitectónico"}).evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  const overlay=plan.locator('svg[aria-label="Capa de anotaciones"]');
  assert.match(await overlay.evaluate((element)=>getComputedStyle(element).touchAction), /pan/, "Selection allows touch panning");
  await plan.getByRole("button",{name:"Alternar zoom",exact:true}).tap();
  await assertFits(plan);
  assert(await plan.getByTestId("plan-viewport").evaluate((element)=>element.scrollWidth>element.clientWidth), "Zoom scroll is local to the viewer");
  await plan.getByRole("button",{name:"Alternar zoom",exact:true}).tap();
  await plan.getByRole("button",{name:"Dibujar nube",exact:true}).tap();
  assert.equal(await overlay.evaluate((element)=>getComputedStyle(element).touchAction), "none");
  const canvasBounds=await overlay.boundingBox();
  await plan.mouse.move(canvasBounds.x+30,canvasBounds.y+30);
  await plan.mouse.down();
  await plan.mouse.move(canvasBounds.x+100,canvasBounds.y+100, { steps: 8 });
  await plan.mouse.up();
  await expect.poll(()=>plan.getByTestId("plan-draft").textContent()).toContain('"tipo":"cloud"');
  await plan.getByRole("button",{name:"Anotaciones y comentarios",exact:true}).tap();
  await plan.getByRole("textbox",{name:"Comentario",exact:true}).fill("Comentario local de prueba");
  await expect.poll(() => plan.getByRole("dialog").evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight + 1)).toBe(true);
  await plan.screenshot({path:`${root}/output/responsive-ui/plano-390.png`});
  await plan.keyboard.press("Escape");
  await plan.setViewportSize({width:320,height:568});
  await assertFits(plan);
  const partida=await browser.newPage({ viewport:{width:320,height:568} });
  await partida.goto("http://127.0.0.1:4188/e2e/responsive/preview.html?partida=1");
  await partida.getByRole("heading",{name:"Instalaciones",exact:true}).waitFor();
  await assertFits(partida);
  assert.deepEqual(await partida.evaluate(()=>window.responsiveDocumentRequests),["tx-1"], "Document query deduplicates the payment transaction IDs");
  assert.equal(await partida.getByText("Documento bancario de prueba con nombre largo.pdf",{exact:true}).count(),2);
  await partida.screenshot({path:`${root}/output/responsive-ui/partida-320.png`,fullPage:true});
  await partida.goto("http://127.0.0.1:4188/e2e/responsive/preview.html?partida=1&document-error=1");
  await partida.getByRole("alert").waitFor();
  await partida.getByText("Pago #001",{exact:true}).waitFor();
  await assertFits(partida);
  const sales=await browser.newPage({ viewport:{width:390,height:844} });
  await sales.goto("http://127.0.0.1:4188/e2e/responsive/preview.html?sales-ledger=1");
  await sales.getByRole("heading",{name:"Transacciones",exact:true}).waitFor();
  assert.equal(await sales.locator(".responsive-record").count(),50);
  await sales.getByRole("button",{name:"Siguiente",exact:true}).click();
  assert.equal(await sales.locator(".responsive-record").count(),38);
  await sales.setViewportSize({width:1440,height:900});
  await sales.getByText("Página 2 de 2",{exact:true}).waitFor();
  await sales.setViewportSize({width:320,height:568});
  await assertFits(sales);
  await sales.getByPlaceholder("Buscar...",{exact:true}).fill("FACTURA-1");
  await sales.getByText("Página 1 de 1",{exact:true}).waitFor();
  await assertFits(sales);
  console.log(`Responsive UI: ${sizes.length} tamaños, selección, filtros, detalles, formularios, navegación, lectura y visor local OK`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
