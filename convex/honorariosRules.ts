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

export function calculateHonorariosFromRecords(input: {
  proyectoId: string;
  modo?: HonorariosModo;
  porcentaje?: number;
  excludedPartidas?: readonly string[];
  transactions: readonly { _id: string; monto_total: number }[];
  pagos: readonly { transaccion_id: string; partida_id?: string; monto: number }[];
  partidas: readonly { _id: string; proyecto?: string; nivel: number; nombre: string; partida_nombre?: string }[];
}): number {
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
    return Math.round(amount * 100) / 100;
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
  return Math.round((total - excludedAmount) * ((input.porcentaje || 0) / 100) * 100) / 100;
}
