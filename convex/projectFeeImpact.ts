import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getHonorariosBreakdown, getHonorariosModo, isHonorariosPartida } from "./honorariosRules";
import { validateIndirectosPercentage } from "./indirectosRules";
import { calculateBudgetIndirectos, feeBudgetConvert } from "./indirectosBudget";
import { deriveFeeConcepts, canonicalFeeConcepts, FEE_CONCEPT_CALCULATION_VERSION, type FeeConceptInput } from "./feeConceptRules";
import { feeConceptInputValidator } from "./feeConceptValidators";
import { calculatePresupuestoMetrics } from "./presupuestoRules";
import { repairProjectPaymentTotals } from "./budgetMaintenance";

export const feeConfigValidators = {
  honorarios_porcentaje: v.optional(v.number()),
  honorarios_modo: v.optional(v.union(v.literal("automatico"), v.literal("transacciones"))),
  indirectos_porcentaje: v.optional(v.number()),
  excluded_partidas_honorarios: v.optional(v.array(v.id("partidas"))),
  fee_concepts: v.optional(v.array(feeConceptInputValidator)),
};
export type FeeProposal = Pick<Doc<"desarrollos">, "honorarios_porcentaje" | "honorarios_modo" | "indirectos_porcentaje" | "excluded_partidas_honorarios"> & { fee_concepts?: FeeConceptInput[] };
export type FeeImpactRecords = {
  partidas: Doc<"partidas">[];
  transactions: Doc<"transacciones">[];
  pagos: Doc<"pagos">[];
  movements: Doc<"ogc_movimientos">[];
};

// Saving reuses this snapshot instead of loading it again through triggers.
// Leave room below Convex's document, byte and index-range transaction limits.
export const FEE_IMPACT_LIMIT = 8000;
export const FEE_IMPACT_TRANSACTION_LIMIT = 3500;
const TOO_LARGE = "El proyecto supera el límite de revisión completa (8,000 registros, 3,500 transacciones u 8 MiB). No se guardaron cambios financieros; solicita una revisión de capacidad.";

export function proposedFeeProject(project: Doc<"desarrollos">, proposal: FeeProposal, records?: FeeImpactRecords) {
  validateIndirectosPercentage(proposal.indirectos_porcentaje);
  if (proposal.excluded_partidas_honorarios?.some(id => !records?.partidas.some(p => p._id === id && p.proyecto === project._id && p.nivel === 1))) {
    throw new Error("Las exclusiones deben ser partidas de nivel 1 del mismo proyecto.");
  }
  if (proposal.honorarios_porcentaje !== undefined &&
      (!Number.isFinite(proposal.honorarios_porcentaje) || proposal.honorarios_porcentaje < 0 || proposal.honorarios_porcentaje > 100)) {
    throw new Error("El porcentaje de honorarios debe estar entre 0 y 100.");
  }
  return {
    ...project,
    ...Object.fromEntries(Object.entries(proposal).filter(([, value]) => value !== undefined)),
    ...(proposal.fee_concepts !== undefined ? { fee_concepts: deriveFeeConcepts(proposal.fee_concepts, records?.partidas || [], project._id) } : {}),
  } as Doc<"desarrollos">;
}

export function feeConfig(project: Doc<"desarrollos">) {
  return {
    honorarios_porcentaje: project.honorarios_porcentaje ?? null,
    honorarios_modo: getHonorariosModo(project.honorarios_modo),
    indirectos_porcentaje: project.indirectos_porcentaje ?? null,
    excluded_partidas_honorarios: project.excluded_partidas_honorarios || [],
    fee_concepts: canonicalFeeConcepts(project.fee_concepts),
  };
}

export function feeConfigChanged(before: Doc<"desarrollos">, after: Doc<"desarrollos">) {
  return JSON.stringify(feeConfig(before)) !== JSON.stringify(feeConfig(after));
}

export async function loadFeeImpactRecords(ctx: Pick<QueryCtx, "db">, project: Doc<"desarrollos">): Promise<FeeImpactRecords> {
  const partidas = await ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(FEE_IMPACT_LIMIT + 1);
  let count = partidas.length;
  if (count > FEE_IMPACT_LIMIT) throw new Error(TOO_LARGE);
  const transactions = await ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", project._id))
    .take(Math.min(FEE_IMPACT_TRANSACTION_LIMIT, FEE_IMPACT_LIMIT - count) + 1);
  count += transactions.length;
  if (count > FEE_IMPACT_LIMIT || transactions.length > FEE_IMPACT_TRANSACTION_LIMIT) throw new Error(TOO_LARGE);
  const movements = await ctx.db.query("ogc_movimientos").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).take(FEE_IMPACT_LIMIT - count + 1);
  count += movements.length;
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
  const records = { partidas, transactions, movements, pagos };
  if (new TextEncoder().encode(JSON.stringify(records)).byteLength > 8 * 1024 * 1024) throw new Error(TOO_LARGE);
  return records;
}

