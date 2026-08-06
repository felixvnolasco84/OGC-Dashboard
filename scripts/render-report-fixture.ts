import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderReportPdf } from "../convex/reportPdf.ts";
import type {
  ReportInsights,
  ReportProgramActivity,
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

const asDataUrl = (path: string) =>
  `data:image/png;base64,${readFileSync(resolve(path)).toString("base64")}`;

const photos = [
  asDataUrl("src/assets/img/bg/HeroBackgroundImage.png"),
  asDataUrl("src/assets/img/bg/AmenitiesImage.png"),
  asDataUrl("src/assets/img/bg/HandHeroImage.png"),
];

const timeline = Array.from({ length: 32 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, 5 + index * 7));
  return {
    date: date.toISOString().slice(0, 10),
    actual_cumulative: index * 2_340_000 + Math.sin(index / 2) * 180_000,
    projected_cumulative: index * 2_315_000,
    physical_progress: Math.min(100, index * 2.2),
    planned_progress: Math.min(100, index * 2.4),
  };
});

const activitySeed = [
  ["Cimentación", "Cimentación", 1, "2026-01-05", "2026-02-18", 90],
  ["Muros PB", "Estructura", 2, "2026-02-02", "2026-03-08", 83],
  ["Losa primer nivel", "Estructura", 2, "2026-03-01", "2026-04-12", 85],
  ["Electricidad", "Instalaciones", 1, "2026-02-22", "2026-06-12", 68],
  ["Canalizaciones", "Instalaciones", 2, "2026-03-15", "2026-05-20", 74],
  ["Tableros", "Instalaciones", 2, "2026-05-01", "2026-07-10", 41],
  ["Yeso y pintura", "Acabados", 1, "2026-03-26", "2026-07-29", 57],
  ["Yeso en muros", "Acabados", 2, "2026-03-26", "2026-05-08", 92],
  ["Yeso en plafones", "Acabados", 2, "2026-04-28", "2026-06-01", 81],
  ["Buñas", "Acabados", 3, "2026-06-02", "2026-07-28", 52],
  ["Plomería", "Instalaciones", 1, "2026-07-01", "2026-08-26", 15],
  ["Aire acondicionado", "Instalaciones", 1, "2026-07-26", "2026-09-10", 4],
  ["Cancelería", "Acabados", 1, "2026-06-20", "2026-08-30", 35],
  ["Carpintería", "Acabados", 1, "2026-07-05", "2026-09-12", 22],
  ["Impermeabilización", "Albañilerías", 2, "2026-07-15", "2026-08-03", 88],
  ["Pruebas y entrega", "Cierre", 1, "2026-08-20", "2026-09-18", 0],
] as const;

const activities: ReportProgramActivity[] = activitySeed.map((row, index) => {
  const parent = activitySeed.find((candidate) => candidate[1] === row[1] && candidate[2] === 1);
  return {
    id: `activity-${index}`,
    name: row[0],
    group: row[1],
    level: row[2],
    start: row[3],
    end: row[4],
    parent_start: row[2] > 1 ? parent?.[3] || row[3] : null,
    parent_end: row[2] > 1 ? parent?.[4] || row[4] : null,
    extension_end: index === 3 ? "2026-06-26" : null,
    actual_progress_percent: row[5],
    planned_progress_percent: Math.min(100, row[5] + (index % 4) * 5),
    financial_progress_percent: Math.max(0, row[5] - 7),
    delayed: new Date(`${row[4]}T00:00:00Z`) < new Date("2026-08-03T00:00:00Z") && row[5] < 100,
    milestones: index === 3
      ? [{ type: "advance", date: "2026-02-12", percentage: 25 }]
      : [],
  };
});

const logbookSections = ["Albañilerías", "Instalaciones", "Acabados", "Seguridad"].map((title, sectionIndex) => ({
  id: `section-${sectionIndex}`,
  title,
  author: sectionIndex % 2 ? "Luis Contreras" : "Sergio Sánchez",
  period_start: "2026-07-28",
  period_end: "2026-08-03",
  bullets: [
    "Resane de oquedades para recibir impermeabilizante; frente dominante de la semana.",
    "Fijación de lavadero y backsplash en lavanderías.",
    "Aplicación de estuco a pretiles y arranque de cuarto de bombas.",
    "Cierre de semana: aplicación de sellopack y registros pluviales y sanitarios.",
  ],
  incident: title === "Seguridad"
    ? "Se solicitó reforzar el cumplimiento de medidas de seguridad en el frente norte."
    : undefined,
  photos: photos.map((url, photoIndex) => ({
    id: `${sectionIndex}-${photoIndex}`,
    url,
    caption: [
      "Resane de oquedades para recibir impermeabilizante",
      "Preparación del frente de acabados",
      "Aplicación de sellopack para evitar filtraciones",
    ][photoIndex],
    author: "Sergio Sánchez",
    date: `2026-08-0${photoIndex + 1}`,
  })),
}));

