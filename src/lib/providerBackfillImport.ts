import {
  normalizeLaborImportText,
  parseLaborImportDate,
} from "./laborPaymentImport.ts";

export const PROVIDER_BACKFILL_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const PROVIDER_BACKFILL_MAX_ROWS = 5_000;
export const PROVIDER_BACKFILL_PREVIEW_BATCH_SIZE = 500;
export const PROVIDER_BACKFILL_SYNC_BATCH_SIZE = 100;
export const PROVIDER_BACKFILL_PREVIEW_ROW_LIMIT = 250;
const PROVIDER_BACKFILL_MAX_VALIDATION_ISSUES = 100;

const REQUIRED_HEADERS = [
  "administracion",
  "monto",
  "fecha",
  "proveedor",
  "factura",
  "tipo_pago",
  "moneda",
] as const;

type HeaderKey = (typeof REQUIRED_HEADERS)[number];

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  administracion: ["ADMINISTRACION", "PROYECTO"],
  monto: ["MONTO", "MONTO TOTAL"],
  fecha: ["FECHA"],
  proveedor: ["PROVEEDOR", "NOMBRE PROVEEDOR"],
  factura: ["FACTURA", "DOCUMENTO", "COMPROBANTE"],
  tipo_pago: ["TIPO DE PAGO", "TIPO PAGO", "FORMA DE PAGO"],
  moneda: ["MONEDA"],
};

const POSITIONAL_HEADERS = new Map<HeaderKey, number>([
  ["administracion", 0],
  ["monto", 4],
  ["fecha", 5],
  ["proveedor", 6],
  ["factura", 7],
  ["tipo_pago", 9],
  ["moneda", 10],
]);

export type ProviderBackfillCandidate = {
  source_key: string;
  project_name: string;
  amount_total: number;
  date: string;
  provider_name: string;
  invoice: string;
  payment_type: string;
  currency: string;
  source_rows: number[];
};

export type ProviderBackfillParseResult = {
  sheetName: string;
  rowCount: number;
  transactionCount: number;
  providerCount: number;
  candidates: ProviderBackfillCandidate[];
};

type ParsedRow = {
  sourceRow: number;
  projectName: string;
  amount: number;
  date: string;
  providerName: string;
  invoice: string;
  paymentType: string;
  currency: string;
};

export class ProviderBackfillImportValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] || "El archivo no es válido para actualizar proveedores.");
    this.name = "ProviderBackfillImportValidationError";
    this.issues = issues;
  }
}

export function chunkProviderBackfillCandidates<
  TCandidate extends ProviderBackfillCandidate,
>(candidates: readonly TCandidate[], batchSize: number): TCandidate[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("El tamaño de lote debe ser un entero mayor que cero.");
  }
  const batches: TCandidate[][] = [];
  for (let index = 0; index < candidates.length; index += batchSize) {
    batches.push(candidates.slice(index, index + batchSize));
  }
  return batches;
}

function normalizeHeader(value: unknown) {
  return normalizeLaborImportText(value);
}

function headerKey(value: unknown): HeaderKey | null {
  const normalized = normalizeHeader(value);
  for (const key of REQUIRED_HEADERS) {
    if (HEADER_ALIASES[key].includes(normalized)) return key;
  }
  return null;
}

function buildHeaderMap(row: unknown[]) {
  const result = new Map<HeaderKey, number>();
  row.forEach((value, index) => {
    const key = headerKey(value);
    if (key && !result.has(key)) result.set(key, index);
  });
  return result;
}

function hasAllHeaders(headers: ReadonlyMap<HeaderKey, number>) {
  return REQUIRED_HEADERS.every((header) => headers.has(header));
}

function readCell(row: unknown[], headers: ReadonlyMap<HeaderKey, number>, key: HeaderKey) {
  const index = headers.get(key);
  return index === undefined ? undefined : row[index];
}

function isEmptyRow(row: unknown[]) {
  return row.every((value) => value === null || value === undefined || String(value).trim() === "");
}

export function parseProviderBackfillMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimalDigits = cleaned.length - lastComma - 1;
    normalized = decimalDigits > 0 && decimalDigits <= 2
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function displayDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function transactionIdentity(row: ParsedRow) {
  return [
    normalizeLaborImportText(row.projectName),
    row.date,
    normalizeLaborImportText(row.invoice),
    normalizeLaborImportText(row.paymentType),
    row.currency,
  ].join("|");
}

function looksLikePositionalData(row: unknown[]) {
  return row.length >= 11 &&
    Boolean(String(row[0] ?? "").trim()) &&
    parseProviderBackfillMoney(row[4]) !== null &&
    parseLaborImportDate(row[5]) !== null &&
    Boolean(String(row[6] ?? "").trim()) &&
    Boolean(String(row[7] ?? "").trim());
}

