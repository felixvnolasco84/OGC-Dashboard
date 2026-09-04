import type { ProgramaMilestoneKind, ProgramaMilestoneStatus } from "./programa-obra-types";

const KIND_LABELS: Record<ProgramaMilestoneKind, string> = {
  anticipo: "Anticipo",
  suministro: "Suministro",
  finiquito: "Finiquito",
};

const STATUS_LABELS: Record<ProgramaMilestoneStatus, string> = {
  scheduled: "Programado",
  upcoming: "Próximo",
  due_today: "Vence hoy",
  overdue: "Vencido",
  review_required: "Requiere revisión",
  partial: "Parcial",
  completed: "Completado",
  missing_evidence: "Evidencia faltante",
};

export function getMilestoneLabel(kind: ProgramaMilestoneKind) {
  return KIND_LABELS[kind];
}

export function getMilestoneStatusLabel(status: ProgramaMilestoneStatus) {
  return STATUS_LABELS[status];
}

export function getMilestoneStatusClasses(status: ProgramaMilestoneStatus) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-800";
  if (status === "upcoming" || status === "scheduled") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "review_required") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "partial") return "border-orange-300 bg-orange-50 text-orange-900";
  return "border-red-200 bg-red-50 text-red-800";
}
