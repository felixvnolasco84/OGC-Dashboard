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

const normalizeLabel = (value: unknown) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es-MX")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const isLaborLabel = (value: unknown) => {
  const normalized = normalizeLabel(value);
  return ["mano de obra", "albanil", "carpinter", "fierrer", "ayudante", "cuadrilla"]
    .some((token) => normalized.includes(token));
};

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

function addScheduleExtension(
  endValue: unknown,
  amountValue: unknown,
  unitValue: unknown,
) {
  const end = parseProjectDate(endValue);
  const amount = Math.max(0, Math.floor(numberValue(amountValue)));
  if (!end || amount <= 0) return null;
  const date = new Date(`${end}T00:00:00Z`);
  const unit = String(unitValue || "dias").toLocaleLowerCase("es-MX");
  if (unit === "semanas") date.setUTCDate(date.getUTCDate() + amount * 7);
  else if (unit === "meses") date.setUTCMonth(date.getUTCMonth() + amount);
  else date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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
    result.logbook.sections = [];
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
      activities: [],
    };
    result.logbook = {
      entries_in_period: 0,
      incidents_in_period: 0,
      incident_summaries: [],
      sections: [],
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
    if (result.workforce) {
      result.workforce.labor_cost_total = 0;
      result.workforce.labor_cost_timeline = [];
    }
  }

  return result;
}

