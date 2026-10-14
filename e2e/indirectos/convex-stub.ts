import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { deriveFeeConcepts, feeChargesForPayment, calculateFeeConceptPayments, type FeeConceptInput, type FeeConceptConfig, type FeeConceptPartida } from "../../convex/feeConceptRules";

type FixtureProject = { _id: string; nombre: string; descripcion: string; status: string; honorarios_porcentaje: number; honorarios_monto: number;
  honorarios_modo?: "automatico" | "transacciones"; indirectos_porcentaje?: number; indirectos_fecha_inicio?: string;
  excluded_partidas_honorarios?: string[]; fee_concepts?: FeeConceptConfig[] };
type FixturePartida = FeeConceptPartida & { presupuesto_original: number; presupuesto_aprobado: number; pagado: number; por_gastar: number; _creationTime: number; sub_partida?: string };
type FixtureProposal = Omit<Partial<FixtureProject>, "fee_concepts"> & { fee_concepts?: FeeConceptInput[] };
export const project: FixtureProject = { _id: "project", nombre: "Obra de prueba", descripcion: "Proyecto para validar indirectos", honorarios_porcentaje: 15, honorarios_monto: 15000, indirectos_porcentaje: 10, indirectos_fecha_inicio: "2026-10-01", status: "Activo" };
export const partidas: FixturePartida[] = [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", presupuesto_original: 200000, presupuesto_aprobado: 200000, pagado: 100000, por_gastar: 100000, _creationTime: 1 }];
partidas.push(...[
  { _id: "fee", nombre: "HONORARIOS", original: 30000 }, { _id: "gc", nombre: "GENERAL CONDITIONS", original: 18000 },
  { _id: "travel", nombre: "VIÁTICOS", original: 3600 }, { _id: "misc", nombre: "VARIOS SIN HONORARIOS", original: 4000 },
].map(p => ({ _id: p._id, nombre: p.nombre, proyecto: "project", nivel: 1, presupuesto_original: p.original, presupuesto_aprobado: p.original, pagado: 0, por_gastar: p.original, _creationTime: 1 })));
partidas.push({ _id: "travel-family", proyecto: "project", nivel: 2, nombre: "VIÁTICOS", partida_nombre: "VIÁTICOS", familia: "Gastos de viaje", presupuesto_original: 3600, presupuesto_aprobado: 3600, pagado: 0, por_gastar: 3600, _creationTime: 1 },
  ...[360, 720, 1080, 720, 720].map((amount,index) => ({ _id: `travel-${index + 1}`, proyecto: "project", nivel: 3, nombre: "VIÁTICOS", partida_nombre: "VIÁTICOS", familia: "Gastos de viaje", sub_partida: `Viático ${index + 1}`, presupuesto_original: amount, presupuesto_aprobado: amount, pagado: 0, por_gastar: amount, _creationTime: 1 })));
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
  feeFixtureChange: (change: { project?: Record<string, unknown>; approvedWork?: number; paymentBase?: number; previewFailure?: boolean; mutationFailure?: boolean; delayedMutation?: boolean }) => {
    Object.assign(project, change.project || {});
    if (change.paymentBase !== undefined) paymentBase = change.paymentBase;
    if (change.approvedWork !== undefined) partidas[0].presupuesto_aprobado = change.approvedWork;
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
function feeImpact(args: FixtureProposal) {
  if (previewFailure) return { status: "error", message: "No se pudo calcular el impacto completo. Error de prueba." };
  const config = (p: Partial<FixtureProject>) => ({ honorarios_porcentaje: p.honorarios_porcentaje ?? null,
    indirectos_porcentaje: p.indirectos_porcentaje ?? null, honorarios_modo: p.honorarios_modo || "automatico",
    indirectos_fecha_inicio: p.indirectos_fecha_inicio ?? null, excluded_partidas_honorarios: p.excluded_partidas_honorarios || [], fee_concepts: p.fee_concepts || [] });
  let concepts;
  try { concepts = args.fee_concepts === undefined ? undefined : deriveFeeConcepts(args.fee_concepts as FeeConceptInput[], partidas); }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Revisa los conceptos." }; }
  const beforeConfig = config(project), afterConfig = config({ ...project, ...args,
    fee_concepts: concepts ?? project.fee_concepts,
    ...(args.indirectos_porcentaje !== undefined ? { indirectos_fecha_inicio: "2026-10-01" } : {}) });
  const scenario = (c: ReturnType<typeof config>) => {
    const base = c.excluded_partidas_honorarios.includes("work") ? 0 : paymentBase;
    const charges = feeChargesForPayment(c.fee_concepts, partidas[0], partidas, "2026-10-01", paymentBase);
    const configuredH = c.fee_concepts.some((fee: { concepto: string }) => fee.concepto === "honorarios");
    const configuredI = c.fee_concepts.some((fee: { concepto: string }) => fee.concepto !== "honorarios");
    const h = charges.filter(fee => fee.config.concepto === "honorarios").reduce((sum,fee) => sum + fee.monto, 0);
    const honorarios = configuredH ? h : c.honorarios_modo === "transacciones" ? 4000 : base * (c.honorarios_porcentaje || 0) / 100;
    const indirectos = configuredI ? charges.filter(fee => fee.config.concepto !== "honorarios").reduce((sum,fee) => sum + fee.monto, 0) : base * (c.indirectos_porcentaje || 0) / 100;
    const pnlHonorarios = configuredH ? h : base * (c.honorarios_porcentaje || 0) / 100;
    const hBase = configuredH ? charges.find(fee => fee.config.concepto === "honorarios")?.base || 0 : base;
    const iBase = configuredI ? charges.filter(fee => fee.config.concepto !== "honorarios").reduce((sum,fee) => sum + fee.base, 0) : base;
    const original = partidas.filter(p => p.nivel === 1).reduce((sum,p) => sum + p.presupuesto_original, 0);
    const approved = partidas.filter(p => p.nivel === 1).reduce((sum,p) => sum + p.presupuesto_aprobado, 0);
    const budget = { honorarios, honorariosBase: configuredH ? hBase : c.honorarios_modo === "transacciones" ? 4000 : base,
      honorariosExcluidos: paymentBase - base, honorariosSegunReglas: honorarios, indirectosBase: base,
      indirectos, manualesSustituidos: 0, gasto_total: paymentBase + honorarios + indirectos,
      presupuesto_original: original, presupuesto_aprobado: approved, por_gastar: approved - paymentBase - honorarios - indirectos };
    budget.indirectosBase = iBase;
    const pnlValues = { baseHonorarios: hBase, baseIndirectos: iBase, honorarios: pnlHonorarios,
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

function queryResult(name: string, args?: unknown): unknown {
  if (args === "skip") return undefined;
  if (name === "desarrollos:getById") {
    const p = project;
    if (!p.fee_concepts?.length) return structuredClone(project);
    const fee_concepts = deriveFeeConcepts(p.fee_concepts, partidas);
    const charges = feeChargesForPayment(fee_concepts, partidas[0], partidas, "2026-10-01", paymentBase);
    return { ...structuredClone(project), fee_concepts, honorarios_monto: charges.find(c => c.config.concepto === "honorarios")?.monto ?? p.honorarios_monto };
  }
  if (name === "desarrollos:previewFeeImpact") return feeImpact(args as FixtureProposal);
  if (name === "desarrollos:getAll") return [project];
  if (name === "partida:getByProject") return partidas;
  if (name === "project_locations:list") return [];
  if (name === "users:getCurrentUser") return { role: "admin" };
  if (name === "currency_helpers:getProjectDefaultCurrency") return { defaultCurrency: "MXN" };
  if (name === "pagos:getPaymentsByDateRange") {
    const p = project;
    if (!p.fee_concepts?.length) return { paymentsByPartida: { work: 100000 }, indirectos: 10000 };
    const result = calculateFeeConceptPayments({ configs: p.fee_concepts, partidas,
      transactions: [{ _id: "tx", fecha: "2026-10-01", status: "Pagado" }], pagos: [{ transaccion_id: "tx", partida_id: "work", monto: paymentBase }] });
    return { paymentsByPartida: { work: paymentBase, ...result.automaticosPorPartida }, feePercentagesByPartida: result.porcentajesPorPartida,
      honorarios: result.concepts.find(c => c.concepto === "honorarios")?.monto ?? p.honorarios_monto,
      indirectos: result.concepts.filter(c => c.concepto !== "honorarios").reduce((sum,c) => sum + c.monto, 0) };
  }
  if (name === "desarrollos:getPnlSummary") return pnl;
  if (name === "desarrollos:getProfitabilitySummary") return profitability;
  if (name === "ogc_movimientos:getAll") return [];
  throw new Error(`Unexpected fixture query: ${name}`);
}
export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown): unknown {
  const current = useSyncExternalStore(subscribe, snapshot);
  const key = JSON.stringify(args);
  const name = getFunctionName(query);
  return useMemo(() => ({ revision: current, value: queryResult(name, key === undefined ? undefined : JSON.parse(key)) }), [name, key, current]).value;
}
export function useConvex() {
  return { query: async (query: Parameters<typeof getFunctionName>[0], args?: unknown) => queryResult(getFunctionName(query), args) };
}
export function useMutation(query: Parameters<typeof getFunctionName>[0]) {
  return async (args: unknown) => {
    Object.assign(window, { indirectosMutation: { name: getFunctionName(query), args } });
    if (delayedMutation) await new Promise(resolve => setTimeout(resolve, 900));
    if (mutationFailure) throw new Error("Error de guardado de prueba");
    const proposal = args as FixtureProposal;
    if (proposal.fee_concepts) {
      Object.assign(project, { fee_concepts: deriveFeeConcepts(proposal.fee_concepts, partidas) });
      revision++; window.dispatchEvent(new Event("fee-fixture-change"));
    }
    return "project";
  };
}
