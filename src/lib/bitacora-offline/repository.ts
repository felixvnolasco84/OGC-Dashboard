import { bitacoraDb, estimateStorage, MAX_ATTACHMENT_BYTES, projectScopeKey, scopedKey } from "./db";
import { assertEntryEdit, protectedBitacoraFields } from "./permissions";
import { validateBitacoraEdit } from "../../../convex/bitacoraRules";
import type {
  BitacoraEntryView,
  BitacoraFields,
  CachedAssignableUser,
  LocalAttachment,
  LocalEntry,
  OfflineProfile,
  OutboxOperation,
  PreparedAttachment,
  RemoteAttachment,
  RemoteEntry,
  StorageCapacity,
} from "./types";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const CREATE_ROLES = new Set(["admin", "user", "finance", "contratista"]);

const id = () => crypto.randomUUID();

export function validatePreparedAttachments(files: PreparedAttachment[]) {
  for (const attachment of files) {
    if (attachment.file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${attachment.file.name} supera el máximo de 10 MiB.`);
    }
    const accepted = attachment.kind === "photo"
      ? PHOTO_TYPES.has(attachment.file.type)
      : DOCUMENT_TYPES.has(attachment.file.type);
    if (!accepted) throw new Error(`Tipo de archivo no permitido: ${attachment.file.name}.`);
    if (attachment.kind === "photo" && !attachment.description?.trim()) {
      throw new Error(`Agrega una descripción para ${attachment.file.name}.`);
    }
  }
}

export async function verifyStorageForFiles(files: PreparedAttachment[]): Promise<StorageCapacity> {
  validatePreparedAttachments(files);
  const capacity = await estimateStorage(files.reduce((sum, item) => sum + item.file.size, 0));
  if (capacity.blocked) {
    throw new Error("No hay espacio local seguro: guardar estos archivos superaría el 80% de la cuota.");
  }
  return capacity;
}

export async function saveEntryLocally(args: {
  userId: string;
  projectId: string;
  role: string;
  fields: BitacoraFields;
  entryClientId?: string;
  expectedRevision?: number;
  newAttachments: PreparedAttachment[];
  keptAttachmentClientIds?: string[];
  attachmentUpdates?: Array<{ clientId: string; name?: string; description?: string }>;
}) {
  if (!args.entryClientId && !CREATE_ROLES.has(args.role)) throw new Error("Tu rol es de sólo lectura.");
  const capacity = await verifyStorageForFiles(args.newAttachments);
  const now = Date.now();

  return bitacoraDb.transaction(
    "rw",
    [bitacoraDb.entries, bitacoraDb.attachments, bitacoraDb.outbox],
    async () => {
      const clientId = args.entryClientId ?? id();
      const key = scopedKey(args.userId, clientId);
      const previous = await bitacoraDb.entries.get(key);
      if (args.entryClientId && !previous) throw new Error("El reporte ya no está disponible en este dispositivo.");
      if (previous && previous.projectId !== args.projectId) throw new Error("El reporte no pertenece a esta Bitácora.");
      const currentAttachments = await bitacoraDb.attachments
        .where("[userId+entryClientId]")
        .equals([args.userId, clientId])
        .toArray();
      if (previous) assertEntryEdit(args.role, args.userId, toEntryView(previous, currentAttachments), args);
      const kept = new Set(args.keptAttachmentClientIds ?? currentAttachments.filter((item) => !item.deleted).map((item) => item.clientId));
      const attachmentUpdates = new Map((args.attachmentUpdates ?? []).map((item) => [item.clientId, item]));
      const removedServerIds: string[] = [];

      for (const attachment of currentAttachments) {
        if (attachment.deleted) continue;
        if (kept.has(attachment.clientId)) continue;
        if (!attachment.serverId && !attachment.storageId) {
          await bitacoraDb.attachments.delete(attachment.key);
        } else {
          removedServerIds.push(attachment.clientId);
          await bitacoraDb.attachments.update(attachment.key, { deleted: true });
        }
      }

      for (const attachment of currentAttachments) {
        if (!kept.has(attachment.clientId)) continue;
        const update = attachmentUpdates.get(attachment.clientId);
        if (!update) continue;
        await bitacoraDb.attachments.update(attachment.key, {
          ...(update.name !== undefined ? { name: update.name, originalName: attachment.originalName ?? attachment.name } : {}),
          ...(update.description !== undefined ? { description: update.description, originalDescription: attachment.originalDescription ?? attachment.description ?? "" } : {}),
        });
      }

      for (const prepared of args.newAttachments) {
        const clientAttachmentId = prepared.clientId ?? id();
        if (await bitacoraDb.attachments.get(scopedKey(args.userId, clientAttachmentId))) throw new Error("El identificador del archivo ya está en uso.");
        const attachment: LocalAttachment = {
          key: scopedKey(args.userId, clientAttachmentId),
          userId: args.userId,
          projectId: args.projectId,
          entryClientId: clientId,
          clientId: clientAttachmentId,
          kind: prepared.kind,
          name: prepared.file.name,
          description: prepared.description?.trim(),
          originalName: prepared.file.name,
          originalDescription: prepared.description?.trim() ?? "",
          mimeType: prepared.file.type,
          size: prepared.file.size,
          blob: prepared.file,
          deleted: false,
          syncState: "pending",
        };
        await bitacoraDb.attachments.put(attachment);
      }

      const entry: LocalEntry = {
        key,
        userId: args.userId,
        projectId: args.projectId,
        clientId,
        serverId: previous?.serverId,
        createdBy: previous ? previous.createdBy : args.userId,
        revision: previous?.revision ?? 0,
        baseRevision: previous?.baseRevision ?? previous?.revision ?? 0,
        syncVersion: previous?.syncVersion ?? 0,
        uploadedAt: previous?.uploadedAt ?? now,
        updatedAt: now,
        deleted: false,
        syncState: "pending",
        ...args.fields,
      };
      await bitacoraDb.entries.put(entry);

      const existing = await bitacoraDb.outbox.where("entryClientId").equals(clientId).and((item) => item.userId === args.userId).first();
      const operation: OutboxOperation = {
        operationId: existing?.operationId ?? id(),
        userId: args.userId,
        projectId: args.projectId,
        entryClientId: clientId,
        operation: previous?.serverId ? "update" : "create",
        baseRevision: previous?.baseRevision ?? previous?.revision ?? 0,
        removedAttachmentClientIds: Array.from(new Set([...(existing?.removedAttachmentClientIds ?? []), ...removedServerIds])),
        status: "pending",
        attempts: existing?.attempts ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await bitacoraDb.outbox.put(operation);
      return { entry, capacity };
    },
  );
}

export async function deleteEntryLocally(userId: string, projectId: string, role: string, entryClientId: string) {
  if (role !== "admin") throw new Error("Sólo un administrador puede eliminar reportes.");
  const key = scopedKey(userId, entryClientId);
  await bitacoraDb.transaction(
    "rw",
    [bitacoraDb.entries, bitacoraDb.attachments, bitacoraDb.outbox],
    async () => {
      const entry = await bitacoraDb.entries.get(key);
      if (!entry) return;
      if (entry.projectId !== projectId) throw new Error("El reporte no pertenece a esta Bitácora.");
      const existing = await bitacoraDb.outbox.where("entryClientId").equals(entryClientId).and((item) => item.userId === userId).first();
      if (!entry.serverId) {
        await bitacoraDb.entries.delete(key);
        await bitacoraDb.attachments.where("[userId+entryClientId]").equals([userId, entryClientId]).delete();
        if (existing) await bitacoraDb.outbox.delete(existing.operationId);
        return;
      }
      const now = Date.now();
      await bitacoraDb.entries.update(key, { deleted: true, syncState: "pending", updatedAt: now });
      await bitacoraDb.outbox.put({
        operationId: existing?.operationId ?? id(),
        userId,
        projectId,
        entryClientId,
        operation: "delete",
        baseRevision: entry.baseRevision,
        removedAttachmentClientIds: [],
        status: "pending",
        attempts: existing?.attempts ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
  );
}

function normalizeRemoteAttachment(raw: RemoteAttachment) {
  return {
    clientId: raw.client_id ?? raw.clientId ?? `legacy-document:${raw._id}`,
    kind: (raw.kind ?? (raw.tipo_documento === "bitacora_foto" ? "photo" : "document")) as "photo" | "document",
  };
}

export async function mergeRemoteEntries(userId: string, projectId: string, rows: RemoteEntry[]) {
  await bitacoraDb.transaction("rw", [bitacoraDb.entries, bitacoraDb.attachments], async () => {
    for (const remote of rows) {
      const clientId = remote.client_id ?? `legacy:${remote._id}`;
      const key = scopedKey(userId, clientId);
      const local = await bitacoraDb.entries.get(key);
      if (local && local.syncState !== "synced") {
        await bitacoraDb.entries.update(key, {
          createdBy: remote.created_by,
          ...(remote.revision > local.baseRevision ? {
            syncState: "conflict" as const,
            syncError: "El reporte cambió en el servidor.",
            serverSnapshot: remote,
          } : {}),
        });
        // A full refresh of the same revision must not replace a draft or its files.
        if (remote.revision === local.baseRevision) {
          for (const raw of [...(remote.fotos ?? []), ...(remote.documentos ?? [])]) {
            const fileKey = scopedKey(userId, normalizeRemoteAttachment(raw).clientId);
            const file = await bitacoraDb.attachments.get(fileKey);
            if (file) await bitacoraDb.attachments.update(fileKey, {
              originalName: raw.nombre ?? "Archivo", originalDescription: raw.descripcion ?? "",
              url: raw.url ?? file.url,
            });
          }
        }
        continue;
      }

      const entry: LocalEntry = {
        key,
        userId,
        projectId,
        clientId,
        serverId: remote._id,
        createdBy: remote.created_by,
        revision: remote.revision ?? 1,
        baseRevision: remote.revision ?? 1,
        syncVersion: remote.sync_version ?? 0,
        uploadedAt: remote.uploaded_at,
        updatedAt: remote.updated_at ?? remote.uploaded_at,
        deleted: Boolean(remote.deleted_at),
        syncState: "synced",
        categoria: remote.categoria,
        partidaId: remote.partida_id,
        familiasTags: remote.familias_tags ?? [],
        responsable: remote.responsable,
        fecha: remote.fecha,
        avanceDia: remote.avance_dia,
        comentarios: remote.comentarios,
        status: remote.status ?? "Sin problemas",
      };
      await bitacoraDb.entries.put(entry);

      const remoteAttachments = [...(remote.fotos ?? []), ...(remote.documentos ?? [])];
      const remoteClientIds = new Set<string>();
      for (const raw of remoteAttachments) {
        const normalized = normalizeRemoteAttachment(raw);
        remoteClientIds.add(normalized.clientId);
        const attachmentKey = scopedKey(userId, normalized.clientId);
        const cached = await bitacoraDb.attachments.get(attachmentKey);
        await bitacoraDb.attachments.put({
          key: attachmentKey,
          userId,
          projectId,
          entryClientId: clientId,
          clientId: normalized.clientId,
          serverId: raw._id,
          storageId: raw.storage_id,
          kind: normalized.kind,
          name: raw.nombre ?? "Archivo",
          description: raw.descripcion,
          originalName: raw.nombre ?? "Archivo",
          originalDescription: raw.descripcion ?? "",
          size: cached?.size ?? 0,
          mimeType: cached?.mimeType,
          url: raw.url ?? undefined,
          blob: cached?.blob,
          thumbnail: cached?.thumbnail,
          downloadRequested: cached?.downloadRequested,
           downloadError: cached?.downloadError,
          deleted: false,
          syncState: "synced",
        });
      }

      const oldAttachments = await bitacoraDb.attachments
        .where("[userId+entryClientId]")
        .equals([userId, clientId])
        .toArray();
      for (const attachment of oldAttachments) {
        if (!remoteClientIds.has(attachment.clientId) && attachment.syncState === "synced") {
          await bitacoraDb.attachments.delete(attachment.key);
        }
      }
    }
  });
}

export async function acceptServerVersion(userId: string, entryClientId: string) {
  const entry = await bitacoraDb.entries.get(scopedKey(userId, entryClientId));
  if (!entry) return;
  const operation = await bitacoraDb.outbox.where("entryClientId").equals(entryClientId).and((item) => item.userId === userId).first();
  if (operation) await bitacoraDb.outbox.delete(operation.operationId);
  if (!entry.serverSnapshot) {
    await bitacoraDb.transaction("rw", [bitacoraDb.entries, bitacoraDb.attachments], async () => {
      await bitacoraDb.entries.delete(entry.key);
      await bitacoraDb.attachments.where("[userId+entryClientId]").equals([userId, entryClientId]).delete();
    });
    return;
  }
  await bitacoraDb.entries.update(entry.key, { syncState: "synced", syncError: undefined, serverSnapshot: undefined });
  await mergeRemoteEntries(userId, entry.projectId, [entry.serverSnapshot]);
}

export async function restoreConflictAsNew(userId: string, entryClientId: string, role: string) {
  const entry = await bitacoraDb.entries.get(scopedKey(userId, entryClientId));
  if (!entry) return;
  const attachments = await bitacoraDb.attachments
    .where("[userId+entryClientId]")
    .equals([userId, entryClientId])
    .toArray();
  const recoverable: PreparedAttachment[] = attachments
    .filter((attachment) => !attachment.deleted && attachment.blob)
    .map((attachment) => ({
      file: new File([attachment.blob!], attachment.name, { type: attachment.mimeType || attachment.blob!.type }),
      kind: attachment.kind,
      description: attachment.description,
    }));
  await saveEntryLocally({
    userId,
    projectId: entry.projectId,
    role,
    fields: {
      categoria: entry.categoria,
      partidaId: entry.partidaId,
      familiasTags: entry.familiasTags,
      responsable: entry.responsable,
      fecha: entry.fecha,
      avanceDia: entry.avanceDia,
      comentarios: entry.comentarios,
      status: entry.status,
    },
    newAttachments: recoverable,
  });
  const operation = await bitacoraDb.outbox.where("entryClientId").equals(entryClientId).and((item) => item.userId === userId).first();
  await bitacoraDb.transaction("rw", [bitacoraDb.entries, bitacoraDb.attachments, bitacoraDb.outbox], async () => {
    if (operation) await bitacoraDb.outbox.delete(operation.operationId);
    await bitacoraDb.entries.delete(entry.key);
    await bitacoraDb.attachments.where("[userId+entryClientId]").equals([userId, entryClientId]).delete();
  });
}

export async function reapplyLocalVersion(userId: string, entryClientId: string, role: string) {
  const entry = await bitacoraDb.entries.get(scopedKey(userId, entryClientId));
  if (!entry?.serverSnapshot) return;
  const snapshot = entry.serverSnapshot;
  if (snapshot.deleted_at) throw new Error("El reporte fue eliminado. Puedes restaurarlo como un reporte nuevo.");
  if (entry.deleted && role !== "admin") throw new Error("Solo un administrador puede eliminar reportes.");
  const attachments = await bitacoraDb.attachments.where("[userId+entryClientId]").equals([userId, entryClientId]).toArray();
  const snapshotFiles = [...(snapshot.fotos ?? []), ...(snapshot.documentos ?? [])];
  const serverFiles = new Map(snapshotFiles.map(file => [normalizeRemoteAttachment(file).clientId, file]));
  const renamed = (file: LocalAttachment) => file.originalName !== undefined && file.name !== file.originalName;
  const described = (file: LocalAttachment) => file.originalDescription !== undefined
    ? (file.description ?? "") !== file.originalDescription
    : !file.serverId && serverFiles.has(file.clientId) && (file.description ?? "") !== (serverFiles.get(file.clientId)?.descripcion ?? "");
  if (!entry.deleted) {
    const error = validateBitacoraEdit({ role, clerkId: userId, createdBy: snapshot.created_by,
      previous: snapshot, next: protectedBitacoraFields(entry),
      attachments: snapshotFiles.map(file => ({ ...normalizeRemoteAttachment(file), name: file.nombre ?? "Archivo", description: file.descripcion })),
      addedAttachments: attachments.filter(file => !file.deleted && !file.serverId && !serverFiles.has(file.clientId)),
      updatedAttachments: attachments.filter(file => !file.deleted && (file.serverId || serverFiles.has(file.clientId)) && (renamed(file) || described(file)))
        .map(file => ({ clientId: file.clientId, ...(renamed(file) ? { name: file.name } : {}), ...(described(file) ? { description: file.description ?? "" } : {}) })),
      removedAttachmentClientIds: attachments.filter(file => file.deleted).map(file => file.clientId),
    });
    if (error) throw new Error(error);
  }
  const existing = await bitacoraDb.outbox.where("entryClientId").equals(entryClientId).and((item) => item.userId === userId).first();
  const now = Date.now();
  await bitacoraDb.transaction("rw", [bitacoraDb.entries, bitacoraDb.attachments, bitacoraDb.outbox], async () => {
    for (const raw of snapshotFiles) {
      const normalized = normalizeRemoteAttachment(raw);
      const key = scopedKey(userId, normalized.clientId);
      const file = await bitacoraDb.attachments.get(key);
      if (file) {
        await bitacoraDb.attachments.update(key, {
          serverId: raw._id, storageId: raw.storage_id ?? file.storageId, syncState: "synced",
          originalName: raw.nombre ?? "Archivo", originalDescription: raw.descripcion ?? "",
          name: renamed(file) ? file.name : raw.nombre ?? "Archivo",
          description: described(file) ? file.description : raw.descripcion,
          url: raw.url ?? file.url,
        });
        continue;
      }
      await bitacoraDb.attachments.put({
        key,
        userId,
        projectId: entry.projectId,
        entryClientId,
        clientId: normalized.clientId,
        serverId: raw._id,
        storageId: raw.storage_id,
        kind: normalized.kind,
        name: raw.nombre ?? "Archivo",
        description: raw.descripcion,
        originalName: raw.nombre ?? "Archivo",
        originalDescription: raw.descripcion ?? "",
        size: 0,
        url: raw.url ?? undefined,
        deleted: false,
        syncState: "synced",
      });
    }
    await bitacoraDb.entries.update(entry.key, {
      serverId: snapshot._id,
      createdBy: snapshot.created_by,
      revision: snapshot.revision,
      baseRevision: snapshot.revision,
      syncState: "pending",
      syncError: undefined,
      serverSnapshot: undefined,
    });
    await bitacoraDb.outbox.put({
      operationId: id(),
      userId,
      projectId: entry.projectId,
      entryClientId,
      operation: entry.deleted ? "delete" : "update",
      baseRevision: snapshot.revision,
      removedAttachmentClientIds: existing?.removedAttachmentClientIds ?? [],
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (existing) await bitacoraDb.outbox.delete(existing.operationId);
  });
}

// Resolve from raw fields as well, so existing offline caches need no migration.
export function resolveBudgetCatalog(partidas: readonly { partidaId: string; name: string; nivel: number; parentId?: string; raw: Record<string, unknown> }[]) {
  return partidas.map((partida) => {
    const rootName = partida.raw.partida_nombre || partida.raw.nombre;
    const root = partida.nivel === 2 && typeof rootName === "string"
      ? partidas.find(candidate => candidate.nivel === 1 && candidate.name === rootName)
      : undefined;
    return {
      id: partida.partidaId,
      name: partida.nivel === 2 && typeof partida.raw.familia === "string" ? partida.raw.familia : partida.name,
      nivel: partida.nivel,
      parentId: root?.partidaId ?? partida.parentId,
    };
  });
}

export async function cacheBootstrap(args: {
  clerkId: string;
  projectId: string;
  bootstrap: {
    verifiedAt: number;
    expiresAt: number;
    latestVersion: number;
    user: Record<string, unknown>;
    project: Record<string, unknown> & { _id: string; nombre?: string };
    partidas: Array<Record<string, unknown> & { _id: string; nombre?: string; nivel: number; padre?: string }>;
    assignableUsers: Array<{ _id: string; name: string; email?: string }>;
  };
}) {
  const { clerkId, projectId, bootstrap } = args;
  const allowed = Array.from(new Set([
    ...((bootstrap.user.allowed_desarrollos as string[] | undefined) ?? []).map(String),
    projectId,
  ]));
  const profile: OfflineProfile = {
    clerkId,
    userId: clerkId,
    name: String(bootstrap.user.name ?? "Usuario"),
    email: String(bootstrap.user.email ?? ""),
    role: String(bootstrap.user.role ?? "viewer"),
    organizationId: bootstrap.user.organization_id ? String(bootstrap.user.organization_id) : undefined,
    projectIds: allowed,
    verifiedAt: bootstrap.verifiedAt,
    expiresAt: bootstrap.expiresAt,
  };

  await bitacoraDb.transaction(
    "rw",
    [bitacoraDb.offlineProfiles, bitacoraDb.projects, bitacoraDb.partidas, bitacoraDb.assignableUsers, bitacoraDb.syncMetadata],
    async () => {
      await bitacoraDb.offlineProfiles.put(profile);
      await bitacoraDb.projects.put({
        key: projectScopeKey(clerkId, projectId),
        userId: clerkId,
        projectId,
        name: bootstrap.project.nombre ?? "Proyecto",
        raw: bootstrap.project,
      });
      await bitacoraDb.partidas.where("[userId+projectId]").equals([clerkId, projectId]).delete();
      const catalog = bootstrap.partidas.map((partida) => ({
        key: scopedKey(clerkId, String(partida._id)),
        userId: clerkId,
        projectId,
        partidaId: String(partida._id),
        name: partida.nombre ?? "Partida",
        nivel: partida.nivel,
        parentId: partida.padre ? String(partida.padre) : undefined,
        raw: partida,
      }));
      const resolved = resolveBudgetCatalog(catalog);
      await bitacoraDb.partidas.bulkPut(catalog.map((partida, index) => ({
        ...partida,
        name: resolved[index].name,
        parentId: resolved[index].parentId,
      })));
      await bitacoraDb.assignableUsers.where("[userId+projectId]").equals([clerkId, projectId]).delete();
      const users: CachedAssignableUser[] = bootstrap.assignableUsers.map((user) => ({
        key: scopedKey(clerkId, String(user._id)),
        userId: clerkId,
        projectId,
        targetUserId: String(user._id),
        name: user.name,
        role: "user",
      }));
      await bitacoraDb.assignableUsers.bulkPut(users);
      const syncKey = projectScopeKey(clerkId, projectId);
      const current = await bitacoraDb.syncMetadata.get(syncKey);
      await bitacoraDb.syncMetadata.put({
        key: syncKey,
        userId: clerkId,
        projectId,
        version: current?.version ?? 0,
        prepared: current?.prepared ?? false,
        lastSyncAt: current?.lastSyncAt,
        status: current?.status ?? "idle",
      });
    },
  );
  return profile;
}

export function toEntryView(
  entry: LocalEntry,
  attachments: LocalAttachment[],
  partidaName?: string,
  localUrls: Record<string, string> = {},
  thumbnailUrls: Record<string, string> = {},
): BitacoraEntryView {
  const convert = (attachment: LocalAttachment) => ({
    _id: attachment.serverId ?? attachment.clientId,
    client_id: attachment.clientId,
    server_id: attachment.serverId,
    storage_id: attachment.storageId,
    nombre: attachment.name,
    descripcion: attachment.description,
    url: localUrls[attachment.clientId] ?? attachment.url,
    local_url: localUrls[attachment.clientId],
    thumbnail_url: thumbnailUrls[attachment.clientId],
    available_offline: Boolean(attachment.blob),
    download_requested: attachment.downloadRequested,
    download_error: attachment.downloadError,
    pending: attachment.syncState !== "synced",
  });
  const visible = attachments.filter((item) => !item.deleted);
  return {
    _id: entry.clientId,
    client_id: entry.clientId,
    created_by: entry.createdBy,
    server_id: entry.serverId,
    revision: entry.revision,
    sync_state: entry.syncState,
    sync_error: entry.syncError,
    locally_deleted: entry.deleted,
    server_deleted: Boolean(entry.serverSnapshot?.deleted_at),
    server_version: entry.serverSnapshot ? {
      fecha: entry.serverSnapshot.fecha,
      responsable: entry.serverSnapshot.responsable,
      avance_dia: entry.serverSnapshot.avance_dia,
      comentarios: entry.serverSnapshot.comentarios,
      status: entry.serverSnapshot.status,
    } : undefined,
    departamento: partidaName,
    categoria: entry.categoria,
    partida_id: entry.partidaId,
    familias_tags: entry.familiasTags,
    responsable: entry.responsable,
    fecha: entry.fecha,
    avance_dia: entry.avanceDia,
    comentarios: entry.comentarios,
    status: entry.status,
    uploaded_at: entry.uploadedAt,
    fotos: visible.filter((item) => item.kind === "photo").map(convert),
    documentos: visible.filter((item) => item.kind === "document").map(convert),
  };
}
