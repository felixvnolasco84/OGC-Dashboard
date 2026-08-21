import type { Id } from "../../../convex/_generated/dataModel";
import {
  ArrowRight,
  Clock3,
  FilePlus2,
  MessageSquareText,
  Paperclip,
  RefreshCw,
} from "lucide-react";
import {
  formatFileSize,
  formatRfiDate,
  formatRfiDateTime,
  IMPACT_OPTIONS,
  RFI_STATUS,
  type RfiDisplayStatus,
} from "./rfiUi";

type HistoryAttachment = {
  _id: Id<"rfi_attachments">;
  nombre: string;
  size: number;
  url: string | null;
};

export type RfiHistoryEntry = {
  _id: Id<"rfi_history">;
  action: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  actor_id: Id<"users">;
  actor_name: string;
  created_at: number;
  attachments?: HistoryAttachment[];
};

const FIELD_LABELS: Record<string, string> = {
  subject: "el asunto",
  background: "los antecedentes",
  question: "la pregunta",
  received_from_id: "quién envió la solicitud",
  rfi_manager_id: "el responsable de la RFI",
  assignee_ids: "las personas asignadas",
  required_assignee_ids: "las respuestas obligatorias",
  distribution_user_ids: "la lista de distribución",
  due_date: "la fecha límite",
  location: "la ubicación",
  drawing_number: "el plano",
  spec_section: "la especificación",
  partida_id: "la partida",
  project_stage: "la etapa",
  cost_impact: "el impacto en costo",
  cost_impact_amount: "el monto estimado",
  schedule_impact: "el impacto en programa",
  schedule_impact_days: "los días estimados",
  is_private: "la privacidad",
  status: "el estado",
  responses: "las respuestas",
  official_response: "la respuesta oficial",
  attachments: "los adjuntos",
  response_attachment: "los adjuntos de respuesta",
};

const USER_FIELDS = new Set(["received_from_id", "rfi_manager_id"]);
const USER_LIST_FIELDS = new Set([
  "assignee_ids",
  "required_assignee_ids",
  "distribution_user_ids",
]);

function parseHistoryValue(value?: string): unknown {
  if (value === undefined || value === "") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function listSummary(values: string[]) {
  if (values.length === 0) return "Sin asignar";
  if (values.length <= 3) return values.join(", ");
  return `${values.slice(0, 3).join(", ")} +${values.length - 3}`;
}

function formatHistoryValue(
  field: string | undefined,
  value: string | undefined,
  usersById: ReadonlyMap<string, { name: string; email: string }>,
  partidasById: ReadonlyMap<string, { nombre: string }>,
) {
  const parsed = parseHistoryValue(value);
  if (parsed === undefined || parsed === null || parsed === "") {
    return USER_LIST_FIELDS.has(field || "")
      ? "Sin asignar"
      : "Sin especificar";
  }

  if (USER_FIELDS.has(field || "") && typeof parsed === "string") {
    const user = usersById.get(parsed);
    return user?.name || user?.email || "Usuario no disponible";
  }

  if (USER_LIST_FIELDS.has(field || "") && Array.isArray(parsed)) {
    return listSummary(
      parsed.map((userId) => {
        const user = usersById.get(String(userId));
        return user?.name || user?.email || "Usuario no disponible";
      }),
    );
  }

  if (field === "partida_id" && typeof parsed === "string") {
    return (
      partidasById.get(parsed)?.nombre || "Partida no disponible"
    );
  }

  if (field === "status" && typeof parsed === "string") {
    return (
      RFI_STATUS[parsed as RfiDisplayStatus]?.label ||
      parsed.replace(/_/g, " ")
    );
  }

  if (
    (field === "cost_impact" || field === "schedule_impact") &&
    typeof parsed === "string"
  ) {
    return (
      IMPACT_OPTIONS.find((option) => option.value === parsed)?.label || parsed
    );
  }

  if (field === "due_date" && typeof parsed === "string") {
    return formatRfiDate(parsed);
  }

  if (field === "cost_impact_amount" && typeof parsed === "number") {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(parsed);
  }

  if (field === "schedule_impact_days" && typeof parsed === "number") {
    return `${parsed} día${parsed === 1 ? "" : "s"}`;
  }

  if (field === "is_private" && typeof parsed === "boolean") {
    return parsed ? "Privada" : "Visible para el proyecto";
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "body" in parsed &&
    typeof parsed.body === "string"
  ) {
    return parsed.body;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "name" in parsed &&
    typeof parsed.name === "string"
  ) {
    return parsed.name;
  }

  if (Array.isArray(parsed)) return listSummary(parsed.map(String));
  if (typeof parsed === "boolean") return parsed ? "Sí" : "No";
  if (typeof parsed === "object") return JSON.stringify(parsed);
  return String(parsed);
}

function responseBodyPreview(value?: string) {
  const parsed = parseHistoryValue(value);
  if (
    parsed &&
    typeof parsed === "object" &&
    "body" in parsed &&
    typeof parsed.body === "string"
  ) {
    return parsed.body;
  }
  return undefined;
}

function historyLabel(item: RfiHistoryEntry) {
  if (item.action === "created") return "Creó la RFI";
  if (item.action === "submitted_for_review") {
    return "Envió la RFI a revisión";
  }
  if (item.action === "opened") return "Abrió la RFI";
  if (item.action === "closed") return "Cerró la RFI";
  if (item.action === "reopened") return "Reabrió la RFI";
  if (item.action === "response_added") return "Agregó una respuesta";
  if (item.action === "official_response_selected") {
    return "Seleccionó una respuesta oficial";
  }
  if (item.action === "attachment_added") return "Adjuntó un archivo";
  if (item.field_changed) {
    return `Actualizó ${FIELD_LABELS[item.field_changed] || item.field_changed.replace(/_/g, " ")}`;
  }
  return "Actualizó la RFI";
}

function actionIcon(action: string) {
  if (action === "created") return FilePlus2;
  if (
    action === "response_added" ||
    action === "official_response_selected"
  ) {
    return MessageSquareText;
  }
  if (action === "attachment_added") return Paperclip;
  if (
    action === "submitted_for_review" ||
    action === "opened" ||
    action === "closed" ||
    action === "reopened"
  ) {
    return RefreshCw;
  }
  return Clock3;
}

function HistoryValue({ value }: { value: string }) {
  if (value.length <= 140) {
    return <span className="break-words">{value}</span>;
  }
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground">Ver contenido</summary>
      <p className="mt-2 whitespace-pre-wrap break-words">{value}</p>
    </details>
  );
}

