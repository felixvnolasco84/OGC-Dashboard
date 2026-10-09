import "fake-indexeddb/auto";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bitacoraDb } from "./db";
import { canUseOnlineBitacora } from "./connection";
import { deleteEntryOnline, mergeOnlineEntries, saveEntryOnline, toOnlineEntryView } from "./online";
import type { BitacoraSaveArgs, RemoteEntry } from "./types";

const remote = (id = "server-1"): RemoteEntry => ({
  _id: id, client_id: `client-${id}`, proyecto: "project-1", revision: 3, sync_version: 7,
  updated_at: 1, uploaded_at: 1, categoria: "Estructura", partida_id: "partida-1", familias_tags: [],
  responsable: "Ada", fecha: "09/10/2026", avance_dia: "Colado", status: "Sin problemas", fotos: [], documentos: [],
});
const args: BitacoraSaveArgs = { fields: {
  categoria: "Estructura", partidaId: "partida-1", familiasTags: [], responsable: "Ada",
  fecha: "09/10/2026", avanceDia: "Colado", status: "Sin problemas",
}, newAttachments: [] };
const client = (mutation = vi.fn().mockResolvedValue({ status: "applied" })) => ({ mutation } as unknown as ConvexReactClient);

afterEach(() => { vi.restoreAllMocks(); bitacoraDb.close(); });

describe("selección automática de conexión", () => {
  it("usa online con servidor conectado aunque el navegador no mida la calidad", () => {
    expect(canUseOnlineBitacora(true, true)).toBe(true);
    expect(canUseOnlineBitacora(true, true, { effectiveType: "4g", downlink: 10, rtt: 50 })).toBe(true);
  });
  it.each([
    [false, true, undefined], [true, false, undefined], [true, true, { effectiveType: "2g" }],
    [true, true, { effectiveType: "slow-2g" }], [true, true, { downlink: 0.2 }], [true, true, { rtt: 1500 }],
  ])("usa respaldo cuando no hay conexión útil: %j", (network, backend, quality) => {
    expect(canUseOnlineBitacora(network as boolean, backend as boolean, quality as Parameters<typeof canUseOnlineBitacora>[2])).toBe(false);
  });
});

