import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/dropdown-menu-fixture.html");
});

test("las acciones se abren, responden al teclado y se cierran al seleccionar", async ({ page }) => {
  await page.getByRole("button", { name: "Acciones" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Editar" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("action")).toHaveText("editado");
  await expect(page.getByRole("menuitem", { name: "Editar" })).toHaveCount(0);
});

test("el diálogo sigue abierto al seleccionar una acción del menú", async ({ page }) => {
  await page.getByRole("button", { name: "Eliminar pago" }).click();
  await page.getByRole("menuitem", { name: "Confirmar eliminación" }).click();
  await expect(page.getByRole("alertdialog", { name: "Confirmar pago" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
});

test("la acción de editar abre un diálogo fuera del contenido del menú", async ({ page }) => {
  await page.getByRole("button", { name: "Editar partida" }).click();
  await page.getByRole("menuitem", { name: "Abrir formulario" }).click();
  await expect(page.getByRole("dialog", { name: "Formulario de partida" })).toBeVisible();
});

test("el calendario permite seleccionar una fecha y cierra el menú", async ({ page }) => {
  await page.getByRole("button", { name: "Fecha", exact: true }).click();
  await expect(page.locator("[data-slot='calendar']")).toBeVisible();
  await page.locator("[data-slot='calendar'] button:not([disabled])").filter({ hasText: /^1$/ }).first().click();
  await expect(page.getByTestId("date")).not.toBeEmpty();
  await expect(page.locator("[data-slot='calendar']")).toHaveCount(0);
});

test("la búsqueda recibe texto dentro del menú", async ({ page }) => {
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("textbox", { name: "Búsqueda" }).fill("partida");
  await expect(page.getByTestId("query")).toHaveText("partida");
  await expect(page.getByRole("textbox", { name: "Búsqueda" })).toBeVisible();
});

test("el calendario dentro de un diálogo recibe clics", async ({ page }) => {
  await page.getByRole("button", { name: "Editar registro" }).click();
  await page.getByRole("button", { name: "Fecha del registro" }).click();
  await page.locator("[data-slot='calendar'] button:not([disabled])").filter({ hasText: /^1$/ }).first().click();
  await expect(page.getByTestId("date")).not.toBeEmpty();
  await expect(page.getByRole("dialog", { name: "Editar fecha" })).toBeVisible();
});

test("el buscador de partidas permite filtrar y seleccionar con el teclado", async ({ page }) => {
  await page.getByRole("button", { name: "Partidas" }).click();
  await page.getByPlaceholder("Buscar partida").fill("Partida B");
  await page.getByPlaceholder("Buscar partida").press("ArrowDown");
  await page.getByPlaceholder("Buscar partida").press("Enter");
  await expect(page.getByTestId("command-value")).toHaveText("Partida B");
});

test("el selector RFI migrado permite elegir una fecha", async ({ page }) => {
  await page.getByRole("button", { name: "Fecha RFI" }).click();
  await page.locator("[data-slot='calendar'] button:not([disabled])").filter({ hasText: /^1$/ }).first().click();
  await expect(page.getByTestId("rfi-date")).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
});

test("el selector RFI migrado filtra y agrega responsables", async ({ page }) => {
  await page.getByRole("button", { name: /Responsables|Asignar|Selecciona/i }).click();
  await page.getByPlaceholder("Buscar nombres, roles o equipos").fill("Ana");
  await page.getByRole("button", { name: /Ana López/ }).click();
  await expect(page.getByTestId("assignees")).toHaveText("test-user");
});
