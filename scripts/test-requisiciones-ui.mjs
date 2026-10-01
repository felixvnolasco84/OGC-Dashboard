import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const fixture = `${root}/e2e/requisiciones`;
const output = `${root}/test-results/requisiciones-responsive`;
const server = await createServer({
    configFile: false, root, cacheDir: `${root}/node_modules/.vite-requisiciones-test`,
    optimizeDeps: { entries: ["e2e/requisiciones/preview.html"] }, plugins: [react()],
    resolve: { alias: [
        { find: "@/components/modals/RequisicionModal", replacement: `${fixture}/requisicion-modal-stub.tsx` },
        { find: "@/components/modals/RequisicionHistoryModal", replacement: `${fixture}/history-modal-stub.tsx` },
        { find: "@/components/providers/ProviderFormDialog", replacement: `${fixture}/shared-modal-stub.tsx` },
        { find: "convex/react", replacement: `${fixture}/convex-stub.ts` },
        { find: "@", replacement: `${root}/src` },
    ] },
    server: { host: "127.0.0.1", port: 4192, strictPort: true },
});
await server.listen();
let browser;
const errors = [];
const material = "Instalaciones hidrosanitarias y materiales para acondicionamiento del edificio";
const card = (page, id = "pending") => page.locator(`[data-requisicion-id='${id}']`);
const visibleQuantity = (page) => page.getByRole("spinbutton", { name: `Cantidad aprobada de ${material}` });
const contextMenu = (page) => page.locator("[data-requisicion-context-menu]");
async function openContext(page, id = "pending") {
    const title = card(page, id).getByRole("button", { name: /^Ver detalles de / });
    await title.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await title.click({ button: "right" });
    await expect(contextMenu(page)).toBeVisible();
}
async function assertModalContext(page, id, mode = "view") {
    await expect(page.getByRole("dialog", { name: "Requisición de prueba", exact: true })).toBeVisible();
    await expect(page.getByTestId("modal-requisicion-id")).toHaveText(id);
    await expect(page.getByTestId("modal-project-id")).toHaveText("project");
    await expect(page.getByTestId("modal-mode")).toHaveText(mode);
}
async function checkContextBounds(page) {
    try { await expect.poll(() => contextMenu(page).evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
    }), { message: "Context menu stays in viewport" }).toBe(true); } catch (error) {
        console.log(await contextMenu(page).evaluate((element) => ({ bounds: element.getBoundingClientRect().toJSON(), style: element.getAttribute("style"), viewport: [innerWidth, innerHeight], list: element.querySelector("[cmdk-list]").getBoundingClientRect().toJSON() })));
        throw error;
    }
}
async function checkLayout(page, context) {
    const overflow = await page.evaluate(() => {
        const main = document.querySelector("[data-dashboard-scroll]");
        const surface = document.querySelector("[data-requisiciones-page]");
        const dialog = document.querySelector("[role=dialog], [role=alertdialog]");
        return {
            document: document.documentElement.scrollWidth > innerWidth + 1,
            main: main.scrollWidth > main.clientWidth + 1,
            surface: surface.scrollWidth > surface.clientWidth + 1,
            dialog: dialog ? dialog.scrollWidth > dialog.clientWidth + 1 : false,
            dialogOutside: dialog ? dialog.getBoundingClientRect().left < 0 || dialog.getBoundingClientRect().right > innerWidth + 1 || dialog.getBoundingClientRect().top < 0 || dialog.getBoundingClientRect().bottom > innerHeight + 1 : false,
        };
    });
    if (overflow.document) console.log(await page.evaluate(() => ({ viewport: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, style: document.body.getAttribute("style"), outside: [...document.body.querySelectorAll("*")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1 && !element.closest("[data-material-layout=table]")).slice(0, 20).map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right, text: element.textContent?.slice(0, 30) })) })));
    assert.deepEqual(overflow, { document: false, main: false, surface: false, dialog: false, dialogOutside: false }, context);
}
async function snapshot(page, name) {
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
    try { await checkLayout(page, name); } catch (error) {
        console.log(await page.evaluate(() => {
            const dialog = document.querySelector("[role=dialog], [role=alertdialog]");
            return dialog ? [...dialog.querySelectorAll("*")].filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => ({ tag: element.tagName, text: element.textContent?.slice(0, 60), width: element.clientWidth, scroll: element.scrollWidth, className: element.className })) : [];
        }));
        throw error;
    }
}
async function menuAction(page, id, label) {
    await card(page, id).getByRole("button", { name: "Acciones de requisición", exact: true }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function closeDialog(page) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
}
async function openPage(width, query = "") {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    // Keep the preview image local and prevent any external transport in this fixture.
    await page.route("https://www.ogc.mx/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: logo }));
    await page.route("**/mock-upload", (route) => route.fulfill({ contentType: "application/json", body: '{"storageId":"mock-storage"}' }));
    await page.goto(`http://127.0.0.1:4192/e2e/requisiciones/preview.html${query}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    return page;
}
const logo = await readFile(`${root}/public/OGC-LOGO.svg`, "utf8");
try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    await mkdir(output, { recursive: true });
    for (const width of [320, 390, 768, 1024, 1440, 1536]) {
        const page = await openPage(width);
        if (width >= 1024) await expect(page.locator("[data-state=expanded][data-side=left]")).toBeVisible();
        await snapshot(page, `list-${width}`);
        const title = card(page).getByRole("button", { name: /^Ver detalles de / });
        await title.click();
        await assertModalContext(page, "pending");
        await closeDialog(page);
        await expect(card(page).getByRole("button", { name: "Expandir requisición", exact: true })).toBeVisible();
        await title.focus();
        await page.keyboard.press("Enter");
        await assertModalContext(page, "pending");
        await closeDialog(page);
        await title.focus();
        await page.keyboard.press("Space");
        await assertModalContext(page, "pending");
        await closeDialog(page);
        await openContext(page);
        await expect(contextMenu(page).locator("[cmdk-root]")).toBeFocused();
        await snapshot(page, `context-${width}`);
        await checkContextBounds(page);
        await page.keyboard.press("Enter");
        await assertModalContext(page, "pending");
        await expect(contextMenu(page)).toHaveCount(0);
        await closeDialog(page);
        await title.focus();
        await page.keyboard.press("Shift+F10");
        await expect(contextMenu(page)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(contextMenu(page)).toHaveCount(0);
        await expect(title).toBeFocused();
        await openContext(page);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog", { name: "Historial de prueba", exact: true })).toBeVisible();
        await expect(page.getByTestId("history-requisicion-id")).toHaveText("pending");
        await expect(page.getByTestId("history-project-id")).toHaveText("project");
        await expect(page.getByTestId("history-mode")).toHaveText("single");
        await closeDialog(page);
        await card(page).evaluate((element, x) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: 898, button: 2 })), width - 2);
        await expect(contextMenu(page)).toBeVisible();
        await checkContextBounds(page);
        await page.keyboard.press("Escape");
        await openContext(page);
        await page.evaluate(() => { document.querySelector("[data-dashboard-scroll]").scrollTop += 10; });
        await expect(contextMenu(page)).toHaveCount(0);
        await openContext(page);
        await page.getByRole("heading", { level: 1 }).click();
        await expect(contextMenu(page)).toHaveCount(0);
        await openContext(page);
        await contextMenu(page).getByRole("option", { name: "Agregar proveedor", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Asignar Proveedor", exact: true })).toBeVisible();
        await expect(contextMenu(page)).toHaveCount(0);
        await closeDialog(page);
        await openContext(page);
        await contextMenu(page).getByRole("option", { name: "Editar", exact: true }).click();
        await assertModalContext(page, "pending", "edit");
        await closeDialog(page);
        await openContext(page);
        await contextMenu(page).getByRole("option", { name: "Mover a Pagada", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Cambiar a Pagada", exact: true })).toBeVisible();
        await closeDialog(page);
        await openContext(page);
        await contextMenu(page).getByRole("option", { name: "Pagado", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Cambiar pago a Pagado", exact: true })).toBeVisible();
        await closeDialog(page);
        await openContext(page);
        await contextMenu(page).getByRole("option", { name: "Completo", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Cambiar entrega a Completo", exact: true })).toBeVisible();
        await closeDialog(page);
        await openContext(page);
        await contextMenu(page).getByRole("option", { name: "Eliminar", exact: true }).click();
        await expect(page.getByRole("alertdialog", { name: "¿Eliminar requisición?", exact: true })).toBeVisible();
        await closeDialog(page);
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.getByRole("textbox", { name: "Buscar requisiciones" }).fill("sin coincidencias");
        await expect(page.getByText("No se encontraron requisiciones", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Limpiar", exact: true }).click();
        await page.locator("#requisicion-filters").getByRole("combobox").nth(1).click();
        await page.getByRole("option", { name: "Equipo", exact: true }).click();
        await expect(card(page)).toHaveCount(0);
        await page.getByRole("button", { name: "Limpiar", exact: true }).click();
        await page.locator("#requisicion-filters").getByRole("button", { name: "Fecha", exact: true }).click();
        await snapshot(page, `filters-${width}`);
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        const req = card(page);
        await req.getByRole("button", { name: "Expandir requisición", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(req.getByRole("button", { name: "Contraer requisición", exact: true })).toBeVisible();
        const layout = req.locator(`[data-material-layout='${width < 768 ? "mobile" : "table"}']`);
        await expect(layout).toBeVisible();
        if (width === 768 || width === 1024) assert.equal(await layout.evaluate((element) => element.scrollWidth > element.clientWidth), true, `Contained table scroll at ${width}`);
        await visibleQuantity(page).fill("6");
        const smallTargets = await req.locator("button").evaluateAll((buttons) => buttons.filter((button) => {
            const bounds = button.getBoundingClientRect();
            return bounds.width > 0 && bounds.height > 0 && (bounds.width < 44 || bounds.height < 44);
        }).map((button) => button.getAttribute("aria-label")));
        assert.deepEqual(smallTargets, [], `Touch targets at ${width}`);
        await snapshot(page, `expanded-${width}`);
        await req.getByRole("button", { name: "Cambiar a Pagada", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Cambiar a Pagada", exact: true })).toBeVisible();
        await snapshot(page, `status-${width}`);
        await closeDialog(page);
        await expect(req.getByRole("button", { name: "Contraer requisición", exact: true })).toBeVisible();
        await menuAction(page, "pending", "Agregar proveedor");
        await snapshot(page, `providers-${width}`);
        await page.getByRole("button", { name: "Ver detalles", exact: true }).click();
        await snapshot(page, `provider-details-${width}`);
        await page.getByRole("button", { name: "Editar", exact: true }).click();
        await snapshot(page, `provider-edit-${width}`);
        await closeDialog(page);
        await menuAction(page, "pending", "Eliminar");
        await snapshot(page, `delete-${width}`);
        await closeDialog(page);
        await page.getByRole("button", { name: "Notificaciones", exact: true }).click();
        await snapshot(page, `notifications-${width}`);
        await page.getByRole("dialog").getByRole("button", { name: "Ver requisiciones", exact: true }).scrollIntoViewIfNeeded();
        await snapshot(page, `notifications-preview-${width}`);
        await page.getByRole("dialog").getByRole("button", { name: "Enviar", exact: true }).click();
        await closeDialog(page);
        assert.equal(await page.evaluate(() => window.recordedMutations.some((entry) => entry.name === "requisiciones:sendEmailNotification")), true);
        await page.getByRole("tab", { name: /^Aprobadas/ }).click();
        await openContext(page, "approved");
        await contextMenu(page).getByRole("option", { name: "Solicitar pago en obra", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Solicitar pago en obra", exact: true })).toBeVisible();
        await closeDialog(page);
        await menuAction(page, "approved", "Solicitar pago en obra");
        await snapshot(page, `onsite-payment-${width}`);
        await closeDialog(page);
        await page.getByRole("tab", { name: /^Pagadas/ }).click();
        await openContext(page, "paid");
        await contextMenu(page).getByRole("option", { name: "Agregar nota de remisión", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Agregar nota de remisión", exact: true })).toBeVisible();
        await closeDialog(page);
        await menuAction(page, "paid", "Agregar nota de remisión");
        await page.getByRole("dialog").locator('input[type=file][multiple]').setInputFiles({ name: "FotoExtensaDeRemision".repeat(4) + ".png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=", "base64") });
        await snapshot(page, `remission-${width}`);
        await closeDialog(page);
        await page.getByRole("tab", { name: /^Recibidas/ }).click();
        await expect(card(page, "received")).toBeVisible();
        await page.getByRole("tab", { name: /^Por revisar/ }).click();
        await visibleQuantity(page).fill("6");
        await page.setViewportSize({ width: width < 768 ? 1024 : 390, height: 900 });
        await expect(visibleQuantity(page)).toHaveValue("6");
        await snapshot(page, `resize-${width}`);
        await page.evaluate(() => { window.holdReview = true; });
        await page.getByRole("button", { name: `Aprobar ${material}`, exact: true }).click();
        await expect(page.getByRole("status", { name: `Revisando ${material}` })).toBeVisible();
        assert.equal(await page.evaluate(() => window.recordedMutations.at(-1).args.cantidad_aprobada), 6);
        await page.evaluate(() => { window.releaseReview(); window.holdReview = false; });
        await expect(visibleQuantity(page)).toHaveCount(0);
        await page.close();
        console.log(`Requisiciones ${width}px: layout, filtros, materiales y diálogos OK`);
    }
    const rejectPage = await openPage(390);
    await card(rejectPage).getByRole("button", { name: "Expandir requisición", exact: true }).click();
    await rejectPage.getByRole("button", { name: `Rechazar ${material}`, exact: true }).click();
    await expect(visibleQuantity(rejectPage)).toHaveCount(0);
    assert.equal(await rejectPage.evaluate(() => window.recordedMutations.at(-1).args.status_revision), "rechazado");
    await rejectPage.close();
    for (const role of ["finance", "user", "contratista", "almacenista", "viewer"]) {
        const page = await openPage(390, `?role=${role}`);
        if (role === "almacenista") await expect(page.getByRole("tab", { name: /^Pagadas/ })).toHaveAttribute("data-state", "active");
        else {
            await card(page).getByRole("button", { name: "Expandir requisición", exact: true }).click();
            assert.equal(await visibleQuantity(page).count(), role === "finance" ? 1 : 0);
        }
        assert.equal(await page.getByRole("button", { name: "Notificaciones", exact: true }).count(), role === "finance" ? 1 : 0);
        assert.equal(await page.getByRole("button", { name: "Nueva Requisición", exact: true }).count(), ["user", "contratista"].includes(role) ? 1 : 0);
        await openContext(page, role === "almacenista" ? "paid" : "pending");
        const menu = contextMenu(page);
        const canManage = ["user", "contratista"].includes(role);
        assert.equal(await menu.getByRole("option", { name: "Editar", exact: true }).count(), canManage ? 1 : 0);
        assert.equal(await menu.getByRole("option", { name: "Agregar proveedor", exact: true }).count(), canManage ? 1 : 0);
        assert.equal(await menu.getByRole("option", { name: "Eliminar", exact: true }).count(), role === "contratista" ? 1 : 0);
        assert.equal(await menu.getByRole("option", { name: "Pagado", exact: true }).count(), role === "finance" ? 1 : 0);
        if (role === "finance") {
            await expect(menu.getByRole("option", { name: "Mover a Aprobada", exact: true })).toHaveAttribute("data-disabled", "false");
            await expect(menu.getByRole("option", { name: "Mover a Recibida", exact: true })).toHaveAttribute("data-disabled", "true");
        } else {
            await expect(menu.getByRole("option", { name: "Mover a Aprobada", exact: true })).toHaveAttribute("data-disabled", "true");
            await expect(menu.getByRole("option", { name: "Mover a Recibida", exact: true })).toHaveAttribute("data-disabled", canManage ? "false" : "true");
        }
        if (role === "almacenista") await expect(menu.getByRole("option", { name: "Agregar nota de remisión", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        if (role === "contratista") {
            await page.getByRole("tab", { name: /^Aprobadas/ }).click();
            await openContext(page, "approved");
            assert.equal(await contextMenu(page).getByRole("option", { name: "Editar", exact: true }).count(), 0);
            assert.equal(await contextMenu(page).getByRole("option", { name: "Agregar proveedor", exact: true }).count(), 0);
            assert.equal(await contextMenu(page).getByRole("option", { name: "Eliminar", exact: true }).count(), 0);
            await expect(contextMenu(page).getByRole("option", { name: "Mover a Recibida", exact: true })).toHaveAttribute("data-disabled", "true");
            await page.keyboard.press("Escape");
        }
        await checkLayout(page, `role-${role}`);
        await page.close();
    }
    for (const scenario of ["empty", "loading"]) {
        const page = await openPage(320, `?${scenario}=1`);
        await expect(page.getByText(scenario === "empty" ? "No se encontraron requisiciones" : "Cargando requisiciones...", { exact: true })).toBeVisible();
        await snapshot(page, scenario);
        await page.close();
    }
    for (const [width, height] of [[320, 568], [1024, 600]]) {
        const page = await openPage(width);
        await page.setViewportSize({ width, height });
        await card(page).getByRole("button", { name: "Cambiar a Pagada", exact: true }).click();
        await page.getByRole("button", { name: "Guardar cambio", exact: true }).scrollIntoViewIfNeeded();
        await snapshot(page, `short-status-${width}`);
        await closeDialog(page);
        await menuAction(page, "pending", "Agregar proveedor");
        await page.getByRole("button", { name: "Ver detalles", exact: true }).click();
        await page.getByRole("button", { name: "Asignar este Proveedor", exact: true }).scrollIntoViewIfNeeded();
        await snapshot(page, `short-provider-${width}`);
        await closeDialog(page);
        await page.getByRole("button", { name: "Notificaciones", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Enviar", exact: true }).scrollIntoViewIfNeeded();
        await snapshot(page, `short-notifications-${width}`);
        await closeDialog(page);
        await card(page).evaluate((element, point) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 2 })), { x: width - 2, y: height - 2 });
        await expect(contextMenu(page)).toBeVisible();
        await snapshot(page, `short-context-${width}`);
        await checkContextBounds(page);
        await page.setViewportSize({ width: width + 10, height });
        await expect(contextMenu(page)).toHaveCount(0);
        await page.close();
    }
    assert.deepEqual(errors, [], "No browser runtime errors");
    console.log(`Capturas: ${output}`);
} finally { if (browser) await browser.close(); await server.close(); }
