import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const params = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
// The downloaded/canvas asset is generated entirely in this fixture.
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="white"/><g fill="none" stroke="#8b9792" stroke-width="3"><path d="M100 100H900V600H100Z M100 320H900 M410 100V600 M680 320V600 M140 140H370V280H140Z M450 140H860V280H450Z M140 360H370V560H140Z M450 360H640V560H450Z M720 360H860V560H720Z"/></g><text x="100" y="655" font-size="22" fill="#526057">A-01 · Plano ficticio de validación</text></svg>')}`;
export const fixture = {
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queries: [] as Array<{ name: string; args: unknown }>,
  role: params.get("role") || "admin",
  owner: params.has("owner"),
  available: !params.has("missing"),
  loading: false,
  unread: 3,
  holdEdit: false,
  releaseEdit: undefined as undefined | (() => void),
  setRole(role: string) { this.role = role; publish(); },
  setLoading(loading: boolean) { this.loading = loading; publish(); },
};
const plan = {
  _id: "plan", proyecto: "project", titulo: "Planta arquitectónica", numero: "A-01", disciplina: "Arquitectura",
  revision: "R1", status: "Vigente", nombre_archivo: "A-01.svg", type: "image/svg+xml", size: 910336,
  uploaded_by_id: "author", created_at: 1795032000000, updated_at: 1795032000000,
  annotation_count: 0, open_annotation_count: 0, comment_count: 0, annotations: [], comments: [],
};
const other = { ...plan, _id: "other", titulo: "Detalle de cimentación", numero: "E-02", disciplina: "Estructura", revision: "R2", status: "Archivado", nombre_archivo: "E-02.svg" };
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown) {
  const version = useSyncExternalStore(subscribe, () => revision);
  const name = getFunctionName(query);
  const key = JSON.stringify(args);
  return useMemo(() => {
    if (args === "skip") return undefined;
    fixture.queries.push({ name, args });
    const input = (args || {}) as Record<string, string>;
    if (name === "users:getCurrentUser") return { _id: fixture.owner ? "author" : "actor", name: "Usuario ficticio", role: fixture.role };
    if (name === "desarrollos:getById") return { _id: input.id, nombre: "Proyecto de prueba" };
    if (name === "planos:getByProject") return [plan, other];
    if (name === "planos:getFoldersByProject" || name === "planos:getMentionableUsers") return [];
    if (name === "planos:getDetail") return fixture.loading ? undefined : { ...(input.plano_id === "other" ? other : plan), url: fixture.available ? image : null };
    if (name === "planos:getUnreadMentionCount") return fixture.unread;
    if (name === "planos:getMentionNotifications") return [];
    throw new Error(`Unexpected P15 query: ${name}`);
  }, [name, key, version]);
}
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return useMemo(() => async (args: Record<string, unknown>) => {
    fixture.calls.push({ name, args });
    if (name === "planos:markMentionNotificationsRead") {
      fixture.unread = 0;
      publish();
      return { has_more: false };
    }
    if (name === "planos:updateMetadata" && fixture.holdEdit) {
      await new Promise<void>((resolve) => { fixture.releaseEdit = resolve; });
      return null;
    }
    throw new Error(`P15 fixture blocks mutation: ${name}`);
  }, [name]);
}
