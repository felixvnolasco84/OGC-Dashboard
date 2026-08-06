import type {
  AssistantOverallStatus,
  AssistantReference,
} from "./assistantTypes.ts";

export function resolveAssistantProjectContext(
  references: AssistantReference[],
  routeProjectId?: string,
) {
  const explicit = new Set<string>();
  for (const reference of references) {
    if (reference.type === "project") explicit.add(reference.id);
    else if (reference.project_id) explicit.add(reference.project_id);
  }
  return explicit.size ? [...explicit] : routeProjectId ? [routeProjectId] : [];
}

export function deterministicAssistantStatus(args: {
  hasData: boolean;
  hasCriticalInsight: boolean;
  hasAttentionInsight: boolean;
  hasBlockedOrOverdueWork: boolean;
}): AssistantOverallStatus {
  if (!args.hasData) return "insufficient_data";
  if (args.hasCriticalInsight) return "critical";
  if (args.hasAttentionInsight || args.hasBlockedOrOverdueWork) return "attention";
  return "on_track";
}

export function assistantDefaultCutoff(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("Fecha de corte inválida");
  const date = new Date(`${asOf}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha de corte inválida");
  date.setUTCDate(date.getUTCDate() - 29);
  return {
    accumulated_through: asOf,
    activity_from: date.toISOString().slice(0, 10),
    activity_through: asOf,
  };
}

export function resolveAssistantCutoff(text: string, defaultAsOf: string) {
  const dates: string[] = [];
  for (const match of text.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g)) {
    const raw = match[1];
    const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const iso = slash ? `${slash[3]}-${slash[2]}-${slash[1]}` : raw;
    const parsed = new Date(`${iso}T12:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso && !dates.includes(iso)) {
      dates.push(iso);
    }
  }
  if (!dates.length) return assistantDefaultCutoff(defaultAsOf);
  if (dates.length === 1) return assistantDefaultCutoff(dates[0]);
  const ordered = dates.slice(0, 2).sort();
  return {
    accumulated_through: ordered[1],
    activity_from: ordered[0],
    activity_through: ordered[1],
  };
}

export function isOperationallyOverdue(args: {
  active: boolean;
  dueDate?: string;
  asOf: string;
}) {
  return Boolean(args.active && args.dueDate && args.dueDate < args.asOf);
}
