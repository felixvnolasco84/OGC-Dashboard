import type { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { validatePreparedAttachments } from "./repository";
import type { BitacoraAttachmentView, BitacoraEntryView, BitacoraSaveArgs, RemoteAttachment, RemoteEntry } from "./types";

function onlineAttachment(file: RemoteAttachment): BitacoraAttachmentView {
  return {
    _id: file._id, server_id: file._id,
    client_id: file.client_id ?? file.clientId ?? `legacy-document:${file._id}`,
    storage_id: file.storage_id, nombre: file.nombre ?? "Archivo", descripcion: file.descripcion,
    url: file.url, available_offline: false, pending: false,
  };
}

export function toOnlineEntryView(entry: RemoteEntry): BitacoraEntryView {
  const clientId = entry.client_id ?? `legacy:${entry._id}`;
  return {
    ...entry, _id: clientId, client_id: clientId, server_id: entry._id,
    revision: entry.revision ?? 1, sync_state: "synced",
    fotos: (entry.fotos ?? []).filter(file => !file.deleted_at).map(onlineAttachment),
    documentos: (entry.documentos ?? []).filter(file => !file.deleted_at).map(onlineAttachment),
  };
}

// Pending edits, creations, deletions and conflicts remain visible after
// reconnecting, until the existing synchronizer acknowledges them.
export function mergeOnlineEntries(remote: BitacoraEntryView[], local: BitacoraEntryView[], changedIds: string[]) {
  const changed = new Set(changedIds);
  const cached = new Map(local.map(entry => [entry.client_id, entry]));
  return [
    ...remote.filter(entry => !changed.has(entry.client_id)).map(entry => {
      const previous = cached.get(entry.client_id);
      const files = new Map([...(previous?.fotos ?? []), ...(previous?.documentos ?? [])].map(file => [file.client_id, file]));
      const withCache = (file: BitacoraAttachmentView) => ({ ...file,
        local_url: files.get(file.client_id)?.local_url, thumbnail_url: files.get(file.client_id)?.thumbnail_url,
        available_offline: files.get(file.client_id)?.available_offline ?? false,
      });
      return { ...entry, fotos: entry.fotos.map(withCache), documentos: entry.documentos.map(withCache) };
    }),
    ...local.filter(entry => changed.has(entry.client_id)),
  ];
}

export async function saveEntryOnline(client: ConvexReactClient, projectId: string, args: BitacoraSaveArgs,
  entry: BitacoraEntryView | undefined, assertActive: () => void) {
  assertActive();
  if (args.entryClientId && (!entry?.server_id || entry.sync_state !== "synced")) throw new Error("El reporte tiene cambios locales pendientes. Sincronízalos antes de editar en línea.");
  validatePreparedAttachments(args.newAttachments);
  const operationId = crypto.randomUUID();
  const clientId = entry?.client_id ?? crypto.randomUUID();
  const addedAttachments = [];
  for (const attachment of args.newAttachments) {
    assertActive();
    const attachmentId = attachment.clientId ?? crypto.randomUUID();
    const uploadUrl = await client.mutation(api.bitacoraOffline.generateBitacoraUploadUrl, {
      proyecto: projectId as Id<"desarrollos">, operationId, attachmentId,
    });
    assertActive();
    const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": attachment.file.type }, body: attachment.file });
    if (!response.ok) throw new Error(`No se pudo subir ${attachment.file.name}.`);
    const { storageId } = await response.json() as { storageId: Id<"_storage"> };
    assertActive();
    await client.mutation(api.bitacoraOffline.registerBitacoraUpload, {
      proyecto: projectId as Id<"desarrollos">, operationId, attachmentId, storageId, kind: attachment.kind,
    });
    addedAttachments.push({ clientId: attachmentId, storageId, kind: attachment.kind,
      name: attachment.file.name, description: attachment.description?.trim() });
  }
  const kept = args.keptAttachmentClientIds && new Set(args.keptAttachmentClientIds);
  assertActive();
  const result = await client.mutation(api.bitacoraOffline.applyOfflineOperation, {
    operationId, clientId, proyecto: projectId as Id<"desarrollos">,
    operation: entry ? "update" : "create", baseRevision: entry?.revision ?? 0,
    logId: entry?.server_id as Id<"bitacora"> | undefined,
    payload: { categoria: args.fields.categoria, partida_id: args.fields.partidaId as Id<"partidas">,
      familias_tags: args.fields.familiasTags, responsable: args.fields.responsable, fecha: args.fields.fecha,
      avance_dia: args.fields.avanceDia, comentarios: args.fields.comentarios, status: args.fields.status },
    addedAttachments, updatedAttachments: args.attachmentUpdates ?? [],
    removedAttachmentClientIds: kept ? [...(entry?.fotos ?? []), ...(entry?.documentos ?? [])].filter(file => !kept.has(file.client_id)).map(file => file.client_id) : [],
  });
  assertApplied(result);
  return { saved: "server" as const };
}

export async function deleteEntryOnline(client: ConvexReactClient, projectId: string, entry: BitacoraEntryView, assertActive: () => void) {
  assertActive();
  if (!entry.server_id || entry.sync_state !== "synced") throw new Error("El reporte tiene cambios locales pendientes.");
  const result = await client.mutation(api.bitacoraOffline.applyOfflineOperation, {
    operationId: crypto.randomUUID(), clientId: entry.client_id, proyecto: projectId as Id<"desarrollos">,
    operation: "delete", baseRevision: entry.revision, logId: entry.server_id as Id<"bitacora">,
    addedAttachments: [], updatedAttachments: [], removedAttachmentClientIds: [],
  });
  assertApplied(result);
  return "server" as const;
}

function assertApplied(result: { status: string; message?: string }) {
  if (result.status === "applied") return;
  if (result.status === "conflict") throw new Error("El reporte cambió en el servidor. Revisa la versión actual antes de volver a guardar.");
  throw new Error(result.message ?? "No se pudo guardar el reporte en el servidor.");
}
