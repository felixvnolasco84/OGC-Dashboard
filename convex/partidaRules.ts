import type { Doc } from "./_generated/dataModel";

export const partidaEditSource = (p: Doc<"partidas">) => JSON.stringify([
  p._id, p.proyecto, p.nivel, p.nombre, p.partida_nombre, p.familia, p.sub_partida,
  p.unidad, p.cantidad, p.precio_unitario, p.presupuesto_original, p.presupuesto_aprobado, p.pagado, p.por_gastar,
]);

export function cleanHierarchyText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Keep this aligned with the transaction import matcher so a name that would
// still be ambiguous during import is also considered a duplicate here.
export function normalizeHierarchyText(value: unknown) {
  return cleanHierarchyText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
