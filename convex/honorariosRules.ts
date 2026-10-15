import { calculateFeeConceptPayments, isActiveFeeConcept, type FeeConceptConfig, type FeeConceptPartida } from "./feeConceptRules";
export type HonorariosModo = "automatico" | "transacciones";

export function isHonorariosPartida(partida: {
  nivel: number;
  nombre: string;
  partida_nombre?: string;
} | null | undefined): boolean {
  if (!partida) return false;
  const rootName = partida.nivel === 1 ? partida.nombre : partida.partida_nombre;
  return rootName?.trim().toLowerCase() === "honorarios";
}

export function getHonorariosModo(modo?: HonorariosModo): HonorariosModo {
  return modo === "transacciones" ? "transacciones" : "automatico";
}

export function getHonorariosBreakdown(input: {
  proyectoId: string;
  modo?: HonorariosModo;
  porcentaje?: number;
  excludedPartidas?: readonly string[];
  feeConcepts?: readonly FeeConceptConfig[];
  convert?: (amount: number, transaction: { _id: string; moneda?: string; tipo_cambio?: string | number }) => number;
  transactions: readonly { _id: string; monto_total: number; fecha?: string; status?: string; moneda?: string; tipo_cambio?: string | number }[];
  pagos: readonly { transaccion_id: string; partida_id?: string; monto: number }[];
  partidas: readonly FeeConceptPartida[];
}): { base: number; excludedAmount: number; amount: number } {
  const configured = input.feeConcepts?.find(c => c.concepto === "honorarios");
  if (configured) {
    const legacy = getHonorariosBreakdown({ ...input, feeConcepts: undefined,
      transactions: input.transactions.filter(t => !isActiveFeeConcept(configured, t.fecha)) });
    const current = calculateFeeConceptPayments({ configs: input.feeConcepts || [configured], partidas: input.partidas,
      transactions: input.transactions, pagos: input.pagos, convert: input.convert, allocate: false }).concepts.find(c => c.concepto === "honorarios")!;
    return { base: legacy.base + current.basePagada, excludedAmount: legacy.excludedAmount,
      amount: Math.round((legacy.amount + current.monto) * 100) / 100 };
  }
  const transactionIds = new Set(input.transactions.map((transaction) => String(transaction._id)));
  const partidasById = new Map(input.partidas.map((partida) => [String(partida._id), partida]));
  const periodPagos = input.pagos.filter((pago) => transactionIds.has(String(pago.transaccion_id)));

  if (getHonorariosModo(input.modo) === "transacciones") {
    const amount = periodPagos.reduce((sum, pago) => {
      const partida = partidasById.get(String(pago.partida_id));
      return partida?.proyecto === input.proyectoId && isHonorariosPartida(partida)
        ? sum + pago.monto
        : sum;
    }, 0);
    return { base: amount, excludedAmount: 0, amount: Math.round(amount * 100) / 100 };
  }

  const excludedIds = new Set((input.excludedPartidas || []).map(String));
  const excludedNames = new Set(input.partidas
    .filter((partida) => partida.nivel === 1 && excludedIds.has(String(partida._id)))
    .map((partida) => partida.nombre));
  const excludedAmount = periodPagos.reduce((sum, pago) => {
    const partida = partidasById.get(String(pago.partida_id));
    return partida && (excludedIds.has(String(partida._id)) ||
      Boolean(partida.partida_nombre && excludedNames.has(partida.partida_nombre)))
      ? sum + pago.monto
      : sum;
  }, 0);
  const total = input.transactions.reduce((sum, transaction) => sum + transaction.monto_total, 0);
  const base = total - excludedAmount;
  return { base, excludedAmount, amount: Math.round(base * ((input.porcentaje || 0) / 100) * 100) / 100 };
}

export function calculateHonorariosFromRecords(input: Parameters<typeof getHonorariosBreakdown>[0]): number {
  return getHonorariosBreakdown(input).amount;
}
