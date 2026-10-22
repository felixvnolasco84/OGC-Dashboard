import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { incomeCurrencyTotals, incomeStorageType, parseIncomeReview } from "../../convex/incomeImportRules";
const scenario = new URLSearchParams(location.search).get("case") || "history";
const fixtureKey = `income-preview-fixture:${scenario}`;
const recorded = { mutations: [] as Array<{ name: string; args: any }>, actions: [] as Array<{ name: string; args: any }> };
Object.assign(window, { incomeImportRecorded: recorded });
const listeners = new Set<() => void>(); let version = 0;
let current: any = JSON.parse(sessionStorage.getItem(fixtureKey) || "null");
function notify() { sessionStorage.setItem(fixtureKey, JSON.stringify(current)); version++; listeners.forEach(listener => listener()); }
const base = {
  _id: "original-attempt", proyecto: "project", request_id: "fixture", file_name: "Ingresos originales de la obra · octubre 2026.xlsx", file_hash: "a".repeat(64), size: 16650, content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", storage_id: "original",
  imported_by: "writer", imported_by_name: "María Hernández · datos ficticios", created_at: Date.UTC(2026, 9, 21, 18), status: "completed", file_available: true, can_resume: false,
  response_rows: 3, valid_rows: 2, rejected_rows: 1,
  parser_summary: { totalRows: 9, validRows: 2, errors: 1, totalAmount: 1050 },
  result: { created: 2, rejected: 1, response_rows: 3, amounts: [{ moneda: "MXN", monto: 1000 }, { moneda: "USD", monto: 50 }] },
};
const item = { _id: "source-item", proyecto: "project", attempt_id: base._id, position: 1, source_row: 2, monto: 1000, fecha: "01/10/2026", descripcion: "Anticipo de obra · dato ficticio", moneda: "MXN", errors: [], outcome: "created", ingreso_id: "income", deleted: false, modified: true, raw_json: '{"monto":1000,"fecha":"1/10/2026","rowIndex":2}' };
const page = (rows: any[], args: any) => {
  const offset = Number(args?.paginationOpts?.cursor || 0); const count = 25;
  return { page: rows.slice(offset, offset + count), isDone: rows.length <= offset + count, continueCursor: String(offset + count) };
};
function queryData(name: string, args: any): any {
  if (name === "users:getCurrentUser") return { _id: "writer", role: scenario === "viewer" ? "viewer" : "finance", name: "María Hernández", email: "writer@example.test" };
  if (name === "ingresos:getByProyecto") return [{ _id: "income", proyecto: "project", monto: 1200, fecha: "01/10/2026", descripcion: "Anticipo actualizado · dato ficticio", moneda: "MXN", import_attempt_id: base._id }, { _id: "legacy", proyecto: "project", monto: 50, fecha: "30/09/2026", descripcion: "Ingreso anterior · dato ficticio", moneda: "MXN" }];
  if (name === "ingresos:getTotalsByProyecto") return { total_ingresos: 1250, total_count: 2 };
  if (name === "ogc_movimientos:getIncomeTotalsByProyecto") return { total_ingresos: 0, total_count: 0 };
  if (["ogc_movimientos:getIncomeByProyecto", "ingresos_documentos:getByProyecto", "ingresos_documentos:getByIngreso"].includes(name)) return [];
  if (name === "incomeImportHistory:listHistory") {
    if (scenario === "empty") return page([], args);
    const rows = [current || base, { ...base, _id: "failed", status: "failed", result: undefined, error: "No fue posible guardar los ingresos. El respaldo se conservó." }, { ...base, _id: "no-original", status: "failed", result: undefined, storage_id: undefined, file_available: false, error: "La transferencia se interrumpió. No se crearon ingresos." }];
    return page(scenario === "pagination" ? Array.from({ length: 26 }, (_, index) => ({ ...base, _id: `attempt-${index}` })) : rows, args);
  }
  if (name === "incomeImportHistory:listAttemptItems") {
    if (current?.review_json && args.attempt_id === current._id) return page(parseIncomeReview(current.review_json).rows.map(row => ({ ...row, _id: `row-${row.position}`, source_row: row.rowIndex, outcome: row.status === "invalid" ? "rejected" : current.status === "completed" ? "created" : "pending", deleted: false, modified: false })), args);
    return page([{ ...item, attempt_id: args.attempt_id }, { ...item, _id: "removed", descripcion: "Ingreso eliminado · dato ficticio", position: 2, source_row: undefined, deleted: true, modified: false }, { ...item, _id: "rejected", descripcion: "Monto negativo · dato ficticio", position: 3, source_row: 7, outcome: "rejected", errors: ["Monto inválido"], monto: -5, deleted: false, modified: false }], args);
  }
  if (name === "incomeImportHistory:getIngresoSource") return args.ingreso_id === "legacy" ? null : { attempt: base, file_available: true, item };
  if (name === "incomeImportHistory:getDownloadUrl") return { url: "/income-mock-original.xlsx", file_name: (current?._id === args.attempt_id ? current.file_name : base.file_name) };
  if (name === "incomeImportHistory:getAttempt") return current || base;
  if (name === "incomeImportHistory:getRequestAttempt") return current && current.request_id === args.request_id ? current : null;
  if (name === "incomeImportHistory:findPreviousFile") return scenario === "repeat" ? { file_name: base.file_name, created_at: base.created_at } : null;
  throw new Error(`Missing income preview query: ${name}`);
}
async function mutate(name: string, args: any) {
  recorded.mutations.push({ name, args });
  if (name === "incomeImportHistory:startAttempt") {
    if (!current || current.request_id !== args.request_id) {
      const parsed = parseIncomeReview(args.review_json);
      current = { ...base, ...args, _id: "new-attempt", status: "processing", storage_id: undefined, file_available: false, can_resume: true, result: undefined, response_rows: parsed.rows.length, valid_rows: parsed.rows.filter(row => row.status === "valid").length, rejected_rows: parsed.rows.filter(row => row.status === "invalid").length };
    }
    notify(); return { attempt_id: current._id, status: current.status, result: current.result };
  }
  if (name === "incomeImportHistory:prepareUpload") return { upload_url: current.storage_id ? null : "/income-mock-upload", content_type: incomeStorageType(current._id), result: current.result };
  if (name === "incomeImportHistory:attachFile") { current.storage_id = args.storage_id; current.file_available = true; current.error = undefined; notify(); return null; }
  if (name === "incomeImportHistory:recordTransferError") { current.error = args.error; notify(); return null; }
  if (name === "incomeImportHistory:failAttempt") { if (!current.result) { current.status = "failed"; current.can_resume = false; current.error = args.error; } notify(); return current.result || null; }
  throw new Error(`Missing income preview mutation: ${name}`);
}
async function action(name: string, args: any) {
  recorded.actions.push({ name, args });
  if (name !== "incomeImportHistory:confirmImport") throw new Error(name);
  if (current.result) return current.result;
  if (scenario === "import-error") { current.status = "failed"; current.can_resume = false; current.error = "Error financiero de prueba. No se crearon ingresos."; notify(); throw new Error(current.error); }
  const parsed = parseIncomeReview(current.review_json); const valid = parsed.rows.filter(row => row.status === "valid");
  current.result = { created: valid.length, rejected: parsed.rows.length - valid.length, response_rows: parsed.rows.length, amounts: incomeCurrencyTotals(valid) };
  current.status = "completed"; current.can_resume = false; notify();
  if (scenario === "lost-response") throw new Error("Respuesta perdida después del guardado");
  return current.result;
}
export function useQuery(reference: any, args: any) { useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => version); return args === "skip" ? undefined : queryData(getFunctionName(reference), args); }
export function useMutation(reference: any) { return (args: any) => mutate(getFunctionName(reference), args); }
export function useAction(reference: any) { return (args: any) => action(getFunctionName(reference), args); }
export function useConvex() { return { query: async (reference: any, args: any) => queryData(getFunctionName(reference), args) }; }
