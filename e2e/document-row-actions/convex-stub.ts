import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

// No Convex client, credentials or network mutations are used by this entry point.
const params = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach((listener) => listener()); };
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const snapshot = () => revision;
export const fixture = {
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queries: [] as Array<{ name: string; args: Record<string, unknown> }>,
  state: params.get("state") || "ready",
  resetCalls() { this.calls = []; publish(); },
};
const now = 1795032000000;
const folders = [
  { _id: "folder-crest", nombre: "Crest - CDS", created_at: now },
  { _id: "folder-empty", nombre: "Vacía", created_at: now },
  { _id: "folder-child", nombre: "Subcarpeta", parent_folder_id: "folder-crest", created_at: now },
];
const documents = [
  { _id: "doc-obra", nombre: "Acta de obra.pdf", descripcion: "Documento ficticio de obra", proyecto: "obra", type: "application/pdf", size: 2048, _creationTime: now, url: "about:blank#p17-obra" },
  { _id: "doc-ventas", nombre: "Contrato ventas.pdf", descripcion: "Documento ficticio de ventas", sales_proyecto: "ventas", type: "application/pdf", size: 4096, _creationTime: now, url: "about:blank#p17-ventas" },
  { _id: "doc-nested", nombre: "Plano dentro.pdf", descripcion: "Documento ficticio en carpeta", folder_id: "folder-crest", proyecto: "obra", type: "application/pdf", size: 1024, _creationTime: now, url: "about:blank#p17-plano" },
];

export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: Record<string, unknown>) {
  const version = useSyncExternalStore(subscribe, snapshot);
  const name = getFunctionName(query);
  const key = JSON.stringify(args || {});
  return useMemo(() => {
    const input = JSON.parse(key);
    fixture.queries.push({ name, args: input });
    if (fixture.state === "loading") return undefined;
    if (name === "documentos:getFileManagerMetadata") return {
      folders: fixture.state === "empty" ? [] : folders,
      proyectos: [{ _id: "obra", nombre: "Obra de prueba" }],
      salesProjects: [{ _id: "ventas", nombre: "Ventas de prueba" }],
      documentCountsByFolder: { "folder-crest": 1, root: 2 },
    };
    if (name === "documentos:listFileManagerDocuments") {
      const filtered = fixture.state === "empty" ? [] : documents.filter((doc) =>
        doc.folder_id === input.folder_id &&
        (!input.proyecto || doc.proyecto === input.proyecto) &&
        (!input.sales_proyecto || doc.sales_proyecto === input.sales_proyecto) &&
        (!input.search || doc.nombre.toLowerCase().includes(String(input.search).toLowerCase()))
      );
      return { documents: filtered, documentTypes: ["application/pdf"], total: filtered.length, totalSize: 7168, page: input.page || 1, pageSize: 25, totalPages: 1 };
    }
    throw new Error(`Unexpected fixture query: ${name}`);
  }, [name, key, version]);
}

export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return async (args: Record<string, unknown>) => {
    fixture.calls.push({ name, args });
    publish();
    if (name === "documentos:deleteFolder" && args.id === "folder-crest") {
      throw new Error("La carpeta contiene elementos");
    }
    if (params.has("fail")) throw new Error("Error simulado P17");
    return name === "documentos:createFolder" ? "folder-created" : undefined;
  };
}
