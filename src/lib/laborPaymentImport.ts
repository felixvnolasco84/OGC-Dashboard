import { classifyProjectMatch } from "../../convex/projectMatchUtils.ts";

export const LABOR_IMPORT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const LABOR_IMPORT_MAX_ROWS = 1_000;

const REQUIRED_HEADERS = [
  "administracion",
  "partida",
  "familia",
  "subpartida",
  "monto",
  "fecha",
  "proveedor",
  "factura",
  "categoria",
  "tipo_pago",
  "moneda",
  "numero_personas",
] as const;

type HeaderKey = (typeof REQUIRED_HEADERS)[number];

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  administracion: ["ADMINISTRACION"],
  partida: ["PARTIDA"],
  familia: ["FAMILIA"],
  subpartida: ["SUBPARTIDA", "SUB PARTIDA"],
  monto: ["MONTO"],
  fecha: ["FECHA"],
  proveedor: ["PROVEEDOR"],
  factura: ["FACTURA"],
  categoria: ["CATEGORIA"],
  tipo_pago: ["TIPO DE PAGO", "TIPO PAGO"],
  moneda: ["MONEDA"],
  numero_personas: [
    "NO PERSONAS",
    "NO DE PERSONAS",
    "NUM PERSONAS",
    "NUMERO PERSONAS",
    "NUMERO DE PERSONAS",
  ],
};

export type LaborImportPartida = {
  _id: string;
  nivel?: number;
  nombre: string;
  familia: string;
  sub_partida: string;
};

export type LaborPaymentLineItem = {
  partida_id: string;
  partida: string;
  familia: string;
  sub_partida: string;
  monto: number;
  numero_personas_origen?: number;
  source_row: number;
};

export type LaborPaymentTransaction = {
  source_key: string;
  fecha: string;
  monto_total: number;
  tipo_pago: string;
  moneda: string;
  tipo_cambio: string;
  status: "Pagado";
  categoria: string;
  factura: string;
  proveedor: string;
  line_items: LaborPaymentLineItem[];
};

export type LaborPaymentRole = {
  key: string;
  label: string;
  count: number;
};

export type LaborPaymentWeek = {
  date: string;
  total_people: number;
  roles: LaborPaymentRole[];
  row_count: number;
  amount_total: number;
  warnings: string[];
  transactions: LaborPaymentTransaction[];
};

export type LaborPaymentParseResult = {
  sheetName: string;
  administration: string;
  projectMatchMode?: "exact" | "normalized" | "alias";
  currency: string;
  rowCount: number;
  amountTotal: number;
  warnings: string[];
  weeks: LaborPaymentWeek[];
};

type ParsedSourceRow = {
  sourceRow: number;
  administration: string;
  partida: string;
  familia: string;
  subpartida: string;
  monto: number;
  date: string;
  proveedor: string;
  factura: string;
  categoria: string;
  tipoPago: string;
  moneda: string;
  numeroPersonas?: number;
  partidaId: string;
};

export class LaborPaymentImportValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] || "El archivo contiene datos inválidos.");
    this.name = "LaborPaymentImportValidationError";
    this.issues = issues;
  }
}

export function normalizeLaborImportText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeLaborImportText(value);
}

function headerKey(value: unknown): HeaderKey | null {
  const normalized = normalizeHeader(value);
  for (const key of REQUIRED_HEADERS) {
    if (HEADER_ALIASES[key].includes(normalized)) return key;
  }
  return null;
}

function buildHeaderMap(row: unknown[]): Map<HeaderKey, number> {
  const result = new Map<HeaderKey, number>();
  row.forEach((value, index) => {
    const key = headerKey(value);
    if (key && !result.has(key)) result.set(key, index);
  });
  return result;
}

function hasAllHeaders(map: Map<HeaderKey, number>) {
  return REQUIRED_HEADERS.every((key) => map.has(key));
}

function readCell(row: unknown[], headers: Map<HeaderKey, number>, key: HeaderKey) {
  const index = headers.get(key);
  return index === undefined ? undefined : row[index];
}

