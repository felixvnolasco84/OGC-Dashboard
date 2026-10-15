import { feeBudgetConvert, calculateBudgetIndirectos } from "./indirectosBudget";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { calculateHierarchyPaymentTotals } from "./paymentHierarchyRules";
import { calculateHonorariosFromRecords } from "./honorariosRules";
import { calculatePresupuestoMetrics } from "./presupuestoRules";
import { currentFeeConcepts, canonicalFeeConcepts } from "./feeConceptRules";

export async function repairProjectPaymentTotals(
  ctx: Pick<MutationCtx, "db">,
  projectId: Id<"desarrollos">,
  dryRun = false,
  records?: { project: Doc<"desarrollos">; partidas: Doc<"partidas">[]; transactions: Doc<"transacciones">[]; pagos: Doc<"pagos">[] },
) {
  const [project, partidas, transactions, existingMetrics] = await Promise.all([
    records ? records.project : ctx.db.get(projectId),
    records ? records.partidas : ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).collect(),
    records ? records.transactions : ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).collect(),
    ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).first(),
  ]);
  if (!project) throw new Error("Proyecto no encontrado");
  const pagos = records?.pagos ?? (await Promise.all(transactions.map(transaction =>
    ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", transaction._id)).collect()
  ))).flat();
  const paidTransactionIds = new Set(transactions.filter(t => t.status === "Pagado").map(t => t._id));
  const directPayments = new Map<string, number>();
  for (const pago of pagos) {
    if (!pago.partida_id || !paidTransactionIds.has(pago.transaccion_id)) continue;
    directPayments.set(String(pago.partida_id), (directPayments.get(String(pago.partida_id)) || 0) + pago.monto);
  }
  const effectiveProject = { ...project, fee_concepts: currentFeeConcepts(project.fee_concepts, partidas) };
  const honorariosMonto = calculateHonorariosFromRecords({
      feeConcepts: effectiveProject.fee_concepts, convert: feeBudgetConvert(project),
    proyectoId: String(projectId), modo: project.honorarios_modo,
    porcentaje: project.honorarios_porcentaje, excludedPartidas: project.excluded_partidas_honorarios,
    transactions, pagos, partidas,
  });
  const indirectos = calculateBudgetIndirectos(effectiveProject, partidas, transactions, pagos);
  const configuredHonorarios = effectiveProject.fee_concepts.find(c => c.concepto === "honorarios");
  const totals = feeHierarchyPaymentTotals(partidas, directPayments, honorariosMonto, indirectos, configuredHonorarios?.partida_id);
  const updatedPartidas = partidas.map(partida => {
    const pagado = totals.get(String(partida._id)) || 0;
    return { ...partida, pagado, por_gastar: partida.presupuesto_aprobado - pagado };
  });
  const changes = updatedPartidas.flatMap((partida, index) => {
    const before = partidas[index];
    if (Math.abs(partida.pagado - before.pagado) < 0.001 && before.por_gastar !== undefined && Math.abs(partida.por_gastar - before.por_gastar) < 0.001) return [];
    return [{ id: partida._id, nivel: partida.nivel, nombre: partida.nombre, familia: partida.familia,
      pagadoBefore: before.pagado, pagadoAfter: partida.pagado,
      porGastarBefore: before.por_gastar, porGastarAfter: partida.por_gastar }];
  });
  const metrics = calculatePresupuestoMetrics(updatedPartidas, honorariosMonto, indirectos);
  const obsoleteStartDates = (project.indirectos_fecha_inicio !== undefined ? 1 : 0) +
    (project.fee_concepts || []).filter(c => c.fecha_inicio !== undefined).length;
  if (!dryRun) {
    for (const change of changes) {
      await ctx.db.patch(change.id, { pagado: change.pagadoAfter, por_gastar: change.porGastarAfter });
    }
    const projectPatch: Partial<Doc<"desarrollos">> = {};
    if (project.honorarios_monto !== honorariosMonto) projectPatch.honorarios_monto = honorariosMonto;
    if (project.indirectos_fecha_inicio !== undefined) projectPatch.indirectos_fecha_inicio = undefined;
    if ((project.fee_concepts || []).some(c => c.fecha_inicio !== undefined) ||
        JSON.stringify(canonicalFeeConcepts(project.fee_concepts)) !== JSON.stringify(canonicalFeeConcepts(effectiveProject.fee_concepts))) {
      projectPatch.fee_concepts = effectiveProject.fee_concepts;
    }
    if (Object.keys(projectPatch).length) await ctx.db.patch(projectId, projectPatch);
    if (existingMetrics) await ctx.db.patch(existingMetrics._id, metrics);
    else await ctx.db.insert("meticas_presupuesto", { proyecto: projectId, ...metrics });
  }
  return { projectId, nombre: project.nombre, dryRun, partidasUpdated: changes.length, changes, obsoleteStartDates,
    honorariosBefore: project.honorarios_monto ?? 0, honorariosAfter: honorariosMonto,
    metricsBefore: existingMetrics, metricsAfter: metrics };
}

export function feeHierarchyPaymentTotals(
  partidas: Parameters<typeof calculateHierarchyPaymentTotals>[0], directPayments: ReadonlyMap<string, number>, honorariosMonto: number | undefined,
  indirectos: { sustituidosPorPartida: Record<string, number>; automaticosPorPartida: Record<string, number>; concepts: readonly { concepto: string; partida_id: string; monto: number }[] },
  honorariosPartidaId?: string,
) {
  const direct = new Map(directPayments);
  const sources = partidas.filter(p => indirectos.concepts.some(c => c.partida_id === p._id));
  for (const [id, amount] of Object.entries(indirectos.sustituidosPorPartida)) {
    const row = partidas.find(p => p._id === id);
    if (row && sources.some(source => row._id === source._id || row.partida_nombre === source.nombre)) direct.set(id, (direct.get(id) || 0) - amount);
  }
  for (const [id, amount] of Object.entries(indirectos.automaticosPorPartida)) direct.set(id, (direct.get(id) || 0) + amount);
  const totals = calculateHierarchyPaymentTotals(partidas, direct, honorariosPartidaId ? undefined : honorariosMonto);
  if (honorariosPartidaId) {
    // The configured honorarios total is distributed to descendants and
    // appears only once in the root.
    totals.set(honorariosPartidaId, honorariosMonto || 0);
  }
  return totals;
}

// Internal maintenance rebuilds derived totals and current automatic rates;
// budget sources, transactions, payment records and selected concepts remain.
export const repairProject = internalMutation({
  args: { projectId: v.id("desarrollos"), dryRun: v.boolean() },
  handler: (ctx, args) => repairProjectPaymentTotals(ctx, args.projectId, args.dryRun),
});
