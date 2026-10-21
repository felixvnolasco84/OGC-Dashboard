import type { Id } from "../../convex/_generated/dataModel";
import type { PartidaItem } from "@/hooks/add-payment-modal";

export type PaymentLineItem = {
  partida_id: Id<"partidas">;
  partida: string;
  familia: string;
  sub_partida: string;
  monto: number;
};

export function buildPaymentDraft(
  partidas: PartidaItem[],
  hasSubPartidas: (partida: string, familia: string) => boolean,
) {
  const lineItems: PaymentLineItem[] = [];
  let incompleteCount = 0;

  for (const partida of partidas) {
    const hasStartedFamily = partida.familias.some((familia) =>
      Boolean(familia.familia || familia.monto || familia.subPartidas.some((sub) => sub.sub_partida || sub.monto)),
    );
    if (!partida.partida) {
      if (hasStartedFamily) incompleteCount++;
      continue;
    }

    let hasSelectedFamily = false;
    for (const familia of partida.familias) {
      if (!familia.familia) {
        if (familia.monto || familia.subPartidas.some((sub) => sub.sub_partida || sub.monto)) incompleteCount++;
        continue;
      }
      hasSelectedFamily = true;

      if (!hasSubPartidas(partida.partida, familia.familia)) {
        if (familia.partida_id && Number.isFinite(familia.monto) && (familia.monto ?? 0) > 0) {
          lineItems.push({
            partida_id: familia.partida_id,
            partida: partida.partida,
            familia: familia.familia,
            sub_partida: "",
            monto: familia.monto!,
          });
        } else {
          incompleteCount++;
        }
        continue;
      }

      let hasStartedSubPartida = false;
      for (const sub of familia.subPartidas) {
        if (!sub.sub_partida && !sub.monto) continue;
        hasStartedSubPartida = true;
        if (sub.partida_id && sub.sub_partida && Number.isFinite(sub.monto) && sub.monto > 0) {
          lineItems.push({
            partida_id: sub.partida_id,
            partida: partida.partida,
            familia: familia.familia,
            sub_partida: sub.sub_partida,
            monto: sub.monto,
          });
        } else {
          incompleteCount++;
        }
      }
      if (!hasStartedSubPartida) incompleteCount++;
    }
    if (!hasSelectedFamily && !hasStartedFamily) incompleteCount++;
  }

  return { lineItems, incompleteCount };
}
