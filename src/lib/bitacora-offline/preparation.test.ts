import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { bitacoraDb, findValidOfflineProfile, inspectOfflinePreparation, readProjectSnapshot } from "./db";
import { BitacoraScopeChanged, classifyPreparationFailure, createSingleAttempt, isProfileUsable, preparationMessage } from "./preparation";
import { deleteEntryLocally, mergeRemoteEntries, saveEntryLocally, toEntryView } from "./repository";
import { cacheHistoricalAttachment, pullProjectChanges, queueHistoricalAttachmentDownload, synchronizeProject } from "./sync";
import type { OfflineProfile, RemoteEntry } from "./types";

const profile = (): OfflineProfile => ({ clerkId: "a", userId: "a", name: "Prueba", email: "test@example.test", role: "admin", projectIds: ["p"], verifiedAt: Date.now(), expiresAt: Date.now() + 60_000 });
const row = (): RemoteEntry => ({ _id: "server", proyecto: "p", client_id: "entry", revision: 1, sync_version: 1, updated_at: Date.now(), uploaded_at: Date.now(), categoria: "Estructura", partida_id: "partida", familias_tags: [], responsable: "Prueba", fecha: "09/10/2026", avance_dia: "Datos simulados", status: "Sin problemas", fotos: [], documentos: [] });
const page = (rows: RemoteEntry[] = []) => ({ page: rows, continueCursor: "", isDone: true, latestVersion: 1 });
const connection = { projectName: "Proyecto", isReady: false, isReading: false, isBusy: false, networkOnline: true, backendConnected: true, hasClient: true, expired: false, hasError: false };
async function prepared(user = "a", project = "p") {
  await bitacoraDb.offlineProfiles.put({ ...profile(), clerkId: user, userId: user, projectIds: [project] });
  await bitacoraDb.projects.put({ key: `${user}:${project}`, userId: user, projectId: project, name: "Proyecto", raw: {} });
  await bitacoraDb.syncMetadata.put({ key: `${user}:${project}`, userId: user, projectId: project, version: 1, prepared: true, status: "idle", lastSyncAt: 100 });
}

