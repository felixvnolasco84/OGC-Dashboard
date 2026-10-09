import { useAuth } from "@clerk/clerk-react";
import { useConvex, type ConvexReactClient } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bitacoraDb, projectScopeKey, readProjectSnapshot, rememberOfflineUser, requestPersistentStorage, scopedKey } from "./db";
import { acceptServerVersion, cacheBootstrap, deleteEntryLocally, reapplyLocalVersion, restoreConflictAsNew, resolveBudgetCatalog, saveEntryLocally, toEntryView } from "./repository";
import { cacheHistoricalAttachment, queueHistoricalAttachmentDownload, synchronizeProject } from "./sync";
import { BitacoraAccessError, BitacoraScopeChanged, classifyPreparationFailure, createSingleAttempt, isProfileUsable, measurePreparation } from "./preparation";
import type { BitacoraEntryView, BitacoraFields, LocalAttachment, OfflineProfile, PreparationFailure, PreparationPhase, PreparedAttachment, StorageCapacity } from "./types";

interface OnlineUser { clerkId?: string; name?: string; email?: string; role?: string }
type SaveArgs = {
  fields: BitacoraFields; entryClientId?: string; newAttachments: PreparedAttachment[];
  keptAttachmentClientIds?: string[]; attachmentUpdates?: Array<{ clientId: string; name?: string; description?: string }>;
};
interface RepositoryContextValue {
  projectId: string;
  project?: { id: string; name: string; raw: Record<string, unknown> };
  profile?: OfflineProfile;
  entries: BitacoraEntryView[];
  partidas: Array<{ id: string; name: string; nivel: number; parentId?: string }>;
  assignableUsers: Array<{ id: string; name: string }>;
  isReady: boolean; isOnline: boolean; networkOnline: boolean; backendConnected: boolean; hasClient: boolean;
  isReading: boolean; isBusy: boolean; phase: PreparationPhase; failure?: PreparationFailure;
  profileExpired: boolean; prolonged: boolean; canRetry: boolean;
  canCreate: boolean; canEdit: boolean;
  pendingCount: number; pausedCount: number; errorCount: number; conflictCount: number;
  attachmentCount: number; offlineAttachmentCount: number; downloadErrorCount: number;
  syncStatus: "idle" | "syncing" | "error" | "conflict";
  syncError?: string; lastSyncAt?: number;
  saveEntry: (args: SaveArgs) => Promise<StorageCapacity>;
  deleteEntry: (entryClientId: string) => Promise<void>;
  retrySync: () => Promise<void>;
  acceptServer: (entryClientId: string) => Promise<void>;
  reapplyLocal: (entryClientId: string) => Promise<void>;
  restoreAsNew: (entryClientId: string) => Promise<void>;
  makeAttachmentAvailableOffline: (attachmentClientId: string) => Promise<"downloaded" | "queued">;
}
const BitacoraRepositoryContext = createContext<RepositoryContextValue | null>(null);
interface ProviderProps {
  children: ReactNode; projectId: string; client?: ConvexReactClient; onlineUser?: OnlineUser | null;
  initialProfile?: OfflineProfile; renewSession?: () => Promise<unknown>; isCurrentUser?: () => boolean;
}

