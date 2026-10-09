/** Pure scheduling rules shared by Convex, the programme, exports and reports. */
export type ProgramCalendar = { weekdays: number[]; holidays: string[] };
export const DEFAULT_PROGRAM_CALENDAR: ProgramCalendar = { weekdays: [1, 2, 3, 4, 5, 6], holidays: [] };
export type ProgramActivity = {
  _id: string; proyecto: string; detalle_id: string; front_id: string; name: string;
  progress: number; share: number; mandatory: boolean; archived: boolean;
  responsible_id?: string; current_start?: string; current_finish?: string;
  actual_start?: string; actual_finish?: string; forecast_finish?: string; progress_as_of?: string;
  requires_review: boolean; accepted_at?: number; accepted_by?: string;
  review_incident?: string; dates_need_review?: boolean;
};
export type ProgramDependency = {
  _id: string; proyecto: string; predecessor_id: string; successor_id: string;
  kind: "FS" | "SS" | "FF"; lag_days: number; lag_unit: "working" | "natural";
};
export type ProgramRequirement = {
  _id: string; activity_id: string; description: string; stage: "start" | "finish";
  blocking: boolean; resolved: boolean; responsible_id?: string; due_date?: string;
};
export type ProgramBlocker = { key: string; stage: "start" | "finish"; message: string; activity_id?: string; responsible_id?: string };

