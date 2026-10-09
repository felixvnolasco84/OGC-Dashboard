import type { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bitacoraDb, estimateStorage, MAX_ATTACHMENT_BYTES, projectScopeKey, scopedKey } from "./db";
import { mergeRemoteEntries } from "./repository";
import type { LocalAttachment, PreparationPhase, RemoteEntry } from "./types";
import { BitacoraScopeChanged } from "./preparation";

export interface SyncOptions {
  onPhase?: (phase: PreparationPhase) => void;
  assertActive?: () => void;
}

type PullResult = {
  page: RemoteEntry[];
  continueCursor: string;
  isDone: boolean;
  latestVersion: number;
};

type ApplyResult =
  | { status: "applied"; logId: string; revision: number; syncVersion: number }
  | { status: "conflict"; reason: "changed" | "deleted"; server: RemoteEntry | null }
  | { status: "forbidden" | "validation_error"; message: string };

async function setSyncStatus(
  userId: string,
  projectId: string,
  status: "idle" | "syncing" | "error" | "conflict",
  error?: string,
) {
  const key = projectScopeKey(userId, projectId);
  const current = await bitacoraDb.syncMetadata.get(key);
  await bitacoraDb.syncMetadata.put({
    key,
    userId,
    projectId,
    version: current?.version ?? 0,
    prepared: current?.prepared ?? false,
    lastSyncAt: current?.lastSyncAt,
    status,
    error,
  });
}

export async function pullProjectChanges(
  client: ConvexReactClient,
  userId: string,
  projectId: string,
  options: SyncOptions = {},
) {
  options.assertActive?.();
  const key = projectScopeKey(userId, projectId);
  const metadata = await bitacoraDb.syncMetadata.get(key);
  const afterVersion = metadata?.version ?? 0;
  let cursor: string | null = null;
  let latestVersion = afterVersion;
  do {
    const result = await client.query(api.bitacoraOffline.pullChanges, {
      proyecto: projectId as Id<"desarrollos">,
      afterVersion,
      paginationOpts: { numItems: 100, cursor },
    }) as PullResult;
    options.assertActive?.();
    await mergeRemoteEntries(userId, projectId, result.page);
    cursor = result.isDone ? null : result.continueCursor;
    latestVersion = Math.max(latestVersion, result.latestVersion);
  } while (cursor);
  const current = await bitacoraDb.syncMetadata.get(key);
  options.assertActive?.();
  await bitacoraDb.syncMetadata.put({
    key,
    userId,
    projectId,
    version: latestVersion,
    prepared: true,
    lastSyncAt: Date.now(),
    status: current?.status ?? "idle",
    error: current?.error,
  });
}

async function uploadAttachment(
  client: ConvexReactClient,
  projectId: string,
  operationId: string,
  attachment: LocalAttachment,
  options: SyncOptions,
) {
  options.assertActive?.();
  let storageId = attachment.storageId;
  if (!storageId) {
    if (!attachment.blob) throw new Error(`No se encontró el original local de ${attachment.name}.`);
    const uploadUrl = await client.mutation(api.bitacoraOffline.generateBitacoraUploadUrl, {
      proyecto: projectId as Id<"desarrollos">,
      operationId,
      attachmentId: attachment.clientId,
    });
    options.assertActive?.();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": attachment.mimeType || attachment.blob.type },
      body: attachment.blob,
    });
    if (!response.ok) throw new Error(`No se pudo subir ${attachment.name}.`);
    ({ storageId } = await response.json() as { storageId: string });
    options.assertActive?.();
    await bitacoraDb.attachments.update(attachment.key, { storageId, syncState: "uploaded" });
  }
  options.assertActive?.();
  await client.mutation(api.bitacoraOffline.registerBitacoraUpload, {
    proyecto: projectId as Id<"desarrollos">,
    operationId,
    attachmentId: attachment.clientId,
    storageId: storageId as Id<"_storage">,
    kind: attachment.kind,
  });
  return storageId;
}

