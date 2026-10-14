import { ConvexError } from "convex/values";

export type RequestedRequisicionItem = {
    partida_id: string;
    familia: string;
    sub_partida?: string;
    cantidad: number;
    unidad: string;
    monto?: number;
};

export function assertRequestedRequisicionItems(items: readonly RequestedRequisicionItem[]) {
    if (!items.length) throw new ConvexError("Agrega al menos un material a la requisición.");
    for (const item of items) {
        if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
            throw new ConvexError("La cantidad solicitada debe ser un número mayor a cero.");
        }
        if (!item.familia.trim() || !item.unidad.trim() || !item.sub_partida?.trim()) {
            throw new ConvexError("Cada material debe tener familia, descripción y unidad.");
        }
        if (item.monto !== undefined && (!Number.isFinite(item.monto) || item.monto < 0)) {
            throw new ConvexError("El importe del material debe ser un número mayor o igual a cero.");
        }
    }
}

// Compare material values independently of record IDs and display order.
// An unchanged form must preserve item IDs, approvals and reviewer notes.
export function requisicionItemsChanged(before: readonly RequestedRequisicionItem[], after: readonly RequestedRequisicionItem[]) {
    const values = (items: readonly RequestedRequisicionItem[]) => items.map(item => JSON.stringify([
        item.partida_id, item.familia, item.sub_partida ?? "", item.cantidad, item.unidad, item.monto ?? null,
    ])).sort();
    return JSON.stringify(values(before)) !== JSON.stringify(values(after));
}

export function assertRequisicionType(tipo: string) {
    if (!["material", "equipo"].includes(tipo)) throw new ConvexError("Tipo de requisición inválido.");
}
