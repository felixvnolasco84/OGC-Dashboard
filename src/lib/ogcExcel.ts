import { normalizeOgcClassification } from "../../convex/ogcClassificationRules";
import type { OgcMovementType } from "../../convex/ogcClassificationRules";

const headerKey = (value: unknown) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, "_");

export async function parseOgcExcel(buffer: ArrayBuffer) {
  const { read, utils, SSF } = await import("xlsx");
  const workbook = read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("El Excel no contiene hojas.");
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true, range: 0 });
  const headers = (rows[0] || []).map(headerKey);
  for (const header of ["TIPO", "CATEGORIA", "MONTO", "FECHA"]) {
    if (!headers.includes(header)) throw new Error(`Falta la columna ${header}.`);
  }
  const errors: Array<{ row: number; error: string }> = [];
  const movimientos: Array<{
    rowIndex: number; tipo: OgcMovementType; categoria: string; monto: number;
    fecha: string; proyecto_nombre?: string; descripcion?: string; moneda: string;
    tipo_cambio?: number; factura_referencia?: string;
  }> = [];
  rows.slice(1).forEach((row, index) => {
    if (row.every(value => value == null || value === "")) return;
    const cell = (...names: string[]) => {
      const column = headers.findIndex(header => names.includes(header));
      return column < 0 ? undefined : row[column];
    };
    const text = (...names: string[]) => String(cell(...names) ?? "").trim();
    const rowIndex = index + 2;
    const descripcion = text("DESCRIPCION");
    const classification = normalizeOgcClassification({ tipo: text("TIPO"), categoria: text("CATEGORIA"), descripcion });
    if (!classification.tipo) {
      errors.push({ row: rowIndex, error: `Tipo de movimiento no reconocido: ${text("TIPO")}` });
      return;
    }
    const rawDate = cell("FECHA");
    const date = typeof rawDate === "number" ? SSF.parse_date_code(rawDate) : null;
    const fecha = date
      ? `${String(date.d).padStart(2, "0")}/${String(date.m).padStart(2, "0")}/${date.y}`
      : String(rawDate ?? "").trim();
    const rawAmount = cell("MONTO");
    // Excel currency cells are numeric. Do not guess decimal separators in text cells.
    const monto = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
    movimientos.push({
      rowIndex, tipo: classification.tipo, categoria: classification.categoria, monto,
      fecha, descripcion: descripcion || undefined, proyecto_nombre: text("OBRA", "PROYECTO") || undefined,
      moneda: text("MONEDA") || "MXN",
      tipo_cambio: Number(cell("TIPO_CAMBIO", "TIPO_DE_CAMBIO")) || undefined,
      factura_referencia: text("FACTURA_REFERENCIA", "FACTURA", "FOLIO") || undefined,
    });
  });
  return { success: movimientos.length > 0, movimientos, errors };
}
