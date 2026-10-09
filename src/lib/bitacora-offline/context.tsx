import { useAuth } from "@clerk/clerk-react";
import { useConvex, usePaginatedQuery, useQuery, type ConvexReactClient } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bitacoraDb, projectScopeKey, readProjectSnapshot, rememberOfflineUser, requestPersistentStorage, scopedKey } from "./db";
import { acceptServerVersion, cacheBootstrap, deleteEntryLocally, reapplyLocalVersion, restoreConflictAsNew, resolveBudgetCatalog, saveEntryLocally, toEntryView } from "./repository";
import { cacheHistoricalAttachment, queueHistoricalAttachmentDownload, synchronizeProject } from "./sync";
import { BitacoraAccessError, BitacoraScopeChanged, classifyPreparationFailure, createSingleAttempt, isProfileUsable, measurePreparation } from "./preparation";
import type { BitacoraEntryView, BitacoraSaveArgs, BitacoraSaveResult, LocalAttachment, OfflineProfile, PreparationFailure, PreparationPhase, RemoteEntry } from "./types";
import { browserConnection, canUseOnlineBitacora } from "./connection";
import { deleteEntryOnline, mergeOnlineEntries, saveEntryOnline, toOnlineEntryView } from "./online";

interface OnlineUser { clerkId?: string; name?: string; email?: string; role?: string }
interface RepositoryContextValue {
  mode: "online" | "offline";
  accountId?: string;
  projectId: string;
  project?: { id: string; name: string; raw: Record<string, unknown> };
  profile?: OfflineProfile;
  entries: BitacoraEntryView[];
  localChangedIds: string[];
  cacheVersion?: number;
  canLoadMore?: boolean; isLoadingMore?: boolean; loadMore?: () => void;
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
  saveEntry: (args: BitacoraSaveArgs) => Promise<BitacoraSaveResult>;
  deleteEntry: (entryClientId: string) => Promise<"server" | "local">;
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
  preferOnline?: boolean;
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
    mode: "offline", accountId: userId,
    projectId, project: profileValid && failure !== "forbidden" && isCurrentUser?.() !== false && data?.project ? { id: projectId, name: data.project.name, raw: data.project.raw } : undefined,
    profile: profileValid ? profile : undefined, entries,
    localChangedIds: isReady ? (data?.entries ?? []).filter(entry => entry.syncState !== "synced").map(entry => entry.clientId) : [],
    cacheVersion: data?.metadata?.version,
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
    saveEntry: async (args) => { const { userId, profile } = requireProfile(); const result = await saveEntryLocally({ userId, projectId, role: profile.role, ...args }); void retrySync(); return { saved: "local", capacity: result.capacity }; },
    deleteEntry: async (id) => { const { userId, profile } = requireProfile(); await deleteEntryLocally(userId, projectId, profile.role, id); void retrySync(); return "local"; },
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
  return <BaseBitacoraRepositoryProvider key={`${userId ?? "unknown"}:${props.projectId}`} {...props}>
    {props.preferOnline && props.client
      ? <AdaptiveBitacoraRepository client={props.client} onlineUser={props.onlineUser} isCurrentUser={props.isCurrentUser}>{props.children}</AdaptiveBitacoraRepository>
      : props.children}
  </BaseBitacoraRepositoryProvider>;
}

