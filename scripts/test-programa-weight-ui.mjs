import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll(
  "\\",
  "/",
);
const output = `${root}/output/programa-weight-impact`;
const server = await createServer({
  configFile: false,
  root,
  cacheDir: `${root}/node_modules/.vite-programa-weight`,
  optimizeDeps: { entries: ["e2e/programa/weight-preview.html"] },
  plugins: [react()],
  resolve: {
    alias: {
      "@": `${root}/src`,
      "convex/react": `${root}/e2e/programa/weight-convex-stub.ts`,
    },
  },
  server: { host: "127.0.0.1", port: 4188, strictPort: true, watch: null },
});
await mkdir(output, { recursive: true });
await server.listen();
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const newPage = async (width, query = "") => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `http://127.0.0.1:4188/e2e/programa/weight-preview.html${query}`,
    );
    await page
      .getByRole("button", { name: "Opciones de Estructura", exact: true })
      .filter({ visible: true })
      .waitFor();
    page.errors = errors;
    return page;
  };
  const open = async (page, name = "Estructura") => {
    if (name !== "Estructura") {
      const expand = page
        .getByRole("button", { name: "Expandir Estructura", exact: true })
        .filter({ visible: true });
      if (await expand.count()) await expand.click();
    }
    await page
      .getByRole("button", { name: `Opciones de ${name}`, exact: true })
      .filter({ visible: true })
      .click();
    await page.getByRole("menuitem", { name: /Ponderación/ }).click();
    await page.getByLabel("Nuevo peso (%)").waitFor();
    await page
      .getByText("Calculando el impacto del programa completo…")
      .waitFor({ state: "hidden" });
  };
  const read = (page) =>
    page.evaluate(() => ({
      attempts: window.weightTest.attempts,
      events: window.weightTest.events,
      version: window.weightTest.getVersion(),
      details: window.weightTest.details,
      schedules: window.weightTest.schedules,
    }));
  const capture = async (page, filename) => {
    await page.waitForTimeout(650);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      filename,
    );
    const dialog = page.getByRole("dialog");
    if (await dialog.count())
      assert.equal(
        await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
        `Sheet overflow: ${filename}`,
      );
    await page.screenshot({
      path: `${output}/${filename}.png`,
      fullPage: false,
    });
  };
  for (const width of [1440, 390, 320]) {
    console.log(`Checking weight editor at ${width}px`);
    const page = await newPage(width);
    await page
      .getByRole("textbox", { name: "Buscar partida o familia" })
      .fill("Estructura");
    await open(page);
    assert.equal(await page.locator('button[title="Editar peso"]').count(), 0);
    const input = page.getByLabel("Nuevo peso (%)"),
      save = page.getByRole("button", {
        name: "Guardar ponderación",
        exact: true,
      });
    assert.equal(await save.isEnabled(), false);
    for (const value of ["20abc", "Infinity", "-1", "101", ""]) {
      await input.fill(value);
      assert.equal(await save.isEnabled(), false);
    }
    await input.fill("40");
    await save.waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Guardar ponderación",
        )?.disabled,
    );
    assert.match(
      await page.getByRole("region", { name: "Impacto general" }).innerText(),
      /4\.00%.*6\.67%/s,
    );
    await input.press("Enter");
    assert.equal((await read(page)).attempts.length, 0);
    await capture(page, `partida-review-${width}`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await read(page)).events.length, 0);
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Opciones de Estructura",
    );
    await open(page);
    await page.getByLabel("Nuevo peso (%)").fill("40");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal((await read(page)).attempts.length, 0);
    await open(page);
    await page.getByLabel("Nuevo peso (%)").fill("40");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal((await read(page)).attempts.length, 0);
    await page
      .getByRole("textbox", { name: "Buscar partida o familia" })
      .fill("");
    await open(page, "Excavación");
    await page.getByLabel("Nuevo peso (%)").fill("40");
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Guardar ponderación",
        )?.disabled,
    );
    assert.match(
      await page
        .getByRole("region", { name: "Impacto en la partida" })
        .innerText(),
      /20\.00%.*33\.33%/s,
    );
    await capture(page, `familia-review-${width}`);
    await page.evaluate(() => window.weightTest.changeProgress());
    await page
      .getByText(
        "El programa cambió. Tu peso propuesto se conserva; revisa la comparación actualizada antes de guardar.",
      )
      .waitFor();
    assert.equal(await save.isEnabled(), false);
    assert.equal(await input.inputValue(), "40");
    await capture(page, `conflict-${width}`);
    await page
      .getByRole("button", {
        name: "Revisar cambios actualizados",
        exact: true,
      })
      .click();
    await page.evaluate(() => window.weightTest.setMode("error"));
    await save.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Error de conexión de prueba" })
      .waitFor();
    assert.equal(await input.inputValue(), "40");
    assert.equal((await read(page)).events.length, 0);
    await capture(page, `error-${width}`);
    await page
      .getByRole("button", {
        name: "Revisar cambios actualizados",
        exact: true,
      })
      .click();
    await page.evaluate(() => window.weightTest.setMode("pending"));
    await save.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Guardando…", exact: true })
      .waitFor();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(
      await page
        .getByRole("button", { name: "Cancelar", exact: true })
        .isEnabled(),
      false,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Close", exact: true })
        .isVisible(),
      false,
    );
    assert.equal((await read(page)).attempts.length, 2);
    await page.evaluate(() => window.weightTest.resolvePending());
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const state = await read(page);
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].id, "familyA");
    assert.equal(state.version, 2);
    assert.equal(state.details[0].avance_porcentaje, 100);
    await capture(page, `success-${width}`);
    assert.deepEqual(page.errors, []);
    results.push({
      width,
      events: state.events.length,
      keyboard: true,
      overflow: false,
    });
    await page.close();
  }
  for (const query of ["?missing=1", "?zero=1"]) {
    console.log(`Checking provisional transition ${query}`);
    const page = await newPage(390, query);
    await open(page, "Cimentación");
    await page.getByLabel("Nuevo peso (%)").fill("80");
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Guardar ponderación",
        )?.disabled,
    );
    assert.match(
      await page
        .getByRole("region", { name: "Impacto en la partida" })
        .innerText(),
      /Actual: Provisional/,
    );
    assert.match(
      await page
        .getByRole("region", { name: "Impacto en la partida" })
        .innerText(),
      /Propuesto: Ponderado/,
    );
    await capture(
      page,
      query.includes("missing")
        ? "missing-to-weighted-390"
        : "zero-to-weighted-390",
    );
    await page.getByRole("button", { name: "Guardar ponderación" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await read(page)).events.length, 1);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
  for (const query of ["?viewer=1", "?planner=1&legacy=1"]) {
    const page = await newPage(390, query);
    await page
      .getByRole("button", { name: "Opciones de Estructura", exact: true })
      .filter({ visible: true })
      .click();
    assert.equal(
      await page.getByRole("menuitem", { name: /Ponderación/ }).count(),
      0,
    );
    assert.equal((await read(page)).attempts.length, 0);
    await page.close();
  }
  for (const query of ["?planner=1", "?legacy=1"]) {
    const page = await newPage(390, query);
    await open(page);
    await page.getByLabel("Nuevo peso (%)").fill("40");
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Guardar ponderación",
        )?.disabled,
    );
    await page.getByRole("button", { name: "Guardar ponderación" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await read(page)).events[0].id, "scheduleA");
    await page.close();
  }
  const page = await newPage(390);
  await open(page, "Excavación");
  await page.getByLabel("Nuevo peso (%)").fill("40");
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Guardar ponderación",
      )?.disabled,
  );
  await page.evaluate(() => window.weightTest.setMode("conflict"));
  await page.getByRole("button", { name: "Guardar ponderación" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "El programa cambió después de la revisión." })
    .waitFor();
  assert.equal((await read(page)).events.length, 0);
  assert.equal(await page.getByLabel("Nuevo peso (%)").inputValue(), "40");
  await page
    .getByRole("button", { name: "Revisar cambios actualizados", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar ponderación" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await read(page)).events.length, 1);
  assert.deepEqual(page.errors, []);
  await page.close();
  const uncertain = await newPage(390);
  await open(uncertain, "Excavación");
  await uncertain.getByLabel("Nuevo peso (%)").fill("40");
  await uncertain.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Guardar ponderación",
      )?.disabled,
  );
  await uncertain.evaluate(() => window.weightTest.setMode("lost-response"));
  await uncertain.getByRole("button", { name: "Guardar ponderación" }).click();
  await uncertain
    .getByRole("alert")
    .filter({ hasText: "No se recibió la respuesta del servidor" })
    .waitFor();
  await uncertain
    .getByRole("button", { name: "Revisar cambios actualizados" })
    .click();
  await uncertain.getByText("Sin cambios por guardar.").waitFor();
  assert.equal(
    await uncertain
      .getByRole("button", { name: "Guardar ponderación" })
      .isEnabled(),
    false,
  );
  assert.equal((await read(uncertain)).events.length, 1);
  assert.equal((await read(uncertain)).attempts.length, 1);
  await capture(uncertain, "response-recovered-390");
  assert.deepEqual(uncertain.errors, []);
  await uncertain.close();
  await writeFile(
    `${output}/ui-results.json`,
    JSON.stringify(
      {
        passed: true,
        results,
        permissions: true,
        provisionalTransitions: true,
        serverConflict: true,
        lostResponse: true,
        filteredUniverse: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Programa weight UI: desktop, 390/320px, keyboard, cancellation, concurrency, retry, single save and provisional transitions passed.",
  );
} finally {
  if (browser) await browser.close();
  await server.close();
}
