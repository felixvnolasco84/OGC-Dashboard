/** Shared positional contract for the Meta ogc_requisicion_estado_v2 template. */
export const WHATSAPP_STATE_TEMPLATE = "ogc_requisicion_estado_v2";

export type WhatsappRequisitionState = {
  reference: string;
  projectName: string;
  classification: string;
  requesterName: string;
  requestedDate: string;
  review?: string;
  payment: string;
  delivery?: string;
  onsitePaymentPending?: boolean;
  paidTo?: string;
  paidAmount?: number;
  receivedBy?: string;
  url: string;
};

// Variables must stay on one line and cannot introduce WhatsApp formatting.
function plain(value: string | undefined, fallback = "Sin dato", limit = 180) {
  return (value || "").replace(/[\r\n\t*_~`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) || fallback;
}

function shortDate(value: string) {
  const local = value.match(/^(\d{1,2})\/(\d{1,2})\/\d{4}$/);
  if (local) return `${local[1].padStart(2, "0")}/${local[2].padStart(2, "0")}`;
  const iso = value.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return iso ? `${iso[2]}/${iso[1]}` : plain(value, "Fecha sin registrar", 30);
}

export function formatWhatsappRequisition(state: WhatsappRequisitionState) {
  const review = state.review === "Pendiente de revisión" || !state.review ? "Pendiente"
    : state.review === "Parcialmente Aprobada" ? "Parcialmente aprobada" : plain(state.review);
  let payment = state.payment === "En proceso" ? "Pendiente" : plain(state.payment);
  if (state.payment === "Pagado") {
    payment = "Pagado";
    if (state.paidTo?.trim()) payment += ` a ${plain(state.paidTo, "", 100)}`;
    if (state.paidAmount !== undefined && Number.isFinite(state.paidAmount) && state.paidAmount >= 0) {
      payment += ` · $${state.paidAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
  } else if (state.payment === "En proceso" && state.onsitePaymentPending) {
    payment += " · Pago en obra solicitado";
  }
  const receivedBy = state.receivedBy?.trim() ? plain(state.receivedBy, "", 100) : "";
  const delivery = state.delivery === "Completo" ? receivedBy ? `Recibido por ${receivedBy}` : "Recibido"
    : state.delivery === "Parcial" ? `Parcial${receivedBy ? ` · Recibido por ${receivedBy}` : ""}`
    : state.delivery ? plain(state.delivery) : "Pendiente";
  const next = state.payment === "Cancelado" ? "Consulta el detalle de la cancelación"
    : review === "Rechazada" ? "Solicitante revisa los comentarios"
    : review === "Pendiente" ? "Administración revisa la requisición"
    : state.payment === "Pagado" && state.delivery === "Completo" ? "Proceso completo"
    : state.payment === "Pagado" && state.delivery === "Parcial" ? "Obra registra la recepción de los materiales restantes"
    : state.payment === "Pagado" && (!state.delivery || state.delivery === "Pendiente") ? "Obra registra la recepción de materiales"
    : review === "Parcialmente aprobada" ? "Consulta los materiales aprobados y los comentarios"
    : review === "Aprobada" && state.payment === "En proceso" && state.onsitePaymentPending ? "Administración atiende la solicitud de pago en obra"
    : review === "Aprobada" && state.payment === "En proceso" ? "Administración libera pago"
    : "Consulta el detalle de la requisición";
  return [
    plain(state.reference), plain(state.projectName, "Proyecto", 120), plain(state.classification, "Clasificación sin registrar", 200),
    `${plain(state.requesterName, "Solicitante sin registrar", 100)} · ${shortDate(state.requestedDate)}`,
    review, payment, delivery, next, state.url,
  ];
}
