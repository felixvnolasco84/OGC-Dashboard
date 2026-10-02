export type OgcMovementType = "ingreso" | "costo_estructura" | "informativo";

const normalizeText = (value?: string) => (value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/\s+/g, " ");

const INFORMATION_CATEGORIES = new Set([
  "carga social obra (siroc-recuperable)",
  "flujo fiscal (iva + retenciones)",
]);

export const isDispHonorarios = (movement: { categoria?: string; descripcion?: string }) =>
  [movement.categoria, movement.descripcion].some(value =>
    /\b(?:disp\.?|dispersion)\s+(?:de\s+)?honorarios\b/.test(normalizeText(value)));

/** Explicit source categories take precedence over descriptions and legacy types. */
export function normalizeOgcClassification(movement: {
  tipo?: string;
  categoria?: string;
  descripcion?: string;
}): { tipo: OgcMovementType | null; categoria: string } {
  const categoria = movement.categoria?.trim().toUpperCase().replace(/\s+/g, " ") || "OTROS";
  if (INFORMATION_CATEGORIES.has(normalizeText(categoria))) return { tipo: "informativo", categoria };
  if (isDispHonorarios(movement)) return { tipo: "costo_estructura", categoria: "DISP HONORARIOS" };
  const tipo = normalizeText(movement.tipo).replace(/_/g, " ");
  if (["ingreso", "ingresos", "cobro"].includes(tipo)) return { tipo: "ingreso", categoria };
  if (["costo estructura", "costo", "gasto", "egreso"].includes(tipo)) return { tipo: "costo_estructura", categoria };
  if (tipo === "informativo") return { tipo: "informativo", categoria };
  return { tipo: null, categoria };
}

export const isOgcIncome = (movement: Parameters<typeof normalizeOgcClassification>[0]) =>
  normalizeOgcClassification(movement).tipo === "ingreso";

export const getOgcTypeLabel = (tipo: string) =>
  tipo === "ingreso" ? "Ingreso" : tipo === "informativo" ? "Informativo" : "Costo estructura";
