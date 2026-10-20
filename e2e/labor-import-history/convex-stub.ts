import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const scenario = new URLSearchParams(location.search).get("case") || "history";
const recorded = { mutations: [] as Array<{ name: string; args: any }>, actions: [] as Array<{ name: string; args: any }> };
Object.assign(window, { laborImportRecorded: recorded });
const listeners = new Set<() => void>();
let version = 0;
function notify() { version++; listeners.forEach(listener => listener()); }
const source = { file_name: "Pagos originales de la obra · revisión octubre 2026.xlsx", file_hash: "a".repeat(64),
  sheet_name: "Pagos", administration: "Obra", currency: "MXN", row_count: 1 };
const summary = { status: "created", dates: ["2026-10-05"], transaction_count: 1, row_count: 1,
  amount_total: 100, total_people: 0, replaced_dates: 0, providers_created: 0, providers_reused: 1 };
const attempt = { _id: "attempt", proyecto: "project", request_id: "preview", source, dates: ["2026-10-05"],
  size: 16248, content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", storage_id: "original",
  status: "completed", imported_by: "writer", imported_by_name: "María Hernández", created_at: Date.UTC(2026, 9, 18, 18), result: summary, file_available: true };
let current: any = null;
const item = { _id: "item", proyecto: "project", attempt_id: "attempt", transaccion_id: "transaction", source_key: "row-2",
  source_rows: [2], factura: "FACTURA-100", proveedor: "Proveedor de prueba", fecha: "2026-10-05", moneda: "MXN", monto_total: 100, outcome: "created", deleted: false };
const transaction = { _id: "transaction", proyecto: "project", factura: "FACTURA-100", proveedor_id: "provider", monto_total: 100,
  fecha: "05/10/2026", moneda: "MXN", tipo_pago: "TRANSFERENCIA", status: "Pagado", categoria: "MATERIAL", lineItemsCount: 1, documentsCount: 0 };
const page = (rows: any[], args: any) => ({ page: args?.paginationOpts?.cursor ? rows.slice(25) : rows.slice(0, 25),
  isDone: Boolean(args?.paginationOpts?.cursor) || rows.length <= 25, continueCursor: "next-page" });
function queryData(name: string, args: any): any {
  if (name === "users:getCurrentUser") return { _id: "writer", role: "user", email: "writer@example.test", name: "María Hernández" };
  if (name === "desarrollos:getById") return { _id: "project", nombre: "Obra", moneda_principal: "MXN" };
  if (name === "partida:getByProject") return [{ _id: "partida", nombre: "OBRA", nivel: 3, partida_nombre: "OBRA", familia: "MATERIAL", sub_partida: "ACERO" }];
  if (name === "laborPaymentImports:getActiveLaborImports") return [];
  if (name === "proveedores:matchByNames") return args.names.map((name: string) => ({ name, status: "matched", provider_id: "provider", tipo: "regular" }));
  if (name === "proveedores:getAll") return [{ _id: "provider", razon_social: "Proveedor de prueba" }];
  if (name === "laborImportHistory:listHistory") {
    if (scenario === "empty") return page([], args);
    const rows = [current || attempt,
      { ...attempt, _id: "failed", status: "failed", result: undefined, error: "La partida cambió durante la carga. No se importaron pagos." },
      { ...attempt, _id: "unchanged", status: "unchanged", result: { ...summary, status: "unchanged" } },
      { ...attempt, _id: "legacy", status: "legacy", result: undefined, storage_id: undefined, file_available: false, size: undefined, source: { ...source, file_name: "Pagos históricos.xls" } },
    ];
    return page(scenario === "pagination" ? Array.from({ length: 26 }, (_, i) => ({ ...attempt, _id: `attempt-${i}` })) : rows, args);
  }
  if (name === "laborImportHistory:listAttemptItems") return page([{ ...item, attempt_id: args.attempt_id }, { ...item, _id: "deleted", factura: "FACTURA-ELIMINADA", transaccion_id: "deleted", deleted: true }], args);
  if (name === "laborImportHistory:listTransactionSources") return page([{ ...item, attempt, file_available: true }], args);
  if (name === "laborImportHistory:getLegacyTransactionReference") return null;
  if (name === "laborImportHistory:getDownloadUrl") return { url: "/mock-original.xlsx", file_name: source.file_name };
  if (name === "laborImportHistory:getAttempt") return current || attempt;
  if (name === "transacciones:getTransactionDetailsById") return transaction;
  if (name === "transacciones:getTransactionConceptosById") return { ...transaction, lineItems: [] };
  if (name === "transacciones:getTransactionDocumentsById") return { ...transaction, documents: [] };
  throw new Error(`Consulta sin stub: ${name}`);
}
export function useQuery(reference: any, args: any = {}) {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
  return args === "skip" ? undefined : queryData(getFunctionName(reference), args);
}
export function useConvex() {
  return { query: async (reference: any, args: any) => queryData(getFunctionName(reference), args) };
}
export function useMutation(reference: any) {
  return async (args: any) => {
    const name = getFunctionName(reference);
    recorded.mutations.push({ name, args });
    if (name === "laborImportHistory:startAttempt") {
      current ||= { ...attempt, source: args.source, request_id: args.request_id, size: args.size, dates: args.dates,
        status: "processing", result: undefined, storage_id: undefined, file_available: false };
      return { attempt_id: "attempt", status: current.status, result: current.result, upload_url: current.storage_id ? null : "/mock-upload" };
    }
    if (name === "laborImportHistory:attachFile") { current.storage_id = args.storage_id; current.file_available = true; }
    else if (name === "laborImportHistory:failAttempt") { current.status = "failed"; current.error = args.error; }
    else if (name !== "transacciones:updateTransaction") throw new Error(`Mutación sin stub: ${name}`);
    notify();
    return null;
  };
}
export function useAction(reference: any) {
  return async (args: any) => {
    recorded.actions.push({ name: getFunctionName(reference), args });
    if (scenario === "import-error") {
      current.status = "failed"; current.error = "Error de importación simulado"; notify();
      throw new Error(current.error);
    }
    current.status = "completed"; current.result = summary; notify();
    if (scenario === "lost-response") throw new Error("Respuesta perdida");
    return summary;
  };
}
