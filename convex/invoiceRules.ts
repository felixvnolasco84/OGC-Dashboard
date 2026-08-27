import { z } from "zod";

export const INVOICE_ANALYSIS_SCHEMA_VERSION = 1;
export const INVOICE_TAXONOMY_VERSION = 1;
export const INVOICE_UNRESOLVED_CODE = "unresolved";

export type InvoiceCategorySeed = {
  code: string;
  label: string;
  parent_code?: string;
  aliases: string[];
};

export const INVOICE_CATEGORY_SEEDS: InvoiceCategorySeed[] = [
  { code: "materials", label: "Materiales", aliases: ["material", "insumo"] },
  { code: "labor_services", label: "Mano de obra y servicios", aliases: ["mano de obra", "servicio"] },
  { code: "machinery_equipment", label: "Maquinaria y equipo", aliases: ["maquinaria", "equipo"] },
  { code: "power_tools", label: "Herramienta eléctrica", parent_code: "machinery_equipment", aliases: ["taladro", "rotomartillo", "esmeril", "sierra"] },
  { code: "hand_tools", label: "Herramienta manual", parent_code: "machinery_equipment", aliases: ["martillo", "pinza", "llave", "desarmador"] },
  { code: "cutting_abrasives", label: "Corte y abrasivos", parent_code: "materials", aliases: ["disco de corte", "disco", "abrasivo", "lija"] },
  { code: "drilling_accessories", label: "Brocas y accesorios", parent_code: "materials", aliases: ["broca", "copa", "punta"] },
  { code: "consumables_parts", label: "Consumibles y refacciones", parent_code: "materials", aliases: ["consumible", "refaccion", "repuesto"] },
  { code: "safety", label: "Seguridad y protección", aliases: ["epp", "seguridad", "guante", "lente", "casco"] },
  { code: "rental", label: "Renta de equipo", aliases: ["renta", "alquiler"] },
  { code: "repair_maintenance", label: "Reparación y mantenimiento", aliases: ["reparacion", "mantenimiento"] },
  { code: "freight_logistics", label: "Flete y logística", aliases: ["flete", "envio", "maniobra"] },
  { code: "professional_services", label: "Servicios profesionales", aliases: ["honorario", "consultoria"] },
  { code: "taxes_fees", label: "Impuestos y derechos", aliases: ["impuesto", "derecho", "iva"] },
  { code: "other", label: "Otros", aliases: ["otro", "varios"] },
  { code: INVOICE_UNRESOLVED_CODE, label: "Sin clasificar", aliases: [] },
];

export function normalizeInvoiceText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInvoiceUuid(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeInvoiceCurrency(value: unknown) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "SIN_MONEDA";
}

export function isInvoiceAnalysisIntent(text: string) {
  const normalized = normalizeInvoiceText(text);
  return [
    "factura",
    "facturas",
    "desglose",
    "herramienta menor",
    "herramienta electrica",
    "herramienta manual",
    "maquinaria comprada",
    "equipo comprado",
    "activos potenciales",
    "consumibles",
    "refacciones",
    "equipo de seguridad",
    "taladro",
    "disco de corte",
    "broca",
    "conceptos sin clasificar",
    "nota de credito",
    "notas de credito",
    "complemento de pago",
    "complementos de pago",
  ].some((token) => normalized.includes(token));
}

export function inferInvoiceGroupBy(text: string) {
  const normalized = normalizeInvoiceText(text);
  if (/\b(mes|mensual|periodo)\b/.test(normalized)) return "month" as const;
  if (/\b(proveedor|proveedores|emisor|emisores)\b/.test(normalized)) return "provider" as const;
  if (/\b(proyecto|proyectos|comparar|compara)\b/.test(normalized)) return "project" as const;
  if (/\b(categoria|categorias|familia|herramienta menor|herramienta electrica|herramienta manual|maquinaria|equipo comprado|consumibles|refacciones|seguridad)\b/.test(normalized)) return "category" as const;
  return "item" as const;
}

