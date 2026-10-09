import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import "../../../src/index.css";
import BitacoraPage from "../../../src/pages/Bitacora/BitacoraPage";
import BitacoraModal from "../../../src/components/Bitacora/BitacoraModal";
import { BitacoraRepositoryProvider, useBitacoraRepository } from "../../../src/lib/bitacora-offline/context";
import { bitacoraDb } from "../../../src/lib/bitacora-offline/db";
import { cacheBootstrap, mergeRemoteEntries } from "../../../src/lib/bitacora-offline/repository";
import type { OfflineProfile, RemoteEntry } from "../../../src/lib/bitacora-offline/types";

// Dedicated localhost origin, synthetic IndexedDB and a client without network methods.
const scenario = new URLSearchParams(location.search).get("scenario") ?? "first";
const adaptive = ["adaptive", "online-storage"].includes(scenario);
const projectId = "qa-project";
let currentUser = "qa-user";
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
let bootstrapCalls = 0;
let mutationCalls = 0;
const profile = (user = currentUser): OfflineProfile => ({ clerkId: user, userId: user, name: "Usuario de prueba", email: "qa@example.test", role: scenario === "viewer" ? "viewer" : "admin", projectIds: [projectId, "qa-project-b"], verifiedAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
const bootstrap = (id: string, user = currentUser) => ({ verifiedAt: Date.now(), expiresAt: Date.now() + 86_400_000, latestVersion: 1,
  user: { clerkId: user, name: "Usuario de prueba", role: scenario === "viewer" ? "viewer" : "admin", allowed_desarrollos: [id] },
  project: { _id: id, nombre: id === "qa-project-b" ? "Proyecto B · prueba de aislamiento" : "Proyecto de prueba" },
  partidas: [{ _id: "qa-partida", nombre: "Estructura", nivel: 1 }], assignableUsers: [],
});
const row = (id = "qa-entry", stateProject = projectId): RemoteEntry => ({ _id: id, proyecto: stateProject, client_id: id, revision: 1, sync_version: 1, updated_at: Date.now(), uploaded_at: Date.now(), categoria: "Estructura", partida_id: "qa-partida", familias_tags: ["Concreto"], responsable: "Usuario de prueba", fecha: "09/10/2026", avance_dia: "Revisión de avance con datos simulados.", comentarios: "Registro utilizado únicamente para validar la interfaz.", status: "Sin problemas", documentos: [{ _id: `${id}-file`, client_id: `${id}-file`, kind: "document", nombre: "Evidencia de prueba.pdf", url: undefined }], fotos: [] });
let serverRows = [row()];
let serverVersion = 1;
const watches = new Map<string, { result: unknown; listeners: Set<() => void>; refresh: () => Promise<void> }>();
const networkQuality = Object.assign(new EventTarget(), { effectiveType: "4g", downlink: 10, rtt: 50 });
if (adaptive) Object.defineProperty(navigator, "connection", { configurable: true, value: networkQuality });
const renewSession = async () => scenario === "session" ? null : "token-simulado";
let connected = scenario !== "backend" && scenario !== "offline";
const listeners = new Set<(state: { isWebSocketConnected: boolean }) => void>();
const mock = {
  connectionState: () => ({ isWebSocketConnected: connected }),
  subscribeToConnectionState: (listener: (state: { isWebSocketConnected: boolean }) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  query: async (reference: Parameters<typeof getFunctionName>[0], args: { proyecto: string; afterVersion?: number; paginationOpts?: { numItems: number; cursor: string | null } }) => {
    const name = getFunctionName(reference);
    if (name.endsWith("getOfflineBootstrap")) {
      const owner = currentUser; bootstrapCalls += 1;
      if (scenario === "error" && bootstrapCalls === 1) throw new Error("Respuesta del servidor simulada para validar el reintento.");
      if (scenario === "forbidden") throw new Error("Unauthorized: Project access required");
      if (["first", "updating", "scope", "expiry"].includes(scenario) && args.proyecto === projectId && owner === "qa-user") await gate;
      return { ...bootstrap(args.proyecto, owner), latestVersion: serverVersion };
    }
    if (adaptive) return { page: serverRows.filter(entry => name.endsWith("pullChanges") ? entry.sync_version > (args.afterVersion ?? 0) : !entry.deleted_at).map(entry => ({ ...entry, departamento: "Estructura" })), isDone: true, continueCursor: "", latestVersion: serverVersion };
    return { page: scenario === "empty" || scenario === "viewer" ? [] : [row(args.proyecto === projectId ? "qa-entry" : "qa-entry-b", args.proyecto)], isDone: true, continueCursor: "", latestVersion: 1 };
  },
  watchQuery: (reference: Parameters<typeof getFunctionName>[0], args: { proyecto: string }) => {
    const key = `${getFunctionName(reference)}:${JSON.stringify(args)}`;
    let watch = watches.get(key);
    if (!watch) {
      watch = { result: undefined, listeners: new Set(), refresh: async () => {
        watch!.result = await mock.query(reference, args as never); watch!.listeners.forEach(listener => listener());
      } };
      watches.set(key, watch);
    }
    return { localQueryResult: () => watch!.result, journal: () => undefined,
      onUpdate: (listener: () => void) => { watch!.listeners.add(listener); if (watch!.result === undefined) void watch!.refresh(); return () => watch!.listeners.delete(listener); } };
  },
  mutation: async (reference: Parameters<typeof getFunctionName>[0], args: { operation: string; clientId: string; logId?: string; payload?: { categoria: string; partida_id: string; familias_tags: string[]; responsable: string; fecha: string; avance_dia: string; comentarios?: string; status: string } }) => {
    mutationCalls += 1;
    if (!adaptive || !getFunctionName(reference).endsWith("applyOfflineOperation")) throw new Error("Las mutaciones de backend están bloqueadas en esta validación.");
    const previous = serverRows.find(entry => entry.client_id === args.clientId);
    serverVersion += 1;
    const entry = { ...row(args.logId ?? `simulated-${serverVersion}`), ...previous, ...args.payload,
      client_id: args.clientId, revision: (previous?.revision ?? 0) + 1, sync_version: serverVersion,
      deleted_at: args.operation === "delete" ? Date.now() : undefined,
    };
    serverRows = [...serverRows.filter(item => item.client_id !== args.clientId), entry];
    await Promise.all([...watches.values()].map(watch => watch.refresh()));
    return { status: "applied", logId: entry._id, revision: entry.revision, syncVersion: serverVersion };
  },
} as unknown as ConvexReactClient;

function Probe() {
  const r = useBitacoraRepository();
  const [result, setResult] = useState("");
  return <div className="border-t border-border p-4 text-xs text-muted-foreground">
    <p style={{ overflowWrap: "anywhere" }} data-testid="repository-state">{JSON.stringify({ mode: r.mode, project: r.projectId, ready: r.isReady, busy: r.isBusy, phase: r.phase, pending: r.pendingCount, paused: r.pausedCount, errors: r.errorCount, conflicts: r.conflictCount, files: r.attachmentCount, offlineFiles: r.offlineAttachmentCount })}</p>
    <p data-testid="network-counts">Bootstrap: {bootstrapCalls}; mutaciones remotas: {mutationCalls}</p>
    <button type="button" className="mt-2 underline" onClick={async () => {
      const before = bootstrapCalls;
      const tasks = Array.from({ length: 5 }, () => r.retrySync());
      await Promise.resolve();
      setResult(bootstrapCalls === before ? "Cinco disparadores compartieron el intento activo." : "Se inició un único intento; esperando resultado.");
      await Promise.all(tasks);
    }}>Probar disparadores simultáneos</button>
    <p role="status">{result}</p>
    {adaptive && <button className="mt-2 underline" onClick={async () => {
      const saved = await r.saveEntry({ fields: { categoria: "Estructura", partidaId: "qa-partida", familiasTags: [],
        responsable: "Usuario de prueba", fecha: "09/10/2026", avanceDia: "Reporte creado para validar el cambio de conexión.", status: "Sin problemas" }, newAttachments: [] });
      const outbox = await bitacoraDb.outbox.count().catch(() => -1);
      setResult(outbox < 0 ? `Guardado: ${saved.saved}; almacenamiento local no disponible` : `Guardado: ${saved.saved}; operaciones locales: ${outbox}`);
    }}>Guardar reporte de prueba</button>}
  </div>;
}

function App() {
  const [id, setId] = useState(projectId);
  const [user, setUser] = useState(currentUser);
  const [status, setStatus] = useState("");
  const offline = ["offline", "missing", "expired", "conflicts", "viewer"].includes(scenario);
  return <ConvexProvider client={mock}><MemoryRouter initialEntries={[`/proyecto/${projectId}/bitacora`]}>
    <div className="border-b border-border bg-muted p-3 text-xs text-foreground">
      <strong>Validación local · datos simulados · sin conexión a datos de obra</strong>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label>Escenario <select aria-label="Escenario de validación" value={scenario} className="border border-border bg-card p-1" onChange={(event) => { location.search = `?scenario=${event.target.value}`; }}>
          {["adaptive", "online-storage", "first", "updating", "error", "offline", "missing", "expired", "backend", "conflicts", "empty", "viewer", "session", "forbidden", "scope", "expiry", "storage"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <button className="underline" onClick={() => { release(); setStatus("Respuesta simulada liberada"); }}>Completar preparación</button>
        <button className="underline" onClick={() => { connected = true; listeners.forEach((listener) => listener({ isWebSocketConnected: true })); }}>Reconectar backend simulado</button>
        {adaptive && <>
          <button className="underline" onClick={() => { connected = false; listeners.forEach(listener => listener({ isWebSocketConnected: false })); }}>Desconectar backend simulado</button>
          <button className="underline" onClick={() => { networkQuality.downlink = 0.2; networkQuality.rtt = 1500; networkQuality.dispatchEvent(new Event("change")); }}>Simular conexión lenta</button>
          <button className="underline" onClick={() => { networkQuality.downlink = 10; networkQuality.rtt = 50; networkQuality.dispatchEvent(new Event("change")); }}>Restaurar buena conexión</button>
        </>}
        <button className="underline" onClick={() => { setId("qa-project-b"); }}>Cambiar proyecto</button>
        <button className="underline" onClick={() => { currentUser = "qa-user-b"; setUser(currentUser); }}>Cambiar usuario</button>
        <button className="underline" onClick={async () => { await bitacoraDb.offlineProfiles.update(user, { expiresAt: Date.now() + 1500 }); setStatus("El perfil vencerá en 1,5 segundos"); }}>Probar vencimiento</button>
      </div>
      <p role="status">{status}</p>
    </div>
    <BitacoraRepositoryProvider preferOnline={adaptive} projectId={id} client={offline ? undefined : mock} onlineUser={offline ? undefined : { clerkId: user }} initialProfile={offline ? profile(user) : undefined}
      renewSession={renewSession}>
      <BitacoraPage />{adaptive && <BitacoraModal />}<Probe />
    </BitacoraRepositoryProvider>
    <Toaster />
  </MemoryRouter></ConvexProvider>;
}

async function main() {
  await bitacoraDb.delete(); await bitacoraDb.open();
  localStorage.removeItem("ogc:bitacora:last-user");
  if (["updating", "offline", "expired", "backend", "conflicts", "viewer", "scope", "expiry"].includes(scenario)) {
    await cacheBootstrap({ clerkId: currentUser, projectId, bootstrap: bootstrap(projectId) });
    if (scenario !== "viewer") await mergeRemoteEntries(currentUser, projectId, [row()]);
    await bitacoraDb.syncMetadata.put({ key: `${currentUser}:${projectId}`, userId: currentUser, projectId, version: 1, prepared: true, lastSyncAt: Date.now() - 3_600_000, status: "idle" });
    if (scenario === "expired") await bitacoraDb.offlineProfiles.update(currentUser, { expiresAt: Date.now() - 1 });
    if (scenario === "conflicts") {
      await mergeRemoteEntries(currentUser, projectId, [row("qa-error"), row("qa-conflict"), row("qa-pending")]);
      await bitacoraDb.entries.update(`${currentUser}:qa-error`, { syncState: "error", syncError: "Este reporte requiere corregir un campo antes de enviarlo." });
      await bitacoraDb.entries.update(`${currentUser}:qa-conflict`, { syncState: "conflict", serverSnapshot: { ...row("qa-conflict"), avance_dia: "Versión del servidor simulada." } });
      await bitacoraDb.entries.update(`${currentUser}:qa-pending`, { syncState: "pending" });
      for (const [entryClientId, status] of [["qa-error", "paused"], ["qa-conflict", "paused"], ["qa-pending", "pending"]] as const) await bitacoraDb.outbox.put({ operationId: entryClientId, userId: currentUser, projectId, entryClientId, operation: "update", baseRevision: 1, removedAttachmentClientIds: [], status, attempts: 0, createdAt: Date.now(), updatedAt: Date.now() });
      await bitacoraDb.attachments.update(`${currentUser}:qa-entry-file`, { blob: new Blob(["archivo de prueba"], { type: "application/pdf" }) });
      await bitacoraDb.attachments.update(`${currentUser}:qa-error-file`, { downloadRequested: true, downloadError: "No se pudo descargar el archivo de prueba." });
    }
  }
  if (scenario === "storage" || scenario === "online-storage") bitacoraDb.close({ disableAutoOpen: true });
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}
void main();
