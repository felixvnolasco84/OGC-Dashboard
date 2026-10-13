import type { Id } from "../../convex/_generated/dataModel";
import type { RequisicionItem } from "../hooks/nueva-requisicion-modal";

export function buildRequestedRequisicionItems(rootId: Id<"partidas">, items: readonly RequisicionItem[]) {
    return items.flatMap(item => item.subPartidas.filter(sp => sp.cantidad > 0).map(sp => ({
        // Requisitions link to the selected root; family and material are labels.
        // Leaf IDs in the form only identify the budget used to prefill prices.
        partida_id: rootId,
        familia: item.familia.trim(),
        sub_partida: (sp.sub_partida === "OTRO" ? sp.descripcion_otro : sp.sub_partida)?.trim(),
        cantidad: sp.cantidad,
        unidad: sp.unidad.trim(),
        monto: sp.monto,
    })));
}
