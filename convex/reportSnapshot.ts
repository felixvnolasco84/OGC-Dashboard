/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ReportDataQualityIssue,
  ReportSnapshotV1,
  ReportTimelinePoint,
  ReportVisibilityProfile,
} from "./reportTypes";
import {
  calculateEarnedValue,
  calculateApprovedCommitments,
  compareIsoDates,
  excelSerialToIsoDate,
  isDateInRange,
  parseProjectDate,
  sanitizeReportText,
} from "./reportingUtils";

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percent = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

function plannedProgress(startValue: unknown, endValue: unknown, asOf: string) {
  const start = parseProjectDate(startValue);
  const end = parseProjectDate(endValue);
  if (!start || !end || end < start) return null;
  if (asOf < start) return 0;
  if (asOf >= end) return 100;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  return ((asOfMs - startMs) / Math.max(86_400_000, endMs - startMs)) * 100;
}

function metricIssue(
  code: string,
  count: number,
  message: string,
): ReportDataQualityIssue | null {
  return count > 0 ? { code, count, message, severity: "warning" } : null;
}

function buildTimeline(
  transactions: any[],
  projections: any[],
  weeklyProgress: any[],
  periodEnd: string,
): ReportTimelinePoint[] {
  const paidByDate = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.status !== "Pagado") continue;
    const date = parseProjectDate(transaction.fecha);
    if (!date || date > periodEnd) continue;
    paidByDate.set(date, (paidByDate.get(date) || 0) + numberValue(transaction.monto_total));
  }

  const latestUpload = projections.reduce(
    (latest, row) => row.uploaded_at > latest ? row.uploaded_at : latest,
    0,
  );
  const selectedProjection = projections.filter(
    (row) => !latestUpload || row.uploaded_at === latestUpload,
  );
  const projectedByDate = new Map<string, number>();
  for (const row of selectedProjection) {
    const date = excelSerialToIsoDate(row.week_date) || parseProjectDate(row.week_date_formatted);
    if (!date || date > periodEnd) continue;
    projectedByDate.set(date, (projectedByDate.get(date) || 0) + numberValue(row.weekly_total));
  }

  const physicalByDate = new Map<string, number>();
  for (const row of weeklyProgress) {
    const date = excelSerialToIsoDate(row.week_date) || parseProjectDate(row.week_date_formatted);
    if (date && date <= periodEnd) {
      physicalByDate.set(date, Math.min(100, Math.max(0, numberValue(row.avance_real))));
    }
  }

  const dates = [...new Set([
    ...paidByDate.keys(),
    ...projectedByDate.keys(),
    ...physicalByDate.keys(),
  ])].sort(compareIsoDates);
  let actual = 0;
  let projected = 0;
  let physical: number | null = null;

  const points = dates.map((date) => {
    actual += paidByDate.get(date) || 0;
    projected += projectedByDate.get(date) || 0;
    if (physicalByDate.has(date)) physical = physicalByDate.get(date) || 0;
    return {
      date,
      actual_cumulative: actual,
      projected_cumulative: selectedProjection.length ? projected : null,
      physical_progress: physical,
      planned_progress: null,
    };
  });
  if (points.length <= 260) return points;
  const stride = Math.ceil(points.length / 259);
  const sampled = points.filter((_, index) => index % stride === 0);
  const lastPoint = points[points.length - 1];
  if (sampled[sampled.length - 1]?.date !== lastPoint.date) sampled.push(lastPoint);
  return sampled;
}

