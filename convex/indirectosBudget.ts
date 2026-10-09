import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { calculateIndirectosFromRecords } from "./indirectosRules";

// Budget amounts use the project's display currency; P&L converts to MXN.
export async function getBudgetIndirectos(ctx: Pick<QueryCtx, "db">, project: Doc<"desarrollos"> | null) {
  if (!project || project.indirectos_porcentaje === undefined) {
    return { automaticos: 0, manualesSustituidos: 0, sustituidosPorPartida: {} as Record<string, number> };
  }
  const [partidas, transactions] = await Promise.all([
    ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).collect(),
    ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", project._id)).collect(),
  ]);
  const pagos = (await Promise.all(transactions.map(t => ctx.db.query("pagos")
    .withIndex("by_transaccion", q => q.eq("transaccion_id", t._id)).collect()))).flat();
  return calculateBudgetIndirectos(project, partidas, transactions, pagos);
}

export function calculateBudgetIndirectos(
  project: Doc<"desarrollos"> | null,
  partidas: Doc<"partidas">[],
  transactions: Doc<"transacciones">[],
  pagos: Doc<"pagos">[],
) {
  const rates: Record<string, number> = { MXN: 1, USD: 17, EUR: 18.5 };
  const targetRate = rates[project?.moneda_principal || "MXN"] || 1;
  return calculateIndirectosFromRecords({
    config: project || {}, partidas, transactions, pagos,
    excludedPartidas: project?.excluded_partidas_honorarios,
    convert: (amount, transaction) => {
      const currency = (transaction.moneda || "MXN").toUpperCase();
      if (currency === (project?.moneda_principal || "MXN")) return amount;
      const rate = Number(String(transaction.tipo_cambio || "").replace(",", "."));
      return amount * (currency === "MXN" ? 1 : (rate > 0 && Number.isFinite(rate) ? rate : rates[currency] || 1)) / targetRate;
    },
  });
}
