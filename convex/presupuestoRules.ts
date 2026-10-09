import { isHonorariosPartida } from "./honorariosRules";

type BudgetPartida = {
  nivel: number;
  nombre: string;
  presupuesto_original?: number;
  presupuesto_aprobado?: number;
  pagado?: number;
};

export function calculatePresupuestoMetrics(
  partidas: readonly BudgetPartida[],
  honorariosMonto?: number,
  indirectos?: { automaticos: number; manualesSustituidos: number },
) {
  const roots = partidas.filter((partida) => partida.nivel === 1);
  const presupuesto_original = roots.reduce((sum, partida) => sum + (partida.presupuesto_original || 0), 0);
  const presupuesto_aprobado = roots.reduce((sum, partida) => sum + (partida.presupuesto_aprobado || 0), 0);
  // Match the HONORARIOS amount displayed in the budget table. Its cached
  // `pagado` can be replaced by hierarchy rollups, so substitute, never add twice.
  const gasto_total = roots.reduce((sum, partida) =>
    sum + (honorariosMonto !== undefined && isHonorariosPartida(partida) ? 0 : (partida.pagado || 0)),
  0) + (honorariosMonto ?? 0) + (indirectos?.automaticos || 0) - (indirectos?.manualesSustituidos || 0);

  return {
    presupuesto_original,
    presupuesto_aprobado,
    gasto_total,
    por_gastar: presupuesto_aprobado - gasto_total,
  };
}