function AdaptiveBitacoraRepository({ children, client, onlineUser, isCurrentUser }: Pick<ProviderProps, "children" | "onlineUser" | "isCurrentUser"> & { client: ConvexReactClient }) {
  const local = useBitacoraRepository();
  const lifetime = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true; lifetime.current += 1;
    return () => { mounted.current = false; lifetime.current += 1; };
  }, []);
  const [slow, setSlow] = useState(() => !canUseOnlineBitacora(true, true, browserConnection()));
  useEffect(() => {
    const connection = browserConnection();
    const changed = () => setSlow(!canUseOnlineBitacora(true, true, connection));
    connection?.addEventListener("change", changed);
    return () => connection?.removeEventListener("change", changed);
  }, []);
  const healthy = local.networkOnline && local.backendConnected && !slow;
  const authenticated = Boolean(onlineUser?.clerkId && isCurrentUser?.() !== false);
  const queryArgs = healthy && authenticated ? { proyecto: local.projectId as Id<"desarrollos"> } : "skip";
  const bootstrap = useQuery(api.bitacoraOffline.getOfflineBootstrap, queryArgs);
  const logs = usePaginatedQuery(api.bitacora.getLogEntriesByProject, queryArgs, { initialNumItems: 50 });
  const scoped = Boolean(bootstrap && bootstrap.user.clerkId === onlineUser?.clerkId && bootstrap.project._id === local.projectId && authenticated);
  const ready = scoped && logs.status !== "LoadingFirstPage";
  const entries = useMemo(() => scoped
    ? mergeOnlineEntries((logs.results as RemoteEntry[]).map(toOnlineEntryView), local.entries, local.localChangedIds)
    : [], [scoped, logs.results, local.entries, local.localChangedIds]);
  const { isBusy, failure, syncError, cacheVersion, retrySync } = local;

  // Cache refresh is a background task. Its failure never blocks online reads
  // or writes. A reactive server version also catches changes by other users.
  useEffect(() => {
    if (healthy && scoped && bootstrap && !isBusy && !failure && !syncError &&
      cacheVersion !== undefined && bootstrap.latestVersion > cacheVersion) void retrySync();
  }, [healthy, scoped, bootstrap, isBusy, failure, syncError, cacheVersion, retrySync]);

  const onlineGuard = () => {
    const generation = lifetime.current;
    return () => {
      if (!mounted.current || generation !== lifetime.current || isCurrentUser?.() === false || !authenticated || !scoped) throw new BitacoraScopeChanged();
      if (!canUseOnlineBitacora(navigator.onLine, client.connectionState().isWebSocketConnected, browserConnection()))
        throw new Error("La conexión cambió. Vuelve a guardar cuando esté disponible el modo sin conexión.");
    };
  };
  const findEntry = (id: string) => {
    const entry = entries.find(item => item.client_id === id);
    if (!entry) throw new Error("El reporte no pertenece a esta Bitácora.");
    return entry;
  };
  const localWork = local.pendingCount + local.pausedCount + local.errorCount + local.conflictCount > 0;
  const value: RepositoryContextValue = {
    ...local, mode: "online", entries,
    project: scoped && bootstrap ? { id: local.projectId, name: bootstrap.project.nombre ?? "Proyecto", raw: bootstrap.project } : undefined,
    profile: scoped && bootstrap ? {
      clerkId: bootstrap.user.clerkId, userId: bootstrap.user.clerkId, name: bootstrap.user.name,
      email: bootstrap.user.email, role: bootstrap.user.role, projectIds: [local.projectId],
      verifiedAt: bootstrap.verifiedAt, expiresAt: bootstrap.expiresAt,
    } : undefined,
    partidas: scoped && bootstrap ? resolveBudgetCatalog(bootstrap.partidas.map(item => ({
      partidaId: item._id, name: item.nombre ?? "Sin nombre", nivel: item.nivel, raw: item,
    }))) : [],
    assignableUsers: scoped && bootstrap ? bootstrap.assignableUsers.map(item => ({ id: item._id, name: item.name })) : [],
    isReady: ready, isReading: !ready, isBusy: false, phase: "idle", failure: undefined,
    profileExpired: false, prolonged: false, syncError: localWork ? local.syncError : undefined,
    syncStatus: localWork ? local.syncStatus : "idle", lastSyncAt: undefined,
    canRetry: localWork && local.canRetry,
    canCreate: Boolean(ready && bootstrap && ["admin", "user", "finance", "contratista"].includes(bootstrap.user.role)),
    canEdit: Boolean(ready && bootstrap?.user.role === "admin"),
    canLoadMore: logs.status === "CanLoadMore", isLoadingMore: logs.status === "LoadingMore", loadMore: () => logs.loadMore(50),
    saveEntry: async (args) => {
      const assertActive = onlineGuard();
      assertActive();
      const entry = args.entryClientId ? findEntry(args.entryClientId) : undefined;
      if (entry && entry.sync_state !== "synced") return local.saveEntry(args);
      return saveEntryOnline(client, local.projectId, args, entry, assertActive);
    },
    deleteEntry: async (id) => {
      const assertActive = onlineGuard();
      assertActive();
      const entry = findEntry(id);
      if (entry.sync_state !== "synced") return local.deleteEntry(id);
      return deleteEntryOnline(client, local.projectId, entry, assertActive);
    },
  };
  return <BitacoraRepositoryContext.Provider value={healthy ? value : local}>{children}</BitacoraRepositoryContext.Provider>;
}
export function OnlineBitacoraRepositoryProvider({ children, projectId, currentUser }: { children: ReactNode; projectId: string; currentUser?: OnlineUser | null }) {
  const client = useConvex();
  const { getToken, userId } = useAuth();
  const identity = useRef(userId);
  identity.current = userId;
  const expectedUser = currentUser?.clerkId;
  const isCurrentUser = useCallback(() => Boolean(expectedUser && identity.current === expectedUser), [expectedUser]);
  const renewSession = useCallback(() => getToken({ skipCache: true }), [getToken]);
  return <BitacoraRepositoryProvider preferOnline projectId={projectId} client={client} onlineUser={userId === expectedUser ? currentUser : undefined} renewSession={renewSession} isCurrentUser={isCurrentUser}>{children}</BitacoraRepositoryProvider>;
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
