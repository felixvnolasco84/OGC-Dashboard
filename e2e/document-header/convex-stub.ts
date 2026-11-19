import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

// This entry point never creates a Convex client or contacts a backend.
const params = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach((listener) => listener()); };
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const snapshot = () => revision;
export const refreshEvidence = publish;
export const fixture = {
  calls: [] as Array<{ name: string; args?: Record<string, unknown> }>,
  queries: [] as Array<{ name: string; args: Record<string, unknown> }>,
};
const now = 1795104000000;
const folders = [
  { _id: "folder-parent", nombre: "Contratos de prueba", created_at: now },
  { _id: "folder-child", nombre: "Anexos de prueba", parent_folder_id: "folder-parent", created_at: now },
];
const documents = [
  { _id: "doc-root", nombre: "Contrato ficticio.pdf", descripcion: "Documento de prueba", proyecto: "obra", type: "Contrato", size: 2048, _creationTime: now },
  { _id: "doc-child", nombre: "Anexo ficticio.pdf", descripcion: "Documento anidado de prueba", folder_id: "folder-parent", proyecto: "obra", type: "Otro", size: 1024, _creationTime: now },
];
export const useConvexAuth = () => ({ isAuthenticated: true, isLoading: false });
export const usePaginatedQuery = () => ({ results: [], status: "Exhausted", loadMore: () => {} });
export const useConvex = () => ({ query: async () => { throw new Error("P16: no se permiten consultas fuera del fixture"); } });
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: Record<string, unknown> | "skip") {
  const version = useSyncExternalStore(subscribe, snapshot);
  const name = getFunctionName(query);
  const key = JSON.stringify(args || {});
  return useMemo(() => {
    if (args === "skip") return undefined;
    const input = JSON.parse(key);
    fixture.queries.push({ name, args: input });
    if (name === "users:getCurrentUser") return { _id: "p16-user", role: params.get("role") || "admin" };
    if (name === "users:hasAccessToDesarrollo") return !params.has("denied");
    if (name === "desarrollos:getById") return { _id: "obra", nombre: "Obra de prueba" };
    if (name === "desarrollos:getAll") return [{ _id: "obra", nombre: "Obra de prueba" }];
    if (name === "budgetCreationHistory:list") return { page: [], isDone: true, continueCursor: "" };
    if (name === "transacciones:getByProyecto") return [];
    if (params.get("state") === "loading") return undefined;
    if (name === "documentos:getFileManagerMetadata" || name === "documentos:getProjectFileManagerMetadata") return {
      folders: params.get("state") === "empty" ? [] : folders,
      proyectos: [{ _id: "obra", nombre: "Obra de prueba" }], salesProjects: [], transacciones: [],
      documentCountsByFolder: { root: 1, "folder-parent": 1 },
    };
    if (name === "documentos:listFileManagerDocuments") {
      const filtered = params.get("state") === "empty" ? [] : documents.filter((doc) =>
        doc.folder_id === input.folder_id && (!input.proyecto || doc.proyecto === input.proyecto) &&
        (!input.type || doc.type === input.type) &&
        (!input.search || doc.nombre.toLowerCase().includes(String(input.search).toLowerCase())));
      return { documents: filtered, documentTypes: ["Contrato", "Otro"], total: filtered.length, totalSize: 3072, page: input.page || 1, pageSize: 25, totalPages: 1 };
    }
    throw new Error(`P16: consulta no simulada: ${name}`);
  }, [name, key, version]);
}
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return async (args?: Record<string, unknown>) => {
    fixture.calls.push({ name, args }); publish();
    // Mutations are recorded for inspection, without changing even fixture records.
    return name === "documentos:createFolder" ? "folder-created" : undefined;
  };
}
export const useAction = useMutation;
