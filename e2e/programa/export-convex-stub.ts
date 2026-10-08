import { getFunctionName } from "convex/server";

// Stable, isolated fixtures for the real ProgramaObra page and its PDF exporter.
const partidas = ["Estructura", "Instalaciones", "Acabados"].map((nombre, index) => ({
  _id: `partida${index}`, nombre, nivel: 1, proyecto: "project", presupuesto_aprobado: 100000, pagado: 25000,
}));
const schedules = partidas.map((partida, index) => ({
  _id: `schedule${index}`, partida_id: partida._id, proyecto_id: "project", orden: index,
  fecha_inicio: "01/01/2026", fecha_fin: "30/11/2026", peso: 100 / 3,
  anticipo_fecha: "10/01/2026", suministro_fecha: "10/05/2026", finiquito_fecha: "10/11/2026",
}));
const details = schedules.flatMap((schedule, index) => Array.from({ length: index === 0 ? 54 : index === 1 ? 2 : 0 }, (_, order) => ({
  _id: `detail${index}-${order}`, programa_obra_id: schedule._id, proyecto_id: "project", nivel: 2,
  familia: `${index === 0 ? "Eje" : "Red"} ${String(order + 1).padStart(2, "0")}`,
  orden: order, fecha_inicio: "01/01/2026", fecha_fin: "30/11/2026", avance_porcentaje: 25,
})));
const comentarios = [
  { _id: "comment0", parent_type: "partida", parent_id: "schedule0", comentario: "Aviso de estructura", fecha_inicio: "01/03/2026", fecha_fin: "15/03/2026" },
  { _id: "comment1", parent_type: "familia", parent_id: "detail0-0", comentario: "Comentario de familia resumida", fecha_inicio: "01/04/2026", fecha_fin: "15/04/2026" },
];
const milestones = schedules.flatMap((schedule, index) => (["anticipo", "suministro", "finiquito"] as const).map((kind) => ({
  scheduleId: schedule._id, partidaId: schedule.partida_id, partidaName: partidas[index].nombre,
  kind, plannedDate: schedule[`${kind}_fecha`], reminderDays: 7, status: "scheduled",
  actionable: false, daysUntil: null, sourceCount: 0, candidateCount: 0, evidenceCount: 0, canViewFinancial: false,
})));

export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: unknown) {
  if (args === "skip") return undefined;
  switch (getFunctionName(reference)) {
    case "users:getCurrentUser": return { _id: "reader", name: "Lector", role: new URLSearchParams(location.search).has("viewer") ? "viewer" : "admin" };
    case "desarrollos:getById": return { _id: "project", nombre: "Prueba de exportación" };
    case "partida:getByNivel": return partidas;
    case "programa_obra:getSchedulesByProyecto": return schedules;
    case "programa_obra:getDetallesByProyecto": return details;
    case "programa_obra:getComentariosByProyecto": return comentarios;
    case "programa_obra:getMilestoneDashboard": return milestones;
    case "programa_obra:getExecutionProgram": return null;
    default: return [];
  }
}

export function useMutation() {
  return async () => { throw new Error("Exportación no debe modificar el programa"); };
}
