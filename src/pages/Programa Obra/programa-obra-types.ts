import { Doc, Id } from "../../../convex/_generated/dataModel";

// ============================================================
// Types
// ============================================================

export type ScheduleData = Doc<"programa_obra">;
export type PonderacionData = Doc<"programa_obra_ponderacion">;
export type AvanceRealData = Doc<"avance_real">;

export type ProgramaItem = {
  id: string;
  partidaDbId?: Id<"partidas">; // actual DB id for mutations
  partida: string;
  presupuesto: number;
  pagado: number;
  expanded: boolean;
  level: number; // 0=partida, 1=familia, 2=sub-partida
  parentPartidaNombre?: string; // for nivel 2/3
  familiaName?: string; // for nivel 2/3
  schedule?: ScheduleData | null;
  ponderacion?: number; // weight %
  avanceReal?: number; // avance real % (computed for 0/1, user-entered for 2)
  financiero?: number; // pagado/presupuesto % (only nivel 0)
  children: ProgramaItem[];
};

// ============================================================
// Helpers
// ============================================================

/** Parse DD/MM/YYYY or YYYY-MM-DD to a Date object */
export function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr.includes("/")) {
    const [d, m, y] = dateStr.split("/").map(Number);
    return new Date(y, m - 1, d);
  }
  if (dateStr.includes("-")) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}
