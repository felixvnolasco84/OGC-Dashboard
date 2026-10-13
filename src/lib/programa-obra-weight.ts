import {
  aggregateProgramProgress,
  summarizeProgram,
  type ProgramActivity,
  type ProgramCalendar,
  type ProgramDetailSource,
  type ProgramScheduleSource,
} from "./programa-obra-rules";

export type ProgramWeightTarget = { kind: "schedule" | "detail"; id: string };
const sorted = <T extends { _id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a._id.localeCompare(b._id));

export function parseProgramWeight(raw: string): number | undefined {
  // Accept a complete decimal, never parse a valid prefix of an invalid value.
  if (!/^\d+(?:\.\d+)?$/.test(raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

function participation(
  rows: { id: string; progress: number; weight?: number }[],
  id: string,
) {
  const mode = aggregateProgramProgress(rows);
  const sum = rows.reduce(
    (total, row) => total + (Number.isFinite(row.weight) ? row.weight! : 0),
    0,
  );
  return {
    count: rows.length,
    sum,
    simple: mode.provisional,
    percent: mode.provisional
      ? 100 / rows.length
      : (rows.find((row) => row.id === id)!.weight! / sum) * 100,
  };
}

/** Complete source projection for a review: keep missing weights distinct from zero.
 * It intentionally excludes names and unrelated financial data. Membership, dates,
 * physical progress and release state are included even without a config version. */
export function programWeightSource(
  schedules: ProgramScheduleSource[],
  details: ProgramDetailSource[],
  activities: ProgramActivity[],
  cutoff: string,
  calendar: ProgramCalendar,
) {
  const schedule = (s: ProgramScheduleSource) => [
    s._id,
    s.peso ?? null,
    s.orden ?? null,
    !!s.archived,
    s.fecha_inicio ?? null,
    s.fecha_fin ?? null,
  ];
  return JSON.stringify(
    {
      cutoff,
      calendar: {
        weekdays: [...calendar.weekdays].sort(),
        holidays: [...calendar.holidays].sort(),
      },
      schedules: sorted(schedules).map(schedule),
      details: sorted(details).map((d) => [
        ...schedule(d),
        d.programa_obra_id,
        d.nivel,
        d.avance_porcentaje ?? null,
      ]),
      activities: sorted(activities).map((a) => [
        a._id,
        a.detalle_id,
        a.progress,
        a.share,
        a.mandatory,
        a.archived,
        a.current_start ?? null,
        a.current_finish ?? null,
        a.requires_review,
        a.accepted_at ?? null,
        a.review_incident ?? null,
      ]),
    },
    (_key, value) =>
      typeof value === "number" && !Number.isFinite(value)
        ? String(value)
        : value,
  );
}

export async function programWeightDigest(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function previewProgramWeight(
  schedules: ProgramScheduleSource[],
  details: ProgramDetailSource[],
  activities: ProgramActivity[],
  target: ProgramWeightTarget,
  peso: number,
  cutoff: string,
  calendar: ProgramCalendar,
) {
  if (!Number.isFinite(peso) || peso < 0 || peso > 100) {
    throw new Error("La ponderación debe estar entre 0 y 100.");
  }
  const before = summarizeProgram(
    schedules,
    details,
    activities,
    cutoff,
    calendar,
  );
  const detail =
    target.kind === "detail"
      ? details.find((d) => d._id === target.id)
      : undefined;
  const scheduleId =
    target.kind === "schedule" ? target.id : detail?.programa_obra_id;
  const schedule = schedules.find((s) => s._id === scheduleId);
  if (
    !schedule ||
    !before.schedules.some((s) => s.id === scheduleId) ||
    (target.kind === "detail" &&
      !before.details.some((d) => d.id === target.id))
  ) {
    throw new Error("El elemento ya no pertenece al programa activo.");
  }
  const after = summarizeProgram(
    schedules.map((s) =>
      target.kind === "schedule" && s._id === target.id ? { ...s, peso } : s,
    ),
    details.map((d) =>
      target.kind === "detail" && d._id === target.id ? { ...d, peso } : d,
    ),
    activities,
    cutoff,
    calendar,
  );
  const beforeSchedule = before.schedules.find((s) => s.id === scheduleId)!;
  const afterSchedule = after.schedules.find((s) => s.id === scheduleId)!;
  const groupBefore =
    target.kind === "schedule"
      ? before.schedules
      : before.details.filter((d) => d.schedule_id === scheduleId);
  const groupAfter =
    target.kind === "schedule"
      ? after.schedules
      : after.details.filter((d) => d.schedule_id === scheduleId);
  const group = (summary: typeof before) => {
    const result = aggregateProgramProgress(summary.schedules);
    return {
      simple: result.provisional,
      inherited: summary.schedules.some(
        (s) => s.provisional || s.children_provisional,
      ),
    };
  };
  const scheduleResult = (s: typeof beforeSchedule) => ({
    progress: s.progress,
    planned: s.planned,
    provisional: s.provisional || s.children_provisional,
    simple: s.provisional,
    inherited: s.children_provisional,
  });
  return {
    cutoff,
    oldWeight: (detail ?? schedule).peso ?? null,
    newWeight: peso,
    participation: {
      before: participation(groupBefore, target.id),
      after: participation(groupAfter, target.id),
    },
    schedule: {
      before: scheduleResult(beforeSchedule),
      after: scheduleResult(afterSchedule),
    },
    overall: {
      before: { ...before.overall, ...group(before) },
      after: { ...after.overall, ...group(after) },
    },
  };
}

export type ProgramWeightImpact = ReturnType<typeof previewProgramWeight>;
