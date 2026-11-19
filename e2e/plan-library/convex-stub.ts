import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const params = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const fixture = {
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queries: [] as Array<{ name: string; args: unknown }>,
  unread: { project: 3, other: 7, global: 12 } as Record<string, number | undefined>,
  role: params.get("role") || "admin",
  empty: params.has("empty"),
  holdRead: false,
  readResolvers: [] as Array<() => void>,
  setUnread(scope: string, count: number | undefined) { this.unread[scope] = count; publish(); },
  setRole(role: string) { this.role = role; publish(); },
  releaseRead() { this.readResolvers.splice(0).forEach((resolve) => resolve()); },
};
const plan = {
  _id: "plan", proyecto: "project", titulo: "Planta arquitectónica", numero: "A-01", disciplina: "Arquitectura",
  revision: "R1", status: "Vigente", nombre_archivo: "A-01.pdf", type: "application/pdf", size: 1024,
  uploaded_by_id: "actor", created_at: 1795032000000, updated_at: 1795032000000, url: null,
  annotation_count: 0, open_annotation_count: 0, comment_count: 0, annotations: [], comments: [],
};
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown) {
  const version = useSyncExternalStore(subscribe, () => revision);
  const name = getFunctionName(query);
  const key = JSON.stringify(args);
  return useMemo(() => {
    if (args === "skip") return undefined;
    fixture.queries.push({ name, args });
    const input = (args || {}) as Record<string, string>;
    const scope = input.proyecto || "global";
    if (name === "users:getCurrentUser") return fixture.role === "loading" ? undefined : { _id: "actor", name: "Usuario de prueba", role: fixture.role };
    if (name === "desarrollos:getById") return { _id: input.id, nombre: input.id === "other" ? "Proyecto alterno" : "Proyecto de prueba" };
    if (name === "planos:getByProject") return fixture.empty ? [] : [plan];
    if (name === "planos:getFoldersByProject") return fixture.empty ? [] : [{ _id: "folder", nombre: "Arquitectura", plan_count: 0, created_at: plan.created_at }];
    if (name === "planos:getMentionableUsers") return [];
    if (name === "planos:getDetail") return plan;
    if (name === "planos:getUnreadMentionCount") return fixture.unread[scope];
    if (name === "planos:getMentionNotifications") return fixture.unread[scope] === 0 ? [] : [{
      _id: `mention-${scope}`, proyecto: scope === "global" ? "other" : scope, plano_id: "plan",
      actor_name: "Responsable de prueba", plano_titulo: `Plano de ${scope}`, proyecto_nombre: "Proyecto alterno",
      comment_excerpt: "Revisar la especificación del plano.", is_unread: true, created_at: plan.created_at,
    }];
    throw new Error(`Unexpected P14 query: ${name}`);
  }, [name, key, version]);
}
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return useMemo(() => async (args: Record<string, unknown>) => {
    fixture.calls.push({ name, args });
    if (name !== "planos:markMentionNotificationsRead") throw new Error(`P14 validation forbids mutation: ${name}`);
    if (fixture.holdRead) {
      await new Promise<void>((resolve) => fixture.readResolvers.push(resolve));
      return { has_more: true };
    }
    fixture.unread[String(args.proyecto || "global")] = 0;
    publish();
    return { has_more: false };
  }, [name]);
}
