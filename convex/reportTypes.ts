export const REPORT_SECTIONS = [
  "executive",
  "financial",
  "earned_value",
  "cashflow",
  "variances",
  "requisitions",
  "program",
  "logbook",
  "data_quality",
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];
export type ReportFrequency = "daily" | "weekly" | "monthly";
export type ReportVisibilityProfile =
  | "full"
  | "viewer"
  | "finance"
  | "contractor";

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  executive: "Resumen ejecutivo",
  financial: "Estado financiero",
  earned_value: "Valor ganado",
  cashflow: "Flujo y proyección",
  variances: "Variaciones",
  requisitions: "Requisiciones",
  program: "Programa de obra",
  logbook: "Bitácora",
  data_quality: "Calidad de datos",
};

const ALL_SECTIONS = [...REPORT_SECTIONS];

export const PROFILE_SECTIONS: Record<
  ReportVisibilityProfile,
  ReportSection[]
> = {
  full: ALL_SECTIONS,
  viewer: [
    "executive",
    "financial",
    "earned_value",
    "cashflow",
    "variances",
    "program",
    "logbook",
    "data_quality",
  ],
  finance: [
    "executive",
    "cashflow",
    "requisitions",
    "data_quality",
  ],
  contractor: [
    "executive",
    "requisitions",
    "program",
    "logbook",
    "data_quality",
  ],
};

export function profileForRole(role: string): ReportVisibilityProfile {
  if (role === "admin" || role === "user") return "full";
  if (role === "finance") return "finance";
  if (role === "viewer") return "viewer";
  return "contractor";
}

export function allowedSectionsForRole(role: string): ReportSection[] {
  return PROFILE_SECTIONS[profileForRole(role)];
}

export type ReportMetricEvidence = {
  metric_key: string;
  observed_value: number | string;
};

export type ReportInsight = {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  statement: string;
  evidence: ReportMetricEvidence[];
  confidence: number;
  recommended_action: string;
  source: "rule" | "ai";
};

export type ReportInsights = {
  executive_summary: string;
  insights: ReportInsight[];
  warning?: string;
};

export type ReportTimelinePoint = {
  date: string;
  actual_cumulative: number;
  projected_cumulative: number | null;
  physical_progress: number | null;
  planned_progress: number | null;
};

export type ReportVariance = {
  name: string;
  approved_budget: number;
  actual_cost: number;
  variance: number;
  exercised_percent: number;
  program_progress_percent?: number | null;
};

export type ReportProgramActivity = {
  id: string;
  name: string;
  group: string;
  level: number;
  start: string | null;
  end: string | null;
  parent_start?: string | null;
  parent_end?: string | null;
  extension_end?: string | null;
  actual_progress_percent: number;
  planned_progress_percent: number | null;
  financial_progress_percent?: number | null;
  delayed: boolean;
  milestones?: Array<{
    type: "advance" | "supply" | "closeout";
    date: string;
    percentage?: number | null;
  }>;
};

export type ReportWorkforcePoint = {
  date: string;
  total: number;
};

export type ReportLaborCostPoint = {
  date: string;
  cumulative: number;
};

export type ReportLogbookPhoto = {
  id: string;
  url?: string | null;
  caption: string;
  author: string;
  date: string;
};

export type ReportLogbookSection = {
  id: string;
  title: string;
  author: string;
  period_start: string;
  period_end: string;
  bullets: string[];
  incident?: string;
  photos: ReportLogbookPhoto[];
};

export type ReportDataQualityIssue = {
  code: string;
  severity: "warning" | "info";
  count: number;
  message: string;
};

export type ReportSnapshotV1 = {
  version: "ReportSnapshotV1";
  generated_at: string;
  visibility_profile: ReportVisibilityProfile;
  project: {
    id: string;
    name: string;
    currency: string;
    status?: string;
  };
  period: {
    start: string;
    end: string;
    key: string;
  };
  financial: {
    original_budget: number;
    approved_budget: number;
    accumulated_cost: number;
    period_cost: number;
    balance: number;
    exercised_percent: number;
    accumulated_income: number;
    period_income: number;
    period_net_cashflow: number;
    pending_payments: number;
    approved_commitments: number;
  };
  earned_value: {
    physical_progress_percent: number;
    planned_progress_percent: number;
    pv: number;
    ev: number;
    ac: number;
    cpi: number | null;
    spi: number | null;
    eac: number | null;
    etc: number | null;
    variance_at_completion: number | null;
  };
  projection: {
    projected_to_date: number | null;
    actual_vs_projection: number | null;
    actual_vs_projection_percent: number | null;
    timeline: ReportTimelinePoint[];
  };
  variances: ReportVariance[];
  concentration: {
    top_five_spend: number;
    top_five_share_percent: number;
  };
  requisitions: {
    total: number;
    pending_review: number;
    pending_payment: number;
    pending_delivery: number;
    overdue_deliveries: number;
    approved_commitments: number;
  };
  program: {
    scheduled_activities: number;
    delayed_activities: number;
    physical_progress_percent: number;
    planned_progress_percent: number;
    activities?: ReportProgramActivity[];
  };
  workforce?: {
    total: number | null;
    roles: Array<{ label: string; count: number | null }>;
    weekly: ReportWorkforcePoint[];
    labor_cost_total: number;
    labor_cost_timeline: ReportLaborCostPoint[];
    source: "captured" | "not_available";
  };
  logbook: {
    entries_in_period: number;
    incidents_in_period: number;
    incident_summaries: string[];
    sections?: ReportLogbookSection[];
  };
  data_quality: {
    score: number;
    issues: ReportDataQualityIssue[];
  };
  source_counts: Record<string, number>;
  methodology: string[];
};