const DAY = 86_400_000;
export function programDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(value)) return undefined;
  const parts = value.includes("/") ? value.split("/").reverse() : value.split("-");
  const [year, month, day] = parts.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return parsed.toISOString().slice(0, 10);
}
export function requireProgramDate(value: string): string {
  const date = programDate(value);
  if (!date) throw new Error("Escribe una fecha válida.");
  return date;
}
export function programToday(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const values = new Map(parts.map((p) => [p.type, p.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
export function dateDay(date: string): number { return Date.parse(`${requireProgramDate(date)}T00:00:00Z`) / DAY; }
export function shiftDate(date: string, days: number): string { return new Date((dateDay(date) + days) * DAY).toISOString().slice(0, 10); }
export function validateCalendar(calendar: ProgramCalendar): void {
  if (!calendar.weekdays.length || calendar.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(calendar.weekdays).size !== calendar.weekdays.length) throw new Error("Selecciona al menos un día laborable, sin duplicados.");
  calendar.holidays.forEach(requireProgramDate);
}
export function isWorkingDate(date: string, calendar = DEFAULT_PROGRAM_CALENDAR): boolean {
  return calendar.weekdays.includes(new Date(dateDay(date) * DAY).getUTCDay()) && !calendar.holidays.includes(date);
}
export function nextWorkingDate(date: string, calendar = DEFAULT_PROGRAM_CALENDAR): string {
  validateCalendar(calendar);
  let result = requireProgramDate(date);
  for (let i = 0; i < 3660; i++) {
    if (isWorkingDate(result, calendar)) return result;
    result = shiftDate(result, 1);
  }
  throw new Error("El calendario no permite encontrar un día laborable.");
}
export function addProgramDays(date: string, days: number, unit: "working" | "natural", calendar = DEFAULT_PROGRAM_CALENDAR): string {
  if (!Number.isInteger(days) || days < 0 || days > 3660) throw new Error("La espera debe ser de 0 a 3660 días enteros.");
  if (unit === "natural") return shiftDate(date, days);
  validateCalendar(calendar);
  let result = requireProgramDate(date);
  for (let count = 0, guard = 0; count < days; guard++) {
    if (guard > 26000) throw new Error("La duración supera el límite del calendario.");
    result = shiftDate(result, 1);
    if (isWorkingDate(result, calendar)) count++;
  }
  return result;
}
export function workingDuration(start: string, finish: string, calendar = DEFAULT_PROGRAM_CALENDAR): number {
  if (finish < start) throw new Error("La fecha final no puede ser anterior al inicio.");
  const range = dateDay(finish) - dateDay(start);
  if (range > 26000) throw new Error("La duración supera el límite del calendario.");
  let count = 0;
  for (let i = 0; i <= range; i++) if (isWorkingDate(shiftDate(start, i), calendar)) count++;
  return count;
}
export function programPlannedProgress(start?: string, finish?: string, cutoff = programToday(), calendar = DEFAULT_PROGRAM_CALENDAR): number {
  const s = programDate(start), f = programDate(finish);
  if (!s || !f || f < s || cutoff < s) return 0;
  if (cutoff >= f) return 100;
  const duration = workingDuration(s, f, calendar);
  return duration ? workingDuration(s, cutoff, calendar) / duration * 100 : 0;
}
export function validateProgress(progress: number): void {
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new Error("El avance debe estar entre 0 y 100.");
}
export function aggregateProgramProgress(rows: { progress: number; weight?: number; released?: boolean; mandatory?: boolean }[]) {
  const completeWeights = rows.length > 0 && rows.every((row) => row.weight != null && Number.isFinite(row.weight) && row.weight >= 0);
  const weight = rows.reduce((sum, row) => sum + (row.weight ?? 0), 0);
  const provisional = !completeWeights || weight <= 0;
  const progress = !rows.length ? 0 : provisional
    ? rows.reduce((sum, row) => sum + row.progress, 0) / rows.length
    : rows.reduce((sum, row) => sum + row.progress * row.weight!, 0) / weight;
  const required = rows.filter((row) => row.mandatory !== false);
  return { progress, provisional, released: rows.length > 0 && required.every((row) => row.released ?? row.progress === 100) };
}
export function activityReleased(activity: ProgramActivity): boolean {
  return !activity.archived && activity.progress === 100 && (!activity.requires_review || activity.accepted_at != null) && !activity.review_incident;
}
export function topologicalActivities(activities: ProgramActivity[], dependencies: ProgramDependency[]): string[] {
  const map = new Map(activities.filter((a) => !a.archived).map((a) => [a._id, a]));
  const degree = new Map([...map.keys()].map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const edge of dependencies) {
    const a = map.get(edge.predecessor_id), b = map.get(edge.successor_id);
    if (!a || !b || a.proyecto !== b.proyecto || a.proyecto !== edge.proyecto) throw new Error("Las actividades deben estar activas y pertenecer al mismo proyecto.");
    if (a._id === b._id) throw new Error("Una actividad no puede depender de sí misma.");
    const key = `${a._id}:${b._id}`;
    if (seen.has(key)) throw new Error("Ya existe una relación entre estas actividades.");
    seen.add(key);
    if (!["FS", "SS", "FF"].includes(edge.kind) || !["working", "natural"].includes(edge.lag_unit)) throw new Error("La relación no es válida.");
    addProgramDays("2026-01-01", edge.lag_days, edge.lag_unit);
    degree.set(b._id, degree.get(b._id)! + 1);
    outgoing.set(a._id, [...(outgoing.get(a._id) ?? []), b._id]);
  }
  const queue = [...degree].filter(([, n]) => n === 0).map(([id]) => id);
  const result: string[] = [];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]; result.push(id);
    for (const next of outgoing.get(id) ?? []) { degree.set(next, degree.get(next)! - 1); if (degree.get(next) === 0) queue.push(next); }
  }
  if (result.length !== map.size) throw new Error("Esta dependencia crea un ciclo en el programa.");
  return result;
}
export function activityBlockers(activity: ProgramActivity, activities: ProgramActivity[], dependencies: ProgramDependency[], requirements: ProgramRequirement[], date: string, calendar = DEFAULT_PROGRAM_CALENDAR): ProgramBlocker[] {
  const result: ProgramBlocker[] = [];
  const map = new Map(activities.map((a) => [a._id, a]));
  for (const edge of dependencies.filter((d) => d.successor_id === activity._id)) {
    const predecessor = map.get(edge.predecessor_id);
    const stage = edge.kind === "FF" ? "finish" : "start";
    let message: string | undefined;
    if (!predecessor || predecessor.archived) message = "La actividad previa ya no está disponible; revisa la relación.";
    else {
      const started = predecessor.actual_start != null;
      const released = activityReleased(predecessor);
      const physicalDate = edge.kind === "SS" ? predecessor.actual_start : predecessor.actual_finish;
      const acceptanceDate = edge.kind !== "SS" && predecessor.requires_review && predecessor.accepted_at != null ? programToday(predecessor.accepted_at) : undefined;
      const eventDate = acceptanceDate && (!physicalDate || acceptanceDate > physicalDate) ? acceptanceDate : physicalDate;
      if (edge.kind === "SS" && !started) message = `Falta registrar el inicio real de ${predecessor.name}.`;
      else if (edge.kind !== "SS" && !released) message = `Falta terminar o aceptar ${predecessor.name}.`;
      else if (!eventDate && edge.lag_days > 0) message = `Falta la fecha real de ${predecessor.name} para comprobar la espera.`;
      else if (eventDate) {
        const earliest = addProgramDays(eventDate, edge.lag_days, edge.lag_unit, calendar);
        if (date < earliest) message = `La espera después de ${predecessor.name} termina el ${earliest}.`;
      }
    }
    if (message) result.push({ key: `dependency:${edge._id}`, stage, message, activity_id: edge.predecessor_id, responsible_id: predecessor?.responsible_id });
  }
  for (const req of requirements.filter((r) => r.activity_id === activity._id && r.blocking && !r.resolved)) result.push({ key: `requirement:${req._id}`, stage: req.stage, message: req.description, responsible_id: req.responsible_id });
  if (activity.review_incident) result.push({ key: `incident:${activity._id}`, stage: "finish", message: activity.review_incident, responsible_id: activity.responsible_id });
  return result;
}
export function progressBlockers(activity: ProgramActivity, nextProgress: number, blockers: ProgramBlocker[]): ProgramBlocker[] {
  return nextProgress <= activity.progress ? [] : blockers.filter((b) => b.stage === "start" || nextProgress === 100);
}
/** Check the actual start/finish rather than substituting the later reporting cutoff. */
export function recordedProgressBlockers(activity: ProgramActivity, nextProgress: number, dates: { actual_start?: string; actual_finish?: string; progress_as_of: string }, activities: ProgramActivity[], dependencies: ProgramDependency[], requirements: ProgramRequirement[], calendar = DEFAULT_PROGRAM_CALENDAR): ProgramBlocker[] {
  const startChanged = !!dates.actual_start && dates.actual_start !== activity.actual_start;
  const finishChanged = nextProgress === 100 && !!dates.actual_finish && dates.actual_finish !== activity.actual_finish;
  const advancing = nextProgress > activity.progress;
  const startDate = (activity.progress === 0 || startChanged) ? dates.actual_start ?? dates.progress_as_of : dates.progress_as_of;
  const start = activityBlockers(activity, activities, dependencies, requirements, startDate, calendar)
    .filter((b) => b.stage === "start" && (advancing || (startChanged && b.key.startsWith("dependency:"))));
  const finish = activityBlockers(activity, activities, dependencies, requirements, dates.actual_finish ?? dates.progress_as_of, calendar)
    .filter((b) => b.stage === "finish" && nextProgress === 100 && (advancing || (finishChanged && b.key.startsWith("dependency:"))));
  return [...start, ...finish];
}
export function activityStatus(activity: ProgramActivity, blockers: ProgramBlocker[]) {
  if (activityReleased(activity)) return "completed" as const;
  if (activity.progress === 100) return "review" as const;
  if (activity.progress > 0) return "in_progress" as const;
  return blockers.some((b) => b.stage === "start") ? "pending" as const : "ready" as const;
}
export const PROGRAM_STATUS_LABELS = { pending: "Pendiente", ready: "Lista para iniciar", in_progress: "En ejecución", review: "Pendiente de revisión", completed: "Terminada" };
export function activityDelayed(activity: ProgramActivity, cutoff: string): boolean {
  return !!activity.current_finish && activity.current_finish < cutoff && !activityReleased(activity);
}
export type ProgramDateEdit = { activity_id: string; start?: string; finish?: string; forecast_finish?: string };
function startForWorkingFinish(finish: string, duration: number, calendar: ProgramCalendar) {
  let date = nextWorkingDate(finish, calendar), remaining = duration - 1;
  for (let attempt = 0; remaining > 0 && attempt < 26000; attempt++) { date = shiftDate(date, -1); if (isWorkingDate(date, calendar)) remaining--; }
  if (remaining > 0) throw new Error("La duración supera el calendario permitido.");
  return date;
}
export function proposeProgramDates(activities: ProgramActivity[], dependencies: ProgramDependency[], edits: ProgramDateEdit[], calendar = DEFAULT_PROGRAM_CALENDAR) {
  validateCalendar(calendar);
  const original = new Map(activities.map((a) => [a._id, a]));
  const current = new Map(activities.map((a) => [a._id, { ...a }]));
  const problems: { activity_id: string; message: string }[] = [];
  const affected = new Set(edits.map((e) => e.activity_id));
  if (!edits.length || new Set(edits.map((e) => e.activity_id)).size !== edits.length) throw new Error("Selecciona actividades diferentes para reprogramar.");
  for (const edit of edits) {
    const row = current.get(edit.activity_id);
    if (!row || row.archived || row.progress === 100) throw new Error("No puedes reprogramar una actividad archivada o terminada.");
    if ((row.actual_start || row.progress > 0) && edit.start && requireProgramDate(edit.start) !== row.current_start) throw new Error("El inicio de una actividad en ejecución no se puede reprogramar.");
    if (edit.start) row.current_start = requireProgramDate(edit.start);
    if (edit.finish) row.current_finish = requireProgramDate(edit.finish);
    if (edit.forecast_finish) row.forecast_finish = requireProgramDate(edit.forecast_finish);
    if (row.current_start && row.current_finish && row.current_finish < row.current_start) throw new Error("La terminación no puede ser anterior al inicio.");
  }
  for (const id of topologicalActivities(activities, dependencies)) {
    const row = current.get(id)!, previous = original.get(id)!;
    const incoming = dependencies.filter((d) => d.successor_id === id);
    if (incoming.some((d) => affected.has(d.predecessor_id))) affected.add(id);
    if (!affected.has(id) || row.progress === 100) continue;
    if (row.dates_need_review || !row.current_start || !row.current_finish) { problems.push({ activity_id: id, message: "Revisa las fechas y el tiempo extra histórico antes de reprogramar." }); continue; }
    let start = row.current_start, finish = row.current_finish, minimumFinish: string | undefined;
    const duration = workingDuration(previous.current_start ?? start, previous.current_finish ?? finish, calendar) || 1;
    if (row.progress > 0 || row.actual_start) {
      if (!row.forecast_finish) { problems.push({ activity_id: id, message: "Indica la terminación prevista de la actividad en ejecución." }); continue; }
      if (row.actual_start && row.forecast_finish < row.actual_start) { problems.push({ activity_id: id, message: "La terminación prevista es anterior al inicio real." }); continue; }
      finish = row.forecast_finish;
    }
    for (const edge of incoming) {
      const pred = current.get(edge.predecessor_id)!;
      if (edge.kind !== "SS" && pred.progress === 100 && !activityReleased(pred)) { problems.push({ activity_id: id, message: `Falta liberar el cierre de ${pred.name}; no se puede inventar su fecha de aceptación.` }); continue; }
      const acceptanceDate = edge.kind !== "SS" && pred.requires_review && pred.accepted_at != null ? programToday(pred.accepted_at) : undefined;
      const physicalAnchor = edge.kind === "SS" ? pred.actual_start ?? pred.current_start : activityReleased(pred) ? pred.actual_finish : pred.actual_finish ?? pred.forecast_finish ?? pred.current_finish;
      const anchor = acceptanceDate && physicalAnchor && acceptanceDate > physicalAnchor ? acceptanceDate : physicalAnchor;
      if (!anchor || pred.dates_need_review) { problems.push({ activity_id: id, message: `Falta una fecha confiable de ${pred.name}.` }); continue; }
      const waited = addProgramDays(anchor, edge.lag_days, edge.lag_unit, calendar);
      const bound = nextWorkingDate(edge.kind === "FS" ? shiftDate(waited, 1) : waited, calendar);
      if (edge.kind === "FF") { if (!minimumFinish || bound > minimumFinish) minimumFinish = bound; if (bound > finish) finish = bound; }
      else if (bound > start) { if (row.actual_start || row.progress > 0) problems.push({ activity_id: id, message: `El inicio real incumple la relación con ${pred.name}; revisa la excepción.` }); else start = bound; }
    }
    if (!row.actual_start && row.progress === 0) {
      start = nextWorkingDate(start, calendar);
      const requestedFinish = edits.find((e) => e.activity_id === id)?.finish;
      const finishBound = [minimumFinish ?? "", requestedFinish ? requireProgramDate(requestedFinish) : ""].sort()[1];
      if (finishBound) { const constrainedStart = startForWorkingFinish(finishBound, duration, calendar); if (constrainedStart > start) start = constrainedStart; }
      finish = addProgramDays(start, duration - 1, "working", calendar);
    }
    if (finish < start) { problems.push({ activity_id: id, message: "La terminación no puede ser anterior al inicio." }); continue; }
    row.current_start = start; row.current_finish = finish;
  }
  const changes = [...current.values()].filter((a) => affected.has(a._id) && (a.current_start !== original.get(a._id)!.current_start || a.current_finish !== original.get(a._id)!.current_finish || a.forecast_finish !== original.get(a._id)!.forecast_finish)).map((a) => ({ activity_id: a._id, name: a.name, old_start: original.get(a._id)!.current_start, old_finish: original.get(a._id)!.current_finish, start: a.current_start!, finish: a.current_finish!, forecast_finish: a.forecast_finish }));
  const oldFinish = activities.filter((a) => !a.archived).map((a) => a.current_finish ?? "").sort().at(-1);
  const newFinish = [...current.values()].filter((a) => !a.archived).map((a) => a.current_finish ?? "").sort().at(-1);
  return { changes, problems, oldFinish, newFinish };
}

export type ProgramScheduleSource = { _id: string; peso?: number; orden?: number; archived?: boolean; fecha_inicio?: string; fecha_fin?: string };
export type ProgramDetailSource = ProgramScheduleSource & { programa_obra_id: string; nivel: number; avance_porcentaje?: number };
/** Project execution dates onto legacy consumers without mutating imported source rows. */
export function projectProgramDates<S extends ProgramScheduleSource, D extends ProgramDetailSource>(schedules: S[], details: D[], activities: ProgramActivity[]) {
  const bounds = (leaves: ProgramActivity[]) => {
    const starts = leaves.map((a) => a.current_start).filter((d): d is string => !!d).sort();
    const finishes = leaves.map((a) => a.current_finish).filter((d): d is string => !!d).sort();
    return leaves.length && leaves.every((a) => !a.dates_need_review && a.current_start && a.current_finish) ? { fecha_inicio: starts[0], fecha_fin: finishes[finishes.length - 1], tiempo_extra_cantidad: 0, tiempo_extra_unidad: "dias" as const } : {};
  };
  const active = activities.filter((a) => !a.archived);
  const projectedDetails = details.map((d) => ({ ...d, ...bounds(active.filter((a) => a.detalle_id === d._id)) }));
  const projectedSchedules = schedules.map((s) => ({ ...s, ...bounds(active.filter((a) => details.some((d) => d._id === a.detalle_id && d.programa_obra_id === s._id))) }));
  return { schedules: projectedSchedules, details: projectedDetails };
}
/** Two-level weighting: front shares → families → partidas. No double counting. */
export function summarizeProgram(schedules: ProgramScheduleSource[], details: ProgramDetailSource[], activities: ProgramActivity[], cutoff = programToday(), calendar = DEFAULT_PROGRAM_CALENDAR) {
  const families = details.filter((d) => d.nivel === 2 && !d.archived && (d.orden != null || activities.some((a) => a.detalle_id === d._id)));
  const detailSummaries = families.map((detail) => {
    const leaves = activities.filter((a) => a.detalle_id === detail._id && !a.archived);
    const rows = leaves.length ? leaves.map((a) => ({ progress: a.progress, weight: a.share, released: activityReleased(a), mandatory: a.mandatory })) : [{ progress: detail.avance_porcentaje ?? 0, weight: 100, released: (detail.avance_porcentaje ?? 0) === 100 }];
    const summary = aggregateProgramProgress(rows);
    const planned = leaves.length ? aggregateProgramProgress(leaves.map((a) => ({ progress: programPlannedProgress(a.current_start, a.current_finish, cutoff, calendar), weight: a.share }))).progress : programPlannedProgress(detail.fecha_inicio, detail.fecha_fin, cutoff, calendar);
    return { id: detail._id, schedule_id: detail.programa_obra_id, weight: detail.peso, ...summary, planned };
  });
  const scheduleSummaries = schedules.filter((s) => !s.archived && (s.orden != null || families.some((f) => f.programa_obra_id === s._id))).map((schedule) => {
    const children = detailSummaries.filter((d) => d.schedule_id === schedule._id);
    return { id: schedule._id, weight: schedule.peso, ...aggregateProgramProgress(children), planned: aggregateProgramProgress(children.map((d) => ({ progress: d.planned, weight: d.weight }))).progress, children_provisional: children.some((d) => d.provisional) };
  });
  const overall = aggregateProgramProgress(scheduleSummaries);
  return { details: detailSummaries, schedules: scheduleSummaries, overall: { ...overall, provisional: overall.provisional || scheduleSummaries.some((s) => s.provisional || s.children_provisional), planned: aggregateProgramProgress(scheduleSummaries.map((s) => ({ progress: s.planned, weight: s.weight }))).progress } };
}