async function pushOutbox(client: ConvexReactClient, userId: string, projectId: string, options: SyncOptions) {
  const operations = await bitacoraDb.outbox
    .where("[userId+projectId]")
    .equals([userId, projectId])
    .sortBy("createdAt");

  for (const operation of operations) {
    options.assertActive?.();
    if (operation.status === "paused") continue;
    if (operation.nextRetryAt && operation.nextRetryAt > Date.now()) continue;
    const entry = await bitacoraDb.entries.get(scopedKey(userId, operation.entryClientId));
    if (!entry || entry.syncState === "conflict") continue;
    await bitacoraDb.outbox.update(operation.operationId, { status: "syncing", updatedAt: Date.now() });
    await bitacoraDb.entries.update(entry.key, { syncState: "syncing", syncError: undefined });

    try {
      const attachments = await bitacoraDb.attachments
        .where("[userId+entryClientId]")
        .equals([userId, entry.clientId])
        .toArray();
      const pendingAttachments = operation.operation === "delete"
        ? []
        : attachments.filter((item) => !item.deleted && item.syncState !== "synced");
      const addedAttachments = [];
      for (const attachment of pendingAttachments) {
        const storageId = await uploadAttachment(client, projectId, operation.operationId, attachment, options);
        addedAttachments.push({
          clientId: attachment.clientId,
          storageId: storageId as Id<"_storage">,
          kind: attachment.kind,
          name: attachment.name,
          description: attachment.description,
        });
      }

      options.assertActive?.();
      const result = await client.mutation(api.bitacoraOffline.applyOfflineOperation, {
        operationId: operation.operationId,
        clientId: entry.clientId,
        proyecto: projectId as Id<"desarrollos">,
        operation: operation.operation,
        baseRevision: operation.baseRevision,
        logId: entry.serverId as Id<"bitacora"> | undefined,
        payload: operation.operation === "delete" ? undefined : {
          categoria: entry.categoria,
          partida_id: entry.partidaId as Id<"partidas">,
          familias_tags: entry.familiasTags,
          responsable: entry.responsable,
          fecha: entry.fecha,
          avance_dia: entry.avanceDia,
          comentarios: entry.comentarios,
          status: entry.status,
        },
        addedAttachments,
        updatedAttachments: attachments
          .filter((item) => !item.deleted && item.syncState === "synced")
          .map((item) => ({ clientId: item.clientId, name: item.name, description: item.description })),
        removedAttachmentClientIds: operation.removedAttachmentClientIds,
      }) as ApplyResult;
      options.assertActive?.();

      if (result.status === "applied") {
        await bitacoraDb.transaction("rw", [bitacoraDb.entries, bitacoraDb.attachments, bitacoraDb.outbox], async () => {
          await bitacoraDb.entries.update(entry.key, {
            serverId: result.logId,
            revision: result.revision,
            baseRevision: result.revision,
            syncVersion: result.syncVersion,
            syncState: "synced",
            syncError: undefined,
          });
          for (const attachment of attachments) {
            if (attachment.deleted) await bitacoraDb.attachments.delete(attachment.key);
            else if (attachment.storageId) await bitacoraDb.attachments.update(attachment.key, { syncState: "synced" });
          }
          await bitacoraDb.outbox.delete(operation.operationId);
        });
        continue;
      }

      if (result.status === "conflict") {
        await bitacoraDb.entries.update(entry.key, {
          syncState: "conflict",
          syncError: result.reason === "deleted" ? "El reporte fue eliminado en el servidor." : "El reporte cambió en el servidor.",
          serverSnapshot: result.server ?? undefined,
        });
        await bitacoraDb.outbox.update(operation.operationId, { status: "paused", error: "conflict", updatedAt: Date.now() });
        continue;
      }

      await bitacoraDb.entries.update(entry.key, { syncState: "error", syncError: result.message });
      await bitacoraDb.outbox.update(operation.operationId, { status: "paused", error: result.message, updatedAt: Date.now() });
    } catch (error) {
      if (error instanceof BitacoraScopeChanged) throw error;
      const message = error instanceof Error ? error.message : "Error de red durante la sincronización.";
      const attempts = operation.attempts + 1;
      await bitacoraDb.entries.update(entry.key, { syncState: "error", syncError: message });
      await bitacoraDb.outbox.update(operation.operationId, {
        status: "pending",
        attempts,
        error: message,
        nextRetryAt: Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)),
        updatedAt: Date.now(),
      });
      throw error;
    }
  }
}