const GENERIC_INVOICE_SEARCH_TOKENS = new Set([
  "a", "al", "algo", "analiza", "analizadas", "analizados", "aprobada", "aprobadas",
  "aprobado", "aprobados", "comprado", "comprados", "compramos", "compras", "cuanto",
  "cuantos", "cuanta", "cuantas", "cual", "cuales", "dame", "de", "del", "desglosa",
  "desglosame", "desglose", "desglosar", "dime", "donde", "el", "en", "entre", "esta",
  "estas", "este", "estos", "factura", "facturas", "gaste", "gastado", "gastamos",
  "gasto", "gastos", "importe", "importes", "la", "las", "lo", "los", "me", "mi",
  "muestra", "muestrame", "pagada", "pagadas", "pagado", "pagados", "pago", "pagos",
  "por", "proyecto", "proyectos", "que", "quiero", "suma", "total", "totales", "un",
  "una", "ver", "y", "categoria", "categorias", "concepto", "conceptos", "mes", "mensual",
  "periodo", "proveedor", "proveedores", "enero", "febrero", "marzo", "abril", "mayo",
  "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "como", "consulta", "consultar", "cuentame", "detalle", "detalles", "favor", "hay",
  "informacion", "necesito", "necesitamos", "podrias", "puede", "puedes", "revisa",
  "revisar", "saber", "segun", "sobre", "tengo", "tenemos",
]);

export type InvoiceAggregateSearchResolution = {
  status: "not_requested" | "matched" | "not_found";
  matching_indexes: number[];
  search_tokens: string[];
};

export type InvoiceDocumentType = "invoice" | "credit_note" | "receipt" | "payment_complement" | "unknown";
export type InvoiceDateBasis = "payment" | "invoice";
export type InvoiceReconciliationCode =
  | "allocation_transaction_mismatch"
  | "transaction_overallocated"
  | "multiple_currencies"
  | "invoice_currency_mismatch"
  | "invoice_total_mismatch"
  | "missing_invoice_total"
  | "unknown_document_type"
  | "unclassified_items";

export const MAX_INVOICE_ALLOCATION_ABS = 1_000_000_000_000;

export function inferInvoiceDateBasis(text: string): InvoiceDateBasis {
  const normalized = normalizeInvoiceText(text);
  return /\b(emitida|emitidas|emitido|emitidos|emision|fecha de factura|facturada|facturadas|facturado|facturados)\b/.test(normalized)
    ? "invoice"
    : "payment";
}

export function parseInvoiceIssuedDate(value: unknown) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const slash = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : slash
      ? `${slash[3]}-${slash[2]}-${slash[1]}`
      : undefined;
  if (!normalized) return undefined;
  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : undefined;
}

export function invoiceDocumentPairKey(fileName: string) {
  const uuid = fileName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return `uuid:${normalizeInvoiceUuid(uuid)}`;
  const withoutExtension = fileName.replace(/\.(xml|pdf|png|jpe?g)$/i, "");
  const normalized = normalizeInvoiceText(withoutExtension)
    .split(" ")
    .filter((token) => !["factura", "cfdi", "xml", "pdf", "imagen", "escaneo", "scan"].includes(token))
    .join(" ");
  return normalized.replace(/\s+/g, "").length >= 4 ? `folio:${normalized}` : undefined;
}

export function invoiceAllocationValidationError(invoiceType: InvoiceDocumentType | undefined, amount: number) {
  if (!Number.isFinite(amount) || amount === 0) return "Los importes asignados deben ser números distintos de cero.";
  if (Math.abs(amount) > MAX_INVOICE_ALLOCATION_ABS) return "El importe asignado excede el límite permitido.";
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return "Los importes asignados admiten como máximo dos decimales.";
  if (invoiceType === "payment_complement") return "Los complementos de pago no se aprueban como gasto.";
  if (invoiceType === "credit_note" && amount >= 0) return "Las notas de crédito deben asignarse con un importe negativo.";
  if (invoiceType !== "credit_note" && amount < 0) return "Un importe negativo requiere que el documento sea una nota de crédito.";
  return undefined;
}

