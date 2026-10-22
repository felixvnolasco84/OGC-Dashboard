/* Isolated transport for real components. No backend, account, or production data. */
import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { useQuery as baseQuery, useMutation as baseMutation } from "./weight-convex-stub";

type Data = Record<string, any>;
const scenario = new URLSearchParams(location.search).get("case") || "history";
const mutations: Data[] = [], attempts: Data[] = [], items: Data[] = [];
let tick = 0, queryUnavailable = false, loseStart = scenario === "lost-start", loseAction = scenario === "lost-response" || scenario === "uncertain";
const listeners = new Set<() => void>();
const notify = () => { tick++; listeners.forEach(fn => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const counts = { created: 0, updated: 1, unchanged: 1, skipped: 0, total: 2 };
const result = { status: "updated", created: 0, updated: 1, unchanged: 1, errors: [], partidas: { ...counts, updated: 0, unchanged: 1, total: 1 }, familias: { ...counts, unchanged: 0, total: 1 }, activity_effects: 1, version: 2, revision_id: "revision" };
const source = { file_name: "Programa original · revisión de cimentación y columnas octubre 2026.xlsx", file_hash: "a".repeat(64), sheet_name: "Programa" };
const makeAttempt = (id: string, status: string) => ({ _id: id, proyecto: "project", request_id: id, status,
  source, imported_by: "actor", imported_by_name: "María · usuario ficticio", created_at: Date.UTC(2026, 9, 21, 18),
  size: 16840, storage_id: status === "legacy" ? undefined : "original", file_available: status !== "legacy", result: status === "unchanged" ? { ...result, status: "unchanged", updated: 0, unchanged: 2, activity_effects: 0 } : status === "completed" ? result : undefined,
  error: status === "failed" ? "El programa cambió durante la subida; vuelve a revisar el Excel." : undefined,
});
if (["history", "pagination", "sources", "viewer"].includes(scenario)) {
  attempts.push(makeAttempt("completed", "completed"), makeAttempt("unchanged", "unchanged"), makeAttempt("failed", "failed"), { ...makeAttempt("legacy", "legacy"), source: undefined });
  items.push({ _id: "row", proyecto: "project", attempt_id: "completed", target_key: "detail:familyA", name: "Estructura / Cimentación anterior",
    kind: "row", outcome: "updated", review_index: 1, deleted: true, row_json: "{}", before_json: JSON.stringify({ fecha_fin: "10/10/2026", peso: 20 }), after_json: JSON.stringify({ fecha_fin: "15/10/2026", peso: 20 }), imported_at: Date.now() },
    { _id: "effect", proyecto: "project", attempt_id: "completed", target_key: "activity:activityB", name: "Columnas · frente norte", kind: "activity_effect", outcome: "updated", effect_reason: "Reprogramación por dependencias; no acredita una fila del Excel", after_json: JSON.stringify({ current_start: "2026-10-16", current_finish: "2026-10-23" }), imported_at: Date.now() });
  if (scenario === "pagination") for (let i = 0; i < 22; i++) attempts.push(makeAttempt(`old-${i}`, "completed"));
}
function paginate(data: Data[], args: Data) {
  const offset = Number(args.paginationOpts?.cursor ?? 0), size = Math.min(25, args.paginationOpts?.numItems ?? 25);
  return { page: data.slice(offset, offset + size), isDone: offset + size >= data.length, continueCursor: String(offset + size) };
}
function read(name: string, args: Data) {
  if (name.endsWith(":listHistory")) return paginate(attempts, args);
  if (name.endsWith(":listAttemptItems")) return paginate(items.filter(i => i.attempt_id === args.attempt_id), args);
  if (name.endsWith(":listSources")) return paginate(items.filter(i => i.target_key === `${args.target.kind}:${args.target.id}`).map(i => ({ ...i, attempt: attempts.find(a => a._id === i.attempt_id), file_available: true })), args);
  if (name.endsWith(":getDownloadUrl")) return { url: "/mock-program-original", file_name: attempts.find(a => a._id === args.attempt_id)?.source?.file_name };
  if (name.endsWith(":getAttempt")) {
    if (queryUnavailable) { queryUnavailable = false; throw new Error("Sin conexión para comprobar el resultado"); }
    const attempt = attempts.find(a => a._id === args.attempt_id);
    return { ...attempt, reviewed_json: attempt.reviewed_json ?? JSON.stringify({ rows: [{ partida: "Estructura", familia: "Cimentación", detalle_id: "familyA" }], review: { date_resolutions: [{ partida: "Estructura", child: "Cimentación", choice: "parent", parent_finish: "31/12/2026", child_finish: "02/01/2027" }] } }), snapshot_json: JSON.stringify({ absent: [{ id: "familyB", name: "Estructura / Columnas conservadas" }], rows: [{ partida: "Estructura", familia: "Anterior", fecha_inicio: "01/10/2026" }] }) };
  }
  return undefined;
}
export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: Data | "skip") {
  useSyncExternalStore(subscribe, () => tick, () => tick);
  const base = baseQuery(reference, args);
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "programa_obra:previewExcelImport") return { fingerprint: "review-v1", rows: args!.rows.map((row: Data, index: number) => ({ index, name: [row.partida, row.familia].filter(Boolean).join(" / "), canonicalName: row.partida, status: "update", issues: [] })), canApply: true, warnings: [], absent: [{ id: "familyB", name: "Columnas conservadas" }], proposal: null };
  if (name.startsWith("programaObraImportHistory:")) return read(name, args!);
  if (name === "desarrollos:getById") return { ...(base as Data), nombre: "Obra ficticia · prueba de respaldo" };
  return base;
}
export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference), fallback = baseMutation(reference);
  return async (args: Data) => {
    if (!name.startsWith("programaObraImportHistory:")) return fallback(args as never);
    mutations.push({ name, args });
    if (name.endsWith(":startAttempt")) {
      const existing = attempts.find(a => a.request_id === args.request_id);
      if (existing) return { attempt_id: existing._id, status: existing.status, result: existing.result, upload_url: existing.storage_id ? null : "/mock-program-upload" };
      const attempt = { ...makeAttempt(`attempt-${attempts.length}`, "processing"), source: args.source, request_id: args.request_id, result: undefined, storage_id: undefined, file_available: false, reviewed_json: JSON.stringify({ rows: args.rows, review: args.review }) };
      attempts.unshift(attempt); notify();
      if (loseStart) { loseStart = false; throw new Error("Se perdió la respuesta al iniciar la carga"); }
      return { attempt_id: attempt._id, status: "processing", upload_url: "/mock-program-upload" };
    }
    const attempt = attempts.find(a => a._id === args.attempt_id)!;
    if (name.endsWith(":attachFile")) {
      if (scenario === "metadata-error") throw new Error("El archivo guardado no coincide con el Excel revisado (tamaño o SHA-256).");
      attempt.storage_id = args.storage_id; attempt.file_available = true; notify(); return;
    }
    if (name.endsWith(":failAttempt")) { if (!attempt.result) { attempt.status = "failed"; attempt.error = args.error; } notify(); return attempt.result ?? null; }
  };
}
export function useAction(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  return async (args: Data) => {
    mutations.push({ name, args });
    const attempt = attempts.find(a => a._id === args.attempt_id)!;
    if (attempt.result) return attempt.result;
    if (scenario === "import-error") { attempt.status = "failed"; attempt.error = "El programa cambió; vuelve a revisar la previsualización del Excel."; notify(); throw new Error(attempt.error); }
    attempt.status = "completed"; attempt.result = result;
    items.push({ _id: `item-${items.length}`, proyecto: "project", attempt_id: attempt._id, target_key: "detail:familyA", name: "Estructura / Excavación", kind: "row", outcome: "updated", review_index: 1, after_json: JSON.stringify(args.rows[1]), imported_at: Date.now() }); notify();
    if (loseAction) { loseAction = false; queryUnavailable = scenario === "uncertain"; throw new Error("No se recibió la respuesta del servidor"); }
    return result;
  };
}
export const useConvex = () => ({ query: async (reference: Parameters<typeof getFunctionName>[0], args: Data) => read(getFunctionName(reference), args) });
export const useConvexConnectionState = () => ({ isWebSocketConnected: true });
Object.assign(window, { programImportTest: { mutations, attempts, items, interruptQueries: () => { queryUnavailable = true; } } });
