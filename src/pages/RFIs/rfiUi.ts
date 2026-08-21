export type RfiDisplayStatus =
  | "draft"
  | "pending_manager_review"
  | "open"
  | "closed"
  | "overdue"
  | "awaiting_response"
  | "awaiting_official_response";

export const RFI_STATUS: Record<
  RfiDisplayStatus,
  { label: string; color: string; className: string }
> = {
  draft: {
    label: "Borrador",
    color: "hsl(var(--disabled-foreground))",
    className: "border-border bg-card text-muted-foreground",
  },
  pending_manager_review: {
    label: "Pendiente",
    color: "hsl(var(--disabled-foreground))",
    className: "border-border bg-card text-muted-foreground",
  },
  open: {
    label: "Abierto",
    color: "#50AC66",
    className: "border-[#50AC66] bg-card text-[#50AC66]",
  },
  closed: {
    label: "Resuelto",
    color: "#50AC66",
    className: "border-[#50AC66] bg-card text-[#50AC66]",
  },
  overdue: {
    label: "Vencida",
    color: "#E75F79",
    className: "border-[#E75F79] bg-card text-[#E75F79]",
  },
  awaiting_response: {
    label: "Pendiente",
    color: "hsl(var(--disabled-foreground))",
    className: "border-border bg-card text-muted-foreground",
  },
  awaiting_official_response: {
    label: "Abierto",
    color: "#50AC66",
    className: "border-[#50AC66] bg-card text-[#50AC66]",
  },
};

export const IMPACT_OPTIONS = [
  { value: "unknown", label: "Por determinar" },
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
  { value: "na", label: "No aplica" },
] as const;

export const RFI_RESPONSIBLE_ROLES = new Set(["admin", "user"]);

export function formatApplicationRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrador",
    user: "Usuario",
    viewer: "Visualizador",
    contratista: "Contratista",
    finance: "Finanzas",
  };
  return labels[role] || role;
}

export function formatRfiDate(date?: string) {
  if (!date) return "Sin fecha";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatRfiCompactDate(date?: string) {
  if (!date) return "Sin fecha";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(parsed);
}

export function formatRfiRequestedDate(timestamp?: number) {
  if (!timestamp) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function formatRfiDueDistance(date?: string) {
  if (!date) return "Sin vencimiento";
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return "Fecha por confirmar";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days > 1) return `Vence en ${days} días`;
  if (days === -1) return "Venció ayer";
  return `Venció hace ${Math.abs(days)} días`;
}

export function formatRfiDateTime(timestamp?: number) {
  if (!timestamp) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function historyActionLabel(action: string) {
  const labels: Record<string, string> = {
    created: "creó la RFI",
    updated: "actualizó la RFI",
    submitted_for_review: "envió la RFI a revisión",
    opened: "abrió la RFI",
    response_added: "agregó una respuesta",
    official_response_selected: "seleccionó una respuesta oficial",
    closed: "cerró la RFI",
    reopened: "reabrió la RFI",
    attachment_added: "adjuntó un archivo",
  };
  return labels[action] || "actualizó la RFI";
}
