import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const rows = Array.from({ length: 30 }, (_, index) => ({
  _id: `provider-${index}`, _creationTime: 1, created_by: "actor",
  razon_social: index === 0 ? "Acabados de prueba SA de CV" : `Proveedor de prueba ${String(index).padStart(2, "0")}`,
  razon_social_normalizada: `PROVEEDOR ${index}`, rfc: index === 0 ? "PRU010101AAA" : "",
  tipo: index === 2 ? "generico" : "regular", is_complete: index === 0,
  is_archived: index === 29, transaccionesCount: index + 1,
  proyectosCount: index % 2 + 1, totalAmount: (index + 1) * 1250,
}));
const report = {
  counts: { scanned: 3, matched: 2, unmatched: 0, archived: 0, conflict: 1, missing_name: 0, already_assigned: 0, updated: 0 },
  groups: [
    { status: "matched", provider_name: "Acabados de prueba", normalized_name: "ACABADOS DE PRUEBA", provider_id: "provider-0", candidate_names: [], transaction_count: 2 },
    { status: "conflict", provider_name: "Proveedor por revisar", normalized_name: "PROVEEDOR POR REVISAR", candidate_names: ["Proveedor A", "Proveedor B"], transaction_count: 1 },
  ],
  isDone: true, continueCursor: "",
};
export const fixture = {
  queries: [] as Array<{ name: string; args: Record<string, unknown> }>,
  pages: [] as Array<Record<string, unknown>>,
  mutations: [] as Array<{ name: string; args: unknown }>,
  loads: [] as number[],
  role: new URLSearchParams(location.search).get("role") || "admin",
  mode: "ready", limit: 25, loadingMore: false, holdPreview: false,
  previewResolvers: [] as Array<() => void>,
  setMode(mode: string) { this.mode = mode; publish(); },
  releasePreview() { this.previewResolvers.splice(0).forEach(resolve => resolve()); },
};
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown) {
  const version = useSyncExternalStore(subscribe, () => revision);
  const name = getFunctionName(query);
  return useMemo(() => {
    if (args === "skip") return undefined;
    if (name === "users:getCurrentUser") return { _id: "actor", role: fixture.role };
    if (name === "desarrollos:getAll") return [{ _id: "project-a", nombre: "Proyecto A" }, { _id: "project-b", nombre: "Proyecto B" }];
    if (name === "proveedores:getAll") return rows;
    throw new Error(`Unexpected P18 query: ${name}`);
  }, [name, JSON.stringify(args), version]);
}
export function usePaginatedQuery(_query: unknown, args: Record<string, unknown>, options: { initialNumItems: number }) {
  const version = useSyncExternalStore(subscribe, () => revision);
  const result = useMemo(() => {
    fixture.pages.push({ ...args, initialNumItems: options.initialNumItems });
    let filtered = rows.filter(row => args.status === "all" || (args.status === "archived" ? row.is_archived : !row.is_archived));
    if (args.status === "incomplete") filtered = filtered.filter(row => !row.is_complete);
    if (args.status === "generic") filtered = filtered.filter(row => row.tipo === "generico");
    if (args.search) filtered = filtered.filter(row => row.razon_social.toLowerCase().includes(String(args.search).toLowerCase()));
    if (args.proyecto_id === "project-b") filtered = filtered.filter(row => row.proyectosCount > 1);
    const field = args.sort === "transactions" ? "transaccionesCount" : args.sort === "projects" ? "proyectosCount" : args.sort === "amount" ? "totalAmount" : "razon_social";
    filtered.sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (args.direction === "desc" ? -1 : 1));
    return { results: fixture.mode === "loading" || fixture.mode === "empty" ? [] : filtered.slice(0, fixture.limit),
      status: fixture.mode === "loading" ? "LoadingFirstPage" : fixture.loadingMore ? "LoadingMore" : filtered.length > fixture.limit && fixture.mode !== "empty" ? "CanLoadMore" : "Exhausted" };
  }, [JSON.stringify(args), version]);
  return { ...result, loadMore: (count: number) => {
    fixture.loads.push(count); fixture.loadingMore = true; publish();
    setTimeout(() => { fixture.limit += count; fixture.loadingMore = false; publish(); }, 250);
  } };
}
const client = { query: async (query: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) => {
  const name = getFunctionName(query);
  fixture.queries.push({ name, args });
  if (name !== "transacciones:previewProviderSyncPage") throw new Error(`Unexpected P18 preview: ${name}`);
  if (fixture.holdPreview) await new Promise<void>(resolve => fixture.previewResolvers.push(resolve));
  return structuredClone(report);
} };
export function useConvex() { return client; }
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return useMemo(() => async (args: unknown) => {
    fixture.mutations.push({ name, args });
    throw new Error(`P18 fixture forbids writes: ${name}`);
  }, [name]);
}
