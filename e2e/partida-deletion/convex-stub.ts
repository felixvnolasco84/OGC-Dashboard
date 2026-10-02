import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { useSyncExternalStore } from "react";
import type { DeletionImpact } from "../../convex/partidaDeletion";

const scenario = new URLSearchParams(location.search).get("case");
export const recorded = { previews: 0, mutations: [] as unknown[] };
Object.assign(window, { deletionRecorded: recorded });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const counts = { pagos: 0, ponderaciones: 0, avances: 0, programacion: 0, hitos: 0, historial: 0, requisiciones: 0, rfis: 0, bitacoras: 0, documentos: 0, tareas: 0, subcontratistas: 0, facturas: 0, memoria: 0, exclusiones: 0, proyecciones: 0 };
let role = scenario === "viewer" ? "viewer" : scenario === "writer" ? "user" : "admin";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
window.addEventListener("deletion-revoke", () => { role = "viewer"; listeners.forEach(listener => listener()); });

export function useQuery(query, args) {
  const currentRole = useSyncExternalStore(subscribe, () => role);
  if (args === "skip") return undefined;
  const name = getFunctionName(query);
  if (name === "users:getCurrentUser") return { role: currentRole };
  if (name === "currency_helpers:getProjectDefaultCurrency") return { defaultCurrency: "MXN" };
  if (name === "desarrollos:getById") return { _id: "project", nombre: "Obra", honorarios_monto: 0 };
  if (name.startsWith("pagos:")) return [];
  throw new Error(`Unexpected query: ${name}`);
}

const client = {
  async query(query, { id }) {
    if (getFunctionName(query) !== "partida:getDeletionImpact") throw new Error("Unexpected preview");
    recorded.previews++;
    await wait(100);
    if (scenario === "preview-error" && recorded.previews === 1) throw new Error("Error temporal al consultar");
    const nivel = id === "root" ? 1 : id === "family" ? 2 : 3;
    const blocked = ["blocked", "limit", "honorarios"].includes(scenario || "");
    const result: DeletionImpact = {
      status: scenario === "missing" ? "missing" : blocked ? "blocked" : "ready",
      canDelete: scenario !== "missing" && !blocked, verified: scenario !== "limit",
      name: nivel === 1 ? "OBRA" : nivel === 2 ? "ACERO" : "VARILLA",
      nivel, scope: { partidas: nivel === 1 ? 2 : 0, familias: nivel <= 2 ? 1 : 0, subpartidas: nivel === 3 ? 1 : 2, total: nivel === 1 ? 5 : nivel === 2 ? 3 : 1, duplicates: nivel === 1 ? 1 : 0 },
      counts: { ...counts, pagos: blocked ? 2 : 0 }, blockers: scenario === "limit" ? ["El volumen de datos excede el límite de verificación segura."] : scenario === "honorarios" ? ["La rama HONORARIOS está protegida."] : blocked ? ["2 pagos", "1 concepto de factura"] : [],
      expectedScope: `snapshot-${recorded.previews}`, hasEquivalentSibling: false,
      budget: { before: { presupuesto_original: 100, presupuesto_aprobado: 120, gasto_total: 0, por_gastar: 120 }, after: { presupuesto_original: 0, presupuesto_aprobado: 0, gasto_total: 0, por_gastar: 0 } },
    };
    return result;
  },
};
export function useConvex() { return client; }
export function useMutation(query) {
  const name = getFunctionName(query);
  return async args => {
    if (name !== "partida:deletePartida") throw new Error(`Unexpected mutation: ${name}`);
    recorded.mutations.push(args);
    if (scenario === "changed" && recorded.mutations.length === 1) throw new ConvexError("El presupuesto cambió después de la revisión. Revisa el nuevo alcance y vuelve a confirmar.");
    if (scenario === "dependency" && recorded.mutations.length === 1) throw new ConvexError("1 pago asociado impide la eliminación.");
    // Publish the removal while the mutation is still pending. The shared
    // dialog must remain mounted after its originating row disappears.
    window.dispatchEvent(new CustomEvent("deletion-publish", { detail: args.id }));
    await wait(700);
    return { status: "deleted", deletedIds: [args.id], removedFilters: { partidas: args.id === "root" ? ["OBRA"] : [], familias: args.id !== "leaf" ? ["ACERO"] : [] } };
  };
}
