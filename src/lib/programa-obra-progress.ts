import { programToday, requireProgramDate, validateProgress } from "./programa-obra-rules";

export type ProgressDates = { actual_start?: string; actual_finish?: string; progress_as_of?: string };
export type ProgressRecord = ProgressDates & { progress: number };

/** Civil dates describe the work; capture timestamps only describe the audit trail. */
export function resolveProgressRecord(previous: ProgressRecord, input: {
  progress: number; execution_date: string; actual_start?: string; actual_finish?: string; reason?: string;
}, today = programToday()) {
  validateProgress(input.progress);
  const progress_as_of = requireProgramDate(input.execution_date);
  const actual_start = input.actual_start !== undefined ? requireProgramDate(input.actual_start)
    : previous.actual_start ?? (previous.progress === 0 && input.progress > 0 ? progress_as_of : undefined);
  const actual_finish = input.progress === 100
    ? input.actual_finish !== undefined ? requireProgramDate(input.actual_finish) : previous.actual_finish ?? progress_as_of
    : undefined;
  if (input.actual_finish !== undefined && input.progress !== 100) throw new Error("La terminación real requiere 100 % de avance.");
  if (input.progress > 0 && !actual_start) throw new Error("Registra el inicio real de la actividad.");
  if (progress_as_of > today || (actual_start && actual_start > today) || (actual_finish && actual_finish > today)) throw new Error("No puedes registrar ejecución en una fecha futura.");
  if (actual_start && actual_start > progress_as_of) throw new Error("La fecha del avance no puede ser anterior al inicio real.");
  if (actual_finish && ((actual_start && actual_finish < actual_start) || actual_finish > progress_as_of)) throw new Error("La terminación real debe estar entre el inicio real y la fecha del avance.");
  const correctsKnownDates = (!!previous.actual_start && actual_start !== previous.actual_start)
    || (input.progress === 100 && !!previous.actual_finish && actual_finish !== previous.actual_finish)
    || (!!previous.progress_as_of && (progress_as_of < previous.progress_as_of || (input.progress === previous.progress && progress_as_of !== previous.progress_as_of)));
  if ((input.progress < previous.progress || correctsKnownDates) && !input.reason?.trim()) throw new Error("Explica el motivo de la corrección de fechas, reducción o reapertura.");
  const dates = { actual_start, actual_finish, progress_as_of };
  const changed = input.progress !== previous.progress || Object.keys(dates).some((key) => dates[key as keyof ProgressDates] !== previous[key as keyof ProgressDates]);
  return { ...dates, correctsKnownDates, changed };
}

export function getRecordedProgressTiming(currentProgress: number, dates: ProgressDates, history: {
  old_value?: number; new_value: number; created_at: number; execution_date?: string;
}[]) {
  const sorted = [...history].sort((a, b) => a.created_at - b.created_at);
  const predatesHistory = (sorted[0]?.old_value ?? 0) > 0;
  const positive = sorted.find((entry) => entry.new_value > 0);
  const hasReportedProgress = currentProgress > 0 || predatesHistory || !!positive || !!dates.actual_start;
  const start = dates.actual_start ?? (!predatesHistory ? positive?.execution_date : undefined);
  const finish = currentProgress === 100
    ? dates.actual_finish ?? [...sorted].reverse().find((entry) => entry.new_value === 100)?.execution_date
    : undefined;
  // Date-only values are converted to local midnight for the existing Gantt coordinate system.
  const timestamp = (date: string) => new Date(`${requireProgramDate(date)}T00:00:00`).getTime();
  return {
    hasReportedProgress,
    progressStartKnown: !hasReportedProgress || !!start,
    progressStartedAt: start ? timestamp(start) : undefined,
    completionKnown: currentProgress < 100 || !!finish,
    completedAt: finish ? timestamp(finish) : undefined,
  };
}
