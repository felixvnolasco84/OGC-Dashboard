export const REQUISICION_NOTIFICATION_MATRIX = [
  {
    type: "created",
    label: "Nueva requisicion",
    actionLabel: "creo una requisicion",
    subject: "Nueva requisicion",
    audienceLabel: "Administracion y Finanzas",
    channelsLabel: "In-app y correo",
    priorityLabel: "Alta",
    slaLabel: "Mismo dia",
    requiresRequisition: true,
    defaultMessage: "Hay una nueva requisicion pendiente de revision en el proyecto.",
  },
  {
    type: "updated",
    label: "Actualizacion",
    actionLabel: "actualizo una requisicion",
    subject: "Requisicion actualizada",
    audienceLabel: "Administracion, Finanzas y solicitante",
    channelsLabel: "In-app y correo",
    priorityLabel: "Media",
    slaLabel: "24 horas",
    requiresRequisition: true,
    defaultMessage: "Hay una actualizacion en una requisicion del proyecto.",
  },
  {
    type: "reviewed",
    label: "Revision",
    actionLabel: "reviso una requisicion",
    subject: "Requisicion revisada",
    audienceLabel: "Solicitante, Administracion y Finanzas",
    channelsLabel: "In-app y correo",
    priorityLabel: "Alta",
    slaLabel: "Mismo dia",
    requiresRequisition: true,
    defaultMessage: "La requisicion fue revisada. Consulta el resultado y los comentarios.",
  },
  {
    type: "assigned",
    label: "Proveedor asignado",
    actionLabel: "asigno proveedor",
    subject: "Proveedor asignado",
    audienceLabel: "Solicitante, Administracion y Finanzas",
    channelsLabel: "In-app y correo",
    priorityLabel: "Media",
    slaLabel: "24 horas",
    requiresRequisition: true,
    defaultMessage: "Se asigno un proveedor a la requisicion.",
  },
  {
    type: "payment",
    label: "Pago",
    actionLabel: "actualizo pago",
    subject: "Pago actualizado",
    audienceLabel: "Solicitante, Administracion y Finanzas",
    channelsLabel: "In-app y correo",
    priorityLabel: "Alta",
    slaLabel: "Mismo dia",
    requiresRequisition: true,
    defaultMessage: "El estado de pago de la requisicion fue actualizado.",
  },
  {
    type: "delivery",
    label: "Entrega",
    actionLabel: "actualizo entrega",
    subject: "Entrega actualizada",
    audienceLabel: "Solicitante, Administracion y Finanzas",
    channelsLabel: "In-app y correo",
    priorityLabel: "Media",
    slaLabel: "24 horas",
    requiresRequisition: true,
    defaultMessage: "El estado de entrega de la requisicion fue actualizado.",
  },
] as const;

export type RequisicionNotificationType = typeof REQUISICION_NOTIFICATION_MATRIX[number]["type"];
export type RequisicionNotificationConfig = typeof REQUISICION_NOTIFICATION_MATRIX[number];

export function getRequisicionNotificationConfig(type: string): RequisicionNotificationConfig {
  return (
    REQUISICION_NOTIFICATION_MATRIX.find((item) => item.type === type) ??
    REQUISICION_NOTIFICATION_MATRIX[0]
  );
}
