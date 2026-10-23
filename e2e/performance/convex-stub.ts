import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const calls: string[] = [];
const listeners = new Set<() => void>();
let unread = 1;
let version = 0;
Object.assign(window, {
  performanceFixtureCalls: calls,
  changeUnread: (count: number) => { unread = count; version++; listeners.forEach(listener => listener()); },
});
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown) {
  const revision = useSyncExternalStore(subscribe, () => version);
  const name = getFunctionName(query);
  const key = JSON.stringify(args);
  return useMemo(() => {
    if (args === "skip") return undefined;
    calls.push(name);
    if (name === "desarrollos:getAll") return [{ _id: "project", nombre: "Proyecto de prueba" }];
    if (name === "planos:getUnreadMentionCount") return unread;
    if (name === "planos:getMentionNotifications") return [];
    throw new Error(`Unexpected fixture query: ${name}`);
  }, [name, key, revision]);
}
export function useConvexAuth() { return { isAuthenticated: true, isLoading: false }; }
export function useMutation() {
  return async () => ({ has_more: false });
}
export const useAction = useMutation;
export function useConvex() { throw new Error("Unexpected fixture imperative query"); }
export function usePaginatedQuery() { throw new Error("Unexpected fixture paginated query"); }
