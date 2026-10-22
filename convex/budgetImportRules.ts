import { v, type Infer } from "convex/values";

export const BUDGET_MAX_BYTES = 10 * 1024 * 1024;
export const BUDGET_IDLE_MS = 30 * 60 * 1000;
export const BUDGET_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const BUDGET_STORAGE_TYPE = "application/x-ogc-initial-budget";
export const budgetStorageType = (id: string, kind: "original" | "manifest") =>
  `${BUDGET_STORAGE_TYPE};attempt=${encodeURIComponent(id).replace(/%[A-F0-9]{2}/g, value => value.toLowerCase())};kind=${kind}`;
export const budgetFormValidator = v.object({
  nombre: v.string(), descripcion: v.string(), ubicacion: v.optional(v.string()),
  honorarios_porcentaje: v.number(), indirectos_porcentaje: v.optional(v.number()),
});
export const budgetPaymentValidator = v.object({
  week: v.number(), amount: v.number(), position: v.number(), columnLetter: v.string(), source_index: v.number(), fecha: v.string(),
});
export const budgetRowValidator = v.object({
  nivel: v.number(), nombre: v.string(), familia: v.string(), sub_partida: v.string(),
  partida_nombre: v.optional(v.string()), unidad: v.string(), cantidad: v.number(), precio_unitario: v.number(),
  presupuesto_original: v.number(), presupuesto_aprobado: v.number(), pagado: v.number(),
  payments: v.array(budgetPaymentValidator), raw_json: v.string(),
});
export type BudgetRow = Infer<typeof budgetRowValidator>;
export type BudgetManifest = { version: 1; reader: string; received_at: number; rows: BudgetRow[] };
export const BUDGET_READER = "https://ogc-excel-reader.vercel.app/upload";

// Preserve the construction import's decimal/group separator rules.
export function budgetNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("El Excel contiene un número no finito.");
    return value;
  }
  let normalized = String(value).trim().replace(/\s|\u00a0/g, "").replace(/[$%]/g, "").replace(/[^0-9.,()-]/g, "");
  if (!normalized) throw new Error(`No se pudo interpretar el valor numérico: ${String(value).slice(0, 80)}`);
  const negative = normalized.startsWith("(") && normalized.endsWith(")");
  if (negative) normalized = normalized.slice(1, -1);
  const comma = normalized.lastIndexOf(","), dot = normalized.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    const decimal = comma > dot ? "," : ".";
    normalized = normalized.replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "").replace(decimal, ".");
  } else if (comma !== -1) {
    const digits = normalized.length - comma - 1;
    normalized = digits > 0 && digits <= 2 ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  } else if (dot !== -1 && (normalized.match(/\./g) || []).length > 1) {
    const digits = normalized.length - dot - 1;
    normalized = digits > 0 && digits <= 2 ? normalized.replace(/\.(?=.*\.)/g, "") : normalized.replace(/\./g, "");
  }
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error("El Excel contiene un importe inválido.");
  return negative ? -result : result;
}

export function parseBudgetResponse(response: unknown): BudgetManifest {
  const result = response as { success?: boolean; data?: Record<string, unknown>[] };
  if (!result?.success || !Array.isArray(result.data) || !result.data.length) throw new Error("El lector no devolvió partidas para este Excel.");
  if (result.data.length > 3000) throw new Error("El presupuesto supera la capacidad de 3,000 registros. El original se conservó; no se creó el proyecto.");
  let root = "";
  const families = new Set<string>();
  const rows = result.data.map((record, index) => {
    const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
    const nivel = Number(record.nivel), nombre = text(record.nombre), familia = text(record.familia);
    if (![1, 2, 3].includes(nivel)) throw new Error(`Registro interpretado ${index + 1}: nivel inválido.`);
    if (nivel === 1) { root = nombre; families.clear(); if (!root) throw new Error("Hay una partida sin nombre."); }
    if (nivel > 1 && !root) throw new Error(`Registro interpretado ${index + 1}: falta la partida padre.`);
    if (nivel === 2) families.add(familia);
    if (nivel === 3 && !families.has(familia)) throw new Error(`Registro interpretado ${index + 1}: falta la familia padre.`);
    const sourcePayments = record.weeklyPayments ?? [];
    if (!Array.isArray(sourcePayments) || sourcePayments.length > 260) throw new Error("Pagos semanales inválidos o superiores a 260 por registro.");
    const payments = sourcePayments.flatMap((p, source_index) => {
      const amount = budgetNumber(p.amount);
      if (amount <= 0) return [];
      const week = Number(p.week), position = Number(p.position);
      const date = new Date((week - 25569) * 86400 * 1000);
      if (!Number.isFinite(week) || !Number.isFinite(position) || !Number.isFinite(date.getTime())) throw new Error("Un pago semanal tiene una fecha o posición inválida.");
      // Mexico City is the business timezone, independent of the server timezone.
      const fecha = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
      return [{ amount, week, position, columnLetter: text(p.columnLetter), source_index, fecha }];
    });
    return { nivel, nombre, familia, sub_partida: text(record.sub_partida), partida_nombre: nivel > 1 ? root : undefined,
      unidad: text(record.unidad), cantidad: budgetNumber(record.cantidad), precio_unitario: budgetNumber(record.precio_unitario),
      presupuesto_original: budgetNumber(record.presupuesto_original), presupuesto_aprobado: budgetNumber(record.presupuesto_aprobado),
      pagado: budgetNumber(record.pagado), payments, raw_json: JSON.stringify(record) };
  });
  const manifest: BudgetManifest = { version: 1, reader: BUDGET_READER, received_at: Date.now(), rows };
  if (new TextEncoder().encode(JSON.stringify(manifest)).length > 4 * 1024 * 1024 || rows.some(r => r.raw_json.length > 100000)) {
    throw new Error("La respuesta del lector supera la capacidad de importación. El original se conservó.");
  }
  return manifest;
}
