export type ProgramaObraMilestoneKind = "anticipo" | "suministro" | "finiquito";

export type ProgramaObraMilestoneStatus =
  | "scheduled"
  | "upcoming"
  | "due_today"
  | "overdue"
  | "review_required"
  | "partial"
  | "completed"
  | "missing_evidence";

export const DEFAULT_REMINDER_DAYS: Record<ProgramaObraMilestoneKind, number> = {
  anticipo: 7,
  suministro: 14,
  finiquito: 7,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeMilestoneText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function parseProgramDateToUtcDay(value?: string | null): number | null {
  if (!value) return null;
  const parts = value.includes("/")
    ? value.split("/").map(Number).reverse()
    : value.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const result = Date.UTC(year, month - 1, day);
  const check = new Date(result);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(result / DAY_MS);
}

export function getMexicoCityDateKey(timestamp = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function getReminderDays(
  kind: ProgramaObraMilestoneKind,
  configured?: number | null,
): number {
  if (configured == null || !Number.isFinite(configured)) {
    return DEFAULT_REMINDER_DAYS[kind];
  }
  return Math.min(90, Math.max(0, Math.round(configured)));
}

export function validateReminderDays(value?: number): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 90) {
    throw new Error("Los días de recordatorio deben estar entre 0 y 90.");
  }
}

export function validateMilestonePercentage(value?: number): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("El porcentaje del hito debe estar entre 0 y 100.");
  }
}

export function getExpectedMilestoneAmount(budget: number, percentage?: number): number | null {
  if (percentage == null || !Number.isFinite(percentage)) return null;
  return Math.round(budget * (percentage / 100) * 100) / 100;
}

export function getDaysUntil(plannedDate: string, todayKey: string): number | null {
  const plannedDay = parseProgramDateToUtcDay(plannedDate);
  const todayDay = parseProgramDateToUtcDay(todayKey);
  if (plannedDay == null || todayDay == null) return null;
  return plannedDay - todayDay;
}

export function deriveMilestoneStatus(input: {
  plannedDate: string;
  reminderDays: number;
  todayKey: string;
  completed: boolean;
  partial?: boolean;
  reviewRequired?: boolean;
  evidencePresent?: boolean;
}): ProgramaObraMilestoneStatus {
  if (input.reviewRequired) return "review_required";
  if (input.completed) {
    return input.evidencePresent ? "completed" : "missing_evidence";
  }
  if (input.partial) return "partial";

  const daysUntil = getDaysUntil(input.plannedDate, input.todayKey);
  if (daysUntil == null) return "scheduled";
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "due_today";
  if (daysUntil <= input.reminderDays) return "upcoming";
  return "scheduled";
}

export function isActionableMilestone(status: ProgramaObraMilestoneStatus): boolean {
  return status !== "scheduled" && status !== "completed";
}

export function isPaidStatus(value?: string | null): boolean {
  return normalizeMilestoneText(value) === "pagado";
}

export function isCompleteDeliveryStatus(value?: string | null): boolean {
  return normalizeMilestoneText(value) === "completo";
}

export function isPartialDeliveryStatus(value?: string | null): boolean {
  return normalizeMilestoneText(value) === "parcial";
}

export function transactionMatchesMilestone(
  category: string | undefined,
  kind: ProgramaObraMilestoneKind,
): boolean {
  const normalized = normalizeMilestoneText(category);
  if (kind === "anticipo") return normalized === "anticipo";
  if (kind === "suministro") return normalized === "material";
  return normalized === "finiquito";
}

export function getAssistedMatchMode(input: {
  kind: ProgramaObraMilestoneKind;
  confirmedCount: number;
  exactCount: number;
  manualCandidateCount?: number;
  withinReminderWindow: boolean;
}): "confirmed" | "automatic" | "review" | "none" {
  if (input.confirmedCount > 0) return "confirmed";
  if (input.withinReminderWindow && input.exactCount > 1) return "review";
  if (
    input.kind === "finiquito" &&
    input.withinReminderWindow &&
    input.exactCount === 0 &&
    (input.manualCandidateCount ?? 0) > 0
  ) {
    return "review";
  }
  if (input.exactCount === 1) {
    return "automatic";
  }
  return "none";
}
