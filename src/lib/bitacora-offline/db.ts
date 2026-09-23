import Dexie, { type EntityTable } from "dexie";
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

export function rememberOfflineUser(clerkId: string) {
  try {
    localStorage.setItem(LAST_OFFLINE_USER_KEY, clerkId);
  } catch {
    // IndexedDB remains authoritative when localStorage is unavailable.
  }
}

export async function findValidOfflineProfile(projectId: string, now = Date.now()) {
  const isUsable = async (profile: OfflineProfile) => {
    if (profile.expiresAt <= now || !profile.projectIds.includes(projectId)) return false;
    return Boolean((await bitacoraDb.syncMetadata.get(projectScopeKey(profile.clerkId, projectId)))?.prepared);
  };
  let preferred: string | null = null;
  try {
    preferred = localStorage.getItem(LAST_OFFLINE_USER_KEY);
  } catch {
    preferred = null;
  }

  if (preferred) {
    const profile = await bitacoraDb.offlineProfiles.get(preferred);
    if (profile && await isUsable(profile)) return profile;
  }

  const profiles = await bitacoraDb.offlineProfiles.toArray();
  for (const profile of profiles) {
    if (await isUsable(profile)) return profile;
  }
  return undefined;
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
