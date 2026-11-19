import { getFunctionName } from "convex/server";
import { useEffect } from "react";
const params = new URLSearchParams(location.search);
const empty: unknown[] = [];
const user = { _id: "local-user", role: params.get("role") || "admin", name: "Usuario ficticio" };
const project = { _id: "project", nombre: "Proyecto ficticio P02", moneda_principal: "MXN", initial_budget_status: "completed" };
const base = { proyecto: "project", _creationTime: 0, presupuesto_original: 10000, presupuesto_aprobado: 10000, pagado: 2500, por_gastar: 7500, cantidad: 100, precio_unitario: 100, unidad: "m²" };
const partidas = [
  { ...base, _id: "p1", nivel: 1, nombre: "PRELIMINARES" },
  { ...base, _id: "f1", nivel: 2, nombre: "PRELIMINARES", partida_nombre: "PRELIMINARES", familia: "Materiales" },
  { ...base, _id: "s1", nivel: 3, nombre: "Trazo y nivelación", partida_nombre: "PRELIMINARES", familia: "Materiales" },
  { ...base, _id: "p2", nivel: 1, nombre: "MUROS DE CONTENCIÓN CON DENOMINACIÓN EXTENSA" },
  { ...base, _id: "f2", nivel: 2, nombre: "MUROS DE CONTENCIÓN CON DENOMINACIÓN EXTENSA", partida_nombre: "MUROS DE CONTENCIÓN CON DENOMINACIÓN EXTENSA", familia: "Mano de obra" },
  { ...base, _id: "s2", nivel: 3, nombre: "Colocación", partida_nombre: "MUROS DE CONTENCIÓN CON DENOMINACIÓN EXTENSA", familia: "Mano de obra" },
];
function query(ref: any, args: any): any {
  if (args === "skip") return undefined;
  switch (getFunctionName(ref)) {
    case "users:getCurrentUser": return user;
    case "desarrollos:getById": return project;
    case "currency_helpers:getProjectDefaultCurrency": return { defaultCurrency: "MXN" };
    case "meticas_presupuesto:getByProyecto": return { presupuesto_original: 20000, presupuesto_aprobado: 20000, gasto_total: 5000, por_gastar: 15000 };
    case "pagos:getPaymentsByDateRange": return { paymentsByPartida: { p1: 500, p2: 750 }, total: 1250, indirectos: 50, honorarios: 100 };
    case "ingresos:getTotalsByProyecto": return { total_ingresos: 25000 };
    case "ogc_movimientos:getIncomeTotalsByProyecto": return { total_ingresos: 0 };
    case "budgetCreationHistory:list": return { page: [], isDone: true, continueCursor: "" };
    default: return empty;
  }
}
const rejectWrite = async () => { throw new Error("P02: todas las escrituras están bloqueadas en el fixture."); };
export function useQuery(ref: any, args: any) {
  const name = getFunctionName(ref);
  const serialized = JSON.stringify(args);
  useEffect(() => {
    if (name === "pagos:getPaymentsByDateRange") {
      const output = document.getElementById("date-query");
      if (output) output.textContent = serialized ?? "undefined";
    }
  }, [name, serialized]);
  return query(ref, args);
}
export const useMutation = () => rejectWrite;
export const useAction = () => rejectWrite;
export const useConvex = () => ({ query: async (ref: any, args: any) => query(ref, args) });
export const useConvexAuth = () => ({ isLoading: false, isAuthenticated: true });
export const usePaginatedQuery = () => ({ results: params.has("empty") ? empty : partidas, status: "Exhausted", loadMore: () => {} });