function applyVisibilityProfile(
  snapshot: ReportSnapshotV1,
  profile: ReportVisibilityProfile,
): ReportSnapshotV1 {
  const result = structuredClone(snapshot);
  result.visibility_profile = profile;

  if (profile === "viewer") {
    result.requisitions = {
      total: 0,
      pending_review: 0,
      pending_payment: 0,
      pending_delivery: 0,
      overdue_deliveries: 0,
      approved_commitments: 0,
    };
    result.financial.approved_commitments = 0;
    result.financial.pending_payments = 0;
  }

  if (profile === "finance") {
    result.financial.original_budget = 0;
    result.financial.approved_budget = 0;
    result.financial.balance = 0;
    result.financial.exercised_percent = 0;
    result.earned_value = {
      physical_progress_percent: 0,
      planned_progress_percent: 0,
      pv: 0,
      ev: 0,
      ac: 0,
      cpi: null,
      spi: null,
      eac: null,
      etc: null,
      variance_at_completion: null,
    };
    result.variances = [];
    result.concentration = { top_five_spend: 0, top_five_share_percent: 0 };
    result.program = {
      scheduled_activities: 0,
      delayed_activities: 0,
      physical_progress_percent: 0,
      planned_progress_percent: 0,
    };
    result.logbook = {
      entries_in_period: 0,
      incidents_in_period: 0,
      incident_summaries: [],
    };
  }

  if (profile === "contractor") {
    result.financial = {
      original_budget: 0,
      approved_budget: 0,
      accumulated_cost: 0,
      period_cost: 0,
      balance: 0,
      exercised_percent: 0,
      accumulated_income: 0,
      period_income: 0,
      period_net_cashflow: 0,
      pending_payments: 0,
      approved_commitments: 0,
    };
    result.earned_value = {
      physical_progress_percent: result.program.physical_progress_percent,
      planned_progress_percent: result.program.planned_progress_percent,
      pv: 0,
      ev: 0,
      ac: 0,
      cpi: null,
      spi: null,
      eac: null,
      etc: null,
      variance_at_completion: null,
    };
    result.projection = {
      projected_to_date: null,
      actual_vs_projection: null,
      actual_vs_projection_percent: null,
      timeline: [],
    };
    result.variances = [];
    result.concentration = { top_five_spend: 0, top_five_share_percent: 0 };
    result.requisitions.approved_commitments = 0;
  }

  return result;
}

