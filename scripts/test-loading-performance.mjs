import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { chromium, expect } from "@playwright/test";
import { seedOfflineBitacora } from "../e2e/bitacora/seed-offline.ts";

// A deterministic local view isolates bundle/render costs from authentication,
// server load and changing production records. These are not production timings.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/loading-performance`;
await mkdir(output, { recursive: true });
const variants = [
  { name: "baseline", directory: `${root}/node_modules/.cache/performance-baseline`, port: 4201 },
  { name: "optimized", directory: `${root}/dist`, port: 4202 },
];
const servers = [];
let browser;
const results = {};
const fixtureNow = Date.now();
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const variant of variants) {
    servers.push(await preview({ configFile: false, root, build: { outDir: variant.directory },
      preview: { host: "127.0.0.1", port: variant.port, strictPort: true } }));
    const origin = `http://127.0.0.1:${variant.port}`;
    const samples = [];
    for (let run = 0; run < 5; run++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
      await context.route("**/*", route => route.request().url().startsWith(origin)
        ? route.continue() : route.abort());
      await context.routeWebSocket(/.*/, socket => socket.close());
      await context.addInitScript(now => {
        Date.now = () => now;
        Object.defineProperty(navigator, "onLine", { get: () => false });
        new MutationObserver(() => {
          if (!window.fixtureReadyAt && document.querySelector("h1")?.textContent?.includes("Larena - Acceso")) {
            window.fixtureReadyAt = performance.now();
          }
        }).observe(document, { childList: true, subtree: true });
      }, fixtureNow);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(`${origin}/__seed`, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html></html>" }));
      await page.goto(`${origin}/__seed`);
      await seedOfflineBitacora(page);
      for (const cache of ["cold", "warm"]) {
        await page.goto(`${origin}/proyecto/layout-project/bitacora`);
        await expect(page.getByRole("heading", { name: "Larena - Acceso" })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        samples.push(await page.evaluate(cache => ({
          cache,
          readyMs: window.fixtureReadyAt,
          javascriptBytes: performance.getEntriesByType("resource")
            .filter(entry => /\.m?js(?:\?|$)/.test(entry.name))
            .reduce((total, entry) => total + entry.decodedBodySize, 0),
        }), cache));
      }
      if (run === 0) {
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: `${output}/${variant.name}-${width}.png` });
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    results[variant.name] = samples;
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = Object.fromEntries(Object.entries(results).map(([variant, samples]) => [variant,
    Object.fromEntries(["cold", "warm"].map(cache => {
      const group = samples.filter(sample => sample.cache === cache);
      return [cache, { samples: group.length, medianReadyMs: median(group.map(s => s.readyMs)),
        medianJavascriptBytes: median(group.map(s => s.javascriptBytes)) }];
    })),
  ]));
  await writeFile(`${output}/results.json`, JSON.stringify({ environment: "Local Chrome, synthetic offline Bitacora, service workers blocked for bundle timing", summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  // Static check supplements the actual offline browser test: every static
  // dependency of the lazy offline app must be installed by the service worker.
  const manifest = JSON.parse(await readFile(`${root}/dist/.vite/manifest.json`, "utf8"));
  const sw = await readFile(`${root}/dist/sw.js`, "utf8");
  const closure = new Set();
  const visit = key => {
    if (closure.has(key)) return;
    closure.add(key);
    const chunk = manifest[key];
    assert.ok(chunk, `Missing manifest entry ${key}`);
    assert.ok(sw.includes(chunk.file), `Offline dependency missing from precache: ${chunk.file}`);
    (chunk.imports || []).forEach(visit);
  };
  visit("src/pages/Bitacora/OfflineBitacoraApp.tsx");
  for (const module of ["src/pages/Programa Obra/ProgramaObraPdfExport.ts", "src/pages/Planos/PlanCanvas.tsx"]) {
    const chunk = manifest[module] ?? Object.values(manifest).find(entry => entry.file.includes("/ProgramaObraPdfExport-"));
    assert.ok(chunk, `Missing optional module ${module}`);
    assert.ok(!sw.includes(chunk.file), `Optional module should not be precached: ${module}`);
  }
  console.log(`Verified offline code closure: ${closure.size} chunks. Screenshots and samples: ${output}`);
} finally {
  await browser?.close();
  for (const server of servers) await new Promise(resolve => server.httpServer.close(resolve));
}
