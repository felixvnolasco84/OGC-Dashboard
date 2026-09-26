import { expect, test } from "@playwright/test";

async function seedOfflineBitacora(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const databaseName = "ogc-bitacora-offline";
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const create = (name: string, keyPath: string, indexes: Array<{ name: string; path: string | string[]; multiEntry?: boolean }>) => {
          const store = db.createObjectStore(name, { keyPath });
          for (const index of indexes) store.createIndex(index.name, index.path, { multiEntry: index.multiEntry });
        };
        create("offlineProfiles", "clerkId", [
          { name: "expiresAt", path: "expiresAt" },
          { name: "projectIds", path: "projectIds", multiEntry: true },
        ]);
        create("projects", "key", [
          { name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "userId", path: "userId" }, { name: "projectId", path: "projectId" },
        ]);
        create("partidas", "key", [
          { name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "[userId+projectId+nivel]", path: ["userId", "projectId", "nivel"] }, { name: "partidaId", path: "partidaId" },
        ]);
        create("entries", "key", [
          { name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "[userId+projectId+syncState]", path: ["userId", "projectId", "syncState"] }, { name: "clientId", path: "clientId" }, { name: "serverId", path: "serverId" }, { name: "syncVersion", path: "syncVersion" },
        ]);
        create("attachments", "key", [
          { name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "[userId+entryClientId]", path: ["userId", "entryClientId"] }, { name: "clientId", path: "clientId" }, { name: "serverId", path: "serverId" }, { name: "syncState", path: "syncState" },
        ]);
        create("outbox", "operationId", [
          { name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "[userId+projectId+status]", path: ["userId", "projectId", "status"] }, { name: "entryClientId", path: "entryClientId" }, { name: "createdAt", path: "createdAt" },
        ]);
        create("syncMetadata", "key", [{ name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "status", path: "status" }]);
        create("assignableUsers", "key", [{ name: "[userId+projectId]", path: ["userId", "projectId"] }, { name: "targetUserId", path: "targetUserId" }]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(request.error?.message || "No se pudo abrir IndexedDB"));
    });

    const now = Date.now();
    const userId = "layout-user";
    const projectId = "layout-project";
    const entryClientId = "layout-entry";
    const pngBytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));
    const transaction = database.transaction(["offlineProfiles", "projects", "partidas", "entries", "attachments", "syncMetadata", "assignableUsers"], "readwrite");
    let writeError = "";
    transaction.addEventListener("error", (event) => {
      const request = event.target as IDBRequest;
      const source = request.source as IDBObjectStore | null;
      writeError = `${source?.name || "store desconocido"}: ${request.error?.message || "error de escritura"}`;
    }, true);
    transaction.objectStore("offlineProfiles").put({ clerkId: userId, userId, name: "Luis Contreras Aviles", email: "layout@example.com", role: "admin", projectIds: [projectId], verifiedAt: now, expiresAt: now + 86_400_000 });
    transaction.objectStore("projects").put({ key: `${userId}:${projectId}`, userId, projectId, name: "Larena - Acceso", raw: {} });
    transaction.objectStore("partidas").put({ key: `${userId}:partida-1`, userId, projectId, partidaId: "partida-1", name: "LUMINARIAS", nivel: 1, raw: {} });
    transaction.objectStore("entries").put({
      key: `${userId}:${entryClientId}`, userId, projectId, clientId: entryClientId, serverId: "server-entry", revision: 1, baseRevision: 1, syncVersion: 1,
      uploadedAt: now, updatedAt: now, deleted: false, syncState: "synced", categoria: "Instalaciones", partidaId: "partida-1", familiasTags: ["ACCESORIOS ELÉCTRICOS"], responsable: "Luis Contreras Aviles",
      fecha: "11/09/2026", avanceDia: "TORRE I\nINSTALACION DE ACCESORIOS 80%\nNIVEL 3\nDEP.302", comentarios: "Sin incidencias reportadas.", status: "Sin problemas",
    });
    for (let index = 0; index < 12; index += 1) {
      const imageBlob = new Blob([pngBytes], { type: "image/png" });
      transaction.objectStore("attachments").put({
        key: `${userId}:photo-${index}`, userId, projectId, entryClientId, clientId: `photo-${index}`, serverId: `server-photo-${index}`, storageId: `storage-${index}`,
        kind: "photo", name: "LUMINARIAS - Foto", description: `INSTALACION DE ACCESORIOS 80%\nTORRE I\nNIVEL 3\nDEP.302`, mimeType: "image/png", size: imageBlob.size,
        blob: imageBlob, deleted: false, syncState: "synced",
      });
    }
    transaction.objectStore("syncMetadata").put({ key: `${userId}:${projectId}`, userId, projectId, version: 1, prepared: true, lastSyncAt: now, status: "idle" });
    transaction.objectStore("assignableUsers").put({ key: `${userId}:assigned-user`, userId, projectId, targetUserId: "assigned-user", name: "Luis Contreras Aviles", role: "admin" });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(writeError || transaction.error?.message || "Falló la escritura de IndexedDB"));
      transaction.onabort = () => reject(new Error(writeError || transaction.error?.message || "Se canceló la escritura de IndexedDB"));
    });
    database.close();
    localStorage.setItem("ogc:bitacora:last-user", userId);
  });
}

test("galería desktop y modal de detalle no crean scroll exterior", async ({ page, context, browserName }) => {
  test.skip(browserName === "webkit", "Playwright WebKit para Windows no permite sembrar Blob/File en IndexedDB; el flujo autenticado cubre WebKit con datos reales.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await seedOfflineBitacora(page);
  await context.setOffline(true);
  await page.goto("/proyecto/layout-project/bitacora");

  await expect(page.getByRole("heading", { name: "Larena - Acceso" })).toBeVisible();
  await page.getByRole("button", { name: /Expandir reporte del/ }).first().click();
  await page.getByTitle("Abrir en la galería").first().click();

  const gallery = page.getByRole("dialog");
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText("LUMINARIAS - Foto")).toBeVisible();
  const gallerySize = await gallery.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
  }));
  expect(gallerySize.width).toBe(1440);
  expect(gallerySize.height).toBe(900);
  expect(gallerySize.scrollWidth).toBe(gallerySize.width);
  expect(gallerySize.scrollHeight).toBe(gallerySize.height);
  await gallery.getByRole("button", { name: "Cerrar galería" }).click();
  await page.getByRole("button", { name: /Acciones del reporte del/ }).click();
  await page.getByRole("menuitem", { name: "Ver detalles" }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByRole("heading", { name: "Detalle de Entrada" })).toBeVisible();
  await expect.poll(() => details.evaluate((element) => element.clientWidth)).toBe(1152);
  const detailsOverflow = await details.evaluate((element) => ({
    outerScrolls: element.scrollHeight > element.clientHeight,
    overflowingVerticalRegions: Array.from(element.querySelectorAll("*")).filter((child) => {
      const style = getComputedStyle(child);
      return ["auto", "scroll"].includes(style.overflowY) && child.scrollHeight > child.clientHeight;
    }).length,
  }));
  expect(detailsOverflow.outerScrolls).toBe(false);
  expect(detailsOverflow.overflowingVerticalRegions).toBe(1);
});
