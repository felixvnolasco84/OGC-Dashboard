import { useState, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

export const role = new URLSearchParams(location.search).get("role") || "admin";
const listeners = new Set<() => void>();
let version = 0;
let completeSync: (() => void) | undefined;
const activeQueries = new Map<string, { name: string; args: unknown }>();
const mutations: Array<{ name: string; args: unknown }> = [];
const cache = new Map<string, any>();
const notify = () => { version++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useVerification() {
  useSyncExternalStore(subscribe, () => version);
  return { queries: [...activeQueries.values()], mutations, finishSync: () => completeSync?.() };
}
function queryData(name: string, args: any): any {
  if (name === "users:getCurrentUser") return { _id: "test-user", role, name: "Usuario ficticio" };
  if (name === "desarrollos:getById") return { _id: args.id, nombre: args.id === "project-a" ? "Obra A · datos ficticios" : "Obra B · datos ficticios", moneda_principal: "MXN" };
  if (name === "transacciones:getTotalsByProyecto") return { count: 121, amount: 8567518.21, withoutProvider: 47, withoutDocuments: 100 };
  if (name === "transacciones:listTableByProyecto") return { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  if (name === "laborImportHistory:listHistory") {
    const attempt = { proyecto: args.proyecto, request_id: "fixture", source: { file_name: `Origen ${args.proyecto}.xlsx`, sheet_name: "Pagos", administration: "Obra", currency: "MXN", row_count: 1 },
      dates: ["2026-11-18"], size: 1024, status: "completed", imported_by_name: "Persona ficticia", created_at: 1795000000000, file_available: false,
      result: { status: "created", transaction_count: 1, row_count: 1, amount_total: 100, dates: ["2026-11-18"] } };
    return { page: Array.from({ length: args.paginationOpts.cursor ? 1 : 25 }, (_, index) => ({ ...attempt, _id: `attempt-${args.paginationOpts.cursor ? 25 : index}` })),
      isDone: Boolean(args.paginationOpts.cursor), continueCursor: "second-page" };
  }
  if (name === "laborImportHistory:listAttemptItems") return { page: [], isDone: true, continueCursor: "" };
  if (name === "invoiceAnalysis:listReviewQueue") return [];
  if (name === "proveedores:getByProyectoWithStats" || name === "proveedores:getAll" || name === "invoiceAnalysis:listDirectIntakeQueue") return [];
  throw new Error(`Consulta no prevista en P06: ${name}`);
}
export function useQuery(reference: any, args: any = {}) {
  useSyncExternalStore(subscribe, () => version);
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  const key = JSON.stringify([name, args]);
  activeQueries.set(key, { name, args });
  if (!cache.has(key)) cache.set(key, queryData(name, args));
  return cache.get(key);
}
export function usePaginatedQuery(reference: any, args: any) {
  const [size, setSize] = useState(50);
  if (args === "skip") return { results: [], status: "LoadingFirstPage", loadMore: () => {} };
  const name = getFunctionName(reference);
  activeQueries.set(JSON.stringify([name, args, size]), { name, args });
  return { results: [{ id: `invoice-${args.project_id}`, transaction_id: `transaction-${args.project_id}`, name: `Factura ${args.project_id}.xml`, kind: "xml" }],
    status: "Exhausted", loadMore: (count: number) => setSize(size + count) };
}
export function useMutation(reference: any) {
  return async (args: any) => {
    const name = getFunctionName(reference);
    mutations.push({ name, args });
    notify();
    if (name !== "sync:syncTransactionsWithDocuments") throw new Error(`Escritura bloqueada por fixture: ${name}`);
    await new Promise<void>(resolve => { completeSync = resolve; });
    return { success: true, summary: { matched: 0, alreadyLinked: 0, unmatched: 0 }, details: [] };
  };
}
export function useConvex() { return { query: async () => { throw new Error("Descargas deshabilitadas en esta verificación"); } }; }
export function useConvexAuth() { return { isAuthenticated: true, isLoading: false }; }
