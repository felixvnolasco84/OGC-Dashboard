export type ParsedTransaction = {
  transaction: {
    proyecto: string;
    monto_total: number;
    fecha: number;
    tipo_pago: string;
    moneda: string;
    tipo_cambio: string;
    status: string;
    categoria?: string;
    codigo_referencia?: string;
    factura?: string;
    proveedor_nombre?: string;
    proveedor?: string;
  };
  lineitems: Array<{
    partida_identifier: {
      partida: string;
      familia: string;
      subpartida: string;
    };
    monto: number;
    administracion?: string;
    codigo?: string;
    tipo_documento?: string;
    nombre_documento?: string;
    descripcion_documento?: string;
    proveedor_nombre?: string;
    proveedor?: string;
  }>;
  factura?: string;
  proveedor_nombre?: string;
  source_key?: string;
  itemCount?: number;
  validation_errors?: Array<
    string | {
      code: string;
      message: string;
      row_numbers?: number[];
    }
  >;
};

export function getParserValidationErrors(transaction: ParsedTransaction): string[] {
  return (transaction.validation_errors || []).map((error) =>
    typeof error === "string" ? error : error.message
  );
}

export function normalizeProviderName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getProviderNames(transaction: ParsedTransaction): string[] {
  const names = [
    transaction.proveedor_nombre,
    transaction.transaction.proveedor_nombre,
    transaction.transaction.proveedor,
    ...transaction.lineitems.flatMap((item) => [item.proveedor_nombre, item.proveedor]),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Map(names.map((name) => [normalizeProviderName(name), name])).values()];
}

export function getProviderName(transaction: ParsedTransaction): string | undefined {
  const names = getProviderNames(transaction);
  return names.length === 1 ? names[0] : undefined;
}

export function validateTransactionTotals(
  declaredTotal: number,
  lineItems: Array<{ monto: number }>,
  tolerance = 0.01
) {
  const lineItemsTotal = lineItems.reduce((sum, item) => sum + item.monto, 0);
  return {
    valid: Math.abs(declaredTotal - lineItemsTotal) <= tolerance,
    lineItemsTotal,
  };
}

async function sha256(value: ArrayBuffer | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashFile(file: File): Promise<string> {
  return sha256(await file.arrayBuffer());
}

export async function buildTransactionSignature(
  transaction: ParsedTransaction,
  lineItems: Array<{ partida: string; familia: string; sub_partida: string; monto: number }>
): Promise<string> {
  const provider = getProviderName(transaction);
  const stableItems = [...lineItems]
    .map((item) => ({
      partida: item.partida.trim().toUpperCase(),
      familia: item.familia.trim().toUpperCase(),
      sub_partida: item.sub_partida.trim().toUpperCase(),
      monto: Number(item.monto.toFixed(2)),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return sha256(JSON.stringify({
    factura: (transaction.factura || transaction.transaction.factura || "").trim().toUpperCase(),
    fecha: transaction.transaction.fecha,
    monto_total: Number(transaction.transaction.monto_total.toFixed(2)),
    proveedor: provider ? normalizeProviderName(provider) : "",
    items: stableItems,
  }));
}

export function getSourceKey(transaction: ParsedTransaction, index: number): string {
  return transaction.source_key || `${index}:${transaction.factura || transaction.transaction.factura || "sin-factura"}`;
}
