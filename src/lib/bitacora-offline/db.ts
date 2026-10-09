import Dexie, { type EntityTable } from "dexie";
import { isProfileUsable } from "./preparation";
import type {
  CachedAssignableUser,
  LocalAttachment,
  LocalEntry,
  LocalPartida,
  LocalProject,
  OfflineProfile,
  OutboxOperation,
  StorageCapacity,
  SyncMetadata,
} from "./types";

export const OFFLINE_PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const STORAGE_WARNING_RATIO = 0.7;
export const STORAGE_BLOCK_RATIO = 0.8;
export const LAST_OFFLINE_USER_KEY = "ogc:bitacora:last-user";

class BitacoraOfflineDatabase extends Dexie {
  offlineProfiles!: EntityTable<OfflineProfile, "clerkId">;
  projects!: EntityTable<LocalProject, "key">;
  partidas!: EntityTable<LocalPartida, "key">;
  entries!: EntityTable<LocalEntry, "key">;
  attachments!: EntityTable<LocalAttachment, "key">;
  outbox!: EntityTable<OutboxOperation, "operationId">;
  syncMetadata!: EntityTable<SyncMetadata, "key">;
  assignableUsers!: EntityTable<CachedAssignableUser, "key">;

  constructor() {
    super("ogc-bitacora-offline");
    this.version(1).stores({
      offlineProfiles: "clerkId, expiresAt, *projectIds",
      projects: "key, [userId+projectId], userId, projectId",
      partidas: "key, [userId+projectId], [userId+projectId+nivel], partidaId",
      entries: "key, [userId+projectId], [userId+projectId+syncState], clientId, serverId, syncVersion",
      attachments: "key, [userId+projectId], [userId+entryClientId], clientId, serverId, syncState",
      outbox: "operationId, [userId+projectId], [userId+projectId+status], entryClientId, createdAt",
      syncMetadata: "key, [userId+projectId], status",
      assignableUsers: "key, [userId+projectId], targetUserId",
    });
  }
}

export const bitacoraDb = new BitacoraOfflineDatabase();

export const scopedKey = (userId: string, id: string) => `${userId}:${id}`;
export const projectScopeKey = (userId: string, projectId: string) => `${userId}:${projectId}`;

export async function readProjectSnapshot(userId: string, projectId: string) {
  return bitacoraDb.transaction("r", bitacoraDb.tables, async () => {
    const key = projectScopeKey(userId, projectId);
    const [profile, project, metadata, partidas, entries, attachments, outbox, users] = await Promise.all([
      bitacoraDb.offlineProfiles.get(userId), bitacoraDb.projects.get(key), bitacoraDb.syncMetadata.get(key),
      bitacoraDb.partidas.where("[userId+projectId]").equals([userId, projectId]).toArray(),
      bitacoraDb.entries.where("[userId+projectId]").equals([userId, projectId]).toArray(),
      bitacoraDb.attachments.where("[userId+projectId]").equals([userId, projectId]).toArray(),
      bitacoraDb.outbox.where("[userId+projectId]").equals([userId, projectId]).toArray(),
      bitacoraDb.assignableUsers.where("[userId+projectId]").equals([userId, projectId]).toArray(),
    ]);
    return { userId, projectId, profile, project, metadata, partidas, entries, attachments, outbox, users };
  });
}

export function rememberOfflineUser(clerkId: string) {
  try {
    localStorage.setItem(LAST_OFFLINE_USER_KEY, clerkId);
  } catch {
    // IndexedDB remains authoritative when localStorage is unavailable.
  }
}

export async function findValidOfflineProfile(projectId: string, now = Date.now(), userId?: string) {
  const isUsable = async (profile: OfflineProfile) => {
    if (!isProfileUsable(profile, userId ?? profile.clerkId, projectId, now)) return false;
    const key = projectScopeKey(profile.clerkId, projectId);
    return Boolean((await bitacoraDb.syncMetadata.get(key))?.prepared && await bitacoraDb.projects.get(key));
  };
  if (userId) {
    const profile = await bitacoraDb.offlineProfiles.get(userId);
    return profile && await isUsable(profile) ? profile : undefined;
  }
  let preferred: string | null = null;
  try {
    preferred = localStorage.getItem(LAST_OFFLINE_USER_KEY);
  } catch {
    preferred = null;
  }

  if (preferred) {
    const profile = await bitacoraDb.offlineProfiles.get(preferred);
    if (profile && await isUsable(profile)) return profile;
    // A remembered account must never fall back to another account's cache.
    return undefined;
  }

  const profiles = await bitacoraDb.offlineProfiles.toArray();
  const usable = [];
  for (const profile of profiles) if (await isUsable(profile)) usable.push(profile);
  return usable.length === 1 ? usable[0] : undefined;
}

export async function inspectOfflinePreparation(projectId: string) {
  try {
    const profile = await findValidOfflineProfile(projectId);
    if (profile) return { profile, reason: "missing" as const };
    let preferred: string | null = null;
    try { preferred = localStorage.getItem(LAST_OFFLINE_USER_KEY); } catch { /* No remembered account. */ }
    const candidates = preferred ? [await bitacoraDb.offlineProfiles.get(preferred)] : await bitacoraDb.offlineProfiles.toArray();
    const expired = candidates.length === 1 && candidates[0]?.projectIds.includes(projectId) && candidates[0].expiresAt <= Date.now();
    return { profile: undefined, reason: expired ? "expired" as const : "missing" as const };
  } catch {
    return { profile: undefined, reason: "storage" as const };
  }
}

export async function clearOfflineUser(userId: string) {
  await bitacoraDb.transaction(
    "rw",
    [
      bitacoraDb.offlineProfiles,
      bitacoraDb.projects,
      bitacoraDb.partidas,
      bitacoraDb.entries,
      bitacoraDb.attachments,
      bitacoraDb.outbox,
      bitacoraDb.syncMetadata,
      bitacoraDb.assignableUsers,
    ],
    async () => {
      await bitacoraDb.offlineProfiles.where("clerkId").equals(userId).delete();
      await Promise.all([
        bitacoraDb.projects.where("userId").equals(userId).delete(),
        bitacoraDb.partidas.where("userId").equals(userId).delete(),
        bitacoraDb.entries.where("userId").equals(userId).delete(),
        bitacoraDb.attachments.where("userId").equals(userId).delete(),
        bitacoraDb.outbox.where("userId").equals(userId).delete(),
        bitacoraDb.syncMetadata.where("userId").equals(userId).delete(),
        bitacoraDb.assignableUsers.where("userId").equals(userId).delete(),
      ]);
    },
  );
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage(additionalBytes = 0): Promise<StorageCapacity> {
  const estimate = await navigator.storage?.estimate?.();
  const usage = estimate?.usage ?? 0;
  const quota = estimate?.quota ?? Number.POSITIVE_INFINITY;
  const projectedRatio = quota === Number.POSITIVE_INFINITY ? 0 : (usage + additionalBytes) / quota;
  return {
    usage,
    quota,
    projectedRatio,
    warning: projectedRatio >= STORAGE_WARNING_RATIO,
    blocked: projectedRatio >= STORAGE_BLOCK_RATIO,
  };
}
