export type RequisicionState = {
    status: string;
    status_entrega?: string;
    status_revision?: string;
    pago_obra?: { estado: string };
};

export type RequisicionStateChange = { paymentStatus?: string; deliveryStatus?: string };

export function isRequisicionApproved(req: Pick<RequisicionState, "status_revision">) {
    return req.status_revision === "Aprobada" || req.status_revision === "Parcialmente Aprobada";
}

export function getRequisicionStateChange(req: RequisicionState, change: RequisicionStateChange) {
    const payment = change.paymentStatus !== undefined;
    const before = payment ? req.status : req.status_entrega || "Pendiente";
    const after = change.paymentStatus ?? change.deliveryStatus ?? before;
    const changed = before !== after;
    const requiresApproval = changed && (payment ? after === "Pagado" : ["Parcial", "Completo"].includes(after));
    const blockedReason = requiresApproval && !isRequisicionApproved(req)
        ? "Primero completa la revisión de materiales. La requisición debe estar Aprobada o Parcialmente Aprobada."
        : undefined;
    const rows = [
        { label: "Aprobación", before: req.status_revision || "Pendiente de revisión", after: req.status_revision || "Pendiente de revisión" },
        { label: "Pago", before: req.status, after: payment ? after : req.status },
        { label: "Entrega", before: req.status_entrega || "Pendiente", after: payment ? req.status_entrega || "Pendiente" : after },
    ];
    if (changed && payment && req.pago_obra?.estado === "pendiente" && ["Pagado", "Cancelado"].includes(after)) {
        rows.push({ label: "Solicitud de pago en obra", before: "pendiente", after: after === "Pagado" ? "pagado" : "cancelada" });
    }
    return { changed, blockedReason, before, after, rows, label: payment ? "Pago" : "Entrega" };
}

export function assertRequisicionStateChange(req: RequisicionState, change: RequisicionStateChange, expected?: string) {
    const transition = getRequisicionStateChange(req, change);
    if (!transition.changed) return transition;
    if (expected !== undefined && transition.before !== expected) {
        throw new Error("El estado cambió mientras confirmabas. Reabre el diálogo para revisar el cambio actual.");
    }
    if (transition.blockedReason) throw new Error(transition.blockedReason);
    return transition;
}
