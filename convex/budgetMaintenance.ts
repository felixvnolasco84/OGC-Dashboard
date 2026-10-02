import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { calculateHierarchyPaymentTotals } from "./paymentHierarchyRules";
import { calculateHonorariosFromRecords } from "./honorariosRules";
import { calculatePresupuestoMetrics } from "./presupuestoRules";

export async function repairProjectPaymentTotals(
  ctx: MutationCtx,
  projectId: Id<"desarrollos">,
  dryRun = false,
) {
  const [project, partidas, transactions, existingMetrics] = await Promise.all([
    ctx.db.get(projectId),
    ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).collect(),
    ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).collect(),
    ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).first(),
  ]);
  if (!project) throw new Error("Proyecto no encontrado");
  const pagos = (await Promise.all(transactions.map(transaction =>
    ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", transaction._id)).collect()
  ))).flat();
  const paidTransactionIds = new Set(transactions.filter(t => t.status === "Pagado").map(t => t._id));
  const directPayments = new Map<string, number>();
  for (const pago of pagos) {
    if (!pago.partida_id || !paidTransactionIds.has(pago.transaccion_id)) continue;
    directPayments.set(String(pago.partida_id), (directPayments.get(String(pago.partida_id)) || 0) + pago.monto);
  }
  const honorariosMonto = calculateHonorariosFromRecords({
    proyectoId: String(projectId), modo: project.honorarios_modo,
    porcentaje: project.honorarios_porcentaje, excludedPartidas: project.excluded_partidas_honorarios,
    transactions, pagos, partidas,
  });
  const totals = calculateHierarchyPaymentTotals(partidas, directPayments, honorariosMonto);
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
  const metrics = calculatePresupuestoMetrics(updatedPartidas, honorariosMonto);
  if (!dryRun) {
    for (const change of changes) {
      await ctx.db.patch(change.id, { pagado: change.pagadoAfter, por_gastar: change.porGastarAfter });
    }
    if (project.honorarios_monto !== honorariosMonto) await ctx.db.patch(projectId, { honorarios_monto: honorariosMonto });
    if (existingMetrics) await ctx.db.patch(existingMetrics._id, metrics);
    else await ctx.db.insert("meticas_presupuesto", { proyecto: projectId, ...metrics });
  }
  return { projectId, nombre: project.nombre, dryRun, partidasUpdated: changes.length, changes,
    honorariosBefore: project.honorarios_monto ?? 0, honorariosAfter: honorariosMonto,
    metricsBefore: existingMetrics, metricsAfter: metrics };
}

// Internal maintenance: only derived totals change; budgets, transactions,
// payment concepts, percentages, exclusions and project settings are preserved.
export const repairProject = internalMutation({
  args: { projectId: v.id("desarrollos"), dryRun: v.boolean() },
  handler: (ctx, args) => repairProjectPaymentTotals(ctx, args.projectId, args.dryRun),
});
