import { isHonorariosPartida } from "./honorariosRules";

export const INDIRECTOS_START = "2026-10-01";
export type IndirectosConfig = { indirectos_porcentaje?: number; indirectos_fecha_inicio?: string };
type Partida = { _id: string; nombre: string; nivel: number; partida_nombre?: string; familia?: string; sub_partida?: string };
type Transaction = { _id: string; fecha: string; status: string; moneda?: string; tipo_cambio?: string | number };
const normalize = (value?: string) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function isIndirectosPartida(partida: Partial<Partida>) {
  return [partida.nombre, partida.partida_nombre, partida.familia, partida.sub_partida].some(value =>
    /indirecto|general condition|condicion(?:es)? general|viatico/.test(normalize(value)));
}

export function reportDateIso(value?: string): string | null {
  const iso = value?.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = value?.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!iso && !local) return null;
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(local![3]), Number(local![2]), Number(local![1])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isAutomaticIndirectos(config: IndirectosConfig, fecha?: string) {
  const date = reportDateIso(fecha);
  return config.indirectos_porcentaje !== undefined && Boolean(date && date >= (config.indirectos_fecha_inicio || INDIRECTOS_START));
}

export function validateIndirectosPercentage(value?: number) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100)) {
    throw new Error("El porcentaje de indirectos debe estar entre 0 y 100.");
  }
}

export function getFeeExcludedPartidaIds(partidas: readonly Partida[], excluded: readonly string[] = []) {
  const ids = new Set(excluded.map(String));
  const names = new Set(partidas.filter(p => ids.has(String(p._id))).map(p => normalize(p.nombre)));
  for (const partida of partidas) {
    if (names.has(normalize(partida.nombre)) || names.has(normalize(partida.partida_nombre))) ids.add(String(partida._id));
  }
  return ids;
}

export function isEligibleFeePayment(partida: Partida, excluded: ReadonlySet<string>) {
  return !isHonorariosPartida(partida) && !excluded.has(String(partida._id));
}

export function indirectosCharge(amount: number, config: IndirectosConfig) {
  return Math.round(amount * ((config.indirectos_porcentaje || 0) / 100) * 100) / 100;
}

export function calculateIndirectosFromRecords(input: {
  config: IndirectosConfig;
  excludedPartidas?: readonly string[];
  partidas: readonly Partida[];
  transactions: readonly Transaction[];
  pagos: readonly { transaccion_id: string; partida_id?: string; monto: number }[];
  convert?: (amount: number, transaction: Transaction) => number;
}) {
  const txs = new Map(input.transactions.map(t => [String(t._id), t]));
  const partidas = new Map(input.partidas.map(p => [String(p._id), p]));
  const excluded = getFeeExcludedPartidaIds(input.partidas, input.excludedPartidas);
  let automaticos = 0;
  let manualesSustituidos = 0;
  const sustituidosPorPartida: Record<string, number> = {};
  for (const pago of input.pagos) {
    const transaction = txs.get(String(pago.transaccion_id));
    const partida = partidas.get(String(pago.partida_id));
    if (!transaction || !partida || transaction.status !== "Pagado" || !isAutomaticIndirectos(input.config, transaction.fecha)) continue;
    const amount = input.convert ? input.convert(Math.abs(pago.monto), transaction) : Math.abs(pago.monto);
    if (isEligibleFeePayment(partida, excluded)) automaticos += indirectosCharge(amount, input.config);
    if (isIndirectosPartida(partida) && !isHonorariosPartida(partida)) {
      const manualAmount = input.convert ? input.convert(pago.monto, transaction) : pago.monto;
      manualesSustituidos += manualAmount;
      sustituidosPorPartida[String(partida._id)] = (sustituidosPorPartida[String(partida._id)] || 0) + manualAmount;
    }
  }
  return { automaticos: Math.round(automaticos * 100) / 100, manualesSustituidos, sustituidosPorPartida };
}
