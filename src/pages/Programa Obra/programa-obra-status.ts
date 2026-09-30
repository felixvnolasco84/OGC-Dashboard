import type { ProgramaItem } from "./programa-obra-types";
import { programDate, programToday } from "../../lib/programa-obra-rules.ts";

type StatusItem = Pick<ProgramaItem, "level" | "schedule" | "detalleSchedule" | "familiaSchedule" | "isComplete" | "avanceReal">;

export function getProgramaItemSchedule(item: StatusItem) {
  return item.level === 0
    ? item.schedule
    : item.detalleSchedule ?? item.familiaSchedule ?? item.schedule;
}

/** The counter, filter and mobile status all use the planned finish date. */
export function isProgramaItemDelayed(item: StatusItem, now: number): boolean {
  if (item.isComplete ?? (item.avanceReal ?? 0) >= 100) return false;
  const value = getProgramaItemSchedule(item)?.fecha_fin;
  if (!value) return false;
  const finish = programDate(value);
  return !!finish && finish < programToday(now);
}

export function countDelayedProgramaItems(items: ProgramaItem[], now: number): number {
  const counted = new Set<string>();
  const visit = (item: ProgramaItem) => {
    if (isProgramaItemDelayed(item, now)) counted.add(item.id);
    item.children.forEach(visit);
  };
  items.forEach(visit);
  return counted.size;
}
