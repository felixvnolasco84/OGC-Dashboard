import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/output/comments-impact`;
const server = await createServer({
  configFile: false,
  root,
  cacheDir: `${root}/node_modules/.vite-comments-test`,
  optimizeDeps: {
    entries: ["e2e/comments/preview.html"],
    include: ["radix-ui"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": `${root}/src`,
      "convex/react": `${root}/e2e/comments/convex-stub.ts`,
    },
  },
  server: { host: "127.0.0.1", port: 4192, strictPort: true },
});
await server.listen();
let browser;
const checks = [],
  screenshots = [];
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const fresh = async (width = 1440, role = "user") => {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:4192/e2e/comments/preview.html?role=${role}`,
    );
    await page
      .getByRole("heading", {
        name: "Comentarios de Bitácora y Programa",
        exact: true,
      })
      .waitFor();
    return { page, errors };
  };
  const fixture = (page, method, arg) =>
    page.evaluate(({ method, arg }) => window.commentFixture[method](arg), {
      method,
      arg,
    });
  const count = (page, kind = "calls") =>
    page.evaluate((kind) => window.commentFixture[kind].length, kind);
  const open = async (page, module) => {
    if (module === "photo") {
      await page.getByRole("button", { name: "Abrir fotografías" }).click();
      await page
        .getByRole("button", { name: "Comentarios", exact: true })
        .click();
    } else
      await page
        .getByRole("button", { name: "Comentarios de partida" })
        .click();
    await page.locator("[data-comment-panel]").waitFor();
  };
  const shot = async (page, name) => {
    await page.screenshot({
      path: `${output}/${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    screenshots.push(`${name}.png`);
  };
  const editor = async (page, module) => {
    const author = module === "photo" ? "Ana López" : "Luis Pérez";
    await page
      .getByRole("button", {
        name: `Editar comentario de ${author}`,
        exact: true,
      })
      .click();
    return page.getByRole("textbox", { name: "Texto propuesto", exact: true });
  };
  for (const width of [1440, 390, 320])
    for (const module of ["photo", "program"]) {
      const { page, errors } = await fresh(width);
      await open(page, module);
      const author = module === "photo" ? "Ana López" : "Luis Pérez";
      const deleteButton = page.getByRole("button", {
        name: `Eliminar comentario de ${author}`,
        exact: true,
      });
      await deleteButton.click();
      const confirm = page.getByRole("alertdialog", {
        name: "¿Eliminar este comentario?",
      });
      await confirm.waitFor();
      assert.equal(await count(page), 0, "Opening delete cannot mutate");
      assert.equal(
        await confirm
          .getByRole("button", { name: "Cancelar", exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
        "Cancel receives initial focus",
      );
      await shot(page, `${module}-delete-${width}`);
      await page.keyboard.press("Escape");
      await confirm.waitFor({ state: "hidden" });
      assert.equal(await count(page), 0, "Escape cannot mutate");
      assert.equal(
        await deleteButton.evaluate((el) => el === document.activeElement),
        true,
        "Cancel restores focus",
      );
      const text = await editor(page, module);
      assert.equal(
        await page
          .getByRole("button", { name: "Guardar comentario", exact: true })
          .isDisabled(),
        true,
      );
      await text.fill("Propuesta de inspección con el responsable de obra.");
      if (module === "program") {
        await page
          .getByLabel("Fecha inicio", { exact: true })
          .fill("2026-10-18");
        assert.equal(
          await page
            .getByRole("button", { name: "Guardar comentario", exact: true })
            .isDisabled(),
          true,
        );
        await page.getByLabel("Fecha fin", { exact: true }).fill("2026-10-20");
      }
      await shot(page, `${module}-edit-${width}`);
      await fixture(page, "setFailure", true);
      await page
        .getByRole("button", { name: "Guardar comentario", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "No se pudo guardar" })
        .waitFor();
      assert.equal(
        await text.inputValue(),
        "Propuesta de inspección con el responsable de obra.",
      );
      await shot(page, `${module}-error-${width}`);
      await fixture(page, "setFailure", false);
      await page
        .getByRole("button", { name: "Guardar comentario", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Comentario actualizado" })
        .waitFor();
      const calls = await page.evaluate(() => window.commentFixture.calls);
      assert.equal(
        calls[0].args.operationId || calls[0].args.operation_id,
        calls[1].args.operationId || calls[1].args.operation_id,
        "Retries reuse the same operation",
      );
      assert.equal(await count(page, "commits"), 1);
      await shot(page, `${module}-success-${width}`);
      await deleteButton.click();
      await page
        .getByRole("button", { name: "Eliminar comentario", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Comentario eliminado" })
        .waitFor();
      assert.equal(await count(page, "commits"), 2);
      if (module === "photo")
        assert.equal(
          await page
            .getByText("La inspección está prevista para mañana.", {
              exact: true,
            })
            .count(),
          1,
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `No page overflow: ${module} ${width}`,
      );
      assert.equal(
        await page
          .locator("[data-comment-panel]")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
        `No panel overflow: ${module} ${width}`,
      );
      assert.deepEqual(errors, []);
      checks.push(
        `${module} ${width}: review, cancel, focus, dates, retry, delete, layout`,
      );
      await page.close();
    }
  for (const module of ["photo", "program"]) {
    const { page, errors } = await fresh(390);
    await open(page, module);
    const text = await editor(page, module);
    await text.fill("Borrador conservado");
    const close =
      module === "photo"
        ? page.getByRole("button", { name: "Cerrar comentarios" })
        : page.getByRole("button", { name: "Close", exact: true });
    await close.click();
    await page
      .getByRole("alertdialog", { name: "¿Descartar el borrador?" })
      .waitFor();
    assert.equal(await count(page), 0);
    await shot(page, `${module}-discard-390`);
    await page
      .getByRole("button", { name: "Seguir editando", exact: true })
      .click();
    assert.equal(await text.inputValue(), "Borrador conservado");
    await text.press("ArrowRight");
    if (module === "photo")
      assert.equal(await page.getByText("1 / 2", { exact: true }).count(), 1);
    await fixture(page, "connection", false);
    await page
      .getByRole("status")
      .filter({ hasText: "Sin conexión al servidor. El borrador" })
      .waitFor();
    assert.equal(await text.inputValue(), "Borrador conservado");
    assert.equal(
      await page
        .getByRole("button", { name: "Guardar comentario", exact: true })
        .isDisabled(),
      true,
    );
    await shot(page, `${module}-offline-390`);
    await fixture(page, "connection", true);
    await fixture(page, "change", module);
    await page
      .getByRole("alert")
      .filter({ hasText: "cambió mientras" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Guardar comentario", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(await text.inputValue(), "Borrador conservado");
    await shot(page, `${module}-conflict-390`);
    await page
      .getByRole("button", { name: "Revisar con esta versión" })
      .click();
    await page
      .getByRole("button", { name: "Guardar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario actualizado" })
      .waitFor();
    const args = await page.evaluate(
      () => window.commentFixture.calls.at(-1).args,
    );
    assert.equal(args.expectedRevision || args.expected_revision, 2);
    await editor(page, module);
    await fixture(page, "remove", module);
    await page
      .getByRole("alert")
      .filter({ hasText: "El comentario ya fue eliminado." })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Guardar comentario", exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
    checks.push(
      `${module}: draft close, arrows, offline, conflict refresh, remote deletion`,
    );
    await page.close();
  }
  {
    const { page } = await fresh();
    await open(page, "photo");
    const text = page.getByRole("textbox", { name: "Comentario", exact: true });
    await text.fill("Nueva publicación");
    await fixture(page, "loseResponse");
    await page
      .getByRole("button", { name: "Publicar comentario", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "No se pudo completar" })
      .waitFor();
    assert.equal(await text.inputValue(), "Nueva publicación");
    await page
      .getByRole("button", { name: "Publicar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario publicado" })
      .waitFor();
    assert.equal(await count(page, "commits"), 1);
    assert.equal(
      await page.getByText("Nueva publicación", { exact: true }).count(),
      1,
    );
    await text.fill("Borrador de foto 1");
    await page.getByRole("button", { name: "Cerrar comentarios" }).click();
    await page
      .getByRole("button", { name: "Descartar borrador", exact: true })
      .click();
    await page.getByRole("button", { name: "Fotografía siguiente" }).click();
    await page
      .getByRole("button", { name: "Comentarios", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Comentario", exact: true })
      .fill("Publicación de foto 2");
    await page
      .getByRole("button", { name: "Publicar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario publicado" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => window.commentFixture.calls.at(-1).args.photoId,
      ),
      "photo2",
    );
    checks.push("photo: lost response deduplication and fixed destination");
    await page.close();
  }
  for (const role of ["viewer", "almacenista"]) {
    const { page } = await fresh(390, role);
    await open(page, "program");
    assert.equal(
      await page
        .getByRole("button", {
          name: /Editar comentario de|Eliminar comentario de|Agregar comentario/,
        })
        .count(),
      0,
    );
    assert.equal(await count(page), 0);
    checks.push(`program read-only ${role}`);
    await page.close();
  }
  {
    const { page } = await fresh(390, "viewer");
    await open(page, "photo");
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(
      await page
        .getByRole("button", {
          name: /Editar comentario de|Eliminar comentario de|Publicar comentario/,
        })
        .count(),
      0,
    );
    checks.push("photo viewer read-only");
    await page.close();
  }
  for (const module of ["photo", "program"]) {
    const { page } = await fresh();
    await open(page, module);
    const text = await editor(page, module);
    await text.fill("Operación en curso");
    await fixture(page, "hold");
    await page
      .getByRole("button", { name: "Guardar comentario", exact: true })
      .click();
    await page.getByRole("button", { name: "Guardando…" }).waitFor();
    const close =
      module === "photo"
        ? page.getByRole("button", { name: "Cerrar comentarios" })
        : page.getByRole("button", { name: "Close", exact: true });
    await close.click();
    assert.equal(await page.locator("[data-comment-panel]").count(), 1);
    assert.equal(await count(page), 1);
    assert.equal(await text.isDisabled(), true);
    await fixture(page, "release");
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario actualizado" })
      .waitFor();
    assert.equal(await count(page, "commits"), 1);
    checks.push(`${module}: pending operation guards`);
    await page.close();
  }
  for (const module of ["photo", "program"]) {
    const { page } = await fresh();
    await open(page, module);
    const author = module === "photo" ? "Ana López" : "Luis Pérez";
    const remove = page.getByRole("button", {
      name: `Eliminar comentario de ${author}`,
      exact: true,
    });
    await remove.click();
    await fixture(page, "change", module);
    assert.equal(
      await page
        .getByRole("button", { name: "Eliminar comentario", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(await count(page), 0);
    await remove.click();
    await fixture(page, "remove", module);
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    assert.equal(await count(page), 0);
    checks.push(`${module}: stale delete and deletion by another user`);
    await page.close();
  }
  for (const module of ["photo", "program"]) {
    const { page } = await fresh();
    await open(page, module);
    const text = await editor(page, module);
    await text.fill("Borrador recuperable");
    await fixture(page, "permission", "viewer");
    assert.equal(await text.inputValue(), "Borrador recuperable");
    assert.equal(
      await page
        .getByRole("button", { name: "Guardar comentario", exact: true })
        .isDisabled(),
      true,
    );
    await fixture(page, "unavailable");
    assert.equal(await text.inputValue(), "Borrador recuperable");
    assert.equal(await count(page), 0);
    checks.push(
      `${module}: revoked permission and unavailable destination preserve draft`,
    );
    await page.close();
  }
  {
    const { page } = await fresh();
    await open(page, "photo");
    const text = page.getByRole("textbox", { name: "Comentario", exact: true });
    await text.fill("Foto estable");
    await page
      .getByRole("button", { name: "Ver fotografía 2", exact: true })
      .click();
    await page
      .getByRole("alertdialog", { name: "¿Descartar el borrador?" })
      .waitFor();
    await page
      .getByRole("button", { name: "Seguir editando", exact: true })
      .click();
    assert.equal(await text.inputValue(), "Foto estable");
    assert.equal(await count(page), 0);
    await page.evaluate(() => window.reorderCommentPhotos());
    assert.equal(await text.inputValue(), "Foto estable");
    await page
      .getByRole("button", { name: "Publicar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario publicado" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => window.commentFixture.calls.at(-1).args.photoId,
      ),
      "photo1",
    );
    checks.push(
      "photo: navigation cancel and reorder preserve identity and draft",
    );
    await page.close();
  }
  {
    const { page } = await fresh();
    await page
      .getByRole("button", { name: "Comentarios de familia", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar comentario", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Comentario", exact: true })
      .fill("Aviso de familia");
    await page.getByLabel("Fecha inicio", { exact: true }).fill("2027-01-01");
    await page.getByLabel("Fecha fin", { exact: true }).fill("2027-01-02");
    await page
      .getByRole("status")
      .filter({ hasText: "puede ampliar la escala" })
      .waitFor();
    await fixture(page, "loseResponse");
    await page
      .getByRole("button", { name: "Publicar comentario", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "No se pudo completar" })
      .waitFor();
    assert.equal(
      await page.getByLabel("Fecha inicio", { exact: true }).inputValue(),
      "2027-01-01",
    );
    await page
      .getByRole("button", { name: "Publicar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario publicado" })
      .waitFor();
    assert.equal(await count(page, "commits"), 1);
    const args = await page.evaluate(
      () => window.commentFixture.calls.at(-1).args,
    );
    assert.equal(args.parent_type, "familia");
    assert.equal(args.parent_id, "family");
    checks.push(
      "program: family destination, outside-range notice and lost response retry",
    );
    await page.close();
  }
  {
    const { page } = await fresh();
    const marker = page.getByRole("button", {
      name: /^Comentario de Estructura:/,
    });
    await marker.focus();
    await page.keyboard.press("Enter");
    assert.equal(await marker.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Space");
    assert.equal(await marker.getAttribute("aria-expanded"), "false");
    await open(page, "program");
    const text = await editor(page, "program");
    await text.fill("Aviso actualizado en el Gantt");
    await page.getByLabel("Fecha fin", { exact: true }).fill("2026-10-20");
    await page
      .getByRole("button", { name: "Guardar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario actualizado" })
      .waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.match(
      await marker.getAttribute("aria-label"),
      /Aviso actualizado en el Gantt, 13\/10\/2026 a 20\/10\/2026/,
    );
    await open(page, "program");
    await page
      .getByRole("button", {
        name: "Eliminar comentario de Luis Pérez",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Eliminar comentario", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Comentario eliminado" })
      .waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await marker.count(), 0);
    checks.push(
      "program: keyboard Gantt marker, reactive text/date update and marker deletion",
    );
    await page.close();
  }
  await writeFile(
    `${output}/validation.json`,
    JSON.stringify({ checks, screenshots, isolated: true }, null, 2),
  );
  console.log(
    `Comments UI passed: ${checks.length} groups; ${screenshots.length} real UI captures.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