const snapshot: ReportSnapshotV1 = {
  version: "ReportSnapshotV1",
  generated_at: new Date().toISOString(),
  visibility_profile: "full",
  project: {
    id: "fixture",
    name: "Larena Torre G",
    currency: "MXN",
    status: "Obra activa",
  },
  period: {
    start: "2026-07-28",
    end: "2026-08-03",
    key: "weekly:2026-W31",
  },
  financial: {
    original_budget: 102_800_000,
    approved_budget: 105_225_001,
    accumulated_cost: 74_539_332,
    period_cost: 4_420_000,
    balance: 30_685_669,
    exercised_percent: 70.84,
    accumulated_income: 78_900_000,
    period_income: 3_900_000,
    period_net_cashflow: -520_000,
    pending_payments: 2_870_000,
    approved_commitments: 4_240_000,
  },
  earned_value: {
    physical_progress_percent: 68,
    planned_progress_percent: 72,
    pv: 75_762_001,
    ev: 71_553_001,
    ac: 74_539_332,
    cpi: 0.96,
    spi: 0.94,
    eac: 109_609_376,
    etc: 35_070_044,
    variance_at_completion: -4_384_375,
  },
  projection: {
    projected_to_date: 72_450_000,
    actual_vs_projection: 2_089_332,
    actual_vs_projection_percent: 2.88,
    timeline,
  },
  variances: [
    ["MÁRMOL", 6_452_000, 6_958_492, -506_492, 65],
    ["CANCELERÍA", 5_452_000, 5_777_000, -325_000, 35],
    ["YESO Y PINTURA", 4_452_000, 4_300_000, 152_000, 45],
    ["CARPINTERÍA", 3_452_000, 3_572_500, -120_500, 22],
    ["AIRE ACONDICIONADO", 7_452_000, 7_572_500, -120_500, 4],
  ].map(([name, approved, actual, variance, progress]) => ({
    name: String(name),
    approved_budget: Number(approved),
    actual_cost: Number(actual),
    variance: Number(variance),
    exercised_percent: Number(actual) / Number(approved) * 100,
    program_progress_percent: Number(progress),
  })),
  concentration: { top_five_spend: 28_180_492, top_five_share_percent: 37.81 },
  requisitions: {
    total: 47,
    pending_review: 6,
    pending_payment: 9,
    pending_delivery: 11,
    overdue_deliveries: 4,
    approved_commitments: 4_240_000,
  },
  program: {
    scheduled_activities: activities.length,
    delayed_activities: activities.filter((activity) => activity.delayed).length,
    physical_progress_percent: 68,
    planned_progress_percent: 72,
    activities,
  },
  workforce: {
    total: 14,
    roles: [
      { label: "Oficiales albañiles", count: 3 },
      { label: "Oficial carpintero", count: 2 },
      { label: "Oficial fierrero", count: 2 },
      { label: "Ayudantes", count: 7 },
    ],
    weekly: Array.from({ length: 17 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 18 + index)).toISOString().slice(0, 10),
      total: Math.min(14, 9 + Math.floor((index + 2) / 3)),
    })),
    labor_cost_total: 4_200_000,
    labor_cost_timeline: Array.from({ length: 14 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 18 + index)).toISOString().slice(0, 10),
      cumulative: 210_000 + index * 295_000 + Math.sin(index) * 80_000,
    })),
    source: "captured",
  },
  logbook: {
    entries_in_period: 24,
    incidents_in_period: 1,
    incident_summaries: ["Se solicitó reforzar las medidas de seguridad del frente norte."],
    sections: logbookSections,
  },
  data_quality: {
    score: 96,
    issues: [
      {
        code: "incomplete_weights",
        severity: "warning",
        count: 1,
        message: "La ponderación del programa suma 99.50%; revisar la familia de acabados.",
      },
    ],
  },
  source_counts: {
    partidas: 240,
    transactions: 390,
    incomes: 22,
    requisitions: 47,
    program_rows: activities.length,
    logbook_entries: 24,
    logbook_photos: 12,
    projection_rows: 32,
  },
  methodology: [
    "Los importes se calculan de forma determinista desde los registros del proyecto.",
    "El avance de la tabla de variaciones proviene del Programa de Obra.",
    "PV y EV usan el presupuesto aprobado multiplicado por el avance planeado y físico.",
    "La IA sólo explica métricas existentes y no recalcula cantidades.",
  ],
};

const insights: ReportInsights = {
  executive_summary:
    "Esta semana el proyecto avanzó en los frentes de Acabados, Instalaciones y Albañilerías. El avance físico real se ubica en 68% frente a 72% planeado, con un CPI de 0.96. Se reportó una incidencia de seguridad y cuatro entregas vencidas que requieren seguimiento.",
  warning: "Fixture de revisión: los insights de IA no fueron solicitados.",
  insights: [
    {
      id: "rule-low-cpi",
      title: "Eficiencia de costo por debajo del umbral",
      severity: "high",
      category: "valor ganado",
      statement: "El valor producido es menor al costo incurrido.",
      evidence: [{ metric_key: "earned_value.cpi", observed_value: 0.96 }],
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
writeFileSync(outputPath, await renderReportPdf(snapshot, insights, REPORT_SECTIONS));
console.log(outputPath);