export async function feeImpactScope(project: Doc<"desarrollos">, proposed: Doc<"desarrollos">, records: FeeImpactRecords) {
  const sorted = <T extends { _id: string }>(rows: T[]) => [...rows].sort((a, b) => a._id.localeCompare(b._id));
  // Hash every canonical financial input. The fixed-size token keeps large
  // projects reviewable without returning their records to the client.
  const scope = JSON.stringify({
    version: FEE_CONCEPT_CALCULATION_VERSION,
    project: [project._id, project.organization_id, project.moneda_principal, project.honorarios_monto, feeConfig(project)],
    proposal: feeConfig(proposed),
    rates: [17, 18.5],
    partidas: sorted(records.partidas).map(p => [p._id, p.proyecto, p.nivel, p.nombre, p.partida_nombre, p.familia, p.sub_partida, p.pagado, p.presupuesto_original, p.presupuesto_aprobado]),
    transactions: sorted(records.transactions).map(t => [t._id, t.monto_total, t.fecha, t.status, t.moneda, t.tipo_cambio]),
    pagos: sorted(records.pagos).map(p => [p._id, p.transaccion_id, p.partida_id, p.monto]),
    movements: sorted(records.movements).map(m => [m._id, m.organization_id, m.proyecto, m.tipo, m.categoria, m.descripcion, m.monto, m.fecha, m.moneda, m.tipo_cambio, m.status]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

// Called with the raw mutation database after revalidating the reviewed snapshot.
// Rebuild all derived values once, atomically, without per-row trigger rereads.
export async function persistFeeProjectTotals(ctx: MutationCtx, previous: Doc<"desarrollos">, project: Doc<"desarrollos">, records: FeeImpactRecords) {
  if (previous.fee_concepts?.length || project.fee_concepts?.length) {
    await repairProjectPaymentTotals(ctx, project._id, false, { project, ...records });
    return;
  }
  const totals = feeBudgetScenario(project, records, true);
  await ctx.db.patch(project._id, { honorarios_monto: totals.honorarios });
  const source = records.partidas.find(p => p.nivel === 1 && isHonorariosPartida(p));
  if (source) await ctx.db.patch(source._id, { pagado: totals.honorarios, por_gastar: source.presupuesto_aprobado - totals.honorarios });
  const metrics = { presupuesto_original: totals.presupuesto_original, presupuesto_aprobado: totals.presupuesto_aprobado,
    gasto_total: totals.gasto_total, por_gastar: totals.por_gastar };
  const existing = await ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).first();
  if (existing) await ctx.db.patch(existing._id, metrics);
  else await ctx.db.insert("meticas_presupuesto", { proyecto: project._id, ...metrics });
}

export function feeBudgetScenario(project: Doc<"desarrollos">, records: FeeImpactRecords, recalculate: boolean) {
  const honorarios = getHonorariosBreakdown({ proyectoId: project._id, modo: project.honorarios_modo,
    porcentaje: project.honorarios_porcentaje, excludedPartidas: project.excluded_partidas_honorarios,
    feeConcepts: project.fee_concepts, convert: feeBudgetConvert(project),
    transactions: records.transactions, pagos: records.pagos, partidas: records.partidas });
  const indirectos = calculateBudgetIndirectos(project, records.partidas, records.transactions, records.pagos, false);
  const honorariosMonto = recalculate || project.fee_concepts?.length ? honorarios.amount : project.honorarios_monto;
  return {
    ...calculatePresupuestoMetrics(records.partidas, honorariosMonto, indirectos),
    honorarios: honorariosMonto ?? 0,
    honorariosBase: honorarios.base,
    honorariosExcluidos: honorarios.excludedAmount,
    honorariosSegunReglas: honorarios.amount,
    indirectosBase: indirectos.baseElegible,
    indirectos: indirectos.automaticos,
    manualesSustituidos: indirectos.manualesSustituidos,
    concepts: indirectos.concepts,
  };
}