export async function buildReportSnapshot(
  ctx: { db: any },
  args: {
    proyecto: string;
    periodStart: string;
    periodEnd: string;
    periodKey: string;
    profile: ReportVisibilityProfile;
  },
): Promise<ReportSnapshotV1> {
  const [project, partidas, metrics, transactions, incomes, requisitions, schedules, details, projections, weeklyProgress, logs] =
    await Promise.all([
      ctx.db.get(args.proyecto),
      ctx.db.query("partidas").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).first(),
      ctx.db.query("transacciones").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("ingresos").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("requisiciones").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("programa_obra").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("weekly_projected_totals").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("weekly_avance_real").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
      ctx.db.query("bitacora").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
    ]);

  if (!project) throw new Error("Project not found");

  const requisitionItems = (
    await Promise.all(
      requisitions.map((requisition: any) =>
        ctx.db.query("requisicion_items")
          .withIndex("by_requisicion", (q: any) => q.eq("requisicion_id", requisition._id))
          .collect(),
      ),
    )
  ).flat();

  const levelOne = partidas.filter((partida: any) => partida.nivel === 1);
  const originalBudget = metrics
    ? numberValue(metrics.presupuesto_original)
    : levelOne.reduce((sum: number, row: any) => sum + numberValue(row.presupuesto_original), 0);
  const approvedBudget = metrics
    ? numberValue(metrics.presupuesto_aprobado)
    : levelOne.reduce((sum: number, row: any) => sum + numberValue(row.presupuesto_aprobado), 0);
  const accumulatedCost = metrics
    ? numberValue(metrics.gasto_total)
    : levelOne.reduce((sum: number, row: any) => sum + numberValue(row.pagado), 0);

  const paidTransactions = transactions.filter((transaction: any) => transaction.status === "Pagado");
  const periodCost = paidTransactions.reduce((sum: number, transaction: any) => {
    const date = parseProjectDate(transaction.fecha);
    return sum + (isDateInRange(date, args.periodStart, args.periodEnd)
      ? numberValue(transaction.monto_total)
      : 0);
  }, 0);
  const pendingPayments = transactions.reduce(
    (sum: number, transaction: any) =>
      sum + (transaction.status !== "Pagado" && transaction.status !== "Cancelado"
        ? numberValue(transaction.monto_total)
        : 0),
    0,
  );
  const accumulatedIncome = incomes.reduce(
    (sum: number, income: any) => sum + numberValue(income.monto),
    0,
  );
  const periodIncome = incomes.reduce((sum: number, income: any) => {
    const date = parseProjectDate(income.fecha);
    return sum + (isDateInRange(date, args.periodStart, args.periodEnd)
      ? numberValue(income.monto)
      : 0);
  }, 0);

  const approvedCommitments = calculateApprovedCommitments(
    requisitions.map((row: any) => ({
      id: String(row._id),
      status: row.status,
      reviewStatus: row.status_revision,
    })),
    requisitionItems.map((item: any) => ({
      requisitionId: String(item.requisicion_id),
      amount: item.monto,
      reviewStatus: item.status_revision,
    })),
  );

  const scheduleRows = details.length ? details : schedules;
  let weightTotal = 0;
  let physicalWeighted = 0;
  let plannedWeighted = 0;
  let delayedActivities = 0;
  let invalidScheduleDates = 0;
  for (const row of scheduleRows) {
    const start = parseProjectDate(row.fecha_inicio);
    const end = parseProjectDate(row.fecha_fin);
    if ((row.fecha_inicio && !start) || (row.fecha_fin && !end) || (start && end && end < start)) {
      invalidScheduleDates += 1;
    }
    const weight = Math.max(0, numberValue(row.peso));
    const actual = Math.min(100, Math.max(0, numberValue(row.avance_porcentaje)));
    const planned = plannedProgress(row.fecha_inicio, row.fecha_fin, args.periodEnd);
    weightTotal += weight;
    physicalWeighted += weight * actual;
    plannedWeighted += weight * (planned || 0);
    if (end && end < args.periodEnd && actual < 100) delayedActivities += 1;
  }
  const physicalProgressPercent = weightTotal > 0 ? physicalWeighted / weightTotal : 0;
  const plannedProgressPercent = weightTotal > 0 ? plannedWeighted / weightTotal : 0;
  const earnedValue = calculateEarnedValue({
    approvedBudget,
    actualCost: accumulatedCost,
    physicalProgressPercent,
    plannedProgressPercent,
  });

  const timeline = buildTimeline(transactions, projections, weeklyProgress, args.periodEnd);
  const lastTimeline = timeline.at(-1);
  const projectedToDate = lastTimeline?.projected_cumulative ?? null;
  const actualVsProjection = projectedToDate === null
    ? null
    : accumulatedCost - projectedToDate;

  const variances = levelOne
    .map((row: any) => ({
      name: sanitizeReportText(row.nombre, 80) || "Partida",
      approved_budget: numberValue(row.presupuesto_aprobado),
      actual_cost: numberValue(row.pagado),
      variance: numberValue(row.presupuesto_aprobado) - numberValue(row.pagado),
      exercised_percent: percent(numberValue(row.pagado), numberValue(row.presupuesto_aprobado)),
    }))
    .sort(
      (a: { variance: number }, b: { variance: number }) =>
        Math.abs(b.variance) - Math.abs(a.variance),
    )
    .slice(0, 12);
  const topSpend = [...levelOne]
    .sort((a: any, b: any) => numberValue(b.pagado) - numberValue(a.pagado))
    .slice(0, 5)
    .reduce((sum: number, row: any) => sum + numberValue(row.pagado), 0);

  const reportAsOf = args.periodEnd;
  const pendingReview = requisitions.filter((row: any) =>
    !row.status_revision || row.status_revision.includes("Pendiente")).length;
  const pendingPayment = requisitions.filter((row: any) =>
    row.status !== "Pagado" && row.status !== "Cancelado").length;
  const pendingDelivery = requisitions.filter((row: any) =>
    row.status_entrega !== "Completo" && row.status !== "Cancelado").length;
  const overdueDeliveries = requisitions.filter((row: any) => {
    const delivery = parseProjectDate(row.fecha_entrega);
    return delivery && delivery < reportAsOf &&
      row.status_entrega !== "Completo" &&
      row.status !== "Cancelado";
  }).length;

  const periodLogs = logs.filter((row: any) =>
    isDateInRange(parseProjectDate(row.fecha), args.periodStart, args.periodEnd));
  const incidentLogs = periodLogs.filter((row: any) => {
    const status = String(row.status || "").toLocaleLowerCase("es-MX");
    return Boolean(row.comentarios) || status.includes("retras") || status.includes("proble");
  });

  const invalidTransactionDates = transactions.filter(
    (row: any) => row.fecha && !parseProjectDate(row.fecha),
  ).length;
  const invalidIncomeDates = incomes.filter(
    (row: any) => row.fecha && !parseProjectDate(row.fecha),
  ).length;
  const invalidLogDates = logs.filter(
    (row: any) => row.fecha && !parseProjectDate(row.fecha),
  ).length;
  const missingBudgets = levelOne.filter(
    (row: any) => numberValue(row.presupuesto_aprobado) <= 0,
  ).length;
  const currencies = new Set([
    ...transactions.map((row: any) => row.moneda).filter(Boolean),
    ...incomes.map((row: any) => row.moneda).filter(Boolean),
  ]);
  const qualityIssues = [
    metricIssue(
      "invalid_dates",
      invalidTransactionDates + invalidIncomeDates + invalidLogDates + invalidScheduleDates,
      "Hay registros con fechas inválidas o rangos invertidos.",
    ),
    metricIssue(
      "incomplete_weights",
      scheduleRows.length > 0 && Math.abs(weightTotal - 100) > 0.5 ? 1 : 0,
      `La ponderación del programa suma ${weightTotal.toFixed(2)}%, no 100%.`,
    ),
    metricIssue(
      "missing_budgets",
      missingBudgets,
      "Hay partidas principales sin presupuesto aprobado.",
    ),
    metricIssue(
      "mixed_currencies",
      currencies.size > 1 ? currencies.size : 0,
      "Se detectaron múltiples monedas; no se aplicó conversión automática.",
    ),
    metricIssue(
      "missing_projection",
      projections.length ? 0 : 1,
      "No existe una proyección semanal cargada.",
    ),
  ].filter((issue): issue is ReportDataQualityIssue => Boolean(issue));

  const fullSnapshot: ReportSnapshotV1 = {
    version: "ReportSnapshotV1",
    generated_at: new Date().toISOString(),
    visibility_profile: "full",
    project: {
      id: String(project._id),
      name: sanitizeReportText(project.nombre, 120) || "Proyecto",
      currency: project.moneda_principal || "MXN",
    },
    period: {
      start: args.periodStart,
      end: args.periodEnd,
      key: args.periodKey,
    },
    financial: {
      original_budget: originalBudget,
      approved_budget: approvedBudget,
      accumulated_cost: accumulatedCost,
      period_cost: periodCost,
      balance: approvedBudget - accumulatedCost,
      exercised_percent: percent(accumulatedCost, approvedBudget),
      accumulated_income: accumulatedIncome,
      period_income: periodIncome,
      period_net_cashflow: periodIncome - periodCost,
      pending_payments: pendingPayments,
      approved_commitments: approvedCommitments,
    },
    earned_value: {
      physical_progress_percent: physicalProgressPercent,
      planned_progress_percent: plannedProgressPercent,
      pv: earnedValue.pv,
      ev: earnedValue.ev,
      ac: earnedValue.ac,
      cpi: earnedValue.cpi,
      spi: earnedValue.spi,
      eac: earnedValue.eac,
      etc: earnedValue.etc,
      variance_at_completion: earnedValue.varianceAtCompletion,
    },
    projection: {
      projected_to_date: projectedToDate,
      actual_vs_projection: actualVsProjection,
      actual_vs_projection_percent:
        projectedToDate && actualVsProjection !== null
          ? percent(actualVsProjection, projectedToDate)
          : null,
      timeline,
    },
    variances,
    concentration: {
      top_five_spend: topSpend,
      top_five_share_percent: percent(topSpend, accumulatedCost),
    },
    requisitions: {
      total: requisitions.length,
      pending_review: pendingReview,
      pending_payment: pendingPayment,
      pending_delivery: pendingDelivery,
      overdue_deliveries: overdueDeliveries,
      approved_commitments: approvedCommitments,
    },
    program: {
      scheduled_activities: scheduleRows.length,
      delayed_activities: delayedActivities,
      physical_progress_percent: physicalProgressPercent,
      planned_progress_percent: plannedProgressPercent,
    },
    logbook: {
      entries_in_period: periodLogs.length,
      incidents_in_period: incidentLogs.length,
      incident_summaries: incidentLogs
        .map((row: any) => sanitizeReportText(row.comentarios || row.avance_dia))
        .filter(Boolean)
        .slice(0, 8),
    },
    data_quality: {
      score: Math.max(0, 100 - qualityIssues.reduce((sum, issue) => sum + Math.min(25, issue.count * 5), 0)),
      issues: qualityIssues,
    },
    source_counts: {
      partidas: partidas.length,
      transactions: transactions.length,
      incomes: incomes.length,
      requisitions: requisitions.length,
      program_rows: scheduleRows.length,
      logbook_entries: logs.length,
      projection_rows: projections.length,
    },
    methodology: [
      "Los importes se calculan de forma determinista desde los registros del proyecto.",
      "PV y EV usan el presupuesto aprobado multiplicado por el avance planeado y físico.",
      "CPI = EV / AC; SPI = EV / PV; EAC = presupuesto aprobado / CPI.",
      "La IA sólo explica métricas existentes y no recalcula cantidades.",
    ],
  };

  return applyVisibilityProfile(fullSnapshot, args.profile);
}

