export const TASK_EMAIL_NOTIFICATION_TYPES = [
  "assigned",
  "unassigned",
  "comment_added",
  "mentioned",
  "due_date_changed",
  "priority_changed",
  "status_changed",
  "blocked",
  "reopened",
  "cancelled",
  "completed",
  "due_soon",
  "due_today",
  "overdue",
] as const;

export type TaskEmailNotificationType = typeof TASK_EMAIL_NOTIFICATION_TYPES[number];

export type TaskEmailTemplateData = {
  type: TaskEmailNotificationType;
  recipientName: string;
  actorName: string;
  projectName: string;
  taskTitle: string;
  taskDescription?: string;
  status: string;
  priority: string;
  dueDate?: string;
  category?: string;
  detail?: string;
  oldValue?: string;
  newValue?: string;
  taskUrl: string;
  logoUrl: string;
  occurredAt: number;
  mockPosition?: { current: number; total: number };
};

export const TASK_EMAIL_NOTIFICATION_MATRIX: ReadonlyArray<{
  type: TaskEmailNotificationType;
  label: string;
  actorAction: string;
  subject: string;
  headline: string;
  defaultDetail: string;
}> = [
  { type: "assigned", label: "Nueva asignación", actorAction: "te asignó una tarea", subject: "Te asignaron una tarea", headline: "TIENES UNA NUEVA TAREA ASIGNADA", defaultDetail: "Revisa el alcance y confirma el seguimiento de esta tarea." },
  { type: "unassigned", label: "Asignación retirada", actorAction: "actualizó los responsables", subject: "Ya no estás asignado a una tarea", headline: "TU ASIGNACIÓN FUE ACTUALIZADA", defaultDetail: "Ya no apareces como responsable de esta tarea." },
  { type: "comment_added", label: "Nuevo comentario", actorAction: "agregó un comentario", subject: "Nuevo comentario en una tarea", headline: "HAY UN NUEVO COMENTARIO", defaultDetail: "Se agregó un comentario a una tarea que sigues." },
  { type: "mentioned", label: "Mención", actorAction: "te mencionó", subject: "Te mencionaron en una tarea", headline: "TE MENCIONARON EN UN COMENTARIO", defaultDetail: "Revisa el comentario y responde si es necesario." },
  { type: "due_date_changed", label: "Fecha límite actualizada", actorAction: "cambió la fecha límite", subject: "Cambió la fecha límite de una tarea", headline: "LA FECHA LÍMITE FUE ACTUALIZADA", defaultDetail: "Revisa la nueva fecha y ajusta tu planeación." },
  { type: "priority_changed", label: "Prioridad actualizada", actorAction: "cambió la prioridad", subject: "Cambió la prioridad de una tarea", headline: "LA PRIORIDAD FUE ACTUALIZADA", defaultDetail: "La prioridad cambió; revisa si debes ajustar el orden de atención." },
  { type: "status_changed", label: "Estado actualizado", actorAction: "cambió el estado", subject: "Cambió el estado de una tarea", headline: "EL ESTADO DE LA TAREA CAMBIÓ", defaultDetail: "Consulta el nuevo estado y el historial de la tarea." },
  { type: "blocked", label: "Tarea bloqueada", actorAction: "bloqueó una tarea", subject: "Una tarea fue bloqueada", headline: "LA TAREA NECESITA APOYO", defaultDetail: "La tarea está bloqueada. Revisa el impedimento y define el siguiente paso." },
  { type: "reopened", label: "Tarea reabierta", actorAction: "reabrió una tarea", subject: "Una tarea fue reabierta", headline: "LA TAREA FUE REABIERTA", defaultDetail: "La tarea volvió a estar activa y necesita seguimiento." },
  { type: "cancelled", label: "Tarea cancelada", actorAction: "canceló una tarea", subject: "Una tarea fue cancelada", headline: "LA TAREA FUE CANCELADA", defaultDetail: "La tarea ya no requiere seguimiento, salvo que se reactive." },
  { type: "completed", label: "Tarea completada", actorAction: "completó una tarea", subject: "Una tarea fue completada", headline: "LA TAREA FUE COMPLETADA", defaultDetail: "La tarea se marcó como completada. Puedes consultar su historial." },
  { type: "due_soon", label: "Próxima a vencer", actorAction: "envió un recordatorio", subject: "Una tarea vence en los próximos 3 días", headline: "LA TAREA ESTÁ PRÓXIMA A VENCER", defaultDetail: "Quedan pocos días para completar esta tarea." },
  { type: "due_today", label: "Vence hoy", actorAction: "envió un recordatorio", subject: "Una tarea vence hoy", headline: "LA TAREA VENCE HOY", defaultDetail: "Esta tarea llega hoy a su fecha límite." },
  { type: "overdue", label: "Tarea vencida", actorAction: "detectó una tarea vencida", subject: "Una tarea está vencida", headline: "LA TAREA NECESITA ATENCIÓN", defaultDetail: "La fecha límite ya pasó y la tarea continúa activa." },
];