function BaseBitacoraRepositoryProvider({ children, projectId, client, onlineUser, initialProfile, renewSession, isCurrentUser }: ProviderProps) {
  const userId = client ? onlineUser?.clerkId : initialProfile?.clerkId;
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const [backendConnected, setBackendConnected] = useState(() => client?.connectionState().isWebSocketConnected ?? false);
  const [now, setNow] = useState(Date.now);
  const [attempt, setAttempt] = useState<{ busy: boolean; phase: PreparationPhase; failure?: PreparationFailure; error?: string }>({ busy: false, phase: "idle" });
  const [prolonged, setProlonged] = useState(false);
  const [objectUrls, setObjectUrls] = useState<{ local: Record<string, string>; thumbnails: Record<string, string> }>({ local: {}, thumbnails: {} });
  const lifetime = useRef(0);
  const mounted = useRef(false);
  const singleAttempt = useRef(createSingleAttempt());
  const persistenceRequested = useRef(false);
  const failedAttempts = useRef(0);
  const automaticRetryAt = useRef(0);
  const entryStarted = useRef(performance.now());
  const entryMeasured = useRef(false);

  useEffect(() => {
    mounted.current = true;
    lifetime.current += 1;
    return () => { mounted.current = false; lifetime.current += 1; };
  }, []);

  const local = useLiveQuery(async () => {
    if (!userId) return { data: undefined, error: undefined };
    const started = performance.now();
    try {
      const data = await readProjectSnapshot(userId, projectId);
      performance.measure("bitacora:reading", { start: started, end: performance.now() });
      return { data, error: undefined };
    } catch (error) {
      return { data: undefined, error: error instanceof Error ? error.message : "No se pudo leer el almacenamiento local." };
    }
  }, [userId, projectId]);
  const candidate = local?.data;
  const data = candidate && candidate.userId === userId && candidate.projectId === projectId ? candidate : undefined;
  const profile = data?.profile ?? initialProfile;
  const profileValid = isProfileUsable(profile, userId, projectId, now);
  const failure = local?.error ? "storage" : attempt.failure;
  const isReady = Boolean(profileValid && data?.project && data.metadata?.prepared && failure !== "forbidden" && isCurrentUser?.() !== false);
  const isReading = local === undefined || !userId;
  const isOnline = Boolean(client && networkOnline && backendConnected);

  useEffect(() => {
    if (!profile) return;
    setNow(Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, profile.expiresAt - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [profile]);

  useEffect(() => {
    if (!isReady || entryMeasured.current) return;
    entryMeasured.current = true;
    performance.measure("bitacora:entrada-hasta-datos", { start: entryStarted.current, end: performance.now() });
  }, [isReady]);

  useEffect(() => {
    setProlonged(false);
    if (!attempt.busy) return;
    // A help threshold, not an error timeout or estimated preparation duration.
    const timer = window.setTimeout(() => setProlonged(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [attempt.busy]);

  useEffect(() => {
    const localUrls: Record<string, string> = {};
    const thumbnails: Record<string, string> = {};
    if (isReady) for (const attachment of data?.attachments ?? []) {
      if (attachment.blob) localUrls[attachment.clientId] = URL.createObjectURL(attachment.blob);
      if (attachment.thumbnail) thumbnails[attachment.clientId] = URL.createObjectURL(attachment.thumbnail);
    }
    setObjectUrls({ local: localUrls, thumbnails });
    return () => [...Object.values(localUrls), ...Object.values(thumbnails)].forEach((url) => URL.revokeObjectURL(url));
  }, [data?.attachments, isReady]);

  const retrySync = useCallback(() => {
    if (!client || !userId || !navigator.onLine || !client.connectionState().isWebSocketConnected) return Promise.resolve();
    const generation = lifetime.current;
    const assertActive = () => {
      if (!mounted.current || generation !== lifetime.current || isCurrentUser?.() === false) throw new BitacoraScopeChanged();
    };
    return singleAttempt.current(async () => {
      let phase: PreparationPhase = "session";
      const timing = measurePreparation();
      const onPhase = (next: PreparationPhase) => {
        assertActive(); timing(next); phase = next;
        setAttempt({ busy: true, phase: next });
      };
      try {
        onPhase("session");
        if (renewSession && !await renewSession()) throw new BitacoraAccessError("session", "No pudimos validar tu sesión.");
        assertActive();
        onPhase("bootstrap");
        const bootstrap = await client.query(api.bitacoraOffline.getOfflineBootstrap, { proyecto: projectId as Id<"desarrollos"> });
        assertActive();
        if (bootstrap.user.clerkId !== userId) throw new BitacoraAccessError("session", "La sesión cambió. Vuelve a iniciar sesión antes de actualizar.");
        onPhase("storage");
        const saved = await cacheBootstrap({ clerkId: userId, projectId, bootstrap: bootstrap as never });
        assertActive();
        rememberOfflineUser(saved.clerkId);
        if (!persistenceRequested.current) { await requestPersistentStorage(); persistenceRequested.current = true; }
        assertActive();
        let result = await synchronizeProject(client, userId, projectId, { onPhase, assertActive });
        while (result === "busy") {
          onPhase("waiting");
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          assertActive();
          if (!navigator.onLine || !client.connectionState().isWebSocketConnected) break;
          result = await synchronizeProject(client, userId, projectId, { onPhase, assertActive });
        }
        assertActive();
        failedAttempts.current = 0;
        automaticRetryAt.current = 0;
        setAttempt({ busy: false, phase: "idle" });
      } catch (error) {
        if (error instanceof BitacoraScopeChanged || !mounted.current || generation !== lifetime.current) return;
        const kind = classifyPreparationFailure(error, phase);
        const message = error instanceof Error ? error.message : "No se pudo preparar o actualizar Bitácora.";
        if (kind === "unknown") {
          failedAttempts.current += 1;
          automaticRetryAt.current = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(failedAttempts.current, 6));
        }
        // Diagnosis must still render when writing the database also fails.
        setAttempt({ busy: false, phase: "idle", failure: kind, error: message });
        try {
          assertActive();
          if (kind === "forbidden") {
            const cached = await bitacoraDb.offlineProfiles.get(userId);
            assertActive();
            if (cached) await bitacoraDb.offlineProfiles.update(userId, { projectIds: cached.projectIds.filter((id) => id !== projectId) });
          }
          const key = projectScopeKey(userId, projectId);
          const current = await bitacoraDb.syncMetadata.get(key);
          assertActive();
          await bitacoraDb.syncMetadata.put({ key, userId, projectId, version: current?.version ?? 0, prepared: current?.prepared ?? false, lastSyncAt: current?.lastSyncAt, status: "error", error: message });
        } catch { /* Keep the in-memory error without clearing local data. */ }
      } finally { timing("idle"); }
    });
  }, [client, userId, projectId, renewSession, isCurrentUser]);

  useEffect(() => {
    const generation = lifetime.current;
    queueMicrotask(() => { if (mounted.current && generation === lifetime.current && networkOnline && backendConnected) void retrySync(); });
  }, [retrySync, networkOnline, backendConnected]);

  useEffect(() => {
    const online = () => { setNetworkOnline(true); void retrySync(); };
    const offline = () => setNetworkOnline(false);
    const visible = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void retrySync(); } };
    window.addEventListener("online", online); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); };
  }, [retrySync]);

  useEffect(() => {
    if (!client) return;
    setBackendConnected(client.connectionState().isWebSocketConnected);
    return client.subscribeToConnectionState((state) => setBackendConnected(state.isWebSocketConnected));
  }, [client]);

  useEffect(() => {
    const pending = data?.outbox.filter((operation) => operation.status === "pending") ?? [];
    if (!isOnline || attempt.busy || failure === "session" || failure === "forbidden" || failure === "storage" || !pending.length) return;
    const nextAttempt = Math.max(automaticRetryAt.current, Math.min(...pending.map((operation) => operation.nextRetryAt ?? Date.now())));
    const timer = window.setTimeout(() => void retrySync(), Math.max(500, nextAttempt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [isOnline, attempt.busy, failure, data?.outbox, retrySync]);

  const requireProfile = () => {
    if (!mounted.current || !userId || !profile || !isReady || !isProfileUsable(profile, userId, projectId) || isCurrentUser?.() === false) throw new Error("Se requiere una preparación vigente para este usuario y proyecto.");
    return { userId, profile };
  };
  const requireEntryScope = async (id: string) => {
    const current = requireProfile();
    const entry = await bitacoraDb.entries.get(scopedKey(current.userId, id));
    requireProfile();
    if (!entry || entry.projectId !== projectId) throw new Error("El reporte no pertenece a esta Bitácora.");
    return current;
  };
  const entries = useMemo(() => {
    if (!isReady) return [];
    const partMap = new Map((data?.partidas ?? []).map((item) => [item.partidaId, item.name]));
    const grouped = new Map<string, LocalAttachment[]>();
    for (const attachment of data?.attachments ?? []) {
      const list = grouped.get(attachment.entryClientId) ?? []; list.push(attachment); grouped.set(attachment.entryClientId, list);
    }
    return (data?.entries ?? []).filter((entry) => !entry.deleted || entry.syncState === "conflict")
      .map((entry) => toEntryView(entry, grouped.get(entry.clientId) ?? [], partMap.get(entry.partidaId), objectUrls.local, objectUrls.thumbnails));
  }, [isReady, data, objectUrls]);
  const visibleIds = new Set(entries.map((entry) => entry.client_id));
  const visibleFiles = (data?.attachments ?? []).filter((item) => !item.deleted && visibleIds.has(item.entryClientId));
  const value: RepositoryContextValue = {
    projectId, project: profileValid && failure !== "forbidden" && isCurrentUser?.() !== false && data?.project ? { id: projectId, name: data.project.name, raw: data.project.raw } : undefined,
    profile: profileValid ? profile : undefined, entries,
    partidas: isReady ? resolveBudgetCatalog(data?.partidas ?? []) : [],
    assignableUsers: isReady ? (data?.users ?? []).map((item) => ({ id: item.targetUserId, name: item.name })) : [],
    isReady, isOnline, networkOnline, backendConnected, hasClient: Boolean(client), isReading,
    isBusy: attempt.busy, phase: attempt.busy ? attempt.phase : isReading ? "reading" : "idle", failure,
    profileExpired: Boolean(profile && profile.clerkId === userId && profile.expiresAt <= now), prolonged,
    canRetry: Boolean(client && userId && isOnline && !attempt.busy && failure !== "session" && failure !== "forbidden"),
    canCreate: Boolean(isReady && profile && ["admin", "user", "finance", "contratista"].includes(profile.role)),
    canEdit: Boolean(isReady && profile?.role === "admin"),
    pendingCount: isReady ? data?.outbox.filter((item) => item.status !== "paused").length ?? 0 : 0,
    pausedCount: isReady ? data?.outbox.filter((item) => item.status === "paused").length ?? 0 : 0,
    errorCount: isReady ? data?.entries.filter((entry) => entry.syncState === "error").length ?? 0 : 0,
    conflictCount: isReady ? data?.entries.filter((entry) => entry.syncState === "conflict").length ?? 0 : 0,
    attachmentCount: visibleFiles.length, offlineAttachmentCount: visibleFiles.filter((item) => Boolean(item.blob)).length,
    downloadErrorCount: visibleFiles.filter((item) => Boolean(item.downloadError && !item.blob)).length,
    syncStatus: attempt.busy ? "syncing" : data?.metadata?.status ?? "idle",
    syncError: local?.error ?? attempt.error ?? data?.metadata?.error,
    lastSyncAt: isReady ? data?.metadata?.lastSyncAt : undefined,
    saveEntry: async (args) => { const { userId, profile } = requireProfile(); const result = await saveEntryLocally({ userId, projectId, role: profile.role, ...args }); void retrySync(); return result.capacity; },
    deleteEntry: async (id) => { const { userId, profile } = requireProfile(); await deleteEntryLocally(userId, projectId, profile.role, id); void retrySync(); },
    retrySync,
    acceptServer: async (id) => { const { userId } = await requireEntryScope(id); await acceptServerVersion(userId, id); },
    reapplyLocal: async (id) => { const { userId } = await requireEntryScope(id); await reapplyLocalVersion(userId, id); void retrySync(); },
    restoreAsNew: async (id) => { const { userId, profile } = await requireEntryScope(id); await restoreConflictAsNew(userId, id, profile.role); void retrySync(); },
    makeAttachmentAvailableOffline: async (id) => {
      const { userId } = requireProfile();
      const generation = lifetime.current;
      const assertActive = () => { if (!mounted.current || lifetime.current !== generation || isCurrentUser?.() === false) throw new BitacoraScopeChanged(); };
      const file = await bitacoraDb.attachments.get(scopedKey(userId, id));
      assertActive();
      if (!file || file.projectId !== projectId) throw new Error("El archivo no pertenece a esta Bitácora.");
      if (!isOnline) { await queueHistoricalAttachmentDownload(userId, id); return "queued"; }
      try { await cacheHistoricalAttachment(userId, id, { assertActive }); return "downloaded"; }
      catch (error) { assertActive(); await bitacoraDb.attachments.update(file.key, { downloadError: error instanceof Error ? error.message : "No se pudo descargar el archivo." }); throw error; }
    },
  };
  return <BitacoraRepositoryContext.Provider value={value}>{children}</BitacoraRepositoryContext.Provider>;
}

export function BitacoraRepositoryProvider(props: ProviderProps) {
  const userId = props.client ? props.onlineUser?.clerkId : props.initialProfile?.clerkId;
  return <BaseBitacoraRepositoryProvider key={`${userId ?? "unknown"}:${props.projectId}`} {...props} />;
}
export function OnlineBitacoraRepositoryProvider({ children, projectId, currentUser }: { children: ReactNode; projectId: string; currentUser?: OnlineUser | null }) {
  const client = useConvex();
  const { getToken, userId } = useAuth();
  const identity = useRef(userId);
  identity.current = userId;
  const expectedUser = currentUser?.clerkId;
  const isCurrentUser = useCallback(() => Boolean(expectedUser && identity.current === expectedUser), [expectedUser]);
  const renewSession = useCallback(() => getToken({ skipCache: true }), [getToken]);
  return <BitacoraRepositoryProvider projectId={projectId} client={client} onlineUser={userId === expectedUser ? currentUser : undefined} renewSession={renewSession} isCurrentUser={isCurrentUser}>{children}</BitacoraRepositoryProvider>;
}
export function OfflineBitacoraRepositoryProvider({ children, projectId, profile }: { children: ReactNode; projectId: string; profile: OfflineProfile }) {
  return <BitacoraRepositoryProvider projectId={projectId} initialProfile={profile}>{children}</BitacoraRepositoryProvider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useBitacoraRepository() {
  const value = useContext(BitacoraRepositoryContext);
  if (!value) throw new Error("Bitácora debe montarse dentro de BitacoraRepositoryProvider.");
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalBitacoraRepository() {
  return useContext(BitacoraRepositoryContext);
}
