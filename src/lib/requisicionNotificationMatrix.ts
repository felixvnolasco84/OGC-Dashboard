export const REQUISICION_NOTIFICATION_MATRIX = [
  { type: "created", label: "Nueva requisición", actionLabel: "creó una requisición", subject: "Nueva requisición", audienceLabel: "Administración y Finanzas", audience: ["project_admins", "finance_team"], channelsLabel: "App y correo", priorityLabel: "Alta", slaLabel: "Mismo día", requiresRequisition: true, defaultMessage: "Hay una nueva requisición pendiente de revisión." },
  { type: "updated", label: "Actualización", actionLabel: "actualizó una requisición", subject: "Requisición actualizada", audienceLabel: "Administración, Finanzas y solicitante", audience: ["project_admins", "finance_team", "requester"], channelsLabel: "App y correo", priorityLabel: "Media", slaLabel: "24 horas", requiresRequisition: true, defaultMessage: "Hay una actualización en una requisición del proyecto." },
  { type: "reviewed", label: "Revisión", actionLabel: "revisó una requisición", subject: "Requisición revisada", audienceLabel: "Solicitante", audience: ["requester"], channelsLabel: "App y correo", priorityLabel: "Alta", slaLabel: "Mismo día", requiresRequisition: true, defaultMessage: "Consulta el resultado de la revisión y sus comentarios." },
  { type: "assigned", label: "Proveedor asignado", actionLabel: "asignó proveedor", subject: "Proveedor asignado", audienceLabel: "Solicitante y Finanzas", audience: ["requester", "finance_team"], channelsLabel: "App y correo", priorityLabel: "Media", slaLabel: "24 horas", requiresRequisition: true, defaultMessage: "Se asignó un proveedor a la requisición." },
  { type: "onsite_payment_requested", label: "Pago en obra solicitado", actionLabel: "solicitó un pago en obra", subject: "Pago en obra solicitado", audienceLabel: "Finanzas y Administración", audience: ["finance_team", "project_admins"], channelsLabel: "App y correo", priorityLabel: "Alta", slaLabel: "Mismo día", requiresRequisition: true, defaultMessage: "Hay una solicitud de pago en obra pendiente." },
  { type: "payment", label: "Pago confirmado", actionLabel: "confirmó un pago", subject: "Pago confirmado", audienceLabel: "Solicitante, Administración y Almacén", audience: ["requester", "project_admins", "warehouse_team"], channelsLabel: "App y correo", priorityLabel: "Alta", slaLabel: "Mismo día", requiresRequisition: true, defaultMessage: "La requisición se marcó como pagada." },
  { type: "delivery", label: "Entrega", actionLabel: "registró una entrega", subject: "Entrega actualizada", audienceLabel: "Solicitante, Finanzas y Administración", audience: ["requester", "finance_team", "project_admins"], channelsLabel: "App y correo", priorityLabel: "Media", slaLabel: "24 horas", requiresRequisition: true, defaultMessage: "Se actualizó la recepción de materiales." },
] as const;

export type RequisicionNotificationType = typeof REQUISICION_NOTIFICATION_MATRIX[number]["type"];
export type RequisicionNotificationConfig = typeof REQUISICION_NOTIFICATION_MATRIX[number];
export type RequisicionNotificationAudience = "project_admins" | "finance_team" | "requester" | "warehouse_team";

export function getRequisicionNotificationConfig(type: string): RequisicionNotificationConfig {
  const config = REQUISICION_NOTIFICATION_MATRIX.find((item) => item.type === type);
  if (!config) throw new Error("Tipo de notificación no soportado");
  return config;
}

export function shouldNotifyRequisitionUser(args: {
  type: RequisicionNotificationType;
  userId: string;
  actorId: string;
  requesterId: string;
  role: string;
  email: string;
  invitationStatus?: string;
  hasProjectAccess: boolean;
}): boolean {
  if (!args.email.trim() || args.invitationStatus === "pending" || !args.hasProjectAccess || args.userId === args.actorId) return false;
  const audience = getRequisicionNotificationConfig(args.type).audience as readonly RequisicionNotificationAudience[];
  return audience.some(key =>
    key === "requester" ? args.userId === args.requesterId :
    key === "project_admins" ? args.role === "admin" :
    key === "warehouse_team" ? args.role === "almacenista" :
    args.role === "finance"
  );
}

export function validateOnsitePaymentRequest(args: {
  statusRevision?: string;
  status: string;
  paymentState?: string;
  amount: number;
  reason: string;
}): string {
  if (!["Aprobada", "Parcialmente Aprobada"].includes(args.statusRevision || "") || args.status === "Pagado" || args.status === "Cancelado") throw new Error("La requisición debe estar aprobada y pendiente de pago");
  if (args.paymentState === "pendiente") throw new Error("Ya existe una solicitud de pago en obra pendiente");
  if (!Number.isFinite(args.amount) || args.amount <= 0 || Math.abs(args.amount * 100 - Math.round(args.amount * 100)) > 0.000001) throw new Error("Ingresa un importe válido con hasta dos decimales");
  const reason = args.reason.trim();
  if (!reason) throw new Error("Ingresa el motivo del pago");
  if (reason.length > 500) throw new Error("El motivo no puede superar 500 caracteres");
  return reason;
}

export function isValidRemissionPhoto(file: { type: string; size: number }): boolean {
  return file.type.startsWith("image/") && file.size > 0 && file.size <= 10 * 1024 * 1024;
}

export function canAddRemissionPhotos(args: { role: string; status: string; hasProjectAccess: boolean }): boolean {
  return (args.role === "almacenista" || args.role === "admin") && args.status === "Pagado" && args.hasProjectAccess;
}

export function countUnreadRequisitionNotifications(deliveries: ReadonlyArray<{
  requisicion_id?: string;
  channel: string;
  read_at?: number;
}>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const delivery of deliveries) {
    if (delivery.channel === "in_app" && !delivery.read_at && delivery.requisicion_id) {
      counts[delivery.requisicion_id] = (counts[delivery.requisicion_id] || 0) + 1;
    }
  }
  return counts;
}

export function notificationForStatusTransition(kind: "payment" | "delivery" | "review", previous: string | undefined, next: string): RequisicionNotificationType | null {
  if (previous === next) return null;
  if (kind === "payment") return next === "Pagado" ? "payment" : null;
  if (kind === "delivery") return next === "Parcial" || next === "Completo" ? "delivery" : null;
  return "reviewed";
}

export function requisitionDetailUrl(baseUrl: string, projectId: string, requisicionId?: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const path = `${base}/proyecto/${encodeURIComponent(projectId)}/requisiciones`;
  return requisicionId ? `${path}?requisicion=${encodeURIComponent(requisicionId)}` : path;
}