export async function buildReportSnapshot(
  ctx: { db: any; storage?: { getUrl: (storageId: string) => Promise<string | null> } },
  args: {
    proyecto: string;
    periodStart: string;
    periodEnd: string;
    periodKey: string;
    profile: ReportVisibilityProfile;
  },
): Promise<ReportSnapshotV1> {
  const [project, partidas, metrics, transactions, incomes, requisitions, schedules, details, projections, weeklyProgress, logs, documents] =
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
      ctx.db.query("documentos").withIndex("by_proyecto", (q: any) => q.eq("proyecto", args.proyecto)).collect(),
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

  const paymentItems = (
    await Promise.all(
      transactions.map((transaction: any) =>
        ctx.db.query("pagos")
          .withIndex("by_transaccion", (q: any) => q.eq("transaccion_id", transaction._id))
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

  const partidaById = new Map<string, any>(partidas.map((row: any) => [String(row._id), row]));
  const scheduleById = new Map<string, any>(schedules.map((row: any) => [String(row._id), row]));
  const detailsBySchedule = new Map<string, any[]>();
  for (const detail of details) {
    const key = String(detail.programa_obra_id);
    const values = detailsBySchedule.get(key) || [];
    values.push(detail);
    detailsBySchedule.set(key, values);
  }

  const programProgressByPartida = new Map<string, number>();
  const parentActivities = schedules.map((schedule: any) => {
    const children = detailsBySchedule.get(String(schedule._id)) || [];
    const progressRows = children.filter((row: any) => Number.isFinite(row.avance_porcentaje));
    const childWeight = progressRows.reduce((sum: number, row: any) => sum + Math.max(0, numberValue(row.peso)), 0);
    const actual = progressRows.length
      ? childWeight > 0
        ? progressRows.reduce((sum: number, row: any) =>
          sum + Math.min(100, Math.max(0, numberValue(row.avance_porcentaje))) * Math.max(0, numberValue(row.peso)), 0) / childWeight
        : progressRows.reduce((sum: number, row: any) => sum + Math.min(100, Math.max(0, numberValue(row.avance_porcentaje))), 0) / progressRows.length
      : 0;
    const partida = partidaById.get(String(schedule.partida_id));
    const name = sanitizeReportText(partida?.nombre || "Partida", 90) || "Partida";
    programProgressByPartida.set(normalizeLabel(name), actual);
    const end = parseProjectDate(schedule.fecha_fin);
    const milestones = [
      schedule.anticipo_fecha ? {
        type: "advance" as const,
        date: parseProjectDate(schedule.anticipo_fecha),
        percentage: Number.isFinite(schedule.anticipo_porcentaje) ? schedule.anticipo_porcentaje : null,
      } : null,
      schedule.suministro_fecha ? {
        type: "supply" as const,
        date: parseProjectDate(schedule.suministro_fecha),
        percentage: null,
      } : null,
      schedule.finiquito_fecha ? {
        type: "closeout" as const,
        date: parseProjectDate(schedule.finiquito_fecha),
        percentage: Number.isFinite(schedule.finiquito_porcentaje) ? schedule.finiquito_porcentaje : null,
      } : null,
    ].filter((milestone): milestone is NonNullable<typeof milestone> => Boolean(milestone?.date))
      .map((milestone) => ({ ...milestone, date: milestone.date as string }));
    return {
      id: String(schedule._id),
      name,
      group: name,
      level: 1,
      start: parseProjectDate(schedule.fecha_inicio),
      end,
      actual_progress_percent: actual,
      planned_progress_percent: plannedProgress(schedule.fecha_inicio, schedule.fecha_fin, args.periodEnd),
      financial_progress_percent: percent(numberValue(partida?.pagado), numberValue(partida?.presupuesto_aprobado)),
      delayed: Boolean(end && end < args.periodEnd && actual < 100),
      milestones,
      order: numberValue(schedule.orden),
    };
  });
  const detailActivities = details.map((detail: any) => {
    const parent = scheduleById.get(String(detail.programa_obra_id));
    const parentPartida = parent ? partidaById.get(String(parent.partida_id)) : null;
    const group = sanitizeReportText(detail.partida || parentPartida?.nombre || "Partida", 90) || "Partida";
    const name = sanitizeReportText(
      detail.nivel === 3 && detail.subpartida ? detail.subpartida : detail.familia,
      90,
    ) || group;
    const actual = Math.min(100, Math.max(0, numberValue(detail.avance_porcentaje)));
    const end = parseProjectDate(detail.fecha_fin);
    return {
      id: String(detail._id),
      name,
      group,
      level: numberValue(detail.nivel) || 2,
      start: parseProjectDate(detail.fecha_inicio),
      end,
      parent_start: parseProjectDate(parent?.fecha_inicio),
      parent_end: parseProjectDate(parent?.fecha_fin),
      extension_end: addScheduleExtension(
        detail.fecha_fin,
        detail.tiempo_extra_cantidad,
        detail.tiempo_extra_unidad,
      ),
      actual_progress_percent: actual,
      planned_progress_percent: plannedProgress(detail.fecha_inicio, detail.fecha_fin, args.periodEnd),
      delayed: Boolean(end && end < args.periodEnd && actual < 100),
      order: numberValue(detail.orden),
    };
  });
  const programActivities = [...parentActivities, ...detailActivities]
    .sort((a, b) => a.group.localeCompare(b.group, "es") || a.order - b.order || a.level - b.level)
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      group: activity.group,
      level: activity.level,
      start: activity.start,
      end: activity.end,
      parent_start: activity.parent_start,
      parent_end: activity.parent_end,
      extension_end: activity.extension_end,
      actual_progress_percent: activity.actual_progress_percent,
      planned_progress_percent: activity.planned_progress_percent,
      financial_progress_percent: activity.financial_progress_percent,
      delayed: activity.delayed,
      milestones: activity.milestones,
    }));

  const transactionById = new Map<string, any>(transactions.map((row: any) => [String(row._id), row]));
  const laborByDate = new Map<string, number>();
  for (const payment of paymentItems) {
    const transaction = transactionById.get(String(payment.transaccion_id));
    const partida = partidaById.get(String(payment.partida_id));
    if (!transaction || transaction.status !== "Pagado" || !partida) continue;
    if (![partida.nombre, partida.familia, partida.sub_partida, partida.partida_nombre].some(isLaborLabel)) continue;
    const date = parseProjectDate(transaction.fecha);
    if (!date || date > args.periodEnd) continue;
    laborByDate.set(date, (laborByDate.get(date) || 0) + numberValue(payment.monto));
  }
  let cumulativeLaborCost = 0;
  const laborCostTimeline = [...laborByDate.entries()]
    .sort(([left], [right]) => compareIsoDates(left, right))
    .map(([date, amount]) => {
      cumulativeLaborCost += amount;
      return { date, cumulative: cumulativeLaborCost };
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
      program_progress_percent: programProgressByPartida.get(normalizeLabel(row.nombre)) ?? null,
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

  const photosByLog = new Map<string, any[]>();
  for (const document of documents) {
    if (document.type !== "bitacora_foto" || !document.bitacora_id) continue;
    const key = String(document.bitacora_id);
    const values = photosByLog.get(key) || [];
    values.push(document);
    photosByLog.set(key, values);
  }
  const logsByCategory = new Map<string, any[]>();
  for (const log of periodLogs) {
    const category = sanitizeReportText(log.categoria || "Generales", 60) || "Generales";
    const values = logsByCategory.get(category) || [];
    values.push(log);
    logsByCategory.set(category, values);
  }
  const logbookSections = await Promise.all(
    [...logsByCategory.entries()].map(async ([title, categoryLogs]) => {
      const sortedLogs = [...categoryLogs].sort((left, right) =>
        compareIsoDates(parseProjectDate(left.fecha) || "", parseProjectDate(right.fecha) || ""));
      const dates = sortedLogs.map((row) => parseProjectDate(row.fecha)).filter(Boolean) as string[];
      const authors = [...new Set(sortedLogs
        .map((row) => sanitizeReportText(row.responsable, 60))
        .filter(Boolean))];
      const bullets = sortedLogs
        .flatMap((row) => String(row.avance_dia || "").split(/\r?\n|[•]+/))
        .map((item) => sanitizeReportText(item, 190))
        .filter(Boolean)
        .slice(0, 6);
      const incident = sortedLogs
        .map((row) => sanitizeReportText(row.comentarios, 220))
        .find(Boolean);
      const photoRecords = sortedLogs
        .flatMap((log) => (photosByLog.get(String(log._id)) || []).map((photo) => ({ log, photo })))
        .slice(0, 6);
      const photos = await Promise.all(photoRecords.map(async ({ log, photo }) => ({
        id: String(photo._id),
        url: photo.storage_id && ctx.storage
          ? await ctx.storage.getUrl(photo.storage_id)
          : null,
        caption: sanitizeReportText(photo.comment || photo.descripcion || "Evidencia fotográfica", 120),
        author: sanitizeReportText(log.responsable || "Equipo de obra", 60),
        date: parseProjectDate(log.fecha) || args.periodEnd,
      })));
      return {
        id: normalizeLabel(title).replace(/\s+/g, "-") || "general",
        title,
        author: authors.length > 1 ? "Equipo de obra" : authors[0] || "Equipo de obra",
        period_start: dates.at(0) || args.periodStart,
        period_end: dates.at(-1) || args.periodEnd,
        bullets,
        incident,
        photos,
      };
    }),
  );

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
    metricIssue(
      "missing_workforce",
      1,
      "El proyecto no cuenta todavía con captura estructurada de cuadrillas por oficio.",
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
      status: sanitizeReportText(project.status || "Obra activa", 40),
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
      activities: programActivities,
    },
    workforce: {
      total: null,
      roles: [
        { label: "Oficiales albañiles", count: null },
        { label: "Oficial carpintero", count: null },
        { label: "Oficial fierrero", count: null },
        { label: "Ayudantes", count: null },
      ],
      weekly: [],
      labor_cost_total: cumulativeLaborCost,
      labor_cost_timeline: laborCostTimeline,
      source: "not_available",
    },
    logbook: {
      entries_in_period: periodLogs.length,
      incidents_in_period: incidentLogs.length,
      incident_summaries: incidentLogs
        .map((row: any) => sanitizeReportText(row.comentarios || row.avance_dia))
        .filter(Boolean)
        .slice(0, 8),
      sections: logbookSections,
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
      labor_cost_rows: laborCostTimeline.length,
      logbook_photos: documents.filter((row: any) => row.type === "bitacora_foto").length,
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
