import type { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bitacoraDb, estimateStorage, MAX_ATTACHMENT_BYTES, projectScopeKey, scopedKey } from "./db";
import { mergeRemoteEntries } from "./repository";
import type { LocalAttachment, RemoteEntry } from "./types";

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

async function makeBlurThumbnail(source: Blob) {
  const sourceUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo preparar la miniatura."));
      image.src = sourceUrl;
    });
    const maxSide = 64;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.32));
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function cachePhotoThumbnails(userId: string, projectId: string) {
  const photos = (await bitacoraDb.attachments
    .where("[userId+projectId]")
    .equals([userId, projectId])
    .toArray())
    .filter((item) => item.kind === "photo" && !item.deleted && !item.blob && !item.thumbnail && item.url);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, photos.length) }, async () => {
    while (cursor < photos.length) {
      const photo = photos[cursor++];
      try {
        const response = await fetch(photo.url!);
        if (!response.ok) continue;
        const thumbnail = await makeBlurThumbnail(await response.blob());
        if (thumbnail) await bitacoraDb.attachments.update(photo.key, { thumbnail });
      } catch {
        // A generic blurred placeholder is used if a historical image cannot be read.
      }
    }
  });
  await Promise.all(workers);
}

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
) {
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
    await mergeRemoteEntries(userId, projectId, result.page);
    cursor = result.isDone ? null : result.continueCursor;
    latestVersion = Math.max(latestVersion, result.latestVersion);
  } while (cursor);
  await cachePhotoThumbnails(userId, projectId);

  const current = await bitacoraDb.syncMetadata.get(key);
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
) {
  let storageId = attachment.storageId;
  if (!storageId) {
    if (!attachment.blob) throw new Error(`No se encontró el original local de ${attachment.name}.`);
    const uploadUrl = await client.mutation(api.bitacoraOffline.generateBitacoraUploadUrl, {
      proyecto: projectId as Id<"desarrollos">,
      operationId,
      attachmentId: attachment.clientId,
    });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": attachment.mimeType || attachment.blob.type },
      body: attachment.blob,
    });
    if (!response.ok) throw new Error(`No se pudo subir ${attachment.name}.`);
    ({ storageId } = await response.json() as { storageId: string });
    await bitacoraDb.attachments.update(attachment.key, { storageId, syncState: "uploaded" });
  }
  await client.mutation(api.bitacoraOffline.registerBitacoraUpload, {
    proyecto: projectId as Id<"desarrollos">,
    operationId,
    attachmentId: attachment.clientId,
    storageId: storageId as Id<"_storage">,
    kind: attachment.kind,
  });
  return storageId;
}

async function pushOutbox(client: ConvexReactClient, userId: string, projectId: string) {
  const operations = await bitacoraDb.outbox
    .where("[userId+projectId]")
    .equals([userId, projectId])
    .sortBy("createdAt");

  for (const operation of operations) {
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
        const storageId = await uploadAttachment(client, projectId, operation.operationId, attachment);
        addedAttachments.push({
          clientId: attachment.clientId,
          storageId: storageId as Id<"_storage">,
          kind: attachment.kind,
          name: attachment.name,
          description: attachment.description,
        });
      }

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

async function runUnlocked(client: ConvexReactClient, userId: string, projectId: string) {
  await setSyncStatus(userId, projectId, "syncing");
  try {
    await pullProjectChanges(client, userId, projectId);
    await cacheRequestedAttachments(userId, projectId);
    await pushOutbox(client, userId, projectId);
    await pullProjectChanges(client, userId, projectId);
    const conflicts = await bitacoraDb.entries
      .where("[userId+projectId+syncState]")
      .equals([userId, projectId, "conflict"])
      .count();
    const errors = await bitacoraDb.entries
      .where("[userId+projectId+syncState]")
      .equals([userId, projectId, "error"])
      .count();
    await setSyncStatus(
      userId,
      projectId,
      conflicts ? "conflict" : errors ? "error" : "idle",
      errors ? "Hay operaciones rechazadas o que requieren corrección." : undefined,
    );
  } catch (error) {
    await setSyncStatus(userId, projectId, "error", error instanceof Error ? error.message : "No se pudo sincronizar.");
    throw error;
  }
}

export async function synchronizeProject(client: ConvexReactClient, userId: string, projectId: string) {
  const lockName = `ogc-bitacora-sync:${userId}:${projectId}`;
  if (navigator.locks?.request) {
    return navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await runUnlocked(client, userId, projectId);
    });
  }
  return runUnlocked(client, userId, projectId);
}

export async function cacheHistoricalAttachment(userId: string, attachmentClientId: string) {
  const attachment = await bitacoraDb.attachments.get(scopedKey(userId, attachmentClientId));
  if (!attachment || attachment.blob || !attachment.url) return;
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("No se pudo descargar el archivo.");
  const blob = await response.blob();
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("El archivo supera el máximo permitido de 10 MiB.");
  const capacity = await estimateStorage(blob.size);
  if (capacity.blocked) throw new Error("La descarga superaría el 80% de la cuota local.");
  await bitacoraDb.attachments.update(attachment.key, {
    blob,
    size: blob.size,
    mimeType: blob.type || attachment.mimeType,
    downloadRequested: false,
  });
}

export async function queueHistoricalAttachmentDownload(userId: string, attachmentClientId: string) {
  const updated = await bitacoraDb.attachments.update(scopedKey(userId, attachmentClientId), {
    downloadRequested: true,
  });
  if (!updated) throw new Error("No se encontró el archivo solicitado.");
}

async function cacheRequestedAttachments(userId: string, projectId: string) {
  const requested = (await bitacoraDb.attachments
    .where("[userId+projectId]")
    .equals([userId, projectId])
    .toArray())
    .filter((attachment) => attachment.downloadRequested && !attachment.blob && attachment.url);
  for (const attachment of requested) {
    try {
      await cacheHistoricalAttachment(userId, attachment.clientId);
    } catch {
      // Keep the durable request so a later synchronization can try again.
    }
  }
}
