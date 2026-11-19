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
