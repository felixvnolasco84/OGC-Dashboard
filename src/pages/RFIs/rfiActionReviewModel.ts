import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type RfiDetail = FunctionReturnType<typeof api.rfis.getDetail>;
export type RfiAction = "submit" | "open" | "official" | "close" | "reopen";
export type RfiConfirmation = "open" | "official" | "close";

export const RFI_ACTION_LABELS: Record<RfiAction, string> = {
  submit: "Enviar a revisión", open: "Abrir RFI", official: "Marcar como oficial", close: "Cerrar RFI", reopen: "Reabrir RFI",
};
export const NEXT_STATE: Record<RfiAction, string> = { submit: "pending_manager_review", open: "open", official: "open", close: "closed", reopen: "open" };

export function rfiActionBlocked(detail: RfiDetail, action: RfiAction, responseId?: string) {
  const permission = { submit: detail.permissions.can_submit, open: detail.permissions.can_open, official: detail.permissions.can_mark_official, close: detail.permissions.can_close, reopen: detail.permissions.can_reopen }[action];
  if (!permission) return "Esta acción ya no está disponible con tu acceso y el estado actual de la RFI.";
  if (action === "submit" && !detail.rfi.rfi_manager_id) return "Selecciona una persona responsable antes de enviar a revisión.";
  if (action === "open" && !detail.rfi.assignee_ids.length) return "Asigna al menos una persona antes de abrir la RFI.";
  if (action === "open" && !detail.rfi.due_date) return "Define una fecha límite antes de abrir la RFI.";
  if (action === "close" && !detail.responses.some((r) => r.is_official)) return "Selecciona al menos una respuesta oficial antes de cerrar.";
  if (action === "official") {
    const response = detail.responses.find((r) => r._id === responseId);
    if (!response) return "La respuesta seleccionada ya no está disponible.";
    if (response.is_official) return "Esta respuesta ya fue marcada como oficial. No se registrará otra selección.";
  }
  return null;
}
