import { getFunctionName } from "convex/server";
import { useSyncExternalStore } from "react";
import * as edit from "../partida-edit/convex-stub";
import * as deletion from "../partida-deletion/convex-stub";

const params = new URLSearchParams(location.search);
let loading = params.has("loading");
let userState = params.get("role") || "admin";
let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = () => { revision++; listeners.forEach(listener => listener()); };
export const recorded = { queries: [] as { name: string; args: unknown }[], deletes: [] as string[] };
Object.assign(window, { partidaMenuRecorded: recorded });
window.addEventListener("menu-payments-ready", () => { loading = false; publish(); });
window.addEventListener("menu-user-ready", () => { userState = "admin"; publish(); });
const paymentQueries = ["pagos:getByPartidaName", "pagos:getByFamilia", "pagos:getByPartidaId"];

export function useQuery(ref: any, args: any) {
  useSyncExternalStore(subscribe, () => revision);
  const name = getFunctionName(ref);
  const handled = name === "users:getCurrentUser" || paymentQueries.includes(name) || name === "budgetCreationHistory:source";
  const base = edit.useQuery(ref, handled ? "skip" : args);
  if (args === "skip") return undefined;
  if (name === "users:getCurrentUser") return userState === "loading" ? undefined : userState === "null" ? null : { role: userState };
  if (paymentQueries.includes(name)) {
    recorded.queries.push({ name, args });
    if (loading) return undefined;
    return [{ _id: name, _creationTime: 0, monto: 23, partida_id: "leaf", transaccion_id: "tx" }];
  }
  if (name === "budgetCreationHistory:source") {
    recorded.queries.push({ name, args });
    return { legacy_name: "presupuesto-ficticio.xlsx", items: [] };
  }
  return base;
}
const editClient = edit.useConvex();
const deletionClient = deletion.useConvex();
const client = { query(ref: any, args: any) { return getFunctionName(ref) === "partida:getDeletionImpact" ? deletionClient.query(ref, args) : editClient.query(ref, args); } };
export function useConvex() {
  return client;
}
export function useMutation(ref: any) {
  if (getFunctionName(ref) === "partida:deletePartida") return async () => { throw new Error("P27 never confirms deletion"); };
  return edit.useMutation(ref);
}
export function useAction() { return async () => { throw new Error("Unexpected P27 fixture action"); }; }
export { readRows } from "../partida-edit/convex-stub";