export function RfiHistoryTimeline({
  history,
  usersById,
  partidasById,
}: {
  history: RfiHistoryEntry[];
  usersById: ReadonlyMap<string, { name: string; email: string }>;
  partidasById: ReadonlyMap<string, { nombre: string }>;
}) {
  if (history.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-8 text-center">
        <Clock3 className="mx-auto h-5 w-5 text-disabled-foreground" />
        <p className="mt-3 text-sm text-subtle-foreground">
          Aún no hay movimientos registrados.
        </p>
      </div>
    );
  }

  return (
    <ol className="divide-y divide-border">
      {history.map((item) => {
        const Icon = actionIcon(item.action);
        const actor =
          usersById.get(String(item.actor_id))?.name ||
          item.actor_name ||
          "Usuario no disponible";
        const showValueChange =
          item.action !== "created" &&
          item.action !== "response_added" &&
          item.action !== "official_response_selected" &&
          item.action !== "attachment_added" &&
          (item.old_value !== undefined || item.new_value !== undefined);
        const oldValue = formatHistoryValue(
          item.field_changed,
          item.old_value,
          usersById,
          partidasById,
        );
        const newValue = formatHistoryValue(
          item.field_changed,
          item.new_value,
          usersById,
          partidasById,
        );
        const responsePreview =
          item.action === "response_added" ||
          item.action === "official_response_selected"
            ? responseBodyPreview(item.new_value)
            : undefined;

        return (
          <li key={item._id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-muted text-subtle-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-medium text-foreground">
                  {historyLabel(item)}
                </p>
                <time className="shrink-0 text-xs text-disabled-foreground">
                  {formatRfiDateTime(item.created_at)}
                </time>
              </div>
              <p className="mt-1 text-xs text-subtle-foreground">{actor}</p>

              {showValueChange && (
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] sm:items-start">
                  <div className="rounded-sm bg-card px-3 py-2">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-disabled-foreground">
                      Antes
                    </span>
                    <HistoryValue value={oldValue} />
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-disabled-foreground sm:mt-5 sm:block" />
                  <div className="rounded-sm bg-card px-3 py-2">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-disabled-foreground">
                      Después
                    </span>
                    <HistoryValue value={newValue} />
                  </div>
                </div>
              )}

              {responsePreview && (
                <div className="mt-3 rounded-sm bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <HistoryValue value={responsePreview} />
                </div>
              )}

              {item.attachments && item.attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {item.attachments.map((attachment) =>
                    attachment.url ? (
                      <a
                        key={attachment._id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-background"
                      >
                        <span className="truncate">{attachment.nombre}</span>
                        <span className="shrink-0 text-disabled-foreground">
                          {formatFileSize(attachment.size)}
                        </span>
                      </a>
                    ) : (
                      <div
                        key={attachment._id}
                        className="rounded-sm border border-border px-3 py-2 text-xs text-subtle-foreground"
                      >
                        {attachment.nombre}
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