const COLORS = {
  background: "#FAFAFA",
  gray: "#716F6D",
  black: "#1D2436",
  white: "#FFFFFF",
  border: "#E5E3E1",
  avatar: "#EEEDEB",
} as const;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value?: string) {
  if (!value) return "Sin fecha límite";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OG";
}

function eventCopy(data: TaskEmailTemplateData) {
  const config = TASK_EMAIL_NOTIFICATION_MATRIX.find((item) => item.type === data.type);
  if (!config) throw new Error(`Unsupported task notification type: ${data.type}`);

  const transitions: Partial<Record<TaskEmailNotificationType, string>> = {
    due_date_changed: `La fecha límite cambió de ${formatDate(data.oldValue)} a ${formatDate(data.newValue)}.`,
    priority_changed: `La prioridad cambió de ${data.oldValue || "Sin prioridad"} a ${data.newValue || data.priority}.`,
    status_changed: `El estado cambió de ${data.oldValue || "Sin estado"} a ${data.newValue || data.status}.`,
    blocked: data.detail || "La tarea está bloqueada. Revisa el impedimento y define el siguiente paso.",
    reopened: `La tarea cambió de ${data.oldValue || "Completada"} a ${data.newValue || data.status}.`,
    completed: data.detail || "La tarea se marcó como completada. Puedes consultar su historial.",
    cancelled: data.detail || "La tarea ya no requiere seguimiento, salvo que se reactive.",
  };

  return {
    ...config,
    detail: data.detail?.trim() || transitions[data.type] || config.defaultDetail,
  };
}

export function getTaskEmailSubject(data: TaskEmailTemplateData) {
  const copy = eventCopy(data);
  const prefix = data.mockPosition
    ? `[MOCK ${String(data.mockPosition.current).padStart(2, "0")}/${String(data.mockPosition.total).padStart(2, "0")}] `
    : "";
  return `${prefix}${copy.subject} · ${data.taskTitle}`;
}