export function reportMetricCatalog(snapshot: ReportSnapshotV1) {
  return {
    "financial.approved_budget": snapshot.financial.approved_budget,
    "financial.accumulated_cost": snapshot.financial.accumulated_cost,
    "financial.period_cost": snapshot.financial.period_cost,
    "financial.balance": snapshot.financial.balance,
    "financial.exercised_percent": snapshot.financial.exercised_percent,
    "financial.period_net_cashflow": snapshot.financial.period_net_cashflow,
    "financial.pending_payments": snapshot.financial.pending_payments,
    "financial.approved_commitments": snapshot.financial.approved_commitments,
    "earned_value.cpi": snapshot.earned_value.cpi ?? "N/D",
    "earned_value.spi": snapshot.earned_value.spi ?? "N/D",
    "earned_value.eac": snapshot.earned_value.eac ?? "N/D",
    "earned_value.variance_at_completion":
      snapshot.earned_value.variance_at_completion ?? "N/D",
    "projection.actual_vs_projection":
      snapshot.projection.actual_vs_projection ?? "N/D",
    "projection.actual_vs_projection_percent":
      snapshot.projection.actual_vs_projection_percent ?? "N/D",
    "requisitions.pending_review": snapshot.requisitions.pending_review,
    "requisitions.pending_payment": snapshot.requisitions.pending_payment,
    "requisitions.overdue_deliveries": snapshot.requisitions.overdue_deliveries,
    "program.delayed_activities": snapshot.program.delayed_activities,
    "program.physical_progress_percent": snapshot.program.physical_progress_percent,
    "program.planned_progress_percent": snapshot.program.planned_progress_percent,
    "logbook.incidents_in_period": snapshot.logbook.incidents_in_period,
    "data_quality.score": snapshot.data_quality.score,
  } satisfies Record<string, number | string>;
}
