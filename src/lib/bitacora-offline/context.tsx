import { useAuth } from "@clerk/clerk-react";
import { useConvex, type ConvexReactClient } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bitacoraDb, projectScopeKey, rememberOfflineUser, requestPersistentStorage } from "./db";
import {
  acceptServerVersion,
  cacheBootstrap,
  deleteEntryLocally,
  reapplyLocalVersion,
  restoreConflictAsNew,
  saveEntryLocally,
  toEntryView,
} from "./repository";
import { cacheHistoricalAttachment, queueHistoricalAttachmentDownload, synchronizeProject } from "./sync";
import type {
  BitacoraEntryView,
  BitacoraFields,
  LocalAttachment,
  OfflineProfile,
  PreparedAttachment,
  StorageCapacity,
} from "./types";

interface OnlineUser {
  clerkId?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface RepositoryContextValue {
  projectId: string;
  project?: { id: string; name: string; raw: Record<string, unknown> };
  profile?: OfflineProfile;
  entries: BitacoraEntryView[];
  partidas: Array<{ id: string; name: string; nivel: number; parentId?: string }>;
  assignableUsers: Array<{ id: string; name: string }>;
  isReady: boolean;
  isOnline: boolean;
  canCreate: boolean;
  canEdit: boolean;
  pendingCount: number;
  conflictCount: number;
  syncStatus: "idle" | "syncing" | "error" | "conflict";
  syncError?: string;
  lastSyncAt?: number;
  saveEntry: (args: {
    fields: BitacoraFields;
    entryClientId?: string;
    newAttachments: PreparedAttachment[];
    keptAttachmentClientIds?: string[];
    attachmentUpdates?: Array<{ clientId: string; name?: string; description?: string }>;
  }) => Promise<StorageCapacity>;
  deleteEntry: (entryClientId: string) => Promise<void>;
  retrySync: () => Promise<void>;
  acceptServer: (entryClientId: string) => Promise<void>;
  reapplyLocal: (entryClientId: string) => Promise<void>;
  restoreAsNew: (entryClientId: string) => Promise<void>;
  makeAttachmentAvailableOffline: (attachmentClientId: string) => Promise<"downloaded" | "queued">;
}

const BitacoraRepositoryContext = createContext<RepositoryContextValue | null>(null);

interface BaseProviderProps {
  children: ReactNode;
  projectId: string;
  client?: ConvexReactClient;
  onlineUser?: OnlineUser | null;
  initialProfile?: OfflineProfile;
  renewSession?: () => Promise<unknown>;
}

function BaseBitacoraRepositoryProvider({
  children,
  projectId,
  client,
  onlineUser,
  initialProfile,
  renewSession,
}: BaseProviderProps) {
  const [profile, setProfile] = useState<OfflineProfile | undefined>(initialProfile);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const [objectUrls, setObjectUrls] = useState<{ local: Record<string, string>; thumbnails: Record<string, string> }>({ local: {}, thumbnails: {} });
  const preparingRef = useRef(false);
  const userId = profile?.clerkId ?? onlineUser?.clerkId;

  const project = useLiveQuery(
    () => userId ? bitacoraDb.projects.get(projectScopeKey(userId, projectId)) : undefined,
    [userId, projectId],
  );
  const partidas = useLiveQuery(
    () => userId
      ? bitacoraDb.partidas.where("[userId+projectId]").equals([userId, projectId]).toArray()
      : [],
    [userId, projectId],
    [],
  );
  const storedEntries = useLiveQuery(
    () => userId
      ? bitacoraDb.entries.where("[userId+projectId]").equals([userId, projectId]).toArray()
      : [],
    [userId, projectId],
    [],
  );
  const attachments = useLiveQuery(
    () => userId
      ? bitacoraDb.attachments.where("[userId+projectId]").equals([userId, projectId]).toArray()
      : [],
    [userId, projectId],
    [],
  );
  const outbox = useLiveQuery(
    () => userId
      ? bitacoraDb.outbox.where("[userId+projectId]").equals([userId, projectId]).toArray()
      : [],
    [userId, projectId],
    [],
  );
  const syncMetadata = useLiveQuery(
    () => userId ? bitacoraDb.syncMetadata.get(projectScopeKey(userId, projectId)) : undefined,
    [userId, projectId],
  );
  const cachedUsers = useLiveQuery(
    () => userId
      ? bitacoraDb.assignableUsers.where("[userId+projectId]").equals([userId, projectId]).toArray()
      : [],
    [userId, projectId],
    [],
  );

  useEffect(() => {
    const local: Record<string, string> = {};
    const thumbnails: Record<string, string> = {};
    for (const attachment of attachments ?? []) {
      if (attachment.blob) local[attachment.clientId] = URL.createObjectURL(attachment.blob);
      if (attachment.thumbnail) thumbnails[attachment.clientId] = URL.createObjectURL(attachment.thumbnail);
    }
    setObjectUrls({ local, thumbnails });
    return () => [...Object.values(local), ...Object.values(thumbnails)].forEach((url) => URL.revokeObjectURL(url));
  }, [attachments]);

  const retrySync = useCallback(async () => {
    if (!client || !userId || !navigator.onLine) return;
    try {
      await renewSession?.();
      if (onlineUser?.clerkId) {
        const bootstrap = await client.query(api.bitacoraOffline.getOfflineBootstrap, {
          proyecto: projectId as Id<"desarrollos">,
        });
        const refreshed = await cacheBootstrap({
          clerkId: onlineUser.clerkId,
          projectId,
          bootstrap: bootstrap as never,
        });
        rememberOfflineUser(refreshed.clerkId);
        setProfile(refreshed);
      }
      await synchronizeProject(client, userId, projectId);
    } catch (error) {
      const key = projectScopeKey(userId, projectId);
      const current = await bitacoraDb.syncMetadata.get(key);
      await bitacoraDb.syncMetadata.put({
        key,
        userId,
        projectId,
        version: current?.version ?? 0,
        prepared: current?.prepared ?? false,
        lastSyncAt: current?.lastSyncAt,
        status: "error",
        error: error instanceof Error ? error.message : "No se pudo validar o sincronizar.",
      });
    }
  }, [client, onlineUser?.clerkId, projectId, renewSession, userId]);

  useEffect(() => {
    const online = () => {
      setNetworkOnline(true);
      void retrySync();
    };
    const offline = () => setNetworkOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") void retrySync();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retrySync]);

  useEffect(() => {
    if (!client || !networkOnline || !outbox?.some((operation) => operation.status === "pending")) return;
    const nextAttempt = Math.min(...outbox.filter((operation) => operation.status === "pending").map((operation) => operation.nextRetryAt ?? Date.now()));
    const timer = window.setTimeout(() => void retrySync(), Math.max(500, nextAttempt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [client, networkOnline, outbox, retrySync]);

  useEffect(() => {
    if (!client || !onlineUser?.clerkId || !navigator.onLine || preparingRef.current) return;
    preparingRef.current = true;
    const prepare = async () => {
      try {
        await renewSession?.();
        const bootstrap = await client.query(api.bitacoraOffline.getOfflineBootstrap, {
          proyecto: projectId as Id<"desarrollos">,
        });
        const saved = await cacheBootstrap({
          clerkId: onlineUser.clerkId!,
          projectId,
          bootstrap: bootstrap as never,
        });
        rememberOfflineUser(saved.clerkId);
        setProfile(saved);
        await requestPersistentStorage();
        await synchronizeProject(client, saved.clerkId, projectId);
      } catch (error) {
        const key = projectScopeKey(onlineUser.clerkId!, projectId);
        const current = await bitacoraDb.syncMetadata.get(key);
        await bitacoraDb.syncMetadata.put({
          key,
          userId: onlineUser.clerkId!,
          projectId,
          version: current?.version ?? 0,
          prepared: current?.prepared ?? false,
          lastSyncAt: current?.lastSyncAt,
          status: "error",
          error: error instanceof Error ? error.message : "No se pudo preparar Bitácora sin conexión.",
        });
      } finally {
        preparingRef.current = false;
      }
    };
    void prepare();
  }, [client, onlineUser?.clerkId, projectId, renewSession]);

  const saveEntry = useCallback(async (args: {
    fields: BitacoraFields;
    entryClientId?: string;
    newAttachments: PreparedAttachment[];
    keptAttachmentClientIds?: string[];
    attachmentUpdates?: Array<{ clientId: string; name?: string; description?: string }>;
  }) => {
    if (!userId || !profile) throw new Error("Bitácora todavía no está preparada para este usuario.");
    const result = await saveEntryLocally({
      userId,
      projectId,
      role: profile.role,
      ...args,
    });
    if (client && navigator.onLine) void retrySync();
    return result.capacity;
  }, [client, profile, projectId, retrySync, userId]);

  const deleteEntry = useCallback(async (entryClientId: string) => {
    if (!userId || !profile) throw new Error("Bitácora todavía no está preparada.");
    await deleteEntryLocally(userId, projectId, profile.role, entryClientId);
    if (client && navigator.onLine) void retrySync();
  }, [client, profile, projectId, retrySync, userId]);

  const entries = useMemo(() => {
    const partMap = new Map((partidas ?? []).map((item) => [item.partidaId, item.name]));
    const grouped = new Map<string, LocalAttachment[]>();
    for (const attachment of attachments ?? []) {
      const list = grouped.get(attachment.entryClientId) ?? [];
      list.push(attachment);
      grouped.set(attachment.entryClientId, list);
    }
    return (storedEntries ?? [])
      .filter((entry) => !entry.deleted || entry.syncState === "conflict")
      .map((entry) => toEntryView(
        entry,
        grouped.get(entry.clientId) ?? [],
        partMap.get(entry.partidaId),
        objectUrls.local,
        objectUrls.thumbnails,
      ));
  }, [attachments, objectUrls, partidas, storedEntries]);

  const value = useMemo<RepositoryContextValue>(() => ({
    projectId,
    project: project ? { id: project.projectId, name: project.name, raw: project.raw } : undefined,
    profile,
    entries,
    partidas: (partidas ?? []).map((item) => ({ id: item.partidaId, name: item.name, nivel: item.nivel, parentId: item.parentId })),
    assignableUsers: (cachedUsers ?? []).map((item) => ({ id: item.targetUserId, name: item.name })),
    isReady: Boolean(profile && project && syncMetadata?.prepared && (client || profile.expiresAt > Date.now())),
    isOnline: Boolean(client && networkOnline),
    canCreate: Boolean(profile && ["admin", "user", "finance", "contratista"].includes(profile.role)),
    canEdit: profile?.role === "admin",
    pendingCount: outbox?.length ?? 0,
    conflictCount: storedEntries?.filter((entry) => entry.syncState === "conflict").length ?? 0,
    syncStatus: syncMetadata?.status ?? "idle",
    syncError: syncMetadata?.error,
    lastSyncAt: syncMetadata?.lastSyncAt,
    saveEntry,
    deleteEntry,
    retrySync,
    acceptServer: async (entryClientId) => {
      if (!userId) return;
      await acceptServerVersion(userId, entryClientId);
    },
    reapplyLocal: async (entryClientId) => {
      if (!userId) return;
      await reapplyLocalVersion(userId, entryClientId);
      if (client && navigator.onLine) void retrySync();
    },
    restoreAsNew: async (entryClientId) => {
      if (!userId || !profile) return;
      await restoreConflictAsNew(userId, entryClientId, profile.role);
      if (client && navigator.onLine) void retrySync();
    },
    makeAttachmentAvailableOffline: async (attachmentClientId) => {
      if (!userId) return "queued";
      if (!networkOnline) {
        await queueHistoricalAttachmentDownload(userId, attachmentClientId);
        return "queued";
      }
      await cacheHistoricalAttachment(userId, attachmentClientId);
      return "downloaded";
    },
  }), [
    cachedUsers,
    client,
    entries,
    networkOnline,
    outbox?.length,
    partidas,
    profile,
    project,
    projectId,
    retrySync,
    saveEntry,
    deleteEntry,
    storedEntries,
    syncMetadata,
    userId,
  ]);

  return <BitacoraRepositoryContext.Provider value={value}>{children}</BitacoraRepositoryContext.Provider>;
}

export function OnlineBitacoraRepositoryProvider({
  children,
  projectId,
  currentUser,
}: {
  children: ReactNode;
  projectId: string;
  currentUser?: OnlineUser | null;
}) {
  const client = useConvex();
  const { getToken } = useAuth();
  const renewSession = useCallback(() => getToken({ skipCache: true }), [getToken]);
  return (
    <BaseBitacoraRepositoryProvider
      projectId={projectId}
      client={client}
      onlineUser={currentUser}
      renewSession={renewSession}
    >
      {children}
    </BaseBitacoraRepositoryProvider>
  );
}

export function OfflineBitacoraRepositoryProvider({
  children,
  projectId,
  profile,
}: {
  children: ReactNode;
  projectId: string;
  profile: OfflineProfile;
}) {
  return (
    <BaseBitacoraRepositoryProvider projectId={projectId} initialProfile={profile}>
      {children}
    </BaseBitacoraRepositoryProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBitacoraRepository() {
  const value = useContext(BitacoraRepositoryContext);
  if (!value) throw new Error("Bitácora debe montarse dentro de BitacoraRepositoryProvider.");
  return value;
}
