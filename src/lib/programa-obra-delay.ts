import { programDate, shiftDate } from "./programa-obra-rules";

/** Execution dates describe the work, never the date the record was captured. */
export type ProgramExecutionTiming = {
  has_reported_progress?: boolean;
  actual_start?: string | null;
  actual_finish?: string | null;
};

export type ProgramDelay = { kind: "overdue" | "late_finish" | "late_start"; start: string; end: string };

/** Shared by the live Gantt and reports; coordinates remain on the full schedule. */
export function getProgramDelay(input: {
  start?: string | null; end?: string | null; cutoff: string;
  overdue: boolean; timing?: ProgramExecutionTiming;
}): ProgramDelay | null {
  const start = programDate(input.start), end = programDate(input.end), cutoff = programDate(input.cutoff);
  if (!start || !end || !cutoff || end < start) return null;
  if (input.overdue) return { kind: "overdue", start, end };
  const actualFinish = programDate(input.timing?.actual_finish);
  if (actualFinish && actualFinish > end) return { kind: "late_finish", start, end };
  const graceEnd = shiftDate(start, 7);
  const actualStart = programDate(input.timing?.actual_start);
  const lateStartEnd = input.timing?.has_reported_progress === false && cutoff > graceEnd ? cutoff
    : input.timing?.has_reported_progress === true && actualStart && actualStart > graceEnd ? actualStart : null;
  return lateStartEnd ? { kind: "late_start", start, end: lateStartEnd < end ? lateStartEnd : end } : null;
}

/** Preserve imported allowances, including legacy fecha_fin with extra time baked in. */
export function getProgramBarDates(input: {
  start?: string | null; end?: string | null;
  parent_start?: string | null; parent_end?: string | null;
  extra_amount?: number; extra_unit?: string;
}) {
  let start = programDate(input.start) ?? null;
  let end = programDate(input.end) ?? null;
  const parentStart = programDate(input.parent_start), parentEnd = programDate(input.parent_end);
  if (parentStart && start && start < parentStart) start = parentStart;
  let extension_end: string | null = null;
  if (end && Number.isFinite(input.extra_amount) && input.extra_amount! > 0) {
    const offset = (date: string, amount: number) => {
      const result = new Date(`${date}T00:00:00Z`);
      if (input.extra_unit === "meses") result.setUTCMonth(result.getUTCMonth() + amount);
      else result.setUTCDate(result.getUTCDate() + amount * (input.extra_unit === "semanas" ? 7 : 1));
      return result.toISOString().slice(0, 10);
    };
    if (parentEnd && end > parentEnd) {
      extension_end = end;
      end = offset(end, -input.extra_amount!);
    } else extension_end = offset(end, input.extra_amount!);
  }
  return { start, end, extension_end };
}

export function getExecutionTiming(rows: Array<{ progress: number; actual_start?: string; actual_finish?: string }>): ProgramExecutionTiming {
  const started = rows.filter((r) => r.progress > 0 || !!r.actual_start);
  return {
    has_reported_progress: started.length > 0,
    actual_start: started.length && started.every((r) => programDate(r.actual_start))
      ? started.map((r) => programDate(r.actual_start)!).sort()[0] : null,
    actual_finish: rows.length && rows.every((r) => r.progress === 100 && programDate(r.actual_finish))
      ? rows.map((r) => programDate(r.actual_finish)!).sort().at(-1)! : null,
  };
}

export function aggregateExecutionTiming(rows: ProgramExecutionTiming[]): ProgramExecutionTiming {
  const started = rows.filter((r) => r.has_reported_progress);
  return {
    has_reported_progress: started.length > 0,
    actual_start: started.length && started.every((r) => programDate(r.actual_start))
      ? started.map((r) => programDate(r.actual_start)!).sort()[0] : null,
    actual_finish: rows.length && rows.every((r) => programDate(r.actual_finish))
      ? rows.map((r) => programDate(r.actual_finish)!).sort().at(-1)! : null,
  };
}