export function parseProviderBackfillRows(
  rows: unknown[][],
  sheetName = "CARGA",
): ProviderBackfillParseResult {
  if (!rows.length) throw new ProviderBackfillImportValidationError(["La hoja está vacía."]);

  const headerRowIndex = rows.slice(0, 10).findIndex((row) => hasAllHeaders(buildHeaderMap(row)));
  const positional = headerRowIndex < 0 && looksLikePositionalData(rows.find((row) => !isEmptyRow(row)) || []);
  if (headerRowIndex < 0 && !positional) {
    throw new ProviderBackfillImportValidationError([
      "No se encontraron las columnas ADMINISTRACIÓN, MONTO, FECHA, PROVEEDOR, FACTURA, TIPO DE PAGO y MONEDA.",
    ]);
  }

  const headers = positional ? POSITIONAL_HEADERS : buildHeaderMap(rows[headerRowIndex]);
  const firstDataIndex = positional ? 0 : headerRowIndex + 1;
  const dataRows = rows.slice(firstDataIndex).filter((row) => !isEmptyRow(row));
  if (!dataRows.length) {
    throw new ProviderBackfillImportValidationError(["La hoja no contiene filas de transacciones."]);
  }
  if (dataRows.length > PROVIDER_BACKFILL_MAX_ROWS) {
    throw new ProviderBackfillImportValidationError([
      `El archivo contiene ${dataRows.length} filas; el máximo es ${PROVIDER_BACKFILL_MAX_ROWS}.`,
    ]);
  }

  const errors: string[] = [];
  let omittedErrorCount = 0;
  const addError = (message: string) => {
    if (errors.length < PROVIDER_BACKFILL_MAX_VALIDATION_ISSUES) errors.push(message);
    else omittedErrorCount += 1;
  };
  const parsedRows: ParsedRow[] = [];
  dataRows.forEach((row, index) => {
    const sourceRow = firstDataIndex + index + 1;
    const projectName = String(readCell(row, headers, "administracion") ?? "").trim();
    const providerName = String(readCell(row, headers, "proveedor") ?? "").trim();
    const invoice = String(readCell(row, headers, "factura") ?? "").trim();
    const paymentType = String(readCell(row, headers, "tipo_pago") ?? "").trim();
    const currency = normalizeLaborImportText(readCell(row, headers, "moneda"));
    const amount = parseProviderBackfillMoney(readCell(row, headers, "monto"));
    const isoDate = parseLaborImportDate(readCell(row, headers, "fecha"));

    if (!projectName) addError(`Fila ${sourceRow}: ADMINISTRACIÓN es obligatoria.`);
    if (!providerName) addError(`Fila ${sourceRow}: PROVEEDOR es obligatorio.`);
    if (!invoice) addError(`Fila ${sourceRow}: FACTURA es obligatoria.`);
    if (!paymentType) addError(`Fila ${sourceRow}: TIPO DE PAGO es obligatorio.`);
    if (!currency) addError(`Fila ${sourceRow}: MONEDA es obligatoria.`);
    if (amount === null || amount <= 0) addError(`Fila ${sourceRow}: MONTO debe ser mayor que cero.`);
    if (!isoDate) addError(`Fila ${sourceRow}: FECHA no es válida.`);

    if (projectName && providerName && invoice && paymentType && currency && amount !== null && amount > 0 && isoDate) {
      parsedRows.push({
        sourceRow,
        projectName,
        amount: roundMoney(amount),
        date: displayDate(isoDate),
        providerName,
        invoice,
        paymentType,
        currency,
      });
    }
  });

  const groupedRows = new Map<string, ParsedRow[]>();
  for (const row of parsedRows) {
    const key = transactionIdentity(row);
    groupedRows.set(key, [...(groupedRows.get(key) || []), row]);
  }

  const candidates: ProviderBackfillCandidate[] = [];
  for (const [identity, transactionRows] of groupedRows) {
    const providers = new Map(
      transactionRows.map((row) => [normalizeLaborImportText(row.providerName), row.providerName]),
    );
    if (providers.size > 1) {
      addError(
        `Las filas ${transactionRows.map((row) => row.sourceRow).join(", ")} de la factura ${transactionRows[0].invoice} contienen proveedores distintos.`,
      );
      continue;
    }
    const first = transactionRows[0];
    const amountTotal = roundMoney(transactionRows.reduce((sum, row) => sum + row.amount, 0));
    candidates.push({
      source_key: `${identity}|${Math.round(amountTotal * 100)}`,
      project_name: first.projectName,
      amount_total: amountTotal,
      date: first.date,
      provider_name: first.providerName,
      invoice: first.invoice,
      payment_type: first.paymentType,
      currency: first.currency,
      source_rows: transactionRows.map((row) => row.sourceRow),
    });
  }

  if (errors.length) {
    const uniqueErrors = [...new Set(errors)];
    if (omittedErrorCount > 0) {
      uniqueErrors.push(`Se omitieron ${omittedErrorCount} errores adicionales del archivo.`);
    }
    throw new ProviderBackfillImportValidationError(uniqueErrors);
  }

  candidates.sort((left, right) =>
    left.project_name.localeCompare(right.project_name, "es") ||
    left.date.localeCompare(right.date) ||
    left.invoice.localeCompare(right.invoice, "es")
  );
  return {
    sheetName,
    rowCount: parsedRows.length,
    transactionCount: candidates.length,
    providerCount: new Set(candidates.map((candidate) => normalizeLaborImportText(candidate.provider_name))).size,
    candidates,
  };
}

export async function parseProviderBackfillWorkbook(file: File) {
  if (file.size > PROVIDER_BACKFILL_MAX_FILE_SIZE) {
    throw new ProviderBackfillImportValidationError(["El archivo excede el tamaño máximo de 10 MB."]);
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const candidates: Array<{ sheetName: string; rows: unknown[][] }> = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    const headerFound = rows.slice(0, 10).some((row) => hasAllHeaders(buildHeaderMap(row)));
    const firstDataRow = rows.find((row) => !isEmptyRow(row));
    if (headerFound || (firstDataRow && looksLikePositionalData(firstDataRow))) {
      candidates.push({ sheetName, rows });
    }
  }
  const named = candidates.find((candidate) => normalizeLaborImportText(candidate.sheetName) === "CARGA");
  const selected = named || (candidates.length === 1 ? candidates[0] : null);
  if (!selected) {
    throw new ProviderBackfillImportValidationError([
      candidates.length > 1
        ? "Hay varias hojas compatibles; renombra la hoja que deseas usar como CARGA."
        : "No se encontró una hoja compatible con el formato de transacciones.",
    ]);
  }
  return parseProviderBackfillRows(selected.rows, selected.sheetName);
}
