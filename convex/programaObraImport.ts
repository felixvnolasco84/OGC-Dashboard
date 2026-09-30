import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { executionContext } from "./programaObraExecution";
import { programDate, proposeProgramDates, validateProgress, type ProgramDateEdit } from "../src/lib/programa-obra-rules";

export type ProgramImportRow = {
  nivel: number; partida: string; familia?: string; subpartida?: string;
  programa_obra_id?: Id<"programa_obra">; detalle_id?: Id<"programa_obra_detalle">;
  fecha_inicio?: string; fecha_fin?: string; anticipo_fecha?: string; anticipo_porcentaje?: number;
  suministro_fecha?: string; finiquito_fecha?: string; finiquito_porcentaje?: number; peso?: number;
};
const normalize = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
export async function previewProgramImport(ctx: QueryCtx | MutationCtx, proyecto: Id<"desarrollos">, rows: ProgramImportRow[]) {
  const [context, schedules, details, partidas] = await Promise.all([
    executionContext(ctx, proyecto),
    ctx.db.query("programa_obra").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ctx.db.query("partidas").withIndex("by_nivel_proyecto", (q) => q.eq("nivel", 1).eq("proyecto", proyecto)).collect(),
  ]);
  if (!rows.length || rows.length > 2000) throw new Error("El archivo debe incluir de 1 a 2000 filas.");
  const fingerprint = JSON.stringify({ version: context.config?.version ?? 0, schedules: [...schedules].sort((a, b) => a._id.localeCompare(b._id)), details: [...details].sort((a, b) => a._id.localeCompare(b._id)) });
  const seen = new Set<string>(), matchedIds = new Set<string>();
  const parentNames = new Map<string, string>();
  for (const row of rows.filter((r) => r.nivel === 1)) {
    const mapped = row.programa_obra_id ? schedules.find((s) => s._id === row.programa_obra_id) : undefined;
    const candidates = mapped ? partidas.filter((p) => p._id === mapped.partida_id) : partidas.filter((p) => normalize(p.nombre) === normalize(row.partida));
    if (candidates.length === 1) parentNames.set(normalize(row.partida), candidates[0].nombre);
  }
  const result = rows.map((row, index) => {
    const issues: string[] = [];
    if (![1, 2, 3].includes(row.nivel) || !row.partida.trim() || (row.nivel > 1 && !row.familia?.trim())) issues.push("La fila requiere un nivel, partida y familia válidos.");
    const mappedSchedule = row.programa_obra_id ? schedules.find((s) => s._id === row.programa_obra_id && !s.archived) : undefined;
    if (row.programa_obra_id && !mappedSchedule) issues.push("La partida seleccionada no pertenece al programa activo.");
    const canonical = parentNames.get(normalize(row.partida)) ?? row.partida;
    const candidates = mappedSchedule ? partidas.filter((p) => p._id === mappedSchedule.partida_id) : partidas.filter((p) => normalize(p.nombre) === normalize(canonical));
    if (candidates.length !== 1) issues.push(candidates.length ? "Hay varias partidas coincidentes; selecciona la existente." : "La partida no existe en el presupuesto del proyecto.");
    const partida = candidates[0];
    const schedule = mappedSchedule ?? schedules.find((s) => s.partida_id === partida?._id);
    const canonicalName = partida?.nombre ?? canonical;
    const key = `${row.nivel}|${normalize(canonicalName)}|${normalize(row.familia ?? "")}|${normalize(row.subpartida ?? "")}`;
    if (seen.has(key)) issues.push("La fila está duplicada en el archivo."); seen.add(key);
    let possible = details.filter((d) => d.nivel === row.nivel && d.programa_obra_id === schedule?._id && normalize(d.familia) === normalize(row.familia ?? "") && normalize(d.subpartida ?? "") === normalize(row.subpartida ?? "") && !d.archived);
    if (row.detalle_id) {
      possible = details.filter((d) => d._id === row.detalle_id && d.programa_obra_id === schedule?._id && d.nivel === row.nivel && !d.archived);
      if (!possible.length) issues.push("La familia seleccionada no pertenece a esta partida o nivel.");
    }
    if (possible.length > 1) issues.push("Hay varias familias coincidentes; selecciona la existente.");
    const detail = possible.length === 1 ? possible[0] : undefined;
    const existingId = row.nivel === 1 ? schedule?._id : detail?._id;
    if (existingId) { if (matchedIds.has(existingId)) issues.push("Dos filas apuntan al mismo registro existente."); matchedIds.add(existingId); }
    for (const value of [row.fecha_inicio, row.fecha_fin, row.anticipo_fecha, row.suministro_fecha, row.finiquito_fecha]) if (value && !programDate(value)) issues.push(`Fecha inválida: ${value}.`);
    if (row.fecha_inicio && row.fecha_fin && programDate(row.fecha_inicio)! > programDate(row.fecha_fin)!) issues.push("El fin es anterior al inicio.");
    for (const value of [row.peso, row.anticipo_porcentaje, row.finiquito_porcentaje]) if (value != null) { try { validateProgress(value); } catch { issues.push("Los porcentajes deben estar entre 0 y 100."); } }
    return { index, name: row.nivel === 1 ? row.partida : `${row.partida} / ${row.familia}${row.subpartida ? ` / ${row.subpartida}` : ""}`, canonicalName, existingId, status: issues.length ? "invalid" as const : existingId ? "update" as const : "create" as const, issues };
  });
  const edits: ProgramDateEdit[] = [], warnings: string[] = [];
  for (const match of result) {
    if (match.status !== "update" || rows[match.index].nivel !== 2) continue;
    const row = rows[match.index], leaves = context.activities.filter((a) => a.detalle_id === match.existingId && !a.archived);
    if (leaves.length > 1) { warnings.push(`${match.name}: se conservarán las fechas y el avance de cada frente.`); continue; }
    const a = leaves[0]; if (!a || a.progress === 100) continue;
    const start = programDate(row.fecha_inicio), finish = programDate(row.fecha_fin);
    if ((!start || start === a.current_start) && (!finish || finish === a.current_finish)) continue;
    edits.push(a.progress > 0 || a.actual_start ? { activity_id: a._id, forecast_finish: finish } : { activity_id: a._id, start, finish });
  }
  const proposal = edits.length ? proposeProgramDates(context.activities, context.dependencies, edits, context.calendar) : null;
  return { fingerprint, version: context.config?.version ?? 0, rows: result, warnings, proposal,
    absent: [...schedules.filter((s) => s.orden != null && !s.archived && !matchedIds.has(s._id)).map((s) => ({ id: s._id, name: partidas.find((p) => p._id === s.partida_id)?.nombre ?? "Partida", type: "partida" as const })), ...details.filter((d) => d.orden != null && !d.archived && !matchedIds.has(d._id)).map((d) => ({ id: d._id, name: `${d.partida} / ${d.familia}`, type: "familia" as const }))],
    canApply: result.every((r) => r.status !== "invalid") && !proposal?.problems.length,
  };
}
