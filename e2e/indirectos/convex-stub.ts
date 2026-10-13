import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

export const project = { _id: "project", nombre: "Obra de prueba", descripcion: "Proyecto para validar indirectos", honorarios_porcentaje: 15, honorarios_monto: 15000, indirectos_porcentaje: 10, indirectos_fecha_inicio: "2026-10-01", status: "Activo" };
export const partidas = [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", presupuesto_original: 200000, presupuesto_aprobado: 200000, pagado: 100000, por_gastar: 100000, _creationTime: 1 }];
const structureBreakdown = [{ key: "indirectos_reales", label: "COSTOS REALES DE INDIRECTOS", amount: 7000 }];
const monthlyOgcMovements = { "2026-10": { honorarios: 15000, indirectos: 10000, indirectosLegacyCosto: 0, structureBreakdown: { indirectos_reales: 7000 } } };
const totals = { honorarios: 15000, indirectos: 10000, indirectosLegacyCosto: 0, costosRealesIndirectos: 7000, saldoIndirectos: 3000, ingresosOgc: 25000, costosOgc: 7000, costosEstructuraOgc: 7000, costosEstructuraMasIndirectos: 7000, ebitda: 18000, ebitdaMargin: .72, margen: 18000, margenPercent: .72, estructuraPercent: .28, structureBreakdown, activeProjects: 1, currentMonthMargen: 18000, currentMonthIngresos: 25000, currentMonthCostos: 7000, currentMonthMargenPercent: .72, wip: { presupuesto: 200000, costoReal: 125000, pagado: 150000, saldo: 25000, ejecutadoPercent: .625, backlogPendiente: 75000 } };
const pnl = { totals, monthlyOgcMovements, structureGroups: [{ key: "indirectos_reales", label: "COSTOS REALES DE INDIRECTOS" }], period: { year: 2026, cutoffMonth: 10, currentMonthKey: "2026-10" } };
const profitability = { ...pnl, projects: [{ ...project, id: "project", ...totals, wip: { ...totals.wip, avance: .5, valorGanado: 100000, restante: 75000, eac: 250000, varianza: -50000, cpi: .8, ingresosBreakdown: [], runway: 4, averageMonthlyExpense: 100000 } }] };
let revision = 0;
let previewFailure = false;
let mutationFailure = false;
let delayedMutation = false;
let paymentBase = 100000;
Object.assign(window, {
  feeFixtureChange: (change: { project?: Record<string, unknown>; paymentBase?: number; previewFailure?: boolean; mutationFailure?: boolean; delayedMutation?: boolean }) => {
    Object.assign(project, change.project || {});
    if (change.paymentBase !== undefined) paymentBase = change.paymentBase;
    if (change.previewFailure !== undefined) previewFailure = change.previewFailure;
    if (change.mutationFailure !== undefined) mutationFailure = change.mutationFailure;
    if (change.delayedMutation !== undefined) delayedMutation = change.delayedMutation;
    revision++; window.dispatchEvent(new Event("fee-fixture-change"));
  },
});
const subscribe = (callback: () => void) => {
  window.addEventListener("fee-fixture-change", callback);
  return () => window.removeEventListener("fee-fixture-change", callback);
};
const snapshot = () => revision;
function feeImpact(args: Record<string, any>) {
  if (previewFailure) return { status: "error", message: "No se pudo calcular el impacto completo. Error de prueba." };
  const config = (p: Record<string, any>) => ({ honorarios_porcentaje: p.honorarios_porcentaje ?? null,
    indirectos_porcentaje: p.indirectos_porcentaje ?? null, honorarios_modo: p.honorarios_modo || "automatico",
    indirectos_fecha_inicio: p.indirectos_fecha_inicio ?? null, excluded_partidas_honorarios: p.excluded_partidas_honorarios || [] });
  const beforeConfig = config(project), afterConfig = config({ ...project, ...args,
    ...(args.indirectos_porcentaje !== undefined ? { indirectos_fecha_inicio: "2026-10-01" } : {}) });
  const scenario = (c: ReturnType<typeof config>) => {
    const base = c.excluded_partidas_honorarios.includes("work") ? 0 : paymentBase;
    const honorarios = c.honorarios_modo === "transacciones" ? 4000 : base * (c.honorarios_porcentaje || 0) / 100;
    const indirectos = base * (c.indirectos_porcentaje || 0) / 100;
    const pnlHonorarios = base * (c.honorarios_porcentaje || 0) / 100;
    const budget = { honorarios, honorariosBase: c.honorarios_modo === "transacciones" ? 4000 : base,
      honorariosExcluidos: paymentBase - base, honorariosSegunReglas: honorarios, indirectosBase: base,
      indirectos, manualesSustituidos: 0, gasto_total: paymentBase + honorarios + indirectos,
      presupuesto_original: 200000, presupuesto_aprobado: 200000, por_gastar: 200000 - paymentBase - honorarios - indirectos };
    const pnlValues = { baseHonorarios: base, baseIndirectos: base, honorarios: pnlHonorarios,
      indirectosAutomaticos: indirectos, indirectosHistoricos: 0, indirectos, costoHistorico: 0,
      costosReales: 7000, saldoIndirectos: indirectos - 7000, ebitda: pnlHonorarios + indirectos - 7000 };
    return { budget, pnl: { ...pnlValues, monthly: { "2026-10": pnlValues } } };
  };
  const before = scenario(beforeConfig), after = scenario(afterConfig);
  return { status: "ready", expectedImpact: JSON.stringify({ beforeConfig, afterConfig, paymentBase }), beforeConfig, afterConfig,
    beforeBudget: before.budget, afterBudget: after.budget, beforePnl: before.pnl, afterPnl: after.pnl,
    budgetCurrency: "MXN", rates: { USD: 17, EUR: 18.5 }, period: { start: "2026-10-01", end: "2026-10-31" },
    counts: { transactions: 1, paid: 1, payments: 1, invalidDates: 0 }, currencies: ["MXN"] };
}

function queryResult(query: Parameters<typeof getFunctionName>[0], args?: unknown): any {
  if (args === "skip") return undefined;
  const name = getFunctionName(query);
  if (name === "desarrollos:getById") return structuredClone(project);
  if (name === "desarrollos:previewFeeImpact") return feeImpact(args as Record<string, any>);
  if (name === "desarrollos:getAll") return [project];
  if (name === "partida:getByProject") return partidas;
  if (name === "project_locations:list") return [];
  if (name === "users:getCurrentUser") return { role: "admin" };
  if (name === "currency_helpers:getProjectDefaultCurrency") return { defaultCurrency: "MXN" };
  if (name === "pagos:getPaymentsByDateRange") return { paymentsByPartida: { work: 100000 }, indirectos: 10000 };
  if (name === "desarrollos:getPnlSummary") return pnl;
  if (name === "desarrollos:getProfitabilitySummary") return profitability;
  if (name === "ogc_movimientos:getAll") return [];
  throw new Error(`Unexpected fixture query: ${name}`);
}
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown): any {
  const current = useSyncExternalStore(subscribe, snapshot);
  const key = JSON.stringify(args);
  return useMemo(() => queryResult(query, args), [getFunctionName(query), key, current]);
}
export function useMutation(query: Parameters<typeof getFunctionName>[0]) {
  return async (args: unknown) => {
    Object.assign(window, { indirectosMutation: { name: getFunctionName(query), args } });
    if (delayedMutation) await new Promise(resolve => setTimeout(resolve, 900));
    if (mutationFailure) throw new Error("Error de guardado de prueba");
    return "project";
  };
}