describe("guardado directo en servidor", () => {
  it("espera la confirmación remota y funciona con IndexedDB cerrado", async () => {
    bitacoraDb.close({ disableAutoOpen: true });
    let acknowledge!: (value: { status: string }) => void;
    const response = new Promise<{ status: string }>(resolve => { acknowledge = resolve; });
    const mutation = vi.fn().mockReturnValue(response);
    let finished = false;
    const saving = saveEntryOnline(client(mutation), "project-1", args, undefined, () => {}).then(result => { finished = true; return result; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(getFunctionName(mutation.mock.calls[0][0])).toBe("bitacoraOffline:applyOfflineOperation");
    acknowledge({ status: "applied" });
    expect(await saving).toEqual({ saved: "server" });
    expect(bitacoraDb.isOpen()).toBe(false);
  });
  it("conserva revisión, removidos y metadatos de archivos en una sola operación", async () => {
    const entry = toOnlineEntryView({ ...remote(), documentos: [
      { _id: "doc-1", nombre: "A.pdf" }, { _id: "doc-2", client_id: "doc-2", nombre: "B.pdf" },
    ] });
    const mutation = vi.fn().mockResolvedValue({ status: "applied" });
    await saveEntryOnline(client(mutation), "project-1", { ...args, entryClientId: entry.client_id,
      keptAttachmentClientIds: ["doc-2"], attachmentUpdates: [{ clientId: "doc-2", name: "Renombrado.pdf" }],
    }, entry, () => {});
    expect(mutation.mock.calls[0][1]).toMatchObject({ operation: "update", logId: "server-1", baseRevision: 3,
      removedAttachmentClientIds: ["legacy-document:doc-1"], updatedAttachments: [{ clientId: "doc-2", name: "Renombrado.pdf" }] });
  });
  it.each([{ status: "conflict" }, { status: "forbidden", message: "Acceso denegado" }, { status: "validation_error", message: "Partida inválida" }])("no anuncia guardado si el servidor rechaza: %j", async result => {
    await expect(saveEntryOnline(client(vi.fn().mockResolvedValue(result)), "project-1", args, undefined, () => {})).rejects.toThrow();
  });
  it("sube y registra originales antes de confirmar el reporte, sin cola local", async () => {
    const mutation = vi.fn().mockImplementation(async reference => getFunctionName(reference).endsWith("generateBitacoraUploadUrl") ? "https://example.test/upload" : { status: "applied" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ storageId: "storage-1" }) }));
    try {
      await saveEntryOnline(client(mutation), "project-1", { ...args, newAttachments: [
        { file: new File(["pdf"], "avance.pdf", { type: "application/pdf" }), kind: "document" },
      ] }, undefined, () => {});
      expect(mutation.mock.calls.map(call => getFunctionName(call[0]))).toEqual([
        "bitacoraOffline:generateBitacoraUploadUrl", "bitacoraOffline:registerBitacoraUpload", "bitacoraOffline:applyOfflineOperation",
      ]);
      expect(mutation.mock.calls[2][1].addedAttachments[0]).toMatchObject({ storageId: "storage-1", name: "avance.pdf" });
    } finally { vi.unstubAllGlobals(); }
  });
  it("detiene una subida si cambia la cuenta o el proyecto antes de aplicar", async () => {
    const mutation = vi.fn().mockResolvedValue("https://example.test/upload");
    let calls = 0;
    await expect(saveEntryOnline(client(mutation), "project-1", { ...args, newAttachments: [
      { file: new File(["pdf"], "avance.pdf", { type: "application/pdf" }), kind: "document" },
    ] }, undefined, () => { if (++calls === 3) throw new Error("scope changed"); })).rejects.toThrow("scope changed");
    expect(mutation).toHaveBeenCalledTimes(1);
  });
  it("elimina directamente y no vuelve a crear una operación local", async () => {
    const mutation = vi.fn().mockResolvedValue({ status: "applied" });
    expect(await deleteEntryOnline(client(mutation), "project-1", toOnlineEntryView(remote()), () => {})).toBe("server");
    expect(mutation.mock.calls[0][1]).toMatchObject({ operation: "delete", baseRevision: 3, logId: "server-1" });
  });
});

describe("recuperación de conexión", () => {
  it("conserva pendientes y conflictos, sin resucitar eliminaciones ni duplicar filas", () => {
    const server = [remote(), remote("server-2"), remote("server-3")].map(toOnlineEntryView);
    const pending = { ...server[0], avance_dia: "Cambio offline", sync_state: "pending" as const };
    const conflict = { ...server[2], sync_state: "conflict" as const };
    const newEntry = { ...toOnlineEntryView(remote("new")), server_id: undefined, sync_state: "pending" as const };
    const result = mergeOnlineEntries(server, [pending, conflict, newEntry], server.map(entry => entry.client_id).concat(newEntry.client_id));
    expect(result.map(entry => entry.client_id)).toEqual([pending.client_id, conflict.client_id, newEntry.client_id]);
    expect(result[0].avance_dia).toBe("Cambio offline");
    expect(result[1].sync_state).toBe("conflict");
  });
  it("usa datos reactivos del servidor y conserva solo los originales descargados de la caché", () => {
    const entry = toOnlineEntryView({ ...remote(), fotos: [{ _id: "photo", client_id: "photo", url: "https://example.test/new.jpg" }] });
    const cached = { ...entry, avance_dia: "Versión vieja", fotos: [{ ...entry.fotos[0], local_url: "blob:cached", available_offline: true }] };
    const [result] = mergeOnlineEntries([entry], [cached], []);
    expect(result.avance_dia).toBe("Colado");
    expect(result.fotos[0]).toMatchObject({ url: "https://example.test/new.jpg", local_url: "blob:cached", available_offline: true });
  });
});
