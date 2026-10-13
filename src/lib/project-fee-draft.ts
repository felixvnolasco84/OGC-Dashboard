import type { Doc } from "../../convex/_generated/dataModel";
import type { FeeProposal } from "../../convex/projectFeeImpact";

export type ProjectDraft = {
  nombre: string; descripcion: string; status: string; ubicacion?: string;
  honorariosPorcentaje: string; indirectosPorcentaje: string;
  honorariosModo: "automatico" | "transacciones";
  excludedPartidas: NonNullable<Doc<"desarrollos">["excluded_partidas_honorarios"]>;
};
export const editableProjectFields = ["nombre", "descripcion", "status", "ubicacion"] as const;
const idsKey = (ids: readonly string[]) => JSON.stringify([...new Set(ids)].sort());

export function projectDraftPatch(baseline: Doc<"desarrollos">, draft: ProjectDraft) {
  const financial: FeeProposal = {};
  const invalid = [draft.honorariosPorcentaje, draft.indirectosPorcentaje].some(value => value !== "" &&
    (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) ||
    (baseline.indirectos_porcentaje !== undefined && draft.indirectosPorcentaje === "");
  const honorarios = draft.honorariosPorcentaje === "" ? 0 : Number(draft.honorariosPorcentaje);
  if (honorarios !== (baseline.honorarios_porcentaje ?? 0)) financial.honorarios_porcentaje = honorarios;
  const indirectos = draft.indirectosPorcentaje === "" ? undefined : Number(draft.indirectosPorcentaje);
  if (indirectos !== baseline.indirectos_porcentaje) financial.indirectos_porcentaje = indirectos;
  if (draft.honorariosModo !== (baseline.honorarios_modo || "automatico")) financial.honorarios_modo = draft.honorariosModo;
  if (idsKey(draft.excludedPartidas) !== idsKey(baseline.excluded_partidas_honorarios || [])) {
    financial.excluded_partidas_honorarios = [...new Set(draft.excludedPartidas)].sort();
  }
  const fields: { nombre?: string; descripcion?: string; status?: string; ubicacion?: string | null } = {};
  const expectedFields: Partial<Record<typeof editableProjectFields[number], string | null>> = {};
  for (const key of editableProjectFields) {
    const original = baseline[key] ?? (key === "status" ? "Activo" : key === "ubicacion" ? null : "");
    const proposed = draft[key] ?? null;
    if (proposed !== original) {
      if (key === "ubicacion") fields[key] = proposed;
      else fields[key] = draft[key];
      expectedFields[key] = baseline[key] ?? null;
    }
  }
  return { financial, fields, expectedFields, invalid, financialChanged: Object.keys(financial).length > 0,
    changed: Object.keys(financial).length + Object.keys(fields).length > 0 };
}
