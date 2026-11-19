import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const listeners = new Set<() => void>();
let revision = 0;
const publish = () => { revision++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const control = { role: "user", access: true, mode: "ready", fail: false };
let settle: (() => void) | undefined;
const mutations: Array<{ name: string; args: unknown }> = [];
export const fixture = {
  mutations,
  set: (patch: Partial<typeof control>) => { Object.assign(control, patch); publish(); },
  finish: () => settle?.(),
};
function rows(projectId: string) {
  const base = { _creationTime: 1, sales_proyecto: projectId, nombre: "Unidad A (ficticia)", familia: "", sub_partida: "", unidad: "", cantidad: 1, precio_unitario: 1000,
    presupuesto_original: 1000, presupuesto_aprobado: 800, pagado: 200, por_gastar: 600, archivo_origen: "fixture" };
  return [
    { ...base, _id: "fixture-root-a", nivel: 1 },
    { ...base, _id: "fixture-family", nivel: 2, partida_nombre: base.nombre, familia: "Interior (ficticio)" },
    { ...base, _id: "fixture-leaf", nivel: 3, partida_nombre: base.nombre, familia: "Interior (ficticio)", sub_partida: "Acabados (ficticios)" },
    { ...base, _id: "fixture-root-b", nivel: 1, nombre: "Unidad B (ficticia)", presupuesto_original: 2000, presupuesto_aprobado: 1600, pagado: 400, por_gastar: 1200 },
  ];
}
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: Record<string, unknown> | "skip") {
  const version = useSyncExternalStore(subscribe, () => revision);
  const name = getFunctionName(query);
  return useMemo(() => {
    if (args === "skip") return undefined;
    if (name === "users:getCurrentUser") return control.mode === "permissions-loading" ? undefined : { _id: "fixture-user", role: control.role };
    if (name === "sales_projects:getById") return control.mode === "loading" ? undefined : !control.access || control.mode === "missing" ? null : { _id: args?.id, nombre: `Proyecto ${args?.id === "fixture-b" ? "B" : "A"} · Ventas ficticias` };
    if (name === "sales_partidas:getBySalesProject") return control.mode === "loading" ? undefined : control.mode === "empty" ? [] : rows(String(args?.salesProjectId));
    if (name === "currency_helpers:getSalesProjectDefaultCurrency") return { defaultCurrency: "USD" };
    if (name.startsWith("sales_pagos:")) return [];
    throw new Error(`Unexpected P24 query: ${name}`);
  }, [name, JSON.stringify(args), version]);
}
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(mutation);
  return useMemo(() => async (args: unknown) => {
    if (name !== "sales_partidas_sync:syncSalesPartidasFromTransactions") throw new Error(`P24 forbids mutation: ${name}`);
    mutations.push({ name, args });
    await new Promise<void>(resolve => { settle = resolve; });
    if (control.fail) throw new Error("P24 · Error simulado");
    return { message: "P24 · Sincronización ficticia completada" };
  }, [name]);
}
