// Shared by the preview and the server. These deliberately preserve the existing
// income import normalization (including loose calendar dates and MXN fallback).
export const INCOME_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const INCOME_IMPORT_MAX_ROWS = 1000;
export const INCOME_IMPORT_MAX_REVIEW_BYTES = 512 * 1024;
export const INCOME_IMPORT_TIMEOUT = 30 * 60 * 1000;
export const INCOME_IMPORT_STORAGE_TYPE = "application/x-ogc-income-original";
export const incomeStorageType = (attemptId: string) => `${INCOME_IMPORT_STORAGE_TYPE};attempt=${encodeURIComponent(attemptId)}`;

export type IncomeReviewRow = {
  position: number; rowIndex?: number; raw_json: string;
  monto: number; fecha: string; descripcion: string; moneda: string;
  status: "valid" | "invalid"; errors: string[];
};
export type IncomeParserSummary = { totalRows: number; validRows: number; errors: number; totalAmount: number };

export function incomeFileError(file: { name: string; size: number }): string | null {
  if (!/\.(xlsx|xls|xlsm)$/i.test(file.name) || file.name.length > 255) return "Selecciona un Excel .xlsx, .xls o .xlsm con nombre de hasta 255 caracteres.";
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > INCOME_IMPORT_MAX_BYTES) return "El Excel debe tener contenido y pesar hasta 10 MB.";
  return null;
}

export function parseIncomeReview(json: string): { rows: IncomeReviewRow[]; parserSummary?: IncomeParserSummary } {
  if (new TextEncoder().encode(json).byteLength > INCOME_IMPORT_MAX_REVIEW_BYTES) throw new Error("La vista previa supera 512 KiB. Divide el archivo antes de cargarlo.");
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.ingresos)) throw new Error("Respuesta inválida del servicio de lectura de Excel.");
  if (data.ingresos.length > INCOME_IMPORT_MAX_ROWS) throw new Error("La carga admite hasta 1,000 registros devueltos por el lector. Divide el archivo.");
  const rows: IncomeReviewRow[] = data.ingresos.map((item: Record<string, unknown>, index: number) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("El lector devolvió un registro inválido.");
    const errors: string[] = [];
    const amount = typeof item.monto === "number" ? item.monto : Number(item.monto);
    if (!Number.isFinite(amount) || amount <= 0) errors.push("Monto inválido");
    const rawDate = typeof item.fecha === "string" ? item.fecha.trim() : "";
    let fecha = rawDate;
    if (!rawDate) errors.push("Fecha faltante");
    else {
      const match = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match || +match[1] < 1 || +match[1] > 31 || +match[2] < 1 || +match[2] > 12) errors.push("Fecha con formato inválido (DD/MM/YYYY)");
      else fecha = `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`;
    }
    let moneda = (typeof item.moneda === "string" ? item.moneda : "MXN").trim().toUpperCase();
    if (!["MXN", "USD", "EUR"].includes(moneda)) moneda = "MXN";
    return {
      position: index + 1,
      ...(Number.isInteger(item.rowIndex) && Number(item.rowIndex) > 0 ? { rowIndex: Number(item.rowIndex) } : {}),
      raw_json: JSON.stringify(item), monto: Number.isFinite(amount) ? amount : 0, fecha,
      descripcion: typeof item.descripcion === "string" ? item.descripcion.trim() : "", moneda,
      status: errors.length ? "invalid" : "valid", errors,
    };
  });
  const summary = data.summary;
  const parserSummary = summary && ["totalRows", "validRows", "errors", "totalAmount"].every(key => typeof summary[key] === "number" && Number.isFinite(summary[key]))
    ? { totalRows: summary.totalRows, validRows: summary.validRows, errors: summary.errors, totalAmount: summary.totalAmount } : undefined;
  // Raw and normalized values coexist in each snapshot. Reject an exceptional
  // single record before starting an attempt rather than exceeding a DB document.
  if (rows.some(row => new TextEncoder().encode(JSON.stringify(row)).byteLength > 768 * 1024)) throw new Error("Un registro del lector es demasiado extenso para conservar su evidencia. Divide el contenido antes de cargarlo.");
  return { rows, parserSummary };
}

export function incomeCurrencyTotals(rows: Array<{ monto: number; moneda: string }>) {
  return ["MXN", "USD", "EUR"].filter(moneda => rows.some(row => row.moneda === moneda))
    .map(moneda => ({ moneda, monto: rows.filter(row => row.moneda === moneda).reduce((sum, row) => sum + row.monto, 0) }));
}
