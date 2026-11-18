import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const fixture = `${root}/e2e/requisiciones`;
const output = `${root}/outputs/P10-implementacion-2026-11-18/fixtures`;
const server = await createServer({
    configFile: false, root, cacheDir: `${root}/node_modules/.vite-requisiciones-header-test`,
    optimizeDeps: { entries: ["e2e/requisiciones/header-preview.html"] }, plugins: [react()],
    resolve: { alias: [
        { find: "@/components/modals/RequisicionModal", replacement: `${fixture}/requisicion-modal-stub.tsx` },
        { find: "@/components/providers/ProviderFormDialog", replacement: `${fixture}/shared-modal-stub.tsx` },
        { find: "convex/react", replacement: `${fixture}/header-convex-stub.ts` },
        { find: "@", replacement: `${root}/src` },
    ] },
    // Other chats edit this shared tree; their HMR reloads must not reset a focus test.
    server: { host: "127.0.0.1", port: 4196, strictPort: true, hmr: false },
});
await server.listen();
let browser;
const errors = [];
const results = [];
const logo = await readFile(`${root}/public/OGC-LOGO.svg`, "utf8");
const trigger = page => page.getByRole("button", { name: "Acciones de requisiciones", exact: true });
const history = page => page.getByRole("dialog", { name: "Historial de Requisiciones", exact: true });
const notifications = page => page.getByRole("dialog", { name: "Notificaciones de requisiciones", exact: true });
const badge = page => page.locator("#requisiciones-unread-count");
async function openPage(width, query = "") {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    // This fixture has no Convex client. Deny every non-local request as a second guard.
    await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.hostname === "127.0.0.1") return route.continue();
        if (url.hostname === "www.ogc.mx" && /\.(svg|png)$/.test(url.pathname)) return route.fulfill({ contentType: "image/svg+xml", body: logo });
        return route.abort();
    });
    await page.goto(`http://127.0.0.1:4196/e2e/requisiciones/header-preview.html${query}`);
    await expect(page.getByRole("heading", { name: "Proyecto A", exact: true })).toBeVisible();
    return page;
}
async function menuAction(page, name) {
    await trigger(page).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
}
async function closeRadix(page) {
    await page.getByRole("dialog").evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function layout(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const menu = page.getByRole("menu");
    if (await menu.count()) assert.equal(await menu.evaluate(element => {
        const b = element.getBoundingClientRect();
        return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
    }), true);
    assert.equal(await page.locator('button[aria-label="Acciones de requisiciones"]').evaluate(element => {
        const b = element.getBoundingClientRect(); return b.width >= 44 && b.height >= 44;
    }), true);
}
async function noWrites(page) {
    assert.deepEqual(await page.evaluate(() => window.recordedMutations), [], "Opening and closing header tools must not send, mark as read, or mutate data");
}
async function scenario(page, detail) {
    await page.evaluate(value => window.dispatchEvent(new CustomEvent("p10-fixture-change", { detail: value })), detail);
}
try {
    await mkdir(output, { recursive: true });
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const width of [390, 1024, 1440]) {
        const page = await openPage(width);
        const totals = await page.locator("dl").innerText();
        const tabs = await page.getByRole("tablist").innerText();
        await expect(badge(page)).toContainText("5 notificaciones de requisiciones sin leer");
        await expect(trigger(page)).toHaveAccessibleDescription("5 notificaciones de requisiciones sin leer");
        await layout(page);
        await page.screenshot({ path: `${output}/cabecera-${width}.png`, fullPage: true });
        await trigger(page).press("ArrowDown");
        await expect(page.getByRole("menuitem", { name: "Historial", exact: true })).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByRole("menuitem", { name: "Notificaciones", exact: true })).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(page.getByRole("menuitem", { name: "Historial", exact: true })).toBeFocused();
        await layout(page);
        await page.screenshot({ path: `${output}/menu-${width}.png`, fullPage: true });
        await page.keyboard.press("Escape");
        await expect(trigger(page)).toBeFocused();
        await trigger(page).press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(history(page)).toBeVisible();
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(page.getByTestId("history-context")).toHaveText(JSON.stringify({ isOpen: true, mode: "all", proyectoId: "project", requisicionId: null }));
        await expect(page.getByText("Historial global project", { exact: true })).toBeVisible();
        await expect(history(page).getByRole("button", { name: "Cerrar historial de requisiciones" })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(history(page).getByRole("button", { name: "Cerrar", exact: true })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(history(page).getByRole("button", { name: "Cerrar historial de requisiciones" })).toBeFocused();
        assert.notEqual(await page.evaluate(() => document.body.style.pointerEvents), "none", "Manual history overlay must not retain the dropdown pointer lock");
        await page.screenshot({ path: `${output}/historial-${width}.png`, fullPage: true });
        await page.keyboard.press("Escape");
        await expect(history(page)).toHaveCount(0);
        await expect(trigger(page)).toBeFocused();
        await menuAction(page, "Historial");
        await history(page).getByRole("button", { name: "Cerrar", exact: true }).click();
        await expect(trigger(page)).toBeFocused();
        await menuAction(page, "Notificaciones");
        await expect(notifications(page)).toBeVisible();
        await expect(page.getByRole("menu")).toHaveCount(0);
        await noWrites(page);
        await page.screenshot({ path: `${output}/notificaciones-${width}.png`, fullPage: true });
        await closeRadix(page);
        await expect(trigger(page)).toBeFocused();
        await page.getByRole("button", { name: "Nueva requisición", exact: true }).click();
        await expect(page.getByTestId("modal-mode")).toHaveText("create");
        await expect(page.getByTestId("modal-project-id")).toHaveText("project");
        await expect(page.getByTestId("modal-requisicion-id")).toHaveText("");
        await closeRadix(page);
        await expect(badge(page)).toContainText("5 notificaciones de requisiciones sin leer");
        assert.equal(await page.locator("dl").innerText(), totals);
        assert.equal(await page.getByRole("tablist").innerText(), tabs);
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await expect(page.getByRole("button", { name: "Filtros", exact: true })).toHaveAttribute("aria-expanded", "true");
        await noWrites(page);
        await page.close();
        results.push({ width, keyboard: true, focus: true, globalHistory: true, notificationsWithoutSend: true, creationContext: true, layout: true });
    }
    for (const role of ["admin", "finance", "user", "contratista", "almacenista"]) {
        const page = await openPage(390, `?role=${role}`);
        await expect(page.getByRole("button", { name: "Nueva requisición", exact: true })).toHaveCount(["admin", "user", "contratista"].includes(role) ? 1 : 0);
        if (role === "almacenista") await expect(page.getByRole("tab", { name: /^Pagadas/ })).toHaveAttribute("aria-selected", "true");
        await trigger(page).click();
        await expect(page.getByRole("menuitem", { name: "Notificaciones", exact: true })).toHaveCount(["admin", "finance"].includes(role) ? 1 : 0);
        await expect(page.getByRole("menuitem")).toHaveCount(["admin", "finance"].includes(role) ? 2 : 1);
        await page.getByRole("menuitem", { name: "Historial", exact: true }).click();
        await expect(history(page)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(trigger(page)).toBeFocused();
        if (["admin", "finance"].includes(role)) {
            await menuAction(page, "Notificaciones");
            await expect(notifications(page)).toBeVisible();
            await closeRadix(page);
            await expect(trigger(page)).toBeFocused();
        }
        await layout(page);
        await noWrites(page);
        await page.close();
        results.push({ role, permissions: true });
    }
    const page = await openPage(390);
    for (const unread of ["zero", "loading", "single", "positive"]) {
        await scenario(page, { unread });
        if (["zero", "loading"].includes(unread)) {
            await expect(badge(page)).toHaveCount(0);
            await expect(trigger(page)).not.toHaveAttribute("aria-describedby");
        } else await expect(badge(page)).toContainText(unread === "single" ? "1 notificación de requisiciones sin leer" : "5 notificaciones de requisiciones sin leer");
    }
    await trigger(page).click();
    await scenario(page, { role: "almacenista" });
    await expect(page.getByRole("menu")).toHaveCount(0);
    await trigger(page).click();
    await expect(page.getByRole("menuitem")).toHaveCount(1);
    await scenario(page, { project: "project-b" });
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Proyecto B", exact: true })).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await menuAction(page, "Historial");
    await expect(page.getByTestId("history-context")).toHaveText(JSON.stringify({ isOpen: true, mode: "all", proyectoId: "project-b", requisicionId: null }));
    await page.keyboard.press("Escape");
    await expect(trigger(page)).toBeFocused();
    await noWrites(page);
    await page.close();
    results.push({ unread: ["zero", "loading", "single", "positive"], resetOnRoleChange: true, resetOnProjectChange: true, noWrites: true });
    assert.deepEqual(errors, [], "No browser runtime or console errors");
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log("P10 OK: 390/1024/1440, 5 roles, novedades, cambio de proyecto/rol, teclado, foco y aperturas sin escrituras.");
} finally { await browser?.close(); await server.close(); }
