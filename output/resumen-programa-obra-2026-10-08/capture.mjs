import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = fileURLToPath(new URL('./', import.meta.url));
const server = await createServer({ configFile: false, root, cacheDir: `${root}/node_modules/.vite-programa-summary`, optimizeDeps: { entries: ['e2e/programa/preview.html'] }, plugins: [react()], resolve: { alias: { '@': `${root}/src`, 'convex/react': `${root}/e2e/programa/convex-stub.ts` } }, server: { host: '127.0.0.1', port: 4196, strictPort: true } });
await fs.mkdir(directory, { recursive: true });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, width] of [['avance-escritorio', 1440], ['avance-movil', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 680 } });
    await page.goto('http://127.0.0.1:4196/e2e/programa/preview.html?progress=legacy');
    if (width >= 850) await page.getByRole('button', { name: 'Registrar avance de Colocación caliza' }).click();
    else await page.getByRole('button', { name: /Editar avance real de Colocación caliza/ }).click();
    await page.getByLabel('Inicio real', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Avance acumulado (%)', { exact: true }).fill('100');
    await page.getByLabel('Avance al día', { exact: true }).fill('2026-09-30');
    await page.getByLabel('Terminación real', { exact: true }).fill('2026-09-29');
    await page.getByRole('heading', { name: 'Registrar avance', exact: true }).click();
    await page.getByRole('dialog').screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Desbordamiento del formulario');
    await page.close();
  }
  console.log(JSON.stringify({ screenshots: ['avance-escritorio.png', 'avance-movil.png'], environment: 'Pruebas locales de la implementación' }));
} finally {
  if (browser) await browser.close();
  await server.close();
}
