type Budget = { presupuesto_original: number; presupuesto_aprobado: number; pagado: number };

export function budgetTotals(rows: readonly Budget[]) {
  const presupuesto_original = rows.reduce((sum, p) => sum + (p.presupuesto_original || 0), 0);
  const presupuesto_aprobado = rows.reduce((sum, p) => sum + (p.presupuesto_aprobado || 0), 0);
  const pagado = rows.reduce((sum, p) => sum + (p.pagado || 0), 0);
  return { presupuesto_original, presupuesto_aprobado, pagado, por_gastar: presupuesto_aprobado - pagado };
}

export function approvedBudgetPatch(presupuesto_aprobado: number, pagado: number) {
  return { presupuesto_aprobado, por_gastar: presupuesto_aprobado - (pagado || 0) };
}

// Parent payments already include direct payments. Never replace them with a sum of children.
export function budgetRollupPatch(parent: Budget, totals: ReturnType<typeof budgetTotals>) {
  return { ...totals, pagado: parent.pagado || 0, ...approvedBudgetPatch(totals.presupuesto_aprobado, parent.pagado) };
}