export function buildInvoiceReconciliation(args: {
  invoice_type?: InvoiceDocumentType;
  invoice_total?: number;
  invoice_currency?: string;
  allocations: Array<{
    amount: number;
    currency: string;
    transaction_total: number;
    existing_approved_amount?: number;
  }>;
  has_unclassified_items?: boolean;
}) {
  const codes = new Set<InvoiceReconciliationCode>();
  const currencies = new Set(args.allocations.map((allocation) => normalizeInvoiceCurrency(allocation.currency)));
  const allocatedTotal = args.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  for (const allocation of args.allocations) {
    if (Math.abs(Math.abs(allocation.amount) - Math.abs(allocation.transaction_total)) > 0.01) {
      codes.add("allocation_transaction_mismatch");
    }
    const assignedAfterApproval = (allocation.existing_approved_amount || 0) + allocation.amount;
    if (Math.abs(assignedAfterApproval) - Math.abs(allocation.transaction_total) > 0.01) {
      codes.add("transaction_overallocated");
    }
  }
  if (currencies.size > 1) codes.add("multiple_currencies");
  const currency = currencies.size === 1 ? [...currencies][0] : undefined;
  const normalizedInvoiceCurrency = normalizeInvoiceCurrency(args.invoice_currency);
  if (currency && normalizedInvoiceCurrency !== "SIN_MONEDA" && currency !== normalizedInvoiceCurrency) {
    codes.add("invoice_currency_mismatch");
  }
  if (args.invoice_total === undefined) {
    codes.add("missing_invoice_total");
  } else if (currency && Math.abs(Math.abs(allocatedTotal) - Math.abs(args.invoice_total)) > 0.01) {
    codes.add("invoice_total_mismatch");
  }
  if (args.invoice_type === "unknown") codes.add("unknown_document_type");
  if (args.has_unclassified_items) codes.add("unclassified_items");
  const variance = args.invoice_total !== undefined && currency
    ? Math.round((Math.abs(allocatedTotal) - Math.abs(args.invoice_total)) * 100) / 100
    : undefined;
  return {
    status: codes.size ? "exception" as const : "matched" as const,
    exception_codes: [...codes],
    allocated_total: Math.round(allocatedTotal * 100) / 100,
    invoice_total: args.invoice_total,
    currency,
    variance,
    allocation_count: args.allocations.length,
  };
}

export function isCurrentInvoiceRunState(args: {
  active_run_id?: string;
  run_id: string;
  invoice_status: string;
  run_status: string;
  allowed_statuses: string[];
}) {
  return args.active_run_id === args.run_id &&
    args.invoice_status === args.run_status &&
    args.allowed_statuses.includes(args.run_status);
}

/**
 * Separates a concrete invoice concept/provider search from generic wording such
 * as "desglosa las facturas". Project labels are ignored because the project is
 * already enforced through validated tool context.
 */
