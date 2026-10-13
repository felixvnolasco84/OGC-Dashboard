import type { Doc } from "../../convex/_generated/dataModel";
import type { PartidaEditChanges } from "../../convex/partidaEdit";
import { cleanHierarchyText } from "../../convex/partidaRules";

export const partidaEditValues = (p: Doc<"partidas">) => ({
  sub_partida: p.sub_partida, unidad: p.unidad, cantidad: p.cantidad,
  precio_unitario: p.precio_unitario, presupuesto_aprobado: p.presupuesto_aprobado,
});
export type PartidaEditValues = ReturnType<typeof partidaEditValues>;

export function partidaEditDraft(base: Doc<"partidas">, values: PartidaEditValues): PartidaEditChanges {
  const fields = base.nivel === 3 ? Object.keys(values) as (keyof PartidaEditValues)[] : ["presupuesto_aprobado"] as const;
  const changes: PartidaEditChanges = {};
  for (const field of fields) {
    const value = field === "sub_partida" ? cleanHierarchyText(values[field]) : values[field];
    const before = field === "sub_partida" ? cleanHierarchyText(base[field]) : base[field];
    if (value !== before) Object.assign(changes, { [field]: value });
  }
  return changes;
}

// Keep edited fields; refresh untouched fields from the current document.
export function rebasePartidaEdit(base: Doc<"partidas">, current: Doc<"partidas">, values: PartidaEditValues) {
  return { ...partidaEditValues(current), ...partidaEditDraft(base, values) };
}
