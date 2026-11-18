import { getFunctionName } from "convex/server";
const params = new URLSearchParams(location.search);
const empty: unknown[] = [];
const user = params.get("role") === "loading" ? undefined : { _id: "local-user", role: params.get("role") || "admin", name: "Usuario ficticio" };
const project = { _id: "project", nombre: "Proyecto ficticio P01", moneda_principal: "MXN", initial_budget_status: params.has("incomplete") ? "incomplete" : "completed" };
function query(ref: any, args: any): any {
  if (args === "skip") return undefined;
  switch (getFunctionName(ref)) {
    case "users:getCurrentUser": return user;
    case "desarrollos:getById": return project;
    case "currency_helpers:getProjectDefaultCurrency": return { defaultCurrency: "MXN" };
    case "meticas_presupuesto:getByProyecto": return { presupuesto_original: 10000, presupuesto_aprobado: 10000, gasto_total: 5000, por_gastar: 5000 };
    case "ingresos:getTotalsByProyecto": return { total_ingresos: 15808443.07 };
    case "ogc_movimientos:getIncomeTotalsByProyecto": return { total_ingresos: 0 };
    case "budgetCreationHistory:list": return { page: [], isDone: true, continueCursor: "" };
    default: return empty;
  }
}
const rejectWrite = async () => { throw new Error("La verificación aislada bloquea todas las escrituras."); };
export const useQuery = query;
export const useMutation = () => rejectWrite;
export const useAction = () => rejectWrite;
export const useConvex = () => ({ query: async (ref: any, args: any) => query(ref, args) });
export const useConvexAuth = () => ({ isLoading: false, isAuthenticated: true });
export const usePaginatedQuery = () => ({ results: empty, status: "Exhausted", loadMore: () => {} });