function parseNumber(value: unknown): number | null {
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

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

export function parseLaborImportDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return validIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const milliseconds = Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (match) return validIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

function isEmptyRow(row: unknown[]) {
  return row.every((value) => value === null || value === undefined || String(value).trim() === "");
}

function partidaKey(partida: string, familia: string, subpartida: string) {
  return [partida, familia, subpartida].map(normalizeLaborImportText).join("|");
}

function partidaFamilyKey(partida: string, familia: string) {
  return [partida, familia].map(normalizeLaborImportText).join("|");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function stringifyRow(row: ParsedSourceRow) {
  return JSON.stringify({
    administration: normalizeLaborImportText(row.administration),
    partida: normalizeLaborImportText(row.partida),
    familia: normalizeLaborImportText(row.familia),
    subpartida: normalizeLaborImportText(row.subpartida),
    monto: roundMoney(row.monto),
    date: row.date,
    proveedor: normalizeLaborImportText(row.proveedor),
    factura: normalizeLaborImportText(row.factura),
    categoria: normalizeLaborImportText(row.categoria),
    tipoPago: normalizeLaborImportText(row.tipoPago),
    moneda: row.moneda,
    numeroPersonas: row.numeroPersonas ?? null,
  });
}

function transactionKey(row: ParsedSourceRow) {
  return [
    row.date,
    normalizeLaborImportText(row.factura),
    normalizeLaborImportText(row.tipoPago),
    row.moneda,
    normalizeLaborImportText(row.proveedor),
  ].join("|");
}

export function parseLaborPaymentRows(
  rows: unknown[][],
  options: {
    projectName: string;
    projectCurrency?: string | null;
    partidas: LaborImportPartida[];
    sheetName?: string;
  },
): LaborPaymentParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rows.length) throw new LaborPaymentImportValidationError(["La hoja está vacía."]);
  const headers = buildHeaderMap(rows[0] || []);
  const missingHeaders = REQUIRED_HEADERS.filter((key) => !headers.has(key));
  if (missingHeaders.length) {
    throw new LaborPaymentImportValidationError([
      `Faltan columnas obligatorias: ${missingHeaders.join(", ")}.`,
    ]);
  }

  const dataRows = rows.slice(1).filter((row) => !isEmptyRow(row));
  if (!dataRows.length) throw new LaborPaymentImportValidationError(["La hoja no contiene filas de pago."]);
  if (dataRows.length > LABOR_IMPORT_MAX_ROWS) {
    throw new LaborPaymentImportValidationError([
      `El archivo contiene ${dataRows.length} filas; el máximo es ${LABOR_IMPORT_MAX_ROWS}.`,
    ]);
  }

  const partidaCandidates = new Map<string, LaborImportPartida[]>();
  const partidaFamilyCandidates = new Map<string, LaborImportPartida[]>();
  for (const partida of options.partidas) {
    const key = partidaKey(partida.nombre, partida.familia, partida.sub_partida);
    partidaCandidates.set(key, [...(partidaCandidates.get(key) || []), partida]);
    const familyKey = partidaFamilyKey(partida.nombre, partida.familia);
    partidaFamilyCandidates.set(
      familyKey,
      [...(partidaFamilyCandidates.get(familyKey) || []), partida],
    );
  }

  const parsedRows: ParsedSourceRow[] = [];
  dataRows.forEach((row, index) => {
    const sourceRow = index + 2;
    const administration = String(readCell(row, headers, "administracion") ?? "").trim();
    const partida = String(readCell(row, headers, "partida") ?? "").trim();
    const familia = String(readCell(row, headers, "familia") ?? "").trim();
    const subpartida = String(readCell(row, headers, "subpartida") ?? "").trim();
    const proveedor = String(readCell(row, headers, "proveedor") ?? "").trim();
    const factura = String(readCell(row, headers, "factura") ?? "").trim();
    const categoria = String(readCell(row, headers, "categoria") ?? "").trim();
    const tipoPago = String(readCell(row, headers, "tipo_pago") ?? "").trim();
    const moneda = normalizeLaborImportText(readCell(row, headers, "moneda"));
    const monto = parseNumber(readCell(row, headers, "monto"));
    const date = parseLaborImportDate(readCell(row, headers, "fecha"));
    const peopleValue = readCell(row, headers, "numero_personas");
    const numeroPersonas = parseNumber(peopleValue);

    // SUBPARTIDA is optional when the project catalog contains a family-level
    // partida (nivel 2) whose own sub_partida is empty. The exact catalog match
    // below determines whether an empty value is valid for this hierarchy.
    const requiredText = { administration, partida, familia, proveedor, factura, categoria, tipoPago, moneda };
    for (const [field, value] of Object.entries(requiredText)) {
      if (!value) errors.push(`Fila ${sourceRow}: ${field} es obligatorio.`);
    }
    if (monto === null || monto <= 0) errors.push(`Fila ${sourceRow}: MONTO debe ser mayor que cero.`);
    if (!date) errors.push(`Fila ${sourceRow}: FECHA no es válida.`);
    if (numeroPersonas !== null && (!Number.isInteger(numeroPersonas) || numeroPersonas < 0)) {
      errors.push(`Fila ${sourceRow}: NO. PERSONAS debe ser un entero no negativo.`);
    }

    const candidates = partidaCandidates.get(partidaKey(partida, familia, subpartida)) || [];
    if (!candidates.length) {
      const familyCandidates = partidaFamilyCandidates.get(partidaFamilyKey(partida, familia)) || [];
      const familyRequiresSubpartida = familyCandidates.some(
        (candidate) => normalizeLaborImportText(candidate.sub_partida) !== "",
      );
      if (!subpartida && familyRequiresSubpartida) {
        errors.push(`Fila ${sourceRow}: subpartida es obligatorio para ${partida} > ${familia}.`);
      } else {
        const hierarchy = [partida, familia, subpartida].filter(Boolean).join(" > ");
        errors.push(`Fila ${sourceRow}: no existe la partida ${hierarchy}.`);
      }
    } else if (candidates.length > 1) {
      errors.push(`Fila ${sourceRow}: la partida ${partida} > ${familia} > ${subpartida} es ambigua.`);
    }

    if (monto !== null && monto > 0 && date && candidates.length === 1) {
      parsedRows.push({
        sourceRow,
        administration,
        partida,
        familia,
        subpartida,
        monto: roundMoney(monto),
        date,
        proveedor,
        factura,
        categoria,
        tipoPago,
        moneda,
        numeroPersonas: numeroPersonas ?? undefined,
        partidaId: candidates[0]._id,
      });
    }
  });

  const administrationLabels = [...new Set(
    parsedRows.map((row) => row.administration.trim()).filter(Boolean),
  )];
  const projectCatalog = [{ _id: "current", nombre: options.projectName }];
  const administrationMatches = administrationLabels.map((label) => ({
    label,
    match: classifyProjectMatch(label, projectCatalog),
  }));
  const unmatchedAdministrations = administrationMatches.filter(
    (entry) => entry.match.status !== "matched",
  );
  if (unmatchedAdministrations.length) {
    errors.push(
      `La administración ${unmatchedAdministrations.map((entry) => entry.label).join(", ")} no coincide con el proyecto ${options.projectName}.`,
    );
  } else if (administrationLabels.length > 1) {
    warnings.push(
      `El archivo usa más de un nombre de administración (${administrationLabels.join(", ")}); todos se asociaron a ${options.projectName}.`,
    );
  }
  const projectMatchMode = administrationMatches.find((entry) => entry.match.mode)?.match.mode;

  const currencies = [...new Set(parsedRows.map((row) => row.moneda))];
  if (currencies.length > 1) errors.push("El archivo mezcla monedas; la carga de mano de obra requiere una sola moneda.");
  const projectCurrency = normalizeLaborImportText(options.projectCurrency);
  if (projectCurrency && currencies[0] && projectCurrency !== currencies[0]) {
    errors.push(`La moneda ${currencies[0]} no coincide con la moneda principal ${projectCurrency}.`);
  }

  const seenRows = new Map<string, number>();
  for (const row of parsedRows) {
    const key = stringifyRow(row);
    const firstRow = seenRows.get(key);
    if (firstRow) errors.push(`Las filas ${firstRow} y ${row.sourceRow} son duplicados exactos.`);
    else seenRows.set(key, row.sourceRow);
  }

  if (errors.length) throw new LaborPaymentImportValidationError([...new Set(errors)]);

  const rowsByDate = new Map<string, ParsedSourceRow[]>();
  for (const row of parsedRows) {
    rowsByDate.set(row.date, [...(rowsByDate.get(row.date) || []), row]);
  }

  const weeks: LaborPaymentWeek[] = [];
  for (const [date, weekRows] of [...rowsByDate.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const weekWarnings: string[] = [];
    const fasarRows = weekRows
      .filter((row) => normalizeLaborImportText(row.subpartida).includes("FASAR"));
    const summaryCounts = [...new Set(
      fasarRows
        .map((row) => row.numeroPersonas)
        .filter((value): value is number => value !== undefined),
    )];
    if (summaryCounts.length > 1) {
      errors.push(`${date}: las filas FASAR declaran totales de personas distintos.`);
    }
    if (fasarRows.length && summaryCounts.length === 0) {
      weekWarnings.push("La fila FASAR no declara NO. PERSONAS; el total se inferirá desde los puestos.");
    }

    const roleCounts = new Map<string, { label: string; counts: number[] }>();
    for (const row of weekRows) {
      if (normalizeLaborImportText(row.subpartida).includes("FASAR")) continue;
      if (row.numeroPersonas === undefined) {
        weekWarnings.push(`Fila ${row.sourceRow}: ${row.subpartida} no tiene NO. PERSONAS.`);
        continue;
      }
      // Zero means this payment concept has no associated workforce. It must not
      // create a zero-count role (or an empty role for family-only partidas).
      if (row.numeroPersonas === 0) continue;
      const label = row.subpartida || row.familia;
      const key = normalizeLaborImportText(label);
      const current = roleCounts.get(key) || { label, counts: [] };
      current.counts.push(row.numeroPersonas);
      roleCounts.set(key, current);
    }

    const roles: LaborPaymentRole[] = [...roleCounts.entries()].map(([key, role]) => {
      const uniqueCounts = [...new Set(role.counts)];
      if (uniqueCounts.length > 1) {
        weekWarnings.push(`${role.label}: hay conteos distintos; se usará el mayor para evitar duplicar pagos divididos.`);
      }
      return { key, label: role.label, count: Math.max(...role.counts) };
    });
    const explicitTotal = roles.reduce((sum, role) => sum + role.count, 0);
    let totalPeople: number;
    if (summaryCounts.length === 1) {
      totalPeople = summaryCounts[0];
      if (explicitTotal > totalPeople) {
        errors.push(`${date}: los puestos suman ${explicitTotal}, por encima del total FASAR de ${totalPeople}.`);
      } else if (explicitTotal < totalPeople) {
        roles.push({ key: "NO DESGLOSADO", label: "No desglosado", count: totalPeople - explicitTotal });
      }
    } else {
      totalPeople = explicitTotal;
      if (totalPeople > 0) {
        weekWarnings.push("No hay un total FASAR válido; el total se infirió desde los puestos deduplicados.");
      }
    }

    const groupedTransactions = new Map<string, ParsedSourceRow[]>();
    for (const row of weekRows) {
      const key = transactionKey(row);
      groupedTransactions.set(key, [...(groupedTransactions.get(key) || []), row]);
    }
    const transactions: LaborPaymentTransaction[] = [];
    for (const [sourceKey, transactionRows] of groupedTransactions) {
      const categories = [...new Set(transactionRows.map((row) => normalizeLaborImportText(row.categoria)))];
      if (categories.length > 1) {
        errors.push(`${date}: la factura ${transactionRows[0].factura} mezcla categorías.`);
        continue;
      }
      transactions.push({
        source_key: sourceKey,
        fecha: date,
        monto_total: roundMoney(transactionRows.reduce((sum, row) => sum + row.monto, 0)),
        tipo_pago: transactionRows[0].tipoPago,
        moneda: transactionRows[0].moneda,
        tipo_cambio: "1",
        status: "Pagado",
        categoria: transactionRows[0].categoria,
        factura: transactionRows[0].factura,
        proveedor: transactionRows[0].proveedor,
        line_items: transactionRows.map((row) => ({
          partida_id: row.partidaId,
          partida: row.partida,
          familia: row.familia,
          sub_partida: row.subpartida,
          monto: row.monto,
          numero_personas_origen: row.numeroPersonas,
          source_row: row.sourceRow,
        })),
      });
    }

    roles.sort((left, right) => {
      if (left.key === "NO DESGLOSADO") return 1;
      if (right.key === "NO DESGLOSADO") return -1;
      return right.count - left.count || left.label.localeCompare(right.label, "es");
    });
    const amountTotal = roundMoney(weekRows.reduce((sum, row) => sum + row.monto, 0));
    weeks.push({
      date,
      total_people: totalPeople,
      roles,
      row_count: weekRows.length,
      amount_total: amountTotal,
      warnings: [...new Set(weekWarnings)],
      transactions,
    });
    warnings.push(...weekWarnings.map((warning) => `${date}: ${warning}`));
  }

  if (errors.length) throw new LaborPaymentImportValidationError([...new Set(errors)]);
  return {
    sheetName: options.sheetName || "CARGA",
    administration: parsedRows[0].administration,
    projectMatchMode,
    currency: currencies[0],
    rowCount: parsedRows.length,
    amountTotal: roundMoney(parsedRows.reduce((sum, row) => sum + row.monto, 0)),
    warnings: [...new Set(warnings)],
    weeks,
  };
}

export async function parseLaborPaymentWorkbook(
  file: File,
  options: {
    projectName: string;
    projectCurrency?: string | null;
    partidas: LaborImportPartida[];
  },
): Promise<LaborPaymentParseResult> {
  if (file.size > LABOR_IMPORT_MAX_FILE_SIZE) {
    throw new LaborPaymentImportValidationError(["El archivo excede el tamaño máximo de 10 MB."]);
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const candidates: Array<{ sheetName: string; rows: unknown[][] }> = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    if (rows.length && hasAllHeaders(buildHeaderMap(rows[0] || []))) candidates.push({ sheetName, rows });
  }
  const named = candidates.find((candidate) => normalizeLaborImportText(candidate.sheetName) === "CARGA");
  const selected = named || (candidates.length === 1 ? candidates[0] : null);
  if (!selected) {
    throw new LaborPaymentImportValidationError([
      candidates.length > 1
        ? "Hay varias hojas compatibles; renombra la hoja que deseas importar como CARGA."
        : "No se encontró una hoja CARGA con todos los encabezados obligatorios.",
    ]);
  }
  return parseLaborPaymentRows(selected.rows, { ...options, sheetName: selected.sheetName });
}
