// Shared by the browser review and the server's processing of the stored original.
export const PROJECTION_MAX_BYTES = 10 * 1024 * 1024;
export const PROJECTION_TIMEOUT = 30 * 60 * 1000;
export const PROJECTION_MAX_CELLS = 5000;
export const PROJECTION_READER = "https://ogc-excel-reader.vercel.app/upload/";

export type ProjectionFormat = "projections" | "flujo";
export type ProjectionReviewRow = {
  partida: string; rowIndex?: number; total?: number; calculatedTotal?: number; declaredTotal?: number; projectionCount?: number;
  weeklyProjections: Array<{ week: number; amount: number; position: number; columnLetter?: string }>;
};
export type ProjectionReview = { sheet_name?: string; rows: ProjectionReviewRow[] };

export function projectionFileError(file: { name: string; size: number }) {
  return !/\.(xlsx|xls)$/i.test(file.name) || file.name.length > 255 || file.size <= 0 || file.size > PROJECTION_MAX_BYTES
    ? "Selecciona un Excel .xlsx o .xls de hasta 10 MB." : null;
}
export async function projectionHash(bytes: ArrayBuffer | Uint8Array) {
  const input = bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", input)), b => b.toString(16).padStart(2, "0")).join("");
}
export function projectionDate(serial: number) {
  return new Date((serial - 25569) * 86400000).toLocaleDateString("es-MX", { timeZone: "UTC" });
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Respuesta del lector de Excel inválida.");
  return input as Record<string, unknown>;
}
function number(input: unknown, label: string, integer = false): number {
  if (typeof input !== "number" || !Number.isFinite(input) || (integer && !Number.isInteger(input))) throw new Error(`${label} inválido en el Excel.`);
  return input;
}
function week(input: unknown) {
  const value = number(input, "Período", true);
  if (value < 1 || value > 2958465) throw new Error("Período inválido en el Excel.");
  return value;
}
export function normalizeProjectionResponse(input: unknown, format: ProjectionFormat): ProjectionReview {
  const data = object(input);
  if (data.success !== true) throw new Error(typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "El lector no pudo procesar el Excel.");
  // The reader can return success together with row errors: never silently import a subset.
  if (Array.isArray(data.errors) && data.errors.length) throw new Error("El lector reportó errores en el Excel. Corrige las filas antes de confirmar.");
  const headers = Array.isArray(data.weekHeaders) ? data.weekHeaders.map(object) : [];
  const inputRows = format === "flujo" ? data.flujos : data.projections;
  if (!Array.isArray(inputRows) || !inputRows.length || inputRows.length > 1000) throw new Error("El Excel debe contener entre 1 y 1000 partidas con períodos válidos.");
  const rows = inputRows.map(inputRow => {
    const row = object(inputRow);
    const label = format === "flujo" ? row.label : row.partida;
    if (typeof label !== "string" || !label.trim() || label.length > 500) throw new Error("Hay una partida sin nombre válido.");
    const values = format === "flujo" ? row.weeklyAmounts : row.weeklyProjections;
    if (!Array.isArray(values)) throw new Error(`Faltan los períodos de ${label}.`);
    const result: ProjectionReviewRow = { partida: label, weeklyProjections: values.map(value => {
      const cell = object(value);
      const position = number(cell.position, "Posición", true);
      if (position < 0 || position > 1000) throw new Error("Posición de período inválida.");
      // Prefer the raw Excel serial. /projections has also returned formatted date strings.
      const candidates = headers.filter(h => h.position === position && (cell.columnLetter === undefined || h.columnLetter === cell.columnLetter));
      const raw = typeof cell.week === "number" ? cell.week : candidates.length === 1 ? candidates[0].weekDateRaw : undefined;
      const output: ProjectionReviewRow["weeklyProjections"][number] = { week: week(raw), amount: number(cell.amount, "Importe"), position };
      if (cell.columnLetter !== undefined) {
        if (typeof cell.columnLetter !== "string" || !/^[A-Z]{1,3}$/.test(cell.columnLetter)) throw new Error("Columna de origen inválida.");
        output.columnLetter = cell.columnLetter;
      }
      return output;
    }) };
    for (const key of ["total", "calculatedTotal", "declaredTotal", "rowIndex", "projectionCount"] as const) {
      if (row[key] !== undefined) result[key] = number(row[key], key, key === "rowIndex" || key === "projectionCount");
    }
    if (result.rowIndex !== undefined && result.rowIndex < 1) throw new Error("Fila de origen inválida.");
    return result;
  });
  const cells = rows.reduce((sum, row) => sum + row.weeklyProjections.length, 0);
  if (!cells || cells > PROJECTION_MAX_CELLS) throw new Error(`El Excel debe contener entre 1 y ${PROJECTION_MAX_CELLS} proyecciones semanales. Esta carga no se puede aplicar.`);
  const review: ProjectionReview = { rows };
  if (typeof data.sheetName === "string" && data.sheetName.trim()) review.sheet_name = data.sheetName.slice(0, 255);
  return review;
}
export async function projectionReviewHash(review: ProjectionReview) {
  // Convex canonicalizes object keys during argument serialization. Hash values,
  // not insertion order, so browser reviews survive the server round trip.
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
    return value;
  }
  return projectionHash(new TextEncoder().encode(JSON.stringify(canonical(review))));
}
export function projectionSummary(rows: ProjectionReviewRow[]) {
  const cells = rows.flatMap(row => row.weeklyProjections);
  const weeks = [...new Set(cells.map(cell => cell.week))].sort((a, b) => a - b);
  const amount = cells.reduce((sum, cell) => sum + cell.amount, 0);
  if (!weeks.length || !Number.isFinite(amount)) throw new Error("El resumen de proyecciones no es válido.");
  return { rows: rows.length, cells: cells.length, weeks: weeks.length, amount, start_week: weeks[0], end_week: weeks[weeks.length - 1] };
}
export function projectionFinancialKey(rows: Array<{ partida: string; week_date: number; amount: number; position: number }>) {
  return JSON.stringify(rows.map(row => [row.partida, row.week_date, row.amount, row.position]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
