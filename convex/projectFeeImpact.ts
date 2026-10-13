import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getHonorariosBreakdown, getHonorariosModo } from "./honorariosRules";
import { INDIRECTOS_START, validateIndirectosPercentage } from "./indirectosRules";
import { calculateBudgetIndirectos } from "./indirectosBudget";
import { calculatePresupuestoMetrics } from "./presupuestoRules";

export const feeConfigValidators = {
  honorarios_porcentaje: v.optional(v.number()),
  honorarios_modo: v.optional(v.union(v.literal("automatico"), v.literal("transacciones"))),
  indirectos_porcentaje: v.optional(v.number()),
  excluded_partidas_honorarios: v.optional(v.array(v.id("partidas"))),
};
export type FeeProposal = Pick<Doc<"desarrollos">, keyof typeof feeConfigValidators>;
export type FeeImpactRecords = {
  partidas: Doc<"partidas">[];
  transactions: Doc<"transacciones">[];
  pagos: Doc<"pagos">[];
  movements: Doc<"ogc_movimientos">[];
};

// Leave room for revalidation and synchronous triggers in the save transaction.
export const FEE_IMPACT_LIMIT = 2500;
const TOO_LARGE = "El proyecto supera el límite de revisión completa. No se guardaron cambios financieros; solicita una revisión de capacidad.";

export function proposedFeeProject(project: Doc<"desarrollos">, proposal: FeeProposal) {
  validateIndirectosPercentage(proposal.indirectos_porcentaje);
  if (proposal.honorarios_porcentaje !== undefined &&
      (!Number.isFinite(proposal.honorarios_porcentaje) || proposal.honorarios_porcentaje < 0 || proposal.honorarios_porcentaje > 100)) {
    throw new Error("El porcentaje de honorarios debe estar entre 0 y 100.");
  }
  return {
    ...project,
    ...Object.fromEntries(Object.entries(proposal).filter(([, value]) => value !== undefined)),
    ...(proposal.indirectos_porcentaje !== undefined
      ? { indirectos_fecha_inicio: project.indirectos_fecha_inicio || INDIRECTOS_START } : {}),
  } as Doc<"desarrollos">;
}

export function feeConfig(project: Doc<"desarrollos">) {
  return {
    honorarios_porcentaje: project.honorarios_porcentaje ?? null,
    honorarios_modo: getHonorariosModo(project.honorarios_modo),
    indirectos_porcentaje: project.indirectos_porcentaje ?? null,
    indirectos_fecha_inicio: project.indirectos_fecha_inicio ?? null,
    excluded_partidas_honorarios: project.excluded_partidas_honorarios || [],
  };
}

export function feeConfigChanged(before: Doc<"desarrollos">, after: Doc<"desarrollos">) {
  return JSON.stringify(feeConfig(before)) !== JSON.stringify(feeConfig(after));
}

export async function loadFeeImpactRecords(ctx: Pick<QueryCtx, "db">, project: Doc<"desarrollos">): Promise<FeeImpactRecords> {
  const partidas = await ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(FEE_IMPACT_LIMIT + 1);
  const transactions = await ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(FEE_IMPACT_LIMIT + 1);
  const movements = await ctx.db.query("ogc_movimientos").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(FEE_IMPACT_LIMIT + 1);
  let count = partidas.length + transactions.length + movements.length;
  if (count > FEE_IMPACT_LIMIT) throw new Error(TOO_LARGE);
  const pagos: Doc<"pagos">[] = [];
  // Historical payments may lack proyecto_id, so never use that index alone.
  for (const transaction of transactions) {
    const rows = await ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", transaction._id))
      .take(FEE_IMPACT_LIMIT - count + 1);
    count += rows.length;
    if (count > FEE_IMPACT_LIMIT) throw new Error(TOO_LARGE);
    pagos.push(...rows);
  }
  return { partidas, transactions, movements, pagos };
}

export function feeImpactScope(project: Doc<"desarrollos">, proposed: Doc<"desarrollos">, records: FeeImpactRecords) {
  const sorted = <T extends { _id: string }>(rows: T[]) => [...rows].sort((a, b) => a._id.localeCompare(b._id));
  // Exact canonical scope, rather than a collision-prone checksum. Only financial
  // inputs are sent back; bank details and document attachments are excluded.
  const scope = JSON.stringify({
    version: 1,
    project: [project._id, project.organization_id, project.moneda_principal, project.honorarios_monto, feeConfig(project)],
    proposal: feeConfig(proposed),
    rates: [17, 18.5],
    partidas: sorted(records.partidas).map(p => [p._id, p.proyecto, p.nivel, p.nombre, p.partida_nombre, p.familia, p.sub_partida, p.pagado, p.presupuesto_original, p.presupuesto_aprobado]),
    transactions: sorted(records.transactions).map(t => [t._id, t.monto_total, t.fecha, t.status, t.moneda, t.tipo_cambio]),
    pagos: sorted(records.pagos).map(p => [p._id, p.transaccion_id, p.partida_id, p.monto]),
    movements: sorted(records.movements).map(m => [m._id, m.organization_id, m.proyecto, m.tipo, m.categoria, m.descripcion, m.monto, m.fecha, m.moneda, m.tipo_cambio, m.status]),
  });
  if (new TextEncoder().encode(scope).byteLength > 512 * 1024) throw new Error(TOO_LARGE);
  return scope;
}

export function feeBudgetScenario(project: Doc<"desarrollos">, records: FeeImpactRecords, recalculate: boolean) {
  const honorarios = getHonorariosBreakdown({ proyectoId: project._id, modo: project.honorarios_modo,
    porcentaje: project.honorarios_porcentaje, excludedPartidas: project.excluded_partidas_honorarios,
    transactions: records.transactions, pagos: records.pagos, partidas: records.partidas });
  const indirectos = calculateBudgetIndirectos(project, records.partidas, records.transactions, records.pagos);
  const honorariosMonto = recalculate ? honorarios.amount : project.honorarios_monto;
  return {
    ...calculatePresupuestoMetrics(records.partidas, honorariosMonto, indirectos),
    honorarios: honorariosMonto ?? 0,
    honorariosBase: honorarios.base,
    honorariosExcluidos: honorarios.excludedAmount,
    honorariosSegunReglas: honorarios.amount,
    indirectosBase: indirectos.baseElegible,
    indirectos: indirectos.automaticos,
    manualesSustituidos: indirectos.manualesSustituidos,
  };
}
