/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
const params = new URLSearchParams(location.search);
const scenario = params.get("case") || "history";
const collection = params.get("screen")?.startsWith("collection");
const target = collection ? { kind: "collection", project_id: "sales-project" } : { kind: "expense", project_id: "project" };
const listeners = new Set<() => void>(); let version = 0;
const recorded = { mutations: [] as any[], actions: [] as any[] };
Object.assign(window, { projectionRecorded: recorded });
function notify() { version++; listeners.forEach(listener => listener()); }
const row = { partida: collection ? "COBRO" : "OBRA", rowIndex: 2, total: 1500, weeklyProjections: [{ week: 46300, amount: 1000, position: 0, columnLetter: "C" }, { week: 46307, amount: 500, position: 1, columnLetter: "D" }] };
const result = { outcome: "created", rows: 1, cells: 2, weeks: 2, amount: 1500, start_week: 46300, end_week: 46307 };
const originalName = "Proyecciones originales de la obra · revisión octubre 2026.xlsx";
const base = { _id: "attempt", target, scope: `${target.kind}:${target.project_id}`, request_id: "preview", format: "flujo", file_name: originalName,
  file_hash: "a".repeat(64), size: 16420, sheet_name: "Proyección", base_revision: "a".repeat(64), status: "completed", imported_by: "writer", imported_by_name: "María Hernández",
  created_at: Date.UTC(2026, 9, 22, 18), completed_at: Date.UTC(2026, 9, 22, 18), result, storage_id: "original", file_available: true, active: true };
let current: any = null;
let startLost = false; let attachLost = false;
function page(rows: any[], args: any) { return { page: args.paginationOpts.cursor ? rows.slice(25) : rows.slice(0, 25), isDone: Boolean(args.paginationOpts.cursor) || rows.length <= 25, continueCursor: "next" }; }
function queryData(name: string, args: any): any {
  if (name === "desarrollos:getAll") return [{ _id: "project", nombre: "Obra de prueba" }, { _id: "other-project", nombre: "Otro proyecto" }];
  if (name === "sales_projects:getAll") return [{ _id: "sales-project", nombre: "Ventas de prueba" }];
  if (name.endsWith(":getById")) return { _id: target.project_id, nombre: collection ? "Ventas de prueba" : "Obra de prueba" };
  if (name === "projectionImportHistory:isManaged") return true;
  if (name === "projectionImportHistory:getCurrentState") return { revision: "a".repeat(64), active_attempt_id: "attempt", active: base };
  if (name === "projectionImportHistory:getAttempt") return current || base;
  if (name === "projectionImportHistory:listHistory") {
    if (scenario === "empty" && !current) return page([], args);
    if (scenario === "pagination") return page(Array.from({ length: 26 }, (_, i) => ({ ...base, _id: `attempt-${i}` })), args);
    return page([...(current ? [current] : [base]), { ...base, _id: "failed", active: false, status: "failed", result: undefined, error: "El lector no pudo procesar el Excel. El original se conservó." },
      { ...base, _id: "unchanged", active: false, status: "unchanged", result: { ...result, outcome: "unchanged" } },
      { ...base, _id: "legacy", active: false, status: "legacy", result: undefined, storage_id: undefined, file_available: false, file_hash: undefined, imported_by_name: "Autor no disponible", file_name: "Proyecciones anteriores.xls" }], args);
  }
  if (name === "projectionImportHistory:listAttemptItems") return page([{ _id: "item", row }], args);
  if (name === "projectionImportHistory:getDownloadUrl") return { url: "/projection-mock-original.xlsx", file_name: current?.file_name || originalName };
  if (name === "projectionImportHistory:getCurrentSource") return { attempt: base, file_available: true, legacy_file_names: [], rows: [{ ...row, weeklyProjections: row.weeklyProjections.filter(cell => args.week === undefined || args.week === cell.week) }] };
  if (name.endsWith(":getUploadMetadata")) return { ...base, uploaded_at: base.created_at, attempt_id: "attempt" };
  if (name === "projected_transactions:getByProject" || name === "sales_projected_transactions_queries:getBySalesProject")
    return scenario === "empty" ? [] : row.weeklyProjections.map((cell, i) => ({ _id: `projection-${i}`, partida: row.partida, week_date: cell.week, amount: cell.amount, position: cell.position }));
  throw new Error(`Consulta sin stub: ${name}`);
}
export function useQuery(reference: any, args: any = {}) {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
  return args === "skip" ? undefined : queryData(getFunctionName(reference), args);
}
export function useConvex() { return { query: async (reference: any, args: any) => queryData(getFunctionName(reference), args) }; }
export function useMutation(reference: any) { return async (args: any) => {
  const name = getFunctionName(reference); recorded.mutations.push({ name, args });
  if (name === "projectionImportHistory:startAttempt") {
    current ||= { ...base, ...args, _id: "new-attempt", status: "processing", result: undefined, storage_id: undefined, file_available: false, active: false };
    if (scenario === "lost-start" && !startLost) { startLost = true; throw new Error("Respuesta de inicio perdida"); }
    return { attempt_id: current._id, status: current.status, result: current.result, upload_url: current.storage_id ? null : "/projection-mock-upload", upload_content_type: "application/x-ogc-projection-new-attempt" };
  }
  if (name === "projectionImportHistory:attachFile") {
    current.storage_id = args.storage_id; current.file_available = true;
    if (scenario === "lost-attach" && !attachLost) { attachLost = true; throw new Error("Respuesta de respaldo perdida"); }
  } else if (name === "projectionImportHistory:failAttempt") { current.status = "failed"; current.error = args.error; }
  else throw new Error(`Mutación sin stub: ${name}`);
  notify(); return null;
}; }
export function useAction(reference: any) { return async (args: any) => {
  recorded.actions.push({ name: getFunctionName(reference), args });
  if (scenario === "import-error") { current.status = "failed"; current.error = "Error de importación de prueba. Las cifras vigentes se conservaron."; notify(); throw new Error(current.error); }
  current.status = "completed"; current.active = true; current.result = result; notify();
  if (scenario === "lost-response") throw new Error("Respuesta perdida");
  return result;
}; }
