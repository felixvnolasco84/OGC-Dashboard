import { reportLogbookFixture } from "./report-logbook.mjs";

// Synthetic programme used to verify the original Gantt at realistic row counts.
export function reportProgramFixture({ partidas = 12, familias = 3 } = {}) {
  const f = reportLogbookFixture(0);
  f.tables.bitacora = [];
  f.tables.documentos = [];
  const names = ["CISTERNA", "MUROS_PB", "LOSA_PN", "ESCALERA INTERNA", "ESCALERA EXTERNA 01", "MUROS_PN", "LOSA_2N", "ESCALERA EXTERNA 02", "MUROS PRETILES", "INSTALACIONES", "ACABADOS", "CARPINTERÍA"];
  const date = (day) => new Date(Date.UTC(2026, 9, day)).toISOString().slice(0, 10);
  const rows = [], schedules = [], details = [];
  for (let p = 0; p < partidas; p++) {
    const name = names[p] ?? `PARTIDA ${p + 1}`;
    const offset = p % 12 * 4;
    rows.push({ _id: `partida-${p}`, proyecto: "project", nivel: 1, nombre: name, presupuesto_aprobado: 290780 + p * 100000 });
    schedules.push({ _id: `schedule-${p}`, proyecto: "project", partida_id: `partida-${p}`, orden: p, peso: 100, fecha_inicio: date(9 + offset), fecha_fin: date(24 + offset) });
    for (let c = 0; c < familias; c++) {
      details.push({
        _id: `family-${p}-${c}`, proyecto: "project", programa_obra_id: `schedule-${p}`, nivel: 2, orden: c, peso: 100,
        partida: name, familia: `FAMILIA ${p + 1}.${c + 1}`, avance_porcentaje: p === 0 ? 0 : 70 + c % 3 * 5,
        fecha_inicio: date(9 + offset + c % 3 * 2), fecha_fin: date(20 + offset + c % 3 * 2),
      });
    }
  }
  Object.assign(f.tables, { partidas: rows, programa_obra: schedules, programa_obra_detalle: details });
  return {
    ...f, partidas: rows, schedules, details,
    args: { proyecto: "project", periodStart: "2026-11-13", periodEnd: "2026-11-19", periodKey: "weekly:2026-11-13:2026-11-19", profile: "full" },
  };
}

/** Covers old pending work, real delays, missing dates and saved extra time. */
export function reportProgramDelayFixture() {
  const f = reportProgramFixture();
  const set = (p, name, start, end, progress, actualStart, actualFinish) => {
    f.partidas[p].nombre = name;
    Object.assign(f.schedules[p], { fecha_inicio: start, fecha_fin: end });
    for (const detail of f.details.filter((d) => d.programa_obra_id === f.schedules[p]._id)) {
      Object.assign(detail, { partida: name, fecha_inicio: start, fecha_fin: end, avance_porcentaje: progress, actual_start: actualStart, actual_finish: actualFinish, progress_as_of: "2026-11-18" });
    }
  };
  set(0, "PRELIMINARES", "2026-05-28", "2026-07-15", 75, "2026-05-28");
  set(1, "MUROS_PB", "2026-10-13", "2026-10-28", 85, "2026-10-13");
  set(2, "LOSA_PN", "2026-11-01", "2026-12-10", 45, "2026-11-12");
  Object.assign(f.details.find((d) => d._id === "family-2-2"), { avance_porcentaje: 0, actual_start: undefined });
  set(3, "INICIO TARDÍO ANTERIOR", "2026-08-01", "2026-12-15", 55, "2026-08-20");
  set(4, "TERMINACIÓN TARDÍA", "2026-10-10", "2026-11-01", 100, "2026-10-10", "2026-11-07");
  set(5, "INICIO OPORTUNO", "2026-10-15", "2026-12-15", 60, "2026-10-15");
  set(6, "TERMINACIÓN OPORTUNA", "2026-10-18", "2026-11-05", 100, "2026-10-18", "2026-11-01");
  set(7, "TERMINADA ANTERIOR", "2026-05-01", "2026-07-15", 100, "2026-05-01", "2026-07-15");
  set(8, "TIEMPO EXTRA GUARDADO", "2026-11-10", "2026-11-28", 30, "2026-11-10");
  Object.assign(f.details.find((d) => d._id === "family-8-0"), { tiempo_extra_cantidad: 5, tiempo_extra_unidad: "dias" });
  set(9, "INICIO SIN FECHA REAL", "2026-11-01", "2026-12-10", 60);
  set(10, "CIERRE SIN FECHA REAL", "2026-10-01", "2026-10-31", 100, "2026-10-01");
  return f;
}
