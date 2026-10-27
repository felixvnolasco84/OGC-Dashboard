import "fake-indexeddb/auto";
import Dexie from "dexie";
import type { ConvexReactClient } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canEditBitacora } from "../../../convex/bitacoraRules";
import { bitacoraDb } from "./db";
import { mergeRemoteEntries, reapplyLocalVersion, saveEntryLocally } from "./repository";
import { saveEntryOnline, toOnlineEntryView } from "./online";
import { synchronizeProject } from "./sync";
import type { BitacoraFields, BitacoraSaveArgs, RemoteEntry } from "./types";

const fields: BitacoraFields = { categoria: "Estructura", partidaId: "partida", familiasTags: ["Histórica"], responsable: "Ana", fecha: "27/10/2026", avanceDia: "Avance original", comentarios: "Incidencia", status: "Sin problemas" };
const remote = (overrides: Partial<RemoteEntry> = {}): RemoteEntry => ({ _id: "server", proyecto: "project", client_id: "entry", created_by: "actor", revision: 1, sync_version: 1, updated_at: 1, uploaded_at: 1,
  categoria: fields.categoria, partida_id: fields.partidaId, familias_tags: fields.familiasTags, responsable: fields.responsable, fecha: fields.fecha, avance_dia: fields.avanceDia, comentarios: fields.comentarios, status: fields.status,
  fotos: [{ _id: "photo-server", client_id: "photo", kind: "photo", nombre: "obra.png", descripcion: "" }],
  documentos: [{ _id: "document-server", client_id: "document", kind: "document", nombre: "obra.pdf", descripcion: "Original" }], ...overrides });
const save = (overrides: Partial<BitacoraSaveArgs> = {}, role = "user") => saveEntryLocally({ userId: "actor", projectId: "project", role, entryClientId: "entry", expectedRevision: 1,
  fields: { ...fields, avanceDia: "Corrección local" }, newAttachments: [], ...overrides });

