import { Doc, Id } from "../../../convex/_generated/dataModel";

// ============================================================
// Types
// ============================================================

export type ScheduleData = Doc<"programa_obra">;
export type DetalleData = Doc<"programa_obra_detalle">;
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
  familiaSchedule?: ScheduleData | null; // Own schedule for familia (level 1) items
  detalleSchedule?: DetalleData | null; // Schedule from programa_obra_detalle (level 1/2)
  parentPartidaDbId?: Id<"partidas">; // Parent partida DB ID
  ponderacion?: number; // weight %
  avanceReal?: number; // avance real % (computed for 0/1, user-entered for 2)
  financiero?: number; // pagado/presupuesto % (only nivel 0)
  maxChildEndDate?: string; // farthest familia end date (only nivel 0, for red extension)
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