export function resolveInvoiceAggregateSearch(
  text: string,
  labels: string[],
  ignoredLabels: string[] = [],
): InvoiceAggregateSearchResolution {
  const ignoredTokens = new Set(
    ignoredLabels.flatMap((label) => normalizeInvoiceText(label).split(" ")).filter(Boolean),
  );
  const searchTokens = normalizeInvoiceText(text)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !GENERIC_INVOICE_SEARCH_TOKENS.has(token))
    .filter((token) => !ignoredTokens.has(token));

  if (!searchTokens.length) {
    return { status: "not_requested", matching_indexes: [], search_tokens: [] };
  }

  const matchingIndexes = labels.flatMap((label, index) => {
    const labelTokens = normalizeInvoiceText(label).split(" ").filter((token) => token.length >= 3);
    const matches = labelTokens.some((labelToken) =>
      searchTokens.some((searchToken) =>
        labelToken.startsWith(searchToken) || searchToken.startsWith(labelToken)),
    );
    return matches ? [index] : [];
  });

  return {
    status: matchingIndexes.length ? "matched" : "not_found",
    matching_indexes: matchingIndexes,
    search_tokens: searchTokens,
  };
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  const expression = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(expression)) {
    const key = match[1].split(":").pop() || match[1];
    attributes[key.toLocaleLowerCase("es-MX")] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function findTagAttributes(xml: string, localName: string) {
  const expression = new RegExp(`<(?:[\\w-]+:)?${localName}\\b([^>]*)>`, "i");
  const match = xml.match(expression);
  return match ? parseAttributes(match[1]) : undefined;
}

function finiteNumber(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sumTaxElements(block: string, localName: "Traslado" | "Retencion") {
  const expression = new RegExp(`<(?:[\\w-]+:)?${localName}\\b([^>]*)\\/?\\s*>`, "gi");
  let total = 0;
  for (const match of block.matchAll(expression)) {
    total += finiteNumber(parseAttributes(match[1]).importe) || 0;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

export type ParsedInvoiceItem = {
  source_index: number;
  description: string;
  product_code?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  discount?: number;
  net_amount?: number;
  tax_amount?: number;
  gross_amount?: number;
};

export type ParsedInvoice = {
  source: "xml";
  invoice_type: InvoiceDocumentType;
  uuid?: string;
  folio?: string;
  issuer_name?: string;
  issuer_rfc?: string;
  receiver_rfc?: string;
  issued_at?: string;
  currency: string;
  subtotal?: number;
  discount?: number;
  transferred_taxes?: number;
  retained_taxes?: number;
  total?: number;
  items: ParsedInvoiceItem[];
  warnings: string[];
};

export function parseCfdiXml(xml: string): ParsedInvoice {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("El XML contiene DTD o entidades externas no permitidas.");
  }
  const comprobante = findTagAttributes(xml, "Comprobante");
  if (!comprobante) throw new Error("No se encontró el nodo Comprobante del CFDI.");
  const emisor = findTagAttributes(xml, "Emisor") || {};
  const receptor = findTagAttributes(xml, "Receptor") || {};
  const timbre = findTagAttributes(xml, "TimbreFiscalDigital") || {};
  const tipo = String(comprobante.tipodecomprobante || "").toUpperCase();
  const invoiceType = tipo === "E"
    ? "credit_note"
    : tipo === "I"
      ? "invoice"
      : tipo === "P"
        ? "payment_complement"
        : "unknown";
  const conceptExpression = /<(?:[\w-]+:)?Concepto\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/(?:[\w-]+:)?Concepto\s*>)/gi;
  const items: ParsedInvoiceItem[] = [];
  for (const match of xml.matchAll(conceptExpression)) {
    const attributes = parseAttributes(match[1]);
    const body = match[2] || "";
    const net = finiteNumber(attributes.importe);
    const discount = finiteNumber(attributes.descuento) || 0;
    const transferred = sumTaxElements(body, "Traslado");
    const retained = sumTaxElements(body, "Retencion");
    const tax = transferred - retained;
    items.push({
      source_index: items.length,
      description: String(attributes.descripcion || "Concepto sin descripción").trim(),
      product_code: attributes.claveprodserv || undefined,
      quantity: finiteNumber(attributes.cantidad),
      unit: attributes.unidad || attributes.claveunidad || undefined,
      unit_price: finiteNumber(attributes.valorunitario),
      discount: discount || undefined,
      net_amount: net,
      tax_amount: tax || undefined,
      gross_amount: net === undefined ? undefined : net - discount + tax,
    });
  }
  const subtotal = finiteNumber(comprobante.subtotal);
  const discount = finiteNumber(comprobante.descuento) || 0;
  const total = finiteNumber(comprobante.total);
  const transferredTaxes = items.reduce((sum, item) => sum + Math.max(0, item.tax_amount || 0), 0);
  const retainedTaxes = items.reduce((sum, item) => sum + Math.max(0, -(item.tax_amount || 0)), 0);
  const warnings: string[] = [];
  if (!items.length) warnings.push("El CFDI no contiene conceptos recuperables.");
  if (!timbre.uuid) warnings.push("El CFDI no contiene UUID timbrado.");
  if (total === undefined) warnings.push("El CFDI no contiene un total válido.");
  const calculated = subtotal === undefined
    ? undefined
    : subtotal - discount + transferredTaxes - retainedTaxes;
  if (total !== undefined && calculated !== undefined && Math.abs(total - calculated) > 0.01) {
    warnings.push("El total del CFDI no concilia con subtotal, descuentos e impuestos recuperados.");
  }
  return {
    source: "xml",
    invoice_type: invoiceType,
    uuid: timbre.uuid || undefined,
    folio: comprobante.folio || undefined,
    issuer_name: emisor.nombre || undefined,
    issuer_rfc: emisor.rfc || undefined,
    receiver_rfc: receptor.rfc || undefined,
    issued_at: comprobante.fecha || undefined,
    currency: normalizeInvoiceCurrency(comprobante.moneda),
    subtotal,
    discount: discount || undefined,
    transferred_taxes: transferredTaxes || undefined,
    retained_taxes: retainedTaxes || undefined,
    total,
    items,
    warnings,
  };
}

const nullableText = z.string().max(500).nullable();
const nullableNumber = z.number().finite().nullable();

export const invoiceModelOutputSchema = z.object({
  document_type: z.enum(["invoice", "credit_note", "receipt", "payment_complement", "unknown"]),
  header: z.object({
    uuid: nullableText,
    folio: nullableText,
    issuer_name: nullableText,
    issuer_rfc: nullableText,
    receiver_rfc: nullableText,
    issued_at: nullableText,
    currency: nullableText,
    subtotal: nullableNumber,
    discount: nullableNumber,
    transferred_taxes: nullableNumber,
    retained_taxes: nullableNumber,
    total: nullableNumber,
  }).strict(),
  items: z.array(z.object({
    source_index: z.number().int().min(0),
    description: z.string().min(1).max(500),
    product_code: nullableText,
    quantity: nullableNumber,
    unit: nullableText,
    unit_price: nullableNumber,
    discount: nullableNumber,
    net_amount: nullableNumber,
    tax_amount: nullableNumber,
    gross_amount: nullableNumber,
    category_code: z.string().min(1).max(80),
    canonical_label: z.string().min(1).max(180),
    confidence: z.enum(["high", "medium", "low"]),
    asset_candidate: z.boolean(),
    evidence_page: z.number().int().min(1).nullable(),
  }).strict()).max(250),
  warnings: z.array(z.string().min(1).max(300)).max(20),
}).strict();

export type InvoiceModelOutput = z.infer<typeof invoiceModelOutputSchema>;

export const invoiceModelOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["document_type", "header", "items", "warnings"],
  properties: {
    document_type: { type: "string", enum: ["invoice", "credit_note", "receipt", "payment_complement", "unknown"] },
    header: {
      type: "object",
      additionalProperties: false,
      required: ["uuid", "folio", "issuer_name", "issuer_rfc", "receiver_rfc", "issued_at", "currency", "subtotal", "discount", "transferred_taxes", "retained_taxes", "total"],
      properties: {
        uuid: { type: ["string", "null"] },
        folio: { type: ["string", "null"] },
        issuer_name: { type: ["string", "null"] },
        issuer_rfc: { type: ["string", "null"] },
        receiver_rfc: { type: ["string", "null"] },
        issued_at: { type: ["string", "null"] },
        currency: { type: ["string", "null"] },
        subtotal: { type: ["number", "null"] },
        discount: { type: ["number", "null"] },
        transferred_taxes: { type: ["number", "null"] },
        retained_taxes: { type: ["number", "null"] },
        total: { type: ["number", "null"] },
      },
    },
    items: {
      type: "array",
      maxItems: 250,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_index", "description", "product_code", "quantity", "unit", "unit_price", "discount", "net_amount", "tax_amount", "gross_amount", "category_code", "canonical_label", "confidence", "asset_candidate", "evidence_page"],
        properties: {
          source_index: { type: "integer", minimum: 0 },
          description: { type: "string", minLength: 1, maxLength: 500 },
          product_code: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          unit_price: { type: ["number", "null"] },
          discount: { type: ["number", "null"] },
          net_amount: { type: ["number", "null"] },
          tax_amount: { type: ["number", "null"] },
          gross_amount: { type: ["number", "null"] },
          category_code: { type: "string", minLength: 1, maxLength: 80 },
          canonical_label: { type: "string", minLength: 1, maxLength: 180 },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          asset_candidate: { type: "boolean" },
          evidence_page: { type: ["integer", "null"], minimum: 1 },
        },
      },
    },
    warnings: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 300 } },
  },
} as const;

export function allocateInvoiceAmount<T extends { weight?: number }>(total: number, rows: T[]) {
  if (!rows.length) return [];
  const cents = Math.round(total * 100);
  const weights = rows.map((row) => Math.max(0, Number(row.weight) || 0));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const effectiveWeights = weightTotal > 0 ? weights : rows.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
  const allocated = effectiveWeights.map((weight) => Math.floor(cents * weight / effectiveTotal));
  let remainder = cents - allocated.reduce((sum, value) => sum + value, 0);
  const order = effectiveWeights.map((weight, index) => ({ weight, index }))
    .sort((left, right) => right.weight - left.weight || left.index - right.index);
  let cursor = 0;
  while (remainder > 0) {
    allocated[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return allocated.map((value) => value / 100);
}