beforeEach(async () => {
  vi.stubGlobal("navigator", { onLine: true, storage: { estimate: async () => ({ usage: 0, quota: 1e8 }), persist: async () => false } });
  const remembered = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => remembered.get(key) ?? null, setItem: (key: string, value: string) => remembered.set(key, value) });
  await bitacoraDb.delete(); await bitacoraDb.open();
});
afterEach(async () => { await bitacoraDb.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("entrada y acceso local", () => {
  it("rechaza editar o eliminar desde otro proyecto sin alterar los datos", async () => {
    await mergeRemoteEntries("a", "p", [row()]);
    await expect(deleteEntryLocally("a", "otro", "admin", "entry")).rejects.toThrow("no pertenece");
    await expect(saveEntryLocally({ userId: "a", projectId: "otro", role: "admin", entryClientId: "entry", newAttachments: [], fields: {
      categoria: "Estructura", partidaId: "partida", familiasTags: [], responsable: "Prueba", fecha: "09/10/2026", avanceDia: "Cambio", comentarios: "", status: "Sin problemas",
    } })).rejects.toThrow("no pertenece");
    expect((await bitacoraDb.entries.get("a:entry"))?.projectId).toBe("p");
    expect((await bitacoraDb.entries.get("a:entry"))?.deleted).toBe(false);
    expect(await bitacoraDb.outbox.count()).toBe(0);
  });
  it("exige identidad, alcance y vigencia incluso con cliente disponible", () => {
    expect(isProfileUsable(profile(), "a", "p")).toBe(true);
    expect(isProfileUsable(profile(), "b", "p")).toBe(false);
    expect(isProfileUsable(profile(), "a", "otro")).toBe(false);
    expect(isProfileUsable({ ...profile(), expiresAt: 1 }, "a", "p")).toBe(false);
  });
  it("resuelve únicamente la caché del usuario solicitado y requiere proyecto y snapshot", async () => {
    await prepared(); localStorage.setItem("ogc:bitacora:last-user", "a");
    expect(await findValidOfflineProfile("p", Date.now(), "b")).toBeUndefined();
    await prepared("b");
    expect((await findValidOfflineProfile("p", Date.now(), "b"))?.clerkId).toBe("b");
    expect((await findValidOfflineProfile("p", Date.now(), "a"))?.clerkId).toBe("a");
    await bitacoraDb.syncMetadata.update("a:p", { prepared: false });
    expect(await findValidOfflineProfile("p", Date.now(), "a")).toBeUndefined();
    await bitacoraDb.syncMetadata.update("a:p", { prepared: true });
    await bitacoraDb.projects.delete("a:p");
    expect(await findValidOfflineProfile("p", Date.now(), "a")).toBeUndefined();
  });
  it("no cambia de cuenta cuando la cuenta recordada no tiene preparación válida", async () => {
    await prepared("b"); localStorage.setItem("ogc:bitacora:last-user", "a");
    expect(await findValidOfflineProfile("p")).toBeUndefined();
  });
  it("rechaza selección ambigua sin una cuenta recordada", async () => {
    await prepared(); await prepared("b"); expect(await findValidOfflineProfile("p")).toBeUndefined();
  });
  it("distingue perfil vencido de preparación inexistente sin borrar pendientes", async () => {
    await prepared(); await bitacoraDb.offlineProfiles.update("a", { expiresAt: 1 });
    localStorage.setItem("ogc:bitacora:last-user", "a");
    expect((await inspectOfflinePreparation("p")).reason).toBe("expired");
    expect((await inspectOfflinePreparation("otro")).reason).toBe("missing");
    expect(await bitacoraDb.projects.count()).toBe(1);
  });
  it("la lectura agrupa únicamente tablas del ámbito actual", async () => {
    await prepared(); await prepared("b", "q"); await mergeRemoteEntries("b", "q", [{ ...row(), proyecto: "q" }]);
    const snapshot = await readProjectSnapshot("a", "p");
    expect(snapshot.entries).toEqual([]); expect(snapshot.project?.userId).toBe("a");
  });
  it("usa mensajes diferentes para carga, error, sesión, backend y falta de preparación", () => {
    expect(preparationMessage({ ...connection, isBusy: true }).title).toBe("Cargando Bitácora de Proyecto");
    expect(preparationMessage({ ...connection, hasError: true }).title).toBe("No pudimos cargar Bitácora");
    expect(preparationMessage({ ...connection, failure: "session" }).title).toBe("Valida tu sesión");
    expect(preparationMessage({ ...connection, backendConnected: false }).message).toContain("servidor");
    expect(preparationMessage({ ...connection, networkOnline: false }).message).toContain("primera vez");
    expect(preparationMessage({ ...connection, expired: true }).title).toContain("venció");
  });
  it("clasifica solo causas identificadas y conserva el fallo local fuera de DB", () => {
    expect(classifyPreparationFailure(new Error("cualquier fallo"), "bootstrap")).toBe("unknown");
    expect(classifyPreparationFailure(new Error("Not authenticated"), "pull")).toBe("session");
    expect(classifyPreparationFailure(new Error("Unauthorized: Project access required"), "bootstrap")).toBe("forbidden");
    expect(classifyPreparationFailure(new DOMException("lleno", "QuotaExceededError"), "pull")).toBe("storage");
  });
  it("comparte el intento completo entre disparadores y libera un fallo para reintentar", async () => {
    const run = createSingleAttempt(); let finish!: () => void;
    const work = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const attempts = Array.from({ length: 5 }, () => run(work));
    await Promise.resolve(); expect(work).toHaveBeenCalledTimes(1);
    expect(attempts.every((attempt) => attempt === attempts[0])).toBe(true);
    finish(); await Promise.all(attempts);
    await expect(run(async () => { throw new Error("fallo"); })).rejects.toThrow("fallo");
    await expect(run(async () => undefined)).resolves.toBeUndefined();
  });
});

describe("recuperación y sincronización", () => {
  it("no marca preparado un primer snapshot interrumpido; sí lo hace después de todas las páginas", async () => {
    const query = vi.fn().mockResolvedValueOnce({ ...page([row()]), isDone: false, continueCursor: "next" }).mockRejectedValueOnce(new Error("segunda página"));
    await expect(pullProjectChanges({ query } as unknown as ConvexReactClient, "a", "p")).rejects.toThrow("segunda página");
    expect((await bitacoraDb.syncMetadata.get("a:p"))?.prepared).not.toBe(true);
    query.mockResolvedValueOnce({ ...page([row()]), isDone: false, continueCursor: "next" }).mockResolvedValueOnce(page());
    await pullProjectChanges({ query } as unknown as ConvexReactClient, "a", "p");
    expect((await bitacoraDb.syncMetadata.get("a:p"))?.prepared).toBe(true);
    expect(query.mock.calls[3][1].paginationOpts.cursor).toBe("next");
  });
  it("prepara un módulo vacío y preserva un snapshot previo si el retorno falla", async () => {
    const query = vi.fn().mockResolvedValueOnce(page()).mockRejectedValueOnce(new Error("backend"));
    const client = { query } as unknown as ConvexReactClient;
    await pullProjectChanges(client, "a", "p");
    expect((await bitacoraDb.syncMetadata.get("a:p"))?.prepared).toBe(true);
    await expect(pullProjectChanges(client, "a", "p")).rejects.toThrow("backend");
    expect((await bitacoraDb.syncMetadata.get("a:p"))?.prepared).toBe(true);
  });
  it("descarta una respuesta tardía después de cambiar el ámbito", async () => {
    let active = true;
    const query = vi.fn(async () => { active = false; return page([row()]); });
    await expect(pullProjectChanges({ query } as unknown as ConvexReactClient, "a", "p", { assertActive: () => { if (!active) throw new BitacoraScopeChanged(); } })).rejects.toBeInstanceOf(BitacoraScopeChanged);
    expect(await bitacoraDb.entries.count()).toBe(0);
  });
  it("informa lock ocupado sin declarar éxito ni consultar el backend", async () => {
    Object.assign(navigator, { locks: { request: async (_name: string, _opts: unknown, callback: (lock: null) => unknown) => callback(null) } });
    const query = vi.fn();
    expect(await synchronizeProject({ query } as unknown as ConvexReactClient, "a", "p")).toBe("busy");
    expect(query).not.toHaveBeenCalled();
  });
  it("excluye ciclos simultáneos en la misma pestaña sin navigator.locks", async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    const query = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue(page());
    const client = { query } as unknown as ConvexReactClient;
    const first = synchronizeProject(client, "a", "p");
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(await synchronizeProject(client, "a", "p")).toBe("busy");
    finish(page()); expect(await first).toBe("completed"); expect(query).toHaveBeenCalledTimes(2);
  });
  it("no reenvía operaciones pausadas ni salta el backoff", async () => {
    await mergeRemoteEntries("a", "p", [row()]);
    await bitacoraDb.entries.update("a:entry", { syncState: "error" });
    const operation = { operationId: "operation", userId: "a", projectId: "p", entryClientId: "entry", operation: "update" as const, baseRevision: 1, removedAttachmentClientIds: [], status: "paused" as const, attempts: 1, createdAt: 1, updatedAt: 1 };
    await bitacoraDb.outbox.put(operation);
    const query = vi.fn().mockResolvedValue(page()); const mutation = vi.fn();
    const client = { query, mutation } as unknown as ConvexReactClient;
    await synchronizeProject(client, "a", "p"); expect(mutation).not.toHaveBeenCalled();
    await bitacoraDb.outbox.update("operation", { status: "pending", nextRetryAt: Date.now() + 60_000 });
    await synchronizeProject(client, "a", "p"); expect(mutation).not.toHaveBeenCalled();
    expect(await bitacoraDb.outbox.count()).toBe(1);
  });
  it("conserva el error de descarga por archivo sin fallar la sincronización de reportes", async () => {
    await mergeRemoteEntries("a", "p", [{ ...row(), fotos: [{ _id: "photo", client_id: "photo", kind: "photo", nombre: "Prueba.jpg", url: "https://example.test/photo" }] }]);
    await queueHistoricalAttachmentDownload("a", "photo");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const query = vi.fn().mockResolvedValue(page());
    expect(await synchronizeProject({ query } as unknown as ConvexReactClient, "a", "p")).toBe("completed");
    const file = await bitacoraDb.attachments.get("a:photo");
    expect(file?.downloadRequested).toBe(true); expect(file?.downloadError).toContain("descargar");
    expect((await bitacoraDb.syncMetadata.get("a:p"))?.status).toBe("idle");
  });
  it("explica una descarga solicitada sin original disponible en vez de dejarla esperando conexión", async () => {
    await mergeRemoteEntries("a", "p", [{ ...row(), documentos: [{ _id: "doc", client_id: "doc", kind: "document", nombre: "Prueba.pdf" }] }]);
    await queueHistoricalAttachmentDownload("a", "doc");
    const query = vi.fn().mockResolvedValue(page());
    expect(await synchronizeProject({ query } as unknown as ConvexReactClient, "a", "p")).toBe("completed");
    expect((await bitacoraDb.attachments.get("a:doc"))?.downloadError).toContain("no está disponible");
  });
  it("cuenta disponibilidad por original y limpia el error después de descargar", async () => {
    await mergeRemoteEntries("a", "p", [{ ...row(), documentos: [{ _id: "doc", client_id: "doc", kind: "document", nombre: "Prueba.pdf", url: "https://example.test/doc" }] }]);
    await bitacoraDb.attachments.update("a:doc", { downloadRequested: true, downloadError: "fallo anterior", thumbnail: new Blob(["miniatura"]) });
    const entry = (await bitacoraDb.entries.get("a:entry"))!;
    expect(toEntryView(entry, await bitacoraDb.attachments.toArray()).documentos[0].available_offline).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["original"]) }));
    await cacheHistoricalAttachment("a", "doc");
    const files = await bitacoraDb.attachments.toArray();
    expect(toEntryView(entry, files).documentos[0].available_offline).toBe(true);
    expect(files[0].downloadError).toBeUndefined(); expect(files[0].downloadRequested).toBe(false);
  });
});
