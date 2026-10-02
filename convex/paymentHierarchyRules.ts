import { isHonorariosPartida } from "./honorariosRules";

type PaymentPartida = {
  _id: string;
  nivel: number;
  nombre: string;
  partida_nombre?: string;
  familia?: string;
};

// Aggregate actual payment concepts, never the already aggregated `pagado`
// fields. Direct payments at every level and refunds count exactly once.
export function calculateHierarchyPaymentTotals(
  partidas: readonly PaymentPartida[],
  directPayments: ReadonlyMap<string, number>,
  honorariosMonto?: number,
): Map<string, number> {
  const byRoot = new Map<string, number>();
  const byFamily = new Map<string, number>();
  const familyKey = (root: string, family?: string) => JSON.stringify([root, family || ""]);
  for (const partida of partidas) {
    const amount = directPayments.get(String(partida._id)) || 0;
    const root = partida.nivel === 1 ? partida.nombre : (partida.partida_nombre || partida.nombre);
    byRoot.set(root, (byRoot.get(root) || 0) + amount);
    if (partida.nivel >= 2) {
      const key = familyKey(root, partida.familia);
      byFamily.set(key, (byFamily.get(key) || 0) + amount);
    }
  }
  return new Map(partidas.map(partida => {
    const root = partida.nivel === 1 ? partida.nombre : (partida.partida_nombre || partida.nombre);
    const amount = partida.nivel === 1
      ? (isHonorariosPartida(partida) && honorariosMonto !== undefined ? honorariosMonto : (byRoot.get(root) || 0))
      : partida.nivel === 2
        ? (byFamily.get(familyKey(root, partida.familia)) || 0)
        : (directPayments.get(String(partida._id)) || 0);
    return [String(partida._id), amount];
  }));
}
