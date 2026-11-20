import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const params = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
let revision = 0;
export const refreshEvidence = () => { revision++; listeners.forEach((listener) => listener()); };
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const snapshot = () => revision;
const now = 1795190400000;
type Folder = { _id: string; nombre: string; proyecto: string; parent_folder_id?: string; created_at: number };
let folders: Folder[] = [
  { _id: "root-obra", nombre: "Raíz protegida", proyecto: "obra", created_at: now },
  { _id: "folder-contracts", nombre: "Contratos", proyecto: "obra", parent_folder_id: "root-obra", created_at: now },
  { _id: "folder-annex", nombre: "Anexos", proyecto: "obra", parent_folder_id: "folder-contracts", created_at: now },
  { _id: "folder-empty", nombre: "Carpeta vacía", proyecto: "obra", parent_folder_id: "root-obra", created_at: now },
  { _id: "root-other", nombre: "Otra raíz protegida", proyecto: "other", created_at: now },
  { _id: "folder-other", nombre: "Otra carpeta", proyecto: "other", parent_folder_id: "root-other", created_at: now },
];
export const fixture = {
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queries: [] as Array<{ name: string; args: Record<string, unknown> }>,
  role: params.get("role") || "admin",
};
export const useConvexAuth = () => ({ isAuthenticated: true, isLoading: false });
export const Unauthenticated = () => null;
export const useConvex = () => ({ query: async () => { throw new Error("No se permite red en este fixture"); } });
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: Record<string, unknown> | "skip") {
  const version = useSyncExternalStore(subscribe, snapshot);
  const name = getFunctionName(query);
  const key = JSON.stringify(args || {});
  return useMemo(() => {
    if (args === "skip") return undefined;
    const input = JSON.parse(key);
    fixture.queries.push({ name, args: input });
    if (name === "users:getCurrentUser") return { _id: "fixture-user", role: fixture.role, allowed_desarrollos: ["obra", "other"] };
    if (name === "users:hasAccessToDesarrollo") return !params.has("denied");
    if (name === "project_locations:list") return [];
    if (name === "desarrollos:getAll") return [{ _id: "obra", nombre: "Obra de prueba" }, { _id: "other", nombre: "Otro proyecto" }];
    if (name === "desarrollos:getById") return { _id: input.id, nombre: input.id === "other" ? "Otro proyecto" : "Obra de prueba" };
    if (name === "requisicion_history:getUnreadSummary" || name === "tareas:getAllUnreadSummary") return { total: 0 };
    if (name === "budgetCreationHistory:list") return { page: [], isDone: true, continueCursor: "" };
    if (name === "documentos:getProjectFileManagerMetadata") {
      if (params.has("loading")) return undefined;
      return { folders: params.has("empty") ? [] : folders.filter(f => f.proyecto === input.proyecto), projectRootFolderId: `root-${input.proyecto}`, documentCountsByFolder: {} };
    }
    if (name === "documentos:listFileManagerDocuments") return { documents: [], transacciones: [], total: 0, totalSize: 0, page: 1, pageSize: 25, totalPages: 1 };
    throw new Error(`Consulta no simulada: ${name}`);
  }, [name, key, version]);
}
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return async (args: Record<string, unknown>) => {
    fixture.calls.push({ name, args });
    if (params.has("fail")) { refreshEvidence(); throw new Error("Error simulado del fixture"); }
    if (name === "documentos:renameFolder") folders = folders.map(f => f._id === args.id ? { ...f, nombre: String(args.nombre) } : f);
    if (name === "documentos:moveFolder") folders = folders.map(f => f._id === args.id ? { ...f, parent_folder_id: String(args.parent_folder_id || `root-${f.proyecto}`) } : f);
    if (name === "documentos:deleteFolder") {
      if (folders.some(f => f.parent_folder_id === args.id)) { refreshEvidence(); throw new Error("Folder must be empty before deleting"); }
      folders = folders.filter(f => f._id !== args.id);
    }
    refreshEvidence();
  };
}
export const useAction = useMutation;
