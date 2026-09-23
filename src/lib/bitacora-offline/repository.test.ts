import "fake-indexeddb/auto";
import type { ConvexReactClient } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bitacoraDb, findValidOfflineProfile, OFFLINE_PROFILE_TTL_MS } from "./db";
import { acceptServerVersion, deleteEntryLocally, mergeRemoteEntries, saveEntryLocally } from "./repository";
import { pullProjectChanges, queueHistoricalAttachmentDownload } from "./sync";
import type { BitacoraFields, OfflineProfile, RemoteEntry } from "./types";

const fields: BitacoraFields = {
  categoria: "Estructura",
  partidaId: "partida-1",
  familiasTags: ["Concreto"],
  responsable: "Ada",
  fecha: "13/09/2026",
  avanceDia: "Colado de losa",
  comentarios: "Sin incidencias",
  status: "Sin problemas",
};

function setQuota(usage: number, quota: number) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { estimate: async () => ({ usage, quota }), persist: async () => true } },
  });
}

function remote(overrides: Partial<RemoteEntry> = {}): RemoteEntry {
  return {
    _id: "server-1",
    proyecto: "project-1",
    client_id: "client-1",
    revision: 1,
    sync_version: 1,
    updated_at: Date.now(),
    categoria: fields.categoria,
    partida_id: fields.partidaId,
    familias_tags: fields.familiasTags,
    responsable: fields.responsable,
    fecha: fields.fecha,
    avance_dia: fields.avanceDia,
    comentarios: fields.comentarios,
    status: fields.status,
    uploaded_at: Date.now(),
    fotos: [],
    documentos: [],
    ...overrides,
  };
}

