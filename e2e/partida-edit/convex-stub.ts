import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { useSyncExternalStore } from "react";
import { analyzePartidaEdit, executePartidaEdit, loadPartidaEditContext } from "../../convex/partidaEdit";
import { calculateBudgetIndirectos } from "../../convex/indirectosBudget";
import { partidaEditSource } from "../../convex/partidaRules";
import type { Doc } from "../../convex/_generated/dataModel";

export const scenario = new URLSearchParams(location.search).get("case") || "";
export const recorded = { previews: 0, contexts: 0, mutations: [] as { args: unknown }[], writes: 0 };
Object.assign(window, { partidaEditRecorded: recorded });
const common = { proyecto: "project", nombre: "OBRA", nivel: 1, familia: "", sub_partida: "", unidad: "m", cantidad: 4, precio_unitario: 100, archivo_origen: "test", _creationTime: 0 };
export const tables: Record<string, any[]> = {
  users: [{ _id: "user", clerkId: "writer", role: scenario === "viewer" ? "viewer" : scenario === "almacenista" ? "almacenista" : "finance", email: "test@example.invalid", allowed_desarrollos: ["project"] }],
  desarrollos: [{ _id: "project", nombre: "Obra de prueba", moneda_principal: scenario === "usd" ? "USD" : "MXN", honorarios_monto: 80, indirectos_porcentaje: 5, indirectos_fecha_inicio: "2026-10-01" }],
  partidas: [
    { ...common, _id: "root", presupuesto_original: 2000, presupuesto_aprobado: 900, pagado: 650, por_gastar: 250 },
    { ...common, _id: "family", nivel: 2, partida_nombre: "OBRA", familia: "ACERO", presupuesto_original: 999, presupuesto_aprobado: 600, pagado: 550, por_gastar: 50 },
    { ...common, _id: "empty", nivel: 2, partida_nombre: "OBRA", familia: "OTROS", presupuesto_original: 300, presupuesto_aprobado: 300, pagado: 0, por_gastar: 300 },
    { ...common, _id: "leaf", nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA", presupuesto_original: 350, presupuesto_aprobado: 400, pagado: 250, por_gastar: 150 },
    { ...common, _id: "sibling", nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "MALLA", presupuesto_original: 200, presupuesto_aprobado: 200, pagado: 100, por_gastar: 100 },
    { ...common, _id: "standalone", nombre: "DIRECTA", presupuesto_original: 100, presupuesto_aprobado: 100, pagado: 20, por_gastar: 80 },
    { ...common, _id: "fee", nombre: "HONORARIOS", presupuesto_original: 0, presupuesto_aprobado: 0, pagado: 80, por_gastar: -80 },
  ],
  transacciones: [{ _id: "tx", proyecto: "project", monto_total: 650, fecha: "05/10/2026", moneda: scenario === "usd" ? "USD" : "MXN", status: "Pagado" }],
  pagos: [{ _id: "a", transaccion_id: "tx", partida_id: "leaf", monto: 250 }, { _id: "b", transaccion_id: "tx", partida_id: "sibling", monto: 100 }, { _id: "c", transaccion_id: "tx", partida_id: "family", monto: 200 }, { _id: "d", transaccion_id: "tx", partida_id: "root", monto: 100 }],
  programa_obra_detalle: [{ _id: "detail", proyecto: "project", nivel: 3, partida: "OBRA", familia: "ACERO", subpartida: "VARILLA" }],
  meticas_presupuesto: [],
};
let revision = 0;
const listeners = new Set<() => void>();
const publish = () => { revision++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const readRows = () => tables.partidas.map(p => ({ ...p })) as Doc<"partidas">[];
export function useRevision() { return useSyncExternalStore(subscribe, () => revision); }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ctx: any = { auth: { getUserIdentity: async () => ({ subject: "writer" }) }, db: {
  get: async (id: string) => structuredClone(Object.values(tables).flat().find(p => p._id === id) || null),
  patch: async (id: string, patch: object) => { recorded.writes++; Object.assign(Object.values(tables).flat().find(p => p._id === id), patch); },
  insert: async (table: string, doc: object) => { recorded.writes++; const id = `${table}-${tables[table].length}`; tables[table].push({ _id: id, ...doc }); return id; },
  query(table: string) {
    const filters: [string, unknown][] = [];
    const query = {
      withIndex(_name: string, predicate: (builder: any) => void) { const builder = { eq(key: string, value: unknown) { filters.push([key, value]); return builder; } }; predicate(builder); return query; },
      async collect() { return structuredClone((tables[table] || []).filter(p => filters.every(([k, v]) => p[k] === v))); },
      async first() { return (await query.collect())[0] || null; },
      async *[Symbol.asyncIterator]() { for (const row of await query.collect()) yield row; },
    }; return query;
  },
} };
window.addEventListener("partida-edit-change", () => { Object.assign(tables.partidas.find(p => p._id === "leaf"), { pagado: 350, por_gastar: 50, cantidad: 7, sub_partida: "RENOMBRE EXTERNO" }); publish(); });
window.addEventListener("partida-edit-revoke", () => { tables.users[0].role = "viewer"; publish(); });
export function useQuery(ref: any, args: any) {
  useRevision();
  if (args === "skip") return undefined;
  const name = getFunctionName(ref);
  if (name === "users:getCurrentUser") return { ...tables.users[0] };
  if (name === "currency_helpers:getProjectDefaultCurrency") return { defaultCurrency: tables.desarrollos[0].moneda_principal };
  if (name === "desarrollos:getById") return tables.desarrollos[0];
  if (name === "partida:getByNivel") return tables.partidas.filter(p => p.nivel === args.nivel && p.proyecto === args.proyecto);
  if (name === "partida:getDistinctFamiliasByPartida") return [];
  if (name === "pagos:getPaymentsByDateRange") return { paymentsByPartida: { leaf: 250, sibling: 100, family: 200, root: 100 }, indirectos: 32.5 };
  if (name.startsWith("pagos:")) return [];
  throw new Error(`Unexpected fixture query: ${name}`);
}
const client = { async query(ref: any, args: any) {
  const name = getFunctionName(ref);
  if (name === "partida:getEditContext") {
    recorded.contexts++; await wait(50);
    if (scenario === "denied") throw new Error("No tienes permiso para editar el presupuesto de este proyecto.");
    const { target, project } = await loadPartidaEditContext(ctx, args);
    return { target, currency: project.moneda_principal || "MXN", source: partidaEditSource(target) };
  }
  if (name === "partida:getEditImpact") {
    const n = ++recorded.previews;
    const result = (await analyzePartidaEdit(ctx, args)).impact;
    await wait(scenario === "race" && n === 1 ? 1000 : 80);
    if (scenario === "preview-error" && n === 1) throw new Error("No se pudo consultar el impacto.");
    return result;
  }
  throw new Error(`Unexpected client query: ${name}`);
} };
export function useConvex() { return client; }
export function useMutation(ref: any) { return async (args: any) => {
  if (getFunctionName(ref) === "partida:createPartida") {
    recorded.mutations.push({ args });
    const result = await ctx.db.insert("partidas", { ...args, por_gastar: args.presupuesto_aprobado - args.pagado });
    publish(); return result;
  }
  if (getFunctionName(ref) !== "partida:update") throw new Error("Unexpected fixture mutation");
  recorded.mutations.push({ args });
  await wait(600);
  if (scenario === "save-error" && recorded.mutations.length === 1) throw new Error("No se pudo guardar. Error temporal.");
  if (scenario === "conflict" && recorded.mutations.length === 1) {
    tables.partidas.find(p => p._id === "sibling").presupuesto_aprobado = 300;
    throw new ConvexError("El presupuesto cambió después de la revisión. Actualiza la revisión antes de guardar; tus cambios se conservan.");
  }
  const result = await executePartidaEdit(ctx, args); publish(); return result;
}; }
