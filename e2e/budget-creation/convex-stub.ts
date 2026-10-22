import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
const scenario = new URLSearchParams(location.search).get("case") || "history";
const listeners = new Set<() => void>(); let version = 0, failed = false;
function notify() { version++; listeners.forEach(fn => fn()); }
const base = { _id: "saved-attempt", proyecto: "project", created_by: "preview-user", created_by_name: "María Hernández",
  created_at: Date.UTC(2026, 9, 21, 18), updated_at: Date.UTC(2026, 9, 21, 18), form: { nombre: "Residencia del Parque", descripcion: "Obra de prueba", honorarios_porcentaje: 10 },
  file_name: "Presupuesto original · revisión octubre 2026.xlsx", file_hash: "a".repeat(64), size: 16384, row_cursor: 3, payment_cursor: -1,
  status: "completed", row_count: 3, payment_count: 1, partidas_created: 3, payments_created: 1, file_available: true, can_resume: true };
let current: any = null;
const calls = { mutations: [] as any[], actions: [] as any[] };
Object.assign(window, { budgetRecorded: calls });
const item = { _id: "source-item", source_index: 2, partida_id: "partida", snapshot_json: JSON.stringify({ normalized: { nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA", cantidad: 1000, unidad: "kg", precio_unitario: 0.12, presupuesto_original: 120, presupuesto_aprobado: 120, pagado: 0 } }) };
function query(name: string, args: any): any {
  if (name === "project_locations:list") return [{ key: "cdmx", name: "Ciudad de México" }];
  if (name === "budgetCreationHistory:get") return current && args.attempt_id === current._id ? current : { ...base, _id: args.attempt_id, can_resume: scenario !== "viewer" };
  if (name === "budgetCreationHistory:list") {
    const all = scenario === "empty" ? [] : scenario === "pagination" ? Array.from({ length: 26 }, (_, i) => ({ ...base, _id: `saved-${i}` })) : [current || base];
    return { page: args.paginationOpts.cursor ? all.slice(25) : all.slice(0, 25), isDone: Boolean(args.paginationOpts.cursor) || all.length <= 25, continueCursor: "next" };
  }
  if (name === "budgetCreationHistory:source") return scenario === "legacy" ? { attempt_id: null, legacy_name: "Presupuesto histórico.xls", items: [] }
    : { attempt_id: "saved-attempt", legacy_name: null, items: [item] };
  if (name === "budgetCreationHistory:items") return { page: [item, { ...item, _id: "payment", transaccion_id: "transaction", payment_index: 0,
    snapshot_json: JSON.stringify({ amount: 40, fecha: "21/10/2026", position: 1, columnLetter: "M" }), deleted: true }], isDone: true, continueCursor: "" };
  return null;
}
async function mutation(ref: any, args: any) {
  const name = getFunctionName(ref); calls.mutations.push({ name, args });
  if (name === "budgetCreationHistory:start") { current ||= { ...base, ...args, _id: "current-attempt", proyecto: undefined, status: "pending", file_available: false, partidas_created: 0, payments_created: 0 }; notify(); return current._id; }
  if (name === "budgetCreationHistory:pause" && current?.status !== "completed") { current = { ...current, status: "failed", error: args.error }; notify(); }
}
async function action(ref: any, args: any) {
  const name = getFunctionName(ref); calls.actions.push({ name, args });
  current ||= { ...base, _id: args.attempt_id };
  if (scenario === "partial" && !failed) { failed = true; current = { ...current, file_available: true, status: "failed", proyecto: "project", partidas_created: 1, row_cursor: 1, error: "La conexión se interrumpió. Puedes reanudar sin duplicar partidas." }; notify(); throw new Error(current.error); }
  current = { ...current, file_available: true, status: "completed", proyecto: "project", partidas_created: 3, payments_created: 1, row_cursor: 3, error: undefined }; notify();
  if (scenario === "lost-response") throw new Error("Respuesta perdida después de guardar");
  return { completed: true, proyecto: "project" };
}
export function useQuery(ref: any, args: any) { useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version); return args === "skip" ? undefined : query(getFunctionName(ref), args); }
export function useMutation(ref: any) { return (args: any) => mutation(ref, args); }
export function useAction(ref: any) { return (args: any) => action(ref, args); }
export function useConvex() { return { query: async (ref: any, args: any) => query(getFunctionName(ref), args) }; }