beforeEach(async () => {
  vi.stubGlobal("navigator", { onLine: true, storage: { estimate: async () => ({ usage: 0, quota: 1e8 }) } });
  await bitacoraDb.delete(); await bitacoraDb.open();
});
afterEach(async () => { await bitacoraDb.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("permisos y persistencia de ediciones", () => {
  it("el autor corrige notas, descripciones y añade fotos, conservando archivos al recargar", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await save({ newAttachments: [{ kind: "photo", file: new File(["foto"], "nueva.png", { type: "image/png" }), description: "Foto adicional" }], attachmentUpdates: [{ clientId: "photo", description: "Ortografía corregida" }] });
    bitacoraDb.close(); await bitacoraDb.open();
    expect(await bitacoraDb.entries.get("actor:entry")).toMatchObject({ createdBy: "actor", avanceDia: "Corrección local", baseRevision: 1 });
    expect(await bitacoraDb.attachments.get("actor:photo")).toMatchObject({ description: "Ortografía corregida" });
    expect(await bitacoraDb.attachments.get("actor:document")).toMatchObject({ description: "Original", deleted: false });
    expect(await bitacoraDb.attachments.count()).toBe(3);
  });
  it.each(["other", undefined])("no infiere autoría de la cuenta que descargó un registro con autor %s", async owner => {
    await mergeRemoteEntries("actor", "project", [remote({ created_by: owner })]);
    await expect(save()).rejects.toThrow("autor");
    expect(await bitacoraDb.outbox.count()).toBe(0);
  });
  it.each(["viewer", "almacenista", "unknown"])("rechaza al autor con rol %s", async role => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await expect(save({}, role)).rejects.toThrow("autor");
  });
  it.each([
    { fields: { ...fields, fecha: "28/10/2026" } },
    { fields: { ...fields, status: "Con retrasos" } },
    { keptAttachmentClientIds: ["document"] },
    { attachmentUpdates: [{ clientId: "document", description: "Cambio" }] },
    { newAttachments: [{ kind: "document" as const, file: new File(["pdf"], "nuevo.pdf", { type: "application/pdf" }) }] },
  ])("rechaza cambios fuera del alcance del autor de forma atómica", async args => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await expect(save(args)).rejects.toThrow("administrador");
    expect((await bitacoraDb.entries.get("actor:entry"))?.avanceDia).toBe("Avance original");
    expect(await bitacoraDb.outbox.count()).toBe(0);
    expect(await bitacoraDb.attachments.count()).toBe(2);
  });
  it("asigna autor a capturas nuevas y lo conserva cuando las edita un administrador", async () => {
    const created = await saveEntryLocally({ userId: "actor", projectId: "project", role: "contratista", fields, newAttachments: [] });
    expect(created.entry.createdBy).toBe("actor");
    await save({ entryClientId: created.entry.clientId, expectedRevision: 0 });
    await mergeRemoteEntries("actor", "project", [remote({ created_by: "other" })]);
    await save({}, "admin");
    expect((await bitacoraDb.entries.get("actor:entry"))?.createdBy).toBe("other");
  });
  it("una descarga completa de la misma revisión conserva borrador, descripciones, blobs y cola", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await bitacoraDb.attachments.update("actor:photo", { blob: new Blob(["original"]) });
    await save({ attachmentUpdates: [{ clientId: "photo", description: "Descripción local" }] });
    const operation = (await bitacoraDb.outbox.toArray())[0];
    await mergeRemoteEntries("actor", "project", [remote()]);
    expect(await bitacoraDb.entries.get("actor:entry")).toMatchObject({ avanceDia: "Corrección local", syncState: "pending", createdBy: "actor" });
    expect(await bitacoraDb.attachments.get("actor:photo")).toMatchObject({ description: "Descripción local", originalDescription: "" });
    expect((await bitacoraDb.attachments.get("actor:photo"))?.blob?.size).toBe(8);
    expect((await bitacoraDb.outbox.toArray())[0]).toEqual(operation);
  });
  it("una revisión mayor crea conflicto sin perder datos; reaplicar revalida permisos", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]); await save();
    await mergeRemoteEntries("actor", "project", [remote({ revision: 2, avance_dia: "Versión remota" })]);
    expect(await bitacoraDb.entries.get("actor:entry")).toMatchObject({ avanceDia: "Corrección local", syncState: "conflict" });
    await expect(reapplyLocalVersion("actor", "entry", "viewer")).rejects.toThrow("autor");
    await reapplyLocalVersion("actor", "entry", "user");
    expect(await bitacoraDb.entries.get("actor:entry")).toMatchObject({ baseRevision: 2, avanceDia: "Corrección local", createdBy: "actor", syncState: "pending" });
  });
  it("rechaza reaplicar campos protegidos que cambiaron remotamente y conserva el conflicto", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]); await save();
    await mergeRemoteEntries("actor", "project", [remote({ revision: 2, fecha: "28/10/2026" })]);
    await expect(reapplyLocalVersion("actor", "entry", "user")).rejects.toThrow("administrador");
    expect((await bitacoraDb.entries.get("actor:entry"))?.syncState).toBe("conflict");
  });
  it("reaplica notas sin deshacer descripciones remotas ni perder fotos añadidas por otra persona", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]); await save();
    await mergeRemoteEntries("actor", "project", [remote({ revision: 2, fotos: [
      { ...remote().fotos![0], descripcion: "Descripción del administrador" },
      { _id: "remote-added", client_id: "remote-added", kind: "photo", nombre: "remota.png", descripcion: "Añadida remotamente" },
    ] })]);
    await reapplyLocalVersion("actor", "entry", "user");
    expect((await bitacoraDb.attachments.get("actor:photo"))?.description).toBe("Descripción del administrador");
    expect((await bitacoraDb.attachments.get("actor:remote-added"))?.description).toBe("Añadida remotamente");
    expect((await bitacoraDb.entries.get("actor:entry"))?.avanceDia).toBe("Corrección local");
  });
  it("recupera un upload confirmado sin perder una descripción editada después de perder la respuesta", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await save({ newAttachments: [{ clientId: "added", kind: "photo", file: new File(["foto"], "nueva.png", { type: "image/png" }), description: "Original nueva" }] });
    await save({ attachmentUpdates: [{ clientId: "added", description: "Corrección posterior" }] });
    await mergeRemoteEntries("actor", "project", [remote({ revision: 2, fotos: [...remote().fotos!,
      { _id: "added-server", client_id: "added", kind: "photo", nombre: "nueva.png", descripcion: "Original nueva" },
    ] })]);
    await reapplyLocalVersion("actor", "entry", "user");
    expect(await bitacoraDb.attachments.get("actor:added")).toMatchObject({ serverId: "added-server", syncState: "synced", description: "Corrección posterior", originalDescription: "Original nueva" });
  });
  it("no guarda una edición abierta sobre una revisión anterior, local ni online", async () => {
    await mergeRemoteEntries("actor", "project", [remote({ revision: 2 })]);
    await expect(save()).rejects.toThrow("cambió");
    const mutation = vi.fn();
    await expect(saveEntryOnline({ mutation } as unknown as ConvexReactClient, "project", { entryClientId: "entry", expectedRevision: 1, fields, newAttachments: [] }, toOnlineEntryView(remote({ revision: 2 })), () => {})).rejects.toThrow("cambió");
    expect(mutation).not.toHaveBeenCalled(); expect(await bitacoraDb.outbox.count()).toBe(0);
  });
  it("sincroniza solo descripciones modificadas y conserva operaciones rechazadas por permisos", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await save({ attachmentUpdates: [{ clientId: "photo", description: "Corregida" }] });
    const query = vi.fn().mockResolvedValue({ page: [remote()], isDone: true, continueCursor: "", latestVersion: 1 });
    const mutation = vi.fn().mockResolvedValue({ status: "forbidden", message: "Permiso revocado" });
    await synchronizeProject({ query, mutation } as unknown as ConvexReactClient, "actor", "project");
    expect(mutation.mock.calls[0][1]).toMatchObject({ baseRevision: 1, updatedAttachments: [{ clientId: "photo", description: "Corregida" }] });
    expect(await bitacoraDb.entries.get("actor:entry")).toMatchObject({ syncState: "error", syncError: "Permiso revocado", avanceDia: "Corrección local" });
    expect((await bitacoraDb.outbox.toArray())[0].status).toBe("paused");
  });
  it("migra caché v1 sin borrar pendientes y fuerza hidratación del autor desde el servidor", async () => {
    await mergeRemoteEntries("actor", "project", [remote()]);
    await save({ newAttachments: [{ kind: "photo", file: new File(["blob"], "nueva.png", { type: "image/png" }), description: "Pendiente" }] });
    const draft = await saveEntryLocally({ userId: "actor", projectId: "project", role: "user", fields, newAttachments: [] });
    const stores = Object.fromEntries(bitacoraDb.tables.map(table => [table.name, [table.schema.primKey.src, ...table.schema.indexes.map(index => index.src)].join(",")]));
    const entries = (await bitacoraDb.entries.toArray()).map(entry => ({ ...entry, createdBy: undefined }));
    const attachments = await bitacoraDb.attachments.toArray(), operations = await bitacoraDb.outbox.toArray();
    await bitacoraDb.delete();
    const old = new Dexie("ogc-bitacora-offline"); old.version(1).stores(stores); await old.open();
    await old.table("entries").bulkPut(entries); await old.table("attachments").bulkPut(attachments); await old.table("outbox").bulkPut(operations);
    await old.table("syncMetadata").put({ key: "actor:project", userId: "actor", projectId: "project", version: 8, prepared: true, status: "idle" });
    old.close(); await bitacoraDb.open();
    expect((await bitacoraDb.syncMetadata.get("actor:project"))?.version).toBe(0);
    expect((await bitacoraDb.entries.get(draft.entry.key))?.createdBy).toBe("actor");
    expect((await bitacoraDb.entries.get("actor:entry"))?.createdBy).toBeUndefined();
    expect(await bitacoraDb.outbox.toArray()).toEqual(operations);
    expect((await bitacoraDb.attachments.toArray()).find(file => file.blob)?.blob?.size).toBe(4);
    const query = vi.fn().mockResolvedValue({ page: [remote()], isDone: true, continueCursor: "", latestVersion: 8 });
    const { pullProjectChanges } = await import("./sync");
    await pullProjectChanges({ query } as unknown as ConvexReactClient, "actor", "project");
    expect(query.mock.calls[0][1].afterVersion).toBe(0);
    expect(await bitacoraDb.entries.get("actor:entry")).toMatchObject({ createdBy: "actor", avanceDia: "Corrección local", syncState: "pending" });
    expect(canEditBitacora("user", "actor", (await bitacoraDb.entries.get("actor:entry"))?.createdBy)).toBe(true);
  });
});