describe("BitacoraRepository offline", () => {
  beforeEach(async () => {
    setQuota(0, 100 * 1024 * 1024);
    await bitacoraDb.delete();
    await bitacoraDb.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await bitacoraDb.delete();
  });

  it("persiste atómicamente reporte, blob y outbox a través de un cierre", async () => {
    const saved = await saveEntryLocally({
      userId: "user-a",
      projectId: "project-1",
      role: "contratista",
      fields,
      newAttachments: [{
        file: new File(["foto-original"], "obra.png", { type: "image/png" }),
        kind: "photo",
        description: "Avance de losa",
      }],
    });

    expect(await bitacoraDb.entries.count()).toBe(1);
    expect(await bitacoraDb.outbox.count()).toBe(1);
    expect((await bitacoraDb.attachments.toArray())[0].blob?.size).toBeGreaterThan(0);
    await bitacoraDb.close();
    await bitacoraDb.open();
    expect((await bitacoraDb.entries.get(saved.entry.key))?.avanceDia).toBe("Colado de losa");
    expect((await bitacoraDb.outbox.toArray())[0].operation).toBe("create");
  });

  it("crear y eliminar antes de sincronizar no produce una llamada remota", async () => {
    const saved = await saveEntryLocally({ userId: "user-a", projectId: "project-1", role: "admin", fields, newAttachments: [] });
    await deleteEntryLocally("user-a", "project-1", "admin", saved.entry.clientId);
    expect(await bitacoraDb.entries.count()).toBe(0);
    expect(await bitacoraDb.outbox.count()).toBe(0);
  });

  it("mantiene los datos de usuarios separados", async () => {
    await saveEntryLocally({ userId: "user-a", projectId: "project-1", role: "user", fields, newAttachments: [] });
    await saveEntryLocally({ userId: "user-b", projectId: "project-1", role: "user", fields: { ...fields, responsable: "Grace" }, newAttachments: [] });
    expect(await bitacoraDb.entries.where("[userId+projectId]").equals(["user-a", "project-1"]).count()).toBe(1);
    expect(await bitacoraDb.entries.where("[userId+projectId]").equals(["user-b", "project-1"]).count()).toBe(1);
  });

  it("rechaza perfiles offline vencidos después de siete días", async () => {
    const now = Date.now();
    const profile: OfflineProfile = {
      clerkId: "user-a",
      userId: "user-a",
      name: "Ada",
      email: "ada@example.com",
      role: "admin",
      projectIds: ["project-1"],
      verifiedAt: now - OFFLINE_PROFILE_TTL_MS - 1,
      expiresAt: now - 1,
    };
    await bitacoraDb.offlineProfiles.put(profile);
    expect(await findValidOfflineProfile("project-1", now)).toBeUndefined();
  });

  it("bloquea el guardado antes de superar 80% de cuota", async () => {
    setQuota(790, 1000);
    await expect(saveEntryLocally({
      userId: "user-a",
      projectId: "project-1",
      role: "user",
      fields,
      newAttachments: [{ file: new File(["1234567890"], "evidencia.pdf", { type: "application/pdf" }), kind: "document" }],
    })).rejects.toThrow("80%");
    expect(await bitacoraDb.entries.count()).toBe(0);
  });

  it("detecta revisiones concurrentes y conserva la versión local", async () => {
    await mergeRemoteEntries("user-a", "project-1", [remote()]);
    await saveEntryLocally({
      userId: "user-a",
      projectId: "project-1",
      role: "admin",
      entryClientId: "client-1",
      fields: { ...fields, avanceDia: "Cambio local" },
      newAttachments: [],
    });
    await mergeRemoteEntries("user-a", "project-1", [remote({ revision: 2, avance_dia: "Cambio servidor" })]);
    const conflicted = await bitacoraDb.entries.get("user-a:client-1");
    expect(conflicted?.syncState).toBe("conflict");
    expect(conflicted?.avanceDia).toBe("Cambio local");
    expect(conflicted?.serverSnapshot?.avance_dia).toBe("Cambio servidor");
    await acceptServerVersion("user-a", "client-1");
    expect((await bitacoraDb.entries.get("user-a:client-1"))?.avanceDia).toBe("Cambio servidor");
    expect(await bitacoraDb.outbox.count()).toBe(0);
  });

  it("aplica tombstones remotos sin resucitar reportes sincronizados", async () => {
    await mergeRemoteEntries("user-a", "project-1", [remote()]);
    await mergeRemoteEntries("user-a", "project-1", [remote({ revision: 2, sync_version: 2, deleted_at: Date.now() })]);
    const deleted = await bitacoraDb.entries.get("user-a:client-1");
    expect(deleted?.deleted).toBe(true);
    expect(deleted?.revision).toBe(2);
    expect(deleted?.syncState).toBe("synced");
  });

  it("conserva una solicitud de descarga hecha sin conexión", async () => {
    await mergeRemoteEntries("user-a", "project-1", [remote({
      fotos: [{
        _id: "photo-server-1",
        client_id: "photo-client-1",
        kind: "photo",
        nombre: "avance.jpg",
        url: "https://example.test/avance.jpg",
      }],
    })]);
    await queueHistoricalAttachmentDownload("user-a", "photo-client-1");
    await bitacoraDb.close();
    await bitacoraDb.open();
    const photo = await bitacoraDb.attachments.get("user-a:photo-client-1");
    expect(photo?.downloadRequested).toBe(true);
    expect(photo?.blob).toBeUndefined();
  });

  it("sincroniza metadatos sin descargar fotografías históricas", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const query = vi.fn().mockResolvedValue({
      page: [remote({
        fotos: [{
          _id: "photo-server-1",
          client_id: "photo-client-1",
          kind: "photo",
          nombre: "avance.jpg",
          url: "https://example.test/avance.jpg",
        }],
      })],
      continueCursor: "",
      isDone: true,
      latestVersion: 1,
    });

    await pullProjectChanges({ query } as unknown as ConvexReactClient, "user-a", "project-1");

    expect(fetchSpy).not.toHaveBeenCalled();
    const photo = await bitacoraDb.attachments.get("user-a:photo-client-1");
    expect(photo?.url).toBe("https://example.test/avance.jpg");
    expect(photo?.blob).toBeUndefined();
    expect(photo?.thumbnail).toBeUndefined();
  });

  it("guarda localmente los cambios de descripción de fotografías existentes", async () => {
    await mergeRemoteEntries("user-a", "project-1", [remote({
      fotos: [{
        _id: "photo-server-1",
        client_id: "photo-client-1",
        kind: "photo",
        nombre: "Estructura - Foto",
        descripcion: "Descripción anterior",
        url: "https://example.test/avance.jpg",
      }],
    })]);
    await saveEntryLocally({
      userId: "user-a",
      projectId: "project-1",
      role: "admin",
      entryClientId: "client-1",
      fields,
      newAttachments: [],
      keptAttachmentClientIds: ["photo-client-1"],
      attachmentUpdates: [{ clientId: "photo-client-1", description: "Descripción actualizada" }],
    });
    const photo = await bitacoraDb.attachments.get("user-a:photo-client-1");
    expect(photo?.description).toBe("Descripción actualizada");
    expect((await bitacoraDb.outbox.toArray())[0].operation).toBe("update");
  });
});
