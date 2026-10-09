import { getFunctionName } from "convex/server";

export const project = { _id: "project", nombre: "Obra de prueba", descripcion: "Proyecto para validar indirectos", honorarios_porcentaje: 15, honorarios_monto: 15000, indirectos_porcentaje: 10, indirectos_fecha_inicio: "2026-10-01", status: "Activo" };
export const partidas = [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", presupuesto_original: 200000, presupuesto_aprobado: 200000, pagado: 100000, por_gastar: 100000, _creationTime: 1 }];
const structureBreakdown = [{ key: "indirectos_reales", label: "COSTOS REALES DE INDIRECTOS", amount: 7000 }];
const monthlyOgcMovements = { "2026-10": { honorarios: 15000, indirectos: 10000, indirectosLegacyCosto: 0, structureBreakdown: { indirectos_reales: 7000 } } };
const totals = { honorarios: 15000, indirectos: 10000, indirectosLegacyCosto: 0, costosRealesIndirectos: 7000, saldoIndirectos: 3000, ingresosOgc: 25000, costosOgc: 7000, costosEstructuraOgc: 7000, costosEstructuraMasIndirectos: 7000, ebitda: 18000, ebitdaMargin: .72, margen: 18000, margenPercent: .72, estructuraPercent: .28, structureBreakdown, activeProjects: 1, currentMonthMargen: 18000, currentMonthIngresos: 25000, currentMonthCostos: 7000, currentMonthMargenPercent: .72, wip: { presupuesto: 200000, costoReal: 125000, pagado: 150000, saldo: 25000, ejecutadoPercent: .625, backlogPendiente: 75000 } };
const pnl = { totals, monthlyOgcMovements, structureGroups: [{ key: "indirectos_reales", label: "COSTOS REALES DE INDIRECTOS" }], period: { year: 2026, cutoffMonth: 10, currentMonthKey: "2026-10" } };
const profitability = { ...pnl, projects: [{ ...project, id: "project", ...totals, wip: { ...totals.wip, avance: .5, valorGanado: 100000, restante: 75000, eac: 250000, varianza: -50000, cpi: .8, ingresosBreakdown: [], runway: 4, averageMonthlyExpense: 100000 } }] };
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown): any {
  if (args === "skip") return undefined;
  const name = getFunctionName(query);
  if (name === "desarrollos:getById") return project;
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
export function useMutation(query: Parameters<typeof getFunctionName>[0]) {
  return async (args: unknown) => { Object.assign(window, { indirectosMutation: { name: getFunctionName(query), args } }); return "project"; };
}