export function renderTaskEmail(data: TaskEmailTemplateData) {
  const copy = eventCopy(data);
  const recipientName = escapeHtml(data.recipientName || "Equipo OGC");
  const actorName = escapeHtml(data.actorName || "OGC Dashboard");
  const projectName = escapeHtml(data.projectName || "General");
  const taskTitle = escapeHtml(data.taskTitle);
  const taskDescription = data.taskDescription ? escapeHtml(data.taskDescription) : "";
  const detail = escapeHtml(copy.detail);
  const taskUrl = escapeHtml(data.taskUrl);
  const logoUrl = escapeHtml(data.logoUrl);
  const actorInitials = escapeHtml(initials(data.actorName));
  const meta = [data.category, data.priority, formatDate(data.dueDate)].filter(Boolean).map((item) => escapeHtml(String(item)));
  const mockLabel = data.mockPosition
    ? `<div style="margin:0 0 16px;color:${COLORS.gray};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Plantilla mock ${data.mockPosition.current} de ${data.mockPosition.total} · ${escapeHtml(copy.label)}</div>`
    : "";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.background};color:${COLORS.black};font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.headline)} · ${taskTitle}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:${COLORS.background};">
      <tr>
        <td align="center" style="padding:40px 18px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;">
            <tr>
              <td style="padding:0 0 28px 2px;">
                <img src="${logoUrl}" width="58" height="58" alt="OGC" style="display:block;width:58px;height:58px;object-fit:contain;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:14px;padding:34px 40px 38px;">
                ${mockLabel}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="top" style="padding:0 20px 28px 0;font-size:16px;line-height:1.5;color:${COLORS.black};">${projectName}</td>
                    <td valign="top" align="right" style="padding:0 0 28px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" align="right">
                        <tr>
                          <td valign="top"><div style="width:46px;height:46px;border-radius:50%;background:${COLORS.avatar};color:${COLORS.gray};font-size:14px;line-height:46px;text-align:center;">${actorInitials}</div></td>
                          <td valign="top" style="padding-left:13px;text-align:left;">
                            <div style="font-size:16px;line-height:1.35;color:${COLORS.gray};">${actorName}</div>
                            <div style="font-size:12px;line-height:1.5;color:${COLORS.gray};">${escapeHtml(copy.actorAction)}</div>
                            <div style="font-size:12px;line-height:1.5;color:${COLORS.gray};">${escapeHtml(formatDateTime(data.occurredAt))}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <div style="margin:14px 0 22px;color:${COLORS.gray};font-size:12px;font-weight:700;letter-spacing:1.7px;line-height:1.45;">${escapeHtml(copy.headline)}</div>
                <div style="margin:0 0 9px;color:${COLORS.gray};font-size:14px;line-height:1.5;">${meta.join(" &nbsp;·&nbsp; ")}</div>
                <h1 style="margin:0 0 26px;color:${COLORS.black};font-size:25px;font-weight:400;line-height:1.28;">${taskTitle}</h1>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:${COLORS.background};border-left:4px solid ${COLORS.gray};">
                  <tr>
                    <td style="padding:22px 20px;">
                      <div style="margin:0 0 12px;color:${COLORS.gray};font-size:11px;font-weight:700;letter-spacing:1.4px;">DETALLE</div>
                      <div style="color:${COLORS.black};font-size:14px;line-height:1.55;">${detail}</div>
                      ${taskDescription ? `<div style="margin-top:12px;color:${COLORS.gray};font-size:13px;line-height:1.5;">${taskDescription}</div>` : ""}
                    </td>
                  </tr>
                </table>
                <div style="margin:30px 0 0;color:${COLORS.gray};font-size:13px;line-height:1.5;">Hola ${recipientName}, este aviso se relaciona con una tarea bajo tu seguimiento.</div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;">
                  <tr>
                    <td bgcolor="${COLORS.black}" style="border-radius:6px;">
                      <a href="${taskUrl}" style="display:inline-block;padding:14px 25px;color:${COLORS.white};font-size:14px;font-weight:700;text-decoration:none;">Ver tarea en OGC</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 14px 0;color:${COLORS.gray};font-size:11px;line-height:1.5;">
                Este correo fue enviado automáticamente por OGC Dashboard.<br />No respondas a este mensaje.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildTaskEmailMockData(
  type: TaskEmailNotificationType,
  position: { current: number; total: number },
  overrides: Partial<TaskEmailTemplateData> = {},
): TaskEmailTemplateData {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + (type === "overdue" ? -2 : type === "due_today" ? 0 : 3));
  const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  const transitionByType: Partial<Record<TaskEmailNotificationType, { oldValue?: string; newValue?: string; detail?: string }>> = {
    mentioned: { detail: "@Felix ¿puedes validar la solución propuesta antes de liberar el plano?" },
    comment_added: { detail: "Se confirmó el trazo. Falta validar la cota final con el equipo de arquitectura." },
    due_date_changed: { oldValue: "2026-08-20", newValue: "2026-08-25" },
    priority_changed: { oldValue: "Media", newValue: "Urgente" },
    status_changed: { oldValue: "Pendiente", newValue: "En progreso" },
    blocked: { oldValue: "En progreso", newValue: "Bloqueada", detail: "Falta la confirmación estructural para continuar con la solución." },
    reopened: { oldValue: "Completada", newValue: "En progreso" },
    cancelled: { oldValue: "Pendiente", newValue: "Cancelada" },
    completed: { oldValue: "En progreso", newValue: "Completada" },
  };

  return {
    type,
    recipientName: "Felix Nolasco",
    actorName: type === "due_soon" || type === "due_today" || type === "overdue" ? "OGC Dashboard" : "Gerardo Acosta",
    projectName: "Larena - Acceso",
    taskTitle: "PLANTA ARQUITECTÓNICA NIVEL 01",
    taskDescription: "Confirmar la solución del acceso y actualizar la cota indicada antes de liberar el plano.",
    status: type === "completed" ? "Completada" : type === "blocked" ? "Bloqueada" : "En progreso",
    priority: type === "priority_changed" ? "Urgente" : "Alta",
    dueDate,
    category: "Arquitectura",
    taskUrl: "https://dashboard.ogc.mx/tareas?mock=1",
    logoUrl: "https://dashboard.ogc.mx/OGC-LOGO.svg",
    occurredAt: Date.now(),
    mockPosition: position,
    ...transitionByType[type],
    ...overrides,
  };
}