async function runUnlocked(client: ConvexReactClient, userId: string, projectId: string, options: SyncOptions) {
  options.assertActive?.();
  await setSyncStatus(userId, projectId, "syncing");
  try {
    options.onPhase?.("pull");
    await pullProjectChanges(client, userId, projectId, options);
    const requested = await bitacoraDb.attachments.where("[userId+projectId]").equals([userId, projectId])
      .filter((item) => !item.deleted && Boolean(item.downloadRequested && !item.blob)).count();
    if (requested) options.onPhase?.("downloads");
    await cacheRequestedAttachments(userId, projectId, options);
    const pending = await bitacoraDb.outbox.where("[userId+projectId]").equals([userId, projectId])
      .filter((item) => item.status !== "paused" && (!item.nextRetryAt || item.nextRetryAt <= Date.now())).count();
    if (pending) options.onPhase?.("push");
    await pushOutbox(client, userId, projectId, options);
    options.onPhase?.("refresh");
    await pullProjectChanges(client, userId, projectId, options);
    const conflicts = await bitacoraDb.entries
      .where("[userId+projectId+syncState]")
      .equals([userId, projectId, "conflict"])
      .count();
    const errors = await bitacoraDb.entries
      .where("[userId+projectId+syncState]")
      .equals([userId, projectId, "error"])
      .count();
    options.assertActive?.();
    await setSyncStatus(
      userId,
      projectId,
      conflicts ? "conflict" : errors ? "error" : "idle",
      errors ? "Hay operaciones rechazadas o que requieren corrección." : undefined,
    );
  } catch (error) {
    if (error instanceof BitacoraScopeChanged) throw error;
    await setSyncStatus(userId, projectId, "error", error instanceof Error ? error.message : "No se pudo sincronizar.");
    throw error;
  }
}

const activeSyncs = new Set<string>();

export async function synchronizeProject(client: ConvexReactClient, userId: string, projectId: string, options: SyncOptions = {}): Promise<"completed" | "busy"> {
  const lockName = `ogc-bitacora-sync:${userId}:${projectId}`;
  if (activeSyncs.has(lockName)) return "busy";
  activeSyncs.add(lockName);
  try {
    if (navigator.locks?.request) {
      return await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
        if (!lock) return "busy" as const;
        await runUnlocked(client, userId, projectId, options);
        return "completed" as const;
      });
    }
    await runUnlocked(client, userId, projectId, options);
    return "completed";
  } finally {
    activeSyncs.delete(lockName);
  }
}

export async function cacheHistoricalAttachment(userId: string, attachmentClientId: string, options: SyncOptions = {}) {
  const attachment = await bitacoraDb.attachments.get(scopedKey(userId, attachmentClientId));
  if (!attachment || attachment.deleted) throw new Error("No se encontró el archivo solicitado.");
  if (attachment.blob) return;
  if (!attachment.url) throw new Error("El original de este archivo no está disponible para descargar.");
  options.assertActive?.();
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("No se pudo descargar el archivo.");
  const blob = await response.blob();
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("El archivo supera el máximo permitido de 10 MiB.");
  const capacity = await estimateStorage(blob.size);
  if (capacity.blocked) throw new Error("La descarga superaría el 80% de la cuota local.");
  options.assertActive?.();
  await bitacoraDb.attachments.update(attachment.key, {
    blob,
    size: blob.size,
    mimeType: blob.type || attachment.mimeType,
    downloadRequested: false,
    downloadError: undefined,
  });
}

export async function queueHistoricalAttachmentDownload(userId: string, attachmentClientId: string) {
  const updated = await bitacoraDb.attachments.update(scopedKey(userId, attachmentClientId), {
    downloadRequested: true,
    downloadError: undefined,
  });
  if (!updated) throw new Error("No se encontró el archivo solicitado.");
}

async function cacheRequestedAttachments(userId: string, projectId: string, options: SyncOptions) {
  const requested = (await bitacoraDb.attachments
    .where("[userId+projectId]")
    .equals([userId, projectId])
    .toArray())
    .filter((attachment) => !attachment.deleted && attachment.downloadRequested && !attachment.blob);
  for (const attachment of requested) {
    try {
      options.assertActive?.();
      await cacheHistoricalAttachment(userId, attachment.clientId, options);
    } catch (error) {
      if (error instanceof BitacoraScopeChanged) throw error;
      options.assertActive?.();
      // Keep the request and explain the failure on the existing file control.
      await bitacoraDb.attachments.update(attachment.key, {
        downloadError: error instanceof Error ? error.message : "No se pudo descargar el archivo.",
      });
    }
  }
}
