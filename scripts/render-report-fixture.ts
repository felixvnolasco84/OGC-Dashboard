import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderReportPdf } from "../convex/reportPdf.ts";
import type {
  ReportInsights,
  ReportSection,
  ReportSnapshotV1,
} from "../convex/reportTypes.ts";

const REPORT_SECTIONS: ReportSection[] = [
  "executive",
  "financial",
  "earned_value",
  "cashflow",
  "variances",
  "requisitions",
  "program",
  "logbook",
  "data_quality",
];

const timeline = Array.from({ length: 32 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, 5 + index * 7));
  return {
    date: date.toISOString().slice(0, 10),
    actual_cumulative: index * 340_000 + Math.sin(index / 2) * 180_000,
    projected_cumulative: index * 315_000,
    physical_progress: Math.min(100, index * 2.7),
    planned_progress: Math.min(100, index * 3),
  };
});

const snapshot: ReportSnapshotV1 = {
  version: "ReportSnapshotV1",
  generated_at: new Date().toISOString(),
  visibility_profile: "full",
  project: {
    id: "fixture",
    name: "Residencial Álamo · Etapa construcción",
    currency: "MXN",
  },
  period: {
    start: "2026-01-01",
    end: "2026-07-29",
    key: "manual:fixture",
  },
  financial: {
    original_budget: 12_800_000,
    approved_budget: 13_250_000,
    accumulated_cost: 9_870_000,
    period_cost: 1_420_000,
    balance: 3_380_000,
    exercised_percent: 74.49,
    accumulated_income: 10_900_000,
    period_income: 1_100_000,
    period_net_cashflow: -320_000,
    pending_payments: 870_000,
    approved_commitments: 1_240_000,
  },
  earned_value: {
    physical_progress_percent: 66.4,
    planned_progress_percent: 72.8,
    pv: 9_646_000,
    ev: 8_798_000,
    ac: 9_870_000,
    cpi: 0.89,
    spi: 0.91,
    eac: 14_887_640,
    etc: 5_017_640,
    variance_at_completion: -1_637_640,
  },
  projection: {
    projected_to_date: 9_450_000,
    actual_vs_projection: 420_000,
    actual_vs_projection_percent: 4.44,
    timeline,
  },
  variances: Array.from({ length: 28 }, (_, index) => ({
    name: `Partida ${String(index + 1).padStart(2, "0")} · Instalación y suministro especial`,
    approved_budget: 850_000 - index * 12_000,
    actual_cost: 640_000 - index * 6_500,
    variance: 210_000 - index * 5_500,
    exercised_percent: 75 + index * 0.4,
  })),
  concentration: {
    top_five_spend: 5_200_000,
    top_five_share_percent: 52.68,
  },
  requisitions: {
    total: 47,
    pending_review: 6,
    pending_payment: 9,
    pending_delivery: 11,
    overdue_deliveries: 4,
    approved_commitments: 1_240_000,
  },
  program: {
    scheduled_activities: 86,
    delayed_activities: 12,
    physical_progress_percent: 66.4,
    planned_progress_percent: 72.8,
  },
  logbook: {
    entries_in_period: 41,
    incidents_in_period: 5,
    incident_summaries: [
      "Retraso en el suministro de tubería hidráulica para los niveles superiores.",
      "La lluvia impidió el colado programado; se reprogramó la cuadrilla.",
      "Se detectó interferencia entre instalaciones eléctricas y plafón.",
      "Se requiere liberar el frente norte antes de recibir acabados.",
      "La inspección de seguridad solicitó señalización adicional.",
    ],
  },
  data_quality: {
    score: 82,
    issues: [
      {
        code: "invalid_dates",
        severity: "warning",
        count: 2,
        message: "Hay registros con fechas inválidas o rangos invertidos.",
      },
      {
        code: "incomplete_weights",
        severity: "warning",
        count: 1,
        message: "La ponderación del programa suma 97.50%, no 100%.",
      },
      {
        code: "mixed_currencies",
        severity: "warning",
        count: 2,
        message: "Se detectaron múltiples monedas; no se aplicó conversión automática.",
      },
    ],
  },
  source_counts: {
    partidas: 240,
    transactions: 390,
    incomes: 22,
    requisitions: 47,
    program_rows: 86,
    logbook_entries: 41,
    projection_rows: 32,
  },
  methodology: [
    "Los importes se calculan de forma determinista desde los registros del proyecto.",
    "PV y EV usan el presupuesto aprobado multiplicado por el avance planeado y físico.",
    "CPI = EV / AC; SPI = EV / PV; EAC = presupuesto aprobado / CPI.",
    "La IA sólo explica métricas existentes y no recalcula cantidades.",
  ],
};

const insights: ReportInsights = {
  executive_summary:
    "El proyecto mantiene disponibilidad presupuestal, pero el CPI de 0.89 y el atraso físico frente al plan requieren priorizar rendimientos y actividades críticas. Las entregas vencidas elevan el riesgo operativo del siguiente periodo.",
  warning: "Fixture de revisión: los insights de IA no fueron solicitados.",
  insights: [
    {
      id: "rule-low-cpi",
      title: "Eficiencia de costo por debajo del umbral",
      severity: "high",
      category: "valor ganado",
      statement: "El valor producido es menor al costo incurrido.",
      evidence: [{ metric_key: "earned_value.cpi", observed_value: 0.89 }],
      confidence: 1,
      recommended_action: "Revisar rendimientos y precios unitarios de las partidas con mayor gasto.",
      source: "rule",
    },
    {
      id: "rule-overdue-deliveries",
      title: "Entregas vencidas",
      severity: "medium",
      category: "requisiciones",
      statement: "Cuatro requisiciones excedieron la fecha comprometida.",
      evidence: [{ metric_key: "requisitions.overdue_deliveries", observed_value: 4 }],
      confidence: 1,
      recommended_action: "Confirmar fechas y priorizar materiales vinculados con la ruta crítica.",
      source: "rule",
    },
  ],
};

const outputDirectory = resolve("output", "pdf");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "reporte-financiero-fixture.pdf");
writeFileSync(outputPath, renderReportPdf(snapshot, insights, REPORT_SECTIONS));
console.log(outputPath);
