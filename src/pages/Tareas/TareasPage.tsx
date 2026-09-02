import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { STATIC_NEUTRAL_COLORS } from "@/lib/design-tokens";
import type {
  PartidaSummary,
  ProjectLookupMap,
  ProjectOption,
  Task,
  TaskCatalogs,
  TaskComment,
  TaskContextMenu,
  TaskGroup,
  TaskHistory,
  TaskLabelOption,
  TaskNotification,
  UserSummary,
} from "./tareasTypes";
import {
  Ban,
  Bell,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  CircleAlert,
  Clock3,
  ExternalLink,
  Eye,
  Filter,
  GripVertical,
  History,
  ListChecks,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  MoveRight,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_OPTIONS = ["General", "Acabados", "Instalaciones", "Obra", "Finanzas", "Documentos", "Requisicion", "Bitacora"];
const GENERAL_SCOPE = "__general__";
const TASK_UI_COLORS = {
  pending: "hsl(var(--disabled-foreground))",
  blue: "#76AFD9",
  green: "#50AC66",
  itemBg: "transparent",
  projectHeaderBorder: "#EEEEEE",
  tableBorder: "rgb(240, 240, 240)",
  pendingIcon: "rgb(173, 173, 173)",
};
const TASK_TABLE_GRID = "grid-cols-[minmax(0,1fr)] md:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-x-6 md:gap-y-3 min-[1440px]:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)_minmax(0,0.74fr)_minmax(0,0.78fr)_minmax(0,0.68fr)_minmax(0,0.72fr)_minmax(0,0.9fr)_32px] min-[1440px]:gap-4";
const TASK_TITLE_CELL = "min-w-0 md:col-span-2 min-[1440px]:col-span-1";
const TASK_FIELD_CELL = "min-w-0 space-y-1 min-[1440px]:space-y-0";
const TASK_ACTION_CELL = "flex min-w-0 justify-end md:col-span-1 min-[1440px]:col-span-1";
const TASK_MOBILE_LABEL = "block text-xs font-medium text-disabled-foreground min-[1440px]:hidden";
const TASK_VALUE_TEXT = "text-disabled-foreground";
const TASK_COLUMN_TEXT = "text-[14px] text-subtle-foreground";
const TASK_CHECKBOX_CLASS = "h-[14px] w-[14px] !rounded-[4px] border-border shadow-none [&_svg]:h-3 [&_svg]:w-3 data-[state=checked]:border-[#50AC66] data-[state=checked]:bg-[#50AC66] data-[state=checked]:text-on-color";

const LABEL_COLORS = [
  "#00a884",
  "#9fd80f",
  "#d6bd2f",
  "#ffc400",
  "#ff5a3d",
  "#ffa0a0",
  "#ff6b6b",
  "#e6294f",
  "#c42f62",
  "#f00072",
  "#f653b5",
  "#ed86d8",
  "#9c4bdc",
  "#7444c4",
  "#863994",
  "#4f86c6",
  "#0796c7",
  "#45c7bb",
  "#55c5eb",
  "#68a9c6",
  "#9db2c3",
  STATIC_NEUTRAL_COLORS.subtleForeground,
  "#8a4f3f",
  "#df70b5",
  "#c4aa83",
  "#84d8ed",
  "#d28b75",
  "#2875d9",
  "#40908c",
  "#a990e8",
  "#adc5e8",
  "#9d98b8",
  "#9a6f6f",
];

const DEFAULT_STATUS_LABELS: TaskLabelOption[] = [
  { id: "Pendiente", label: "Pendiente", color: TASK_UI_COLORS.pending },
  { id: "En progreso", label: "En progreso", color: TASK_UI_COLORS.blue },
  { id: "Completada", label: "Completada", color: TASK_UI_COLORS.green },
  { id: "Bloqueada", label: "Bloqueada", color: "#E75F79" },
  { id: "Cancelada", label: "Cancelada", color: TASK_UI_COLORS.pending },
];

const DEFAULT_PRIORITY_LABELS: TaskLabelOption[] = [
  { id: "Urgente", label: "Urgente", color: "#E75F79" },
  { id: "Alta", label: "Alta", color: "#F4BF4F" },
  { id: "Media", label: "Media", color: TASK_UI_COLORS.green },
  { id: "Baja", label: "Baja", color: TASK_UI_COLORS.pending },
];

function emptyForm() {
  return {
    tipo: "tarea" as "tarea" | "minuta",
    organization_id: "",
    proyecto: "",
    titulo: "",
    descripcion: "",
    prioridad: "Media",
    status: "Pendiente",
    fecha_limite: "",
    categoria: "General",
    asignados: new Set<string>(),
    partidas: new Set<string>(),
  };
}

function suggestedMinuteTitle() {
  const date = new Date();
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  const month = new Intl.DateTimeFormat("es-MX", { month: "long" }).format(date);
  return `Minuta Semana ${date.getDate()} ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

function isOverdue(task: Task) {
  if (!task.fecha_limite || task.status === "Completada" || task.status === "Cancelada") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${task.fecha_limite}T00:00:00`).getTime() < today.getTime();
}

function formatDate(date?: string) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function relativeDueDateLabel(date?: string) {
  const dueDate = parseDateString(date);
  if (!dueDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (Math.abs(days) > 10) return null;
  if (days === 0) return "Vence hoy";
  if (days > 0) return `Vence en ${days} ${days === 1 ? "día" : "días"}`;

  const elapsedDays = Math.abs(days);
  return `Venció hace ${elapsedDays} ${elapsedDays === 1 ? "día" : "días"}`;
}

function parseDateString(date?: string) {
  if (!date) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return undefined;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateInputValue(date: Date) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mutationErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) return fallback;
  return error.message
    .replace(/^\[CONVEX[^\]]*\]\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .trim() || fallback;
}

function isPortaledPickerTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("[data-radix-popper-content-wrapper]") ||
    target.closest("[data-radix-select-content]") ||
    target.closest("[data-radix-popover-content]") ||
    target.closest("[data-slot='calendar']")
  );
}

function isPortaledPickerOpen() {
  return Boolean(
    document.querySelector("[data-radix-popper-content-wrapper]") ||
    document.querySelector("[data-radix-select-content]")
  );
}

type TaskDropIndicator = {
  taskId: Id<"tareas">;
  edge: "before" | "after";
};

function sortTasksByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => (a.position ?? a.created_at) - (b.position ?? b.created_at));
}

function taskOrderScopeKey(task: Pick<Task, "parent_task" | "proyecto" | "organization_id">) {
  return `${task.parent_task || "root"}:${task.proyecto || "none"}:${task.organization_id || "none"}`;
}

function applyTaskOrder(tasks: Task[], orderedIds?: Id<"tareas">[]) {
  if (!orderedIds?.length) return tasks;
  const byId = new Map(tasks.map((task) => [task._id, task]));
  const seen = new Set<string>();
  const next: Task[] = [];
  for (const id of orderedIds) {
    const task = byId.get(id);
    if (!task || seen.has(task._id)) continue;
    next.push(task);
    seen.add(task._id);
  }
  for (const task of tasks) {
    if (seen.has(task._id)) continue;
    next.push(task);
  }
  return next;
}

function moveTaskId(
  orderedIds: Id<"tareas">[],
  draggedId: Id<"tareas">,
  targetId: Id<"tareas">,
  edge: "before" | "after"
) {
  const from = orderedIds.indexOf(draggedId);
  if (from < 0 || draggedId === targetId) return orderedIds;
  const next = orderedIds.filter((id) => id !== draggedId);
  const target = next.indexOf(targetId);
  if (target < 0) return orderedIds;
  next.splice(edge === "after" ? target + 1 : target, 0, draggedId);
  return next;
}

function TaskDropLine({ edge }: { edge: "before" | "after" }) {
  return (
    <div
        className={cn(
          "pointer-events-none absolute inset-x-0 z-20",
          edge === "before" ? "-top-px" : "-bottom-px"
        )}
    >
      <div className="relative h-0.5 rounded-full" style={{ backgroundColor: TASK_UI_COLORS.green }}>
        <span
          className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: TASK_UI_COLORS.green }}
        />
      </div>
    </div>
  );
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function statusClass(status: string) {
  switch (status) {
    case "Completada":
      return "bg-green-50 text-green-700 border-green-200";
    case "En progreso":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Bloqueada":
      return "bg-red-50 text-red-700 border-red-200";
    case "Cancelada":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function priorityClass(priority: string) {
  if (!priority) return "bg-background text-muted-foreground border-border";
  switch (priority) {
    case "Urgente":
      return "bg-red-50 text-red-700 border-red-200";
    case "Alta":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "Baja":
      return "bg-background text-muted-foreground border-border";
    default:
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
}

function formatHistoryValue(value?: string) {
  if (!value) return "Sin valor";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return `${parsed.length} asignado${parsed.length === 1 ? "" : "s"}`;
    return String(parsed);
  } catch {
    return value;
  }
}

function historyLabel(item: TaskHistory) {
  if (item.action === "created") return "Creó la tarea";
  if (item.action === "comment_added") return "Agregó un comentario";
  if (item.action === "status_changed") {
    return `Cambió el estado de ${formatHistoryValue(item.old_value)} a ${formatHistoryValue(item.new_value)}`;
  }
  if (item.field_changed === "asignados") return "Actualizó los asignados";
  if (item.field_changed === "partidas") return "Actualizó las partidas";
  if (item.field_changed) return `Actualizó ${item.field_changed.replace("_", " ")}`;
  return "Actualizó la tarea";
}

function notificationLabel(item: TaskNotification) {
  if (item.notification_type === "mention") {
    return "Te mencionó en un comentario";
  }
  if (item.notification_type === "assignment") {
    return item.action === "created" ? "Te asignó una nueva tarea" : "Actualizó los asignados";
  }
  if (item.action === "created") return "Creó una tarea";
  if (item.action === "comment_added") return "Agregó un comentario";
  if (item.action === "status_changed") {
    return `Cambió el estado a ${formatHistoryValue(item.new_value)}`;
  }
  if (item.field_changed) return `Actualizó ${item.field_changed.replace("_", " ")}`;
  return "Actualizó una tarea";
}

function relativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Ahora";
  if (diff < hour) {
    const value = Math.floor(diff / minute);
    return `${value} min`;
  }
  if (diff < day) {
    const value = Math.floor(diff / hour);
    return `${value} h`;
  }

  const value = Math.floor(diff / day);
  return `${value} día${value === 1 ? "" : "s"}`;
}

function userInitials(user: Pick<UserSummary, "name" | "email">) {
  const source = user.name || user.email;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function normalizeStoredLabels(value: string | null, fallback: TaskLabelOption[]) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    const valid = parsed
      .filter((item) => item?.id && item?.label && item?.color)
      .map((item) => {
        const fallbackMatch = fallback.find((label) => label.id === item.id || label.label === item.label);
        return fallbackMatch ? { ...item, color: fallbackMatch.color } : item;
      });
    return valid.length ? valid : fallback;
  } catch {
    return fallback;
  }
}

function mergeLabels(baseLabels: TaskLabelOption[], values: string[], fallback: TaskLabelOption[]) {
  const labels = [...baseLabels];
  const known = new Set(labels.flatMap((label) => [label.id, label.label]));

  for (const value of values) {
    if (!value || known.has(value)) continue;
    const fallbackMatch = fallback.find((label) => label.id === value || label.label === value);
    labels.push(fallbackMatch || labelForValue(value, labels));
    known.add(value);
  }

  return labels;
}

function partidaDisplayName(partida: PartidaSummary) {
  if (partida.nivel === 3) return partida.sub_partida || partida.nombre;
  if (partida.nivel === 2) return partida.familia || partida.nombre;
  return partida.nombre;
}

function partidaContext(partida: PartidaSummary) {
  if (partida.nivel === 3) {
    return [partida.partida_nombre || partida.nombre, partida.familia].filter(Boolean).join(" / ");
  }
  if (partida.nivel === 2) return partida.partida_nombre || partida.nombre;
  return "Partida";
}

function statusIconForLabel(status: string): LucideIcon {
  const key = status.trim().toLowerCase();
  if (key === "pendiente") return Pause;
  if (key === "en progreso" || key === "en curso") return Play;
  if (key === "completada" || key === "completado") return Check;
  if (key === "bloqueada" || key === "bloqueado") return Ban;
  if (key === "cancelada" || key === "cancelado") return X;
  return Circle;
}

function StatusSectionIcon({ status, color }: { status: string; color: string }) {
  const Icon = statusIconForLabel(status);
  const isPending = status.trim().toLowerCase() === "pendiente";
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-on-color"
      style={{ backgroundColor: isPending ? TASK_UI_COLORS.pendingIcon : color }}
    >
      <Icon
        className="h-2.5 w-2.5"
        fill={isPending ? "currentColor" : "none"}
        strokeWidth={isPending ? 0 : 2.5}
      />
    </span>
  );
}

function labelForValue(value: string, labels: TaskLabelOption[]) {
  const defaultLabel = [...DEFAULT_STATUS_LABELS, ...DEFAULT_PRIORITY_LABELS].find(
    (label) => label.label === value || label.id === value
  );
  return labels.find((label) => label.label === value || label.id === value) || defaultLabel || {
    id: value,
    label: value || "Sin etiqueta",
    color: TASK_UI_COLORS.pending,
  };
}

function InlineLabelValue({ value, labels }: { value: string; labels: TaskLabelOption[] }) {
  const activeLabel = labelForValue(value, labels);

  return (
    <div className="flex h-9 min-w-0 items-center gap-2 px-2 text-sm font-normal text-disabled-foreground min-[1440px]:h-8">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: activeLabel.color }} />
      <span className="truncate">{activeLabel.label}</span>
    </div>
  );
}

function InlineDatePicker({
  value,
  disabled,
  overdue,
  showRelative = false,
  onChange,
}: {
  value?: string;
  disabled: boolean;
  overdue: boolean;
  showRelative?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateString(value);
  const displayValue = showRelative ? relativeDueDateLabel(value) || formatDate(value) : formatDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-9 w-full min-w-0 justify-start rounded-none border-0 bg-transparent px-0 text-left text-sm font-normal shadow-none hover:bg-transparent min-[1440px]:h-6",
            overdue ? "font-medium text-red-600" : TASK_VALUE_TEXT
          )}
        >
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto border-border bg-card p-0 text-foreground shadow-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Calendar
          mode="single"
          required
          selected={selectedDate}
          defaultMonth={selectedDate || new Date()}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateInputValue(date));
            setOpen(false);
          }}
          buttonVariant="ghost"
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Limpiar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(toDateInputValue(new Date()));
              setOpen(false);
            }}
          >
            Hoy
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlineLabelPicker({
  value,
  labels,
  disabled,
  onSelect,
  onLabelsChange,
}: {
  value: string;
  labels: TaskLabelOption[];
  disabled: boolean;
  onSelect: (value: string) => void;
  onLabelsChange: (labels: TaskLabelOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftLabels, setDraftLabels] = useState<TaskLabelOption[]>(labels);
  const [colorTargetId, setColorTargetId] = useState<string | null>(null);
  const activeLabel = labelForValue(value, labels);

  useEffect(() => {
    if (open) {
      setDraftLabels(labels);
      setEditing(false);
      setColorTargetId(null);
    }
  }, [labels, open]);

  const updateDraftLabel = (id: string, changes: Partial<TaskLabelOption>) => {
    setDraftLabels((current) => current.map((label) => label.id === id ? { ...label, ...changes } : label));
  };

  const addDraftLabel = () => {
    const id = `label-${Date.now()}`;
    setDraftLabels((current) => [
      ...current,
      { id, label: "Nueva etiqueta", color: LABEL_COLORS[current.length % LABEL_COLORS.length] },
    ]);
    setEditing(true);
  };

  const applyLabels = () => {
    const normalized = draftLabels
      .map((label) => ({ ...label, label: label.label.trim() }))
      .filter((label) => label.label);
    onLabelsChange(normalized.length ? normalized : labels);
    setEditing(false);
    setColorTargetId(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          disabled={disabled}
          className={cn(
            "h-9 w-full min-w-0 justify-start gap-2 rounded-md border border-transparent bg-transparent px-2 text-sm font-normal text-disabled-foreground shadow-none hover:border-border hover:bg-card hover:text-subtle-foreground min-[1440px]:h-8",
            open && "border-border bg-card text-subtle-foreground ring-1 ring-ring"
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: activeLabel.color }} />
          <span className="truncate">{activeLabel.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={6} className="w-56 overflow-visible border-border bg-card p-0 text-foreground shadow-xl">
        <div className="mx-auto -mt-2 h-4 w-4 rotate-45 border-l border-t border-border bg-card" />
        {editing ? (
          <>
            <div className="p-3 pb-2">
              <p className="mb-2 px-1 text-xs font-medium text-disabled-foreground">Estado</p>
              <div className="space-y-0.5">
                {draftLabels.map((label) => (
                  <div key={label.id} className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setColorTargetId(colorTargetId === label.id ? null : label.id)}
                      className="shrink-0 rounded p-1 hover:bg-muted"
                    >
                      <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
                    </button>
                    <Input
                      value={label.label}
                      onChange={(event) => updateDraftLabel(label.id, { label: event.target.value })}
                      className="h-7 flex-1 border-border bg-card px-2 text-sm text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDraftLabels((current) => current.filter((item) => item.id !== label.id))}
                      className="h-7 w-7 shrink-0 text-disabled-foreground hover:text-[#E75F79]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {colorTargetId === label.id && (
                      <div className="absolute left-0 top-full z-50 mt-1 grid w-40 grid-cols-4 gap-2 rounded-md border border-border bg-card p-3 shadow-xl">
                        {LABEL_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => {
                              updateDraftLabel(label.id, { color });
                              setColorTargetId(null);
                            }}
                            className="h-6 w-6 rounded-md border border-on-color shadow-sm"
                            style={{ backgroundColor: color }}
                            aria-label={`Color ${color}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="ghost" onClick={addDraftLabel} className="mt-2 h-8 w-full gap-2 text-xs text-disabled-foreground hover:text-subtle-foreground">
                <Plus className="h-3.5 w-3.5" />
                Nueva etiqueta
              </Button>
            </div>
            <div className="border-t border-border p-2">
              <Button type="button" variant="ghost" onClick={applyLabels} className="h-8 w-full text-xs text-subtle-foreground">
                Aplicar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 pb-2">
              <p className="mb-2 px-1 text-xs font-medium text-disabled-foreground">Estado</p>
              <div className="space-y-0.5">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => { onSelect(label.label); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted",
                      value === label.label || value === label.id ? "bg-muted font-medium" : ""
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                    <span>{label.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-border p-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(true)} className="h-8 w-full gap-2 text-xs text-disabled-foreground hover:text-subtle-foreground">
                <Pencil className="h-3.5 w-3.5" />
                Editar etiquetas
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function priorityDisplayName(priority: string) {
  return priority || "Sin prioridad";
}

function InlinePriorityPicker({
  value,
  labels,
  disabled,
  onSelect,
  onLabelsChange,
}: {
  value: string;
  labels: TaskLabelOption[];
  disabled: boolean;
  onSelect: (value: string) => void;
  onLabelsChange: (labels: TaskLabelOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftLabels, setDraftLabels] = useState<TaskLabelOption[]>(labels);
  const [colorTargetId, setColorTargetId] = useState<string | null>(null);
  const activeLabel = value ? labelForValue(value, labels) : null;
  const clearLabel = "Sin prioridad";

  useEffect(() => {
    if (open) {
      setDraftLabels(labels);
      setEditing(false);
      setColorTargetId(null);
    }
  }, [labels, open]);

  const updateDraftLabel = (id: string, changes: Partial<TaskLabelOption>) => {
    setDraftLabels((current) => current.map((label) => label.id === id ? { ...label, ...changes } : label));
  };

  const addDraftLabel = () => {
    const id = `label-${Date.now()}`;
    setDraftLabels((current) => [
      ...current,
      { id, label: "Nueva etiqueta", color: LABEL_COLORS[current.length % LABEL_COLORS.length] },
    ]);
    setEditing(true);
  };

  const applyLabels = () => {
    const normalized = draftLabels
      .map((label) => ({ ...label, label: label.label.trim() }))
      .filter((label) => label.label);
    onLabelsChange(normalized.length ? normalized : labels);
    setEditing(false);
    setColorTargetId(null);
  };

  const handleSelect = (nextValue: string) => {
    onSelect(nextValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-9 w-full min-w-0 justify-start gap-2 rounded-md border border-transparent bg-transparent px-2 text-sm font-normal text-disabled-foreground shadow-none hover:border-border hover:bg-card hover:text-subtle-foreground min-[1440px]:h-8",
            open && "border-border bg-card text-subtle-foreground ring-1 ring-ring"
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: activeLabel?.color || TASK_UI_COLORS.pending }}
          />
          <span className="truncate">{activeLabel?.label || clearLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={6} className="w-56 overflow-visible border-border bg-card p-0 text-foreground shadow-xl">
        <div className="mx-auto -mt-2 h-4 w-4 rotate-45 border-l border-t border-border bg-card" />
        {editing ? (
          <>
            <div className="p-3 pb-2">
              <p className="mb-2 px-1 text-xs font-medium text-disabled-foreground">Prioridad</p>
              <div className="space-y-0.5">
                {draftLabels.map((label) => (
                  <div key={label.id} className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setColorTargetId(colorTargetId === label.id ? null : label.id)}
                      className="shrink-0 rounded p-1 hover:bg-muted"
                    >
                      <span
                        className="block h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                    </button>
                    <Input
                      value={label.label}
                      onChange={(event) => updateDraftLabel(label.id, { label: event.target.value })}
                      className="h-7 flex-1 border-border bg-card px-2 text-sm text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDraftLabels((current) => current.filter((item) => item.id !== label.id))}
                      className="h-7 w-7 shrink-0 text-disabled-foreground hover:text-[#E75F79]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {colorTargetId === label.id && (
                      <div className="absolute left-0 top-full z-50 mt-1 grid w-40 grid-cols-4 gap-2 rounded-md border border-border bg-card p-3 shadow-xl">
                        {LABEL_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => {
                              updateDraftLabel(label.id, { color });
                              setColorTargetId(null);
                            }}
                            className="h-6 w-6 rounded-md border border-on-color shadow-sm"
                            style={{ backgroundColor: color }}
                            aria-label={`Color ${color}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="ghost" onClick={addDraftLabel} className="mt-2 h-8 w-full gap-2 text-xs text-disabled-foreground hover:text-subtle-foreground">
                <Plus className="h-3.5 w-3.5" />
                Nueva prioridad
              </Button>
            </div>
            <div className="border-t border-border p-2">
              <Button type="button" variant="ghost" onClick={applyLabels} className="h-8 w-full text-xs text-subtle-foreground">
                Aplicar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 pb-2">
              <p className="mb-2 px-1 text-xs font-medium text-disabled-foreground">Prioridad</p>
              <div className="space-y-0.5">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => handleSelect(label.label)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted",
                      value === label.label || value === label.id ? "bg-muted font-medium" : ""
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-disabled-foreground hover:bg-muted"
                >
                  <Ban className="h-4 w-4 shrink-0" />
                  <span>Limpiar</span>
                </button>
              </div>
            </div>
            <div className="border-t border-border p-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(true)} className="h-8 w-full gap-2 text-xs text-disabled-foreground hover:text-subtle-foreground">
                <Pencil className="h-3.5 w-3.5" />
                Editar etiquetas
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function InlineSingleSelectPicker({
  value,
  displayValue,
  options,
  disabled,
  searchPlaceholder,
  onSelect,
}: {
  value: string;
  displayValue: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  searchPlaceholder: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("es");
    if (!term) return options;
    return options.filter((option) => option.label.toLocaleLowerCase("es").includes(term));
  }, [options, searchTerm]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchTerm("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-9 w-full min-w-0 justify-start gap-2 rounded-md border border-transparent bg-transparent px-2 text-sm font-normal text-disabled-foreground shadow-none hover:border-border hover:bg-card hover:text-subtle-foreground min-[1440px]:h-8",
            open && "border-border bg-card text-subtle-foreground ring-1 ring-ring"
          )}
        >
          <span className="truncate">{displayValue}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-72 overflow-hidden border-border bg-card p-0 text-foreground shadow-xl">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 pl-9 text-sm"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted",
                value === option.value && "bg-muted"
              )}
            >
              <span className="truncate">{option.label}</span>
              {value === option.value && <CheckCircle2 className="h-4 w-4 shrink-0 text-subtle-foreground" />}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-disabled-foreground">Sin resultados</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlineAssigneePicker({
  task,
  assignableUsers,
  disabled,
  onChange,
}: {
  task: Task;
  assignableUsers?: UserSummary[];
  disabled: boolean;
  onChange: (assignees: Id<"users">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const assignedIds = useMemo(() => new Set(task.asignados), [task.asignados]);
  const assignedUsers = useMemo(() => {
    const usersById = new Map((assignableUsers || []).map((user) => [user._id, user]));
    return task.asignados.map((id) => usersById.get(id) || task.assigned_users?.find((user) => user._id === id)).filter(Boolean) as UserSummary[];
  }, [assignableUsers, task.asignados, task.assigned_users]);
  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (assignableUsers || []).filter((user) => {
      if (!term) return true;
      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term)
      );
    });
  }, [assignableUsers, searchTerm]);

  const toggleUser = (userId: Id<"users">) => {
    const next = new Set(task.asignados);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    onChange(Array.from(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-left hover:bg-transparent min-[1440px]:h-6",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {assignedUsers.length ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-disabled text-xs font-medium text-subtle-foreground">
                {userInitials(assignedUsers[0])}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-4 text-disabled-foreground">
                {assignedUsers.map((user) => user.name || user.email).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-disabled text-xs font-medium text-subtle-foreground">
                -
              </span>
              <span className="text-sm text-disabled-foreground">Sin asignar</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-border bg-card p-0 text-foreground shadow-xl">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {assignedUsers.length ? assignedUsers.map((user) => (
              <button
                key={user._id}
                type="button"
                onClick={() => toggleUser(user._id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs text-foreground hover:bg-disabled"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-[10px] font-medium text-subtle-foreground">
                  {userInitials(user)}
                </span>
                <span className="max-w-36 truncate">{user.name || user.email}</span>
                <X className="h-3 w-3" />
              </button>
            )) : (
              <span className="text-sm text-disabled-foreground">Selecciona responsables</span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nombres, roles o equipos"
              className="h-9 pl-9 pr-9"
            />
            <CircleAlert className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-disabled-foreground" />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-subtle-foreground">Personas sugeridas</p>
          {!assignableUsers && (
            <div className="flex h-24 items-center justify-center text-disabled-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {assignableUsers && filteredUsers.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-subtle-foreground">
              No hay usuarios con esa búsqueda.
            </div>
          )}
          {filteredUsers.map((user) => {
            const selected = assignedIds.has(user._id);

            return (
              <button
                key={user._id}
                type="button"
                onClick={() => toggleUser(user._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  selected && "bg-muted"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-subtle-foreground">
                  {userInitials(user)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{user.name || user.email}</span>
                  <span className="block truncate text-xs text-subtle-foreground">{user.role}</span>
                </span>
                {selected && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <Bell className="h-4 w-4" />
          Se notificara a los responsables
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlinePartidaPicker({
  task,
  projectPartidas,
  disabled,
  onChange,
}: {
  task: Task;
  projectPartidas?: PartidaSummary[];
  disabled: boolean;
  onChange: (partidas: Id<"partidas">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const selectedPartidaIds = useMemo(() => new Set(task.partidas || []), [task.partidas]);
  const selectedPartidas = useMemo(() => {
    const partidasById = new Map((projectPartidas || []).map((partida) => [partida._id, partida]));
    return (task.partidas || [])
      .map((id) => partidasById.get(id) || task.assigned_partidas?.find((partida) => partida._id === id))
      .filter(Boolean) as PartidaSummary[];
  }, [projectPartidas, task.partidas, task.assigned_partidas]);
  const filteredPartidas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (projectPartidas || []).filter((partida) => {
      if (partida.nivel !== 1) return false;
      if (!term) return true;
      return partida.nombre.toLowerCase().includes(term);
    });
  }, [projectPartidas, searchTerm]);

  const togglePartida = (partidaId: Id<"partidas">) => {
    const next = new Set(task.partidas || []);
    if (next.has(partidaId)) {
      next.delete(partidaId);
    } else {
      next.add(partidaId);
    }
    onChange(Array.from(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-left hover:bg-transparent min-[1440px]:h-6",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {selectedPartidas.length ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-subtle-foreground">
                {selectedPartidas.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-4 text-disabled-foreground">
                {selectedPartidas.map(partidaDisplayName).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-disabled text-xs font-medium text-subtle-foreground">
                -
              </span>
              <span className="text-sm text-disabled-foreground">Sin partidas</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-border bg-card p-0 text-foreground shadow-xl">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {selectedPartidas.length ? selectedPartidas.map((partida) => (
              <button
                key={partida._id}
                type="button"
                onClick={() => togglePartida(partida._id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs text-foreground hover:bg-disabled"
              >
                <span className="max-w-44 truncate">{partidaDisplayName(partida)}</span>
                <X className="h-3 w-3" />
              </button>
            )) : (
              <span className="text-sm text-disabled-foreground">Selecciona partidas</span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar partidas"
              className="h-9 pl-9 pr-9"
            />
            <CircleAlert className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-disabled-foreground" />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-subtle-foreground">Partidas del proyecto</p>
          {!projectPartidas && (
            <div className="flex h-24 items-center justify-center text-disabled-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {projectPartidas && filteredPartidas.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-subtle-foreground">
              No hay partidas con esa búsqueda.
            </div>
          )}
          {filteredPartidas.map((partida) => {
            const selected = selectedPartidaIds.has(partida._id);

            return (
              <button
                key={partida._id}
                type="button"
                onClick={() => togglePartida(partida._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  selected && "bg-muted"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-subtle-foreground">
                  {partida.nivel}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{partidaDisplayName(partida)}</span>
                  <span className="block truncate text-xs text-subtle-foreground">{partidaContext(partida)}</span>
                </span>
                {selected && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <ListChecks className="h-4 w-4" />
          Se relacionara con la tarea
        </div>
      </PopoverContent>
    </Popover>
  );
}

const InlineAssigneePickerForCreate = React.memo(function InlineAssigneePickerForCreate({
  assignableUsers,
  value,
  disabled,
  onChange,
}: {
  assignableUsers?: UserSummary[];
  value: Id<"users">[];
  disabled: boolean;
  onChange: (assignees: Id<"users">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const valueKey = useMemo(() => value.join(","), [value]);
  
  const assignedIds = useMemo(() => new Set(value), [valueKey]);
  
  const assignedUsers = useMemo(() => {
    if (!assignableUsers?.length && !value.length) return [];
    const usersById = new Map((assignableUsers || []).map((user) => [user._id, user]));
    return value.map((id) => usersById.get(id)).filter(Boolean) as UserSummary[];
  }, [assignableUsers, valueKey]);
  
  const filteredUsers = useMemo(() => {
    if (!assignableUsers?.length) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return assignableUsers;
    return assignableUsers.filter((user) => (
      user.name.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term) ||
      user.role.toLowerCase().includes(term)
    ));
  }, [assignableUsers, searchTerm]);

  const toggleUser = useCallback((userId: Id<"users">) => {
    onChange(
      value.includes(userId) 
        ? value.filter((id) => id !== userId)
        : [...value, userId]
    );
  }, [value, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-left hover:bg-transparent min-[1440px]:h-6",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {assignedUsers.length ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-disabled text-xs font-medium text-subtle-foreground">
                {userInitials(assignedUsers[0])}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-4 text-disabled-foreground">
                {assignedUsers.map((user) => user.name || user.email).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-disabled text-xs font-medium text-subtle-foreground">
                -
              </span>
              <span className="text-sm text-disabled-foreground">Sin asignar</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-border bg-card p-0 text-foreground shadow-xl">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {assignedUsers.length ? assignedUsers.map((user) => (
              <button
                key={user._id}
                type="button"
                onClick={() => toggleUser(user._id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs text-foreground hover:bg-disabled"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-[10px] font-medium text-subtle-foreground">
                  {userInitials(user)}
                </span>
                <span className="max-w-36 truncate">{user.name || user.email}</span>
                <X className="h-3 w-3" />
              </button>
            )) : (
              <span className="text-sm text-disabled-foreground">Selecciona responsables</span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nombres, roles o equipos"
              className="h-9 pl-9 pr-9"
            />
            <CircleAlert className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-disabled-foreground" />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-subtle-foreground">Personas sugeridas</p>
          {!assignableUsers && (
            <div className="flex h-24 items-center justify-center text-disabled-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {assignableUsers && filteredUsers.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-subtle-foreground">
              No hay usuarios con esa búsqueda.
            </div>
          )}
          {filteredUsers.map((user) => {
            const selected = assignedIds.has(user._id);
            return (
              <button
                key={user._id}
                type="button"
                onClick={() => toggleUser(user._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  selected && "bg-muted"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-subtle-foreground">
                  {userInitials(user)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{user.name || user.email}</span>
                  <span className="block truncate text-xs text-subtle-foreground">{user.role}</span>
                </span>
                {selected && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <Bell className="h-4 w-4" />
          Se notificara a los responsables
        </div>
      </PopoverContent>
    </Popover>
  );
});

const InlinePartidaPickerForCreate = React.memo(function InlinePartidaPickerForCreate({
  projectPartidas,
  value,
  disabled,
  onChange,
}: {
  projectPartidas?: PartidaSummary[];
  value: Id<"partidas">[];
  disabled: boolean;
  onChange: (partidas: Id<"partidas">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const valueKey = useMemo(() => value.join(","), [value]);
  
  const selectedPartidaIds = useMemo(() => new Set(value), [valueKey]);
  
  const selectedPartidas = useMemo(() => {
    if (!projectPartidas?.length && !value.length) return [];
    const partidasById = new Map((projectPartidas || []).map((partida) => [partida._id, partida]));
    return value.map((id) => partidasById.get(id)).filter(Boolean) as PartidaSummary[];
  }, [projectPartidas, valueKey]);
  
  const filteredPartidas = useMemo(() => {
    if (!projectPartidas?.length) return [];
    const term = searchTerm.trim().toLowerCase();
    const nivelOnePartidas = projectPartidas.filter((partida) => partida.nivel === 1);
    if (!term) return nivelOnePartidas;
    return nivelOnePartidas.filter((partida) => partida.nombre.toLowerCase().includes(term));
  }, [projectPartidas, searchTerm]);

  const togglePartida = useCallback((partidaId: Id<"partidas">) => {
    onChange(
      value.includes(partidaId)
        ? value.filter((id) => id !== partidaId)
        : [...value, partidaId]
    );
  }, [value, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-left hover:bg-transparent min-[1440px]:h-6",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {selectedPartidas.length ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-subtle-foreground">
                {selectedPartidas.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-4 text-disabled-foreground">
                {selectedPartidas.map(partidaDisplayName).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-disabled text-xs font-medium text-subtle-foreground">
                -
              </span>
              <span className="text-sm text-disabled-foreground">Sin partidas</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-border bg-card p-0 text-foreground shadow-xl">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {selectedPartidas.length ? selectedPartidas.map((partida) => (
              <button
                key={partida._id}
                type="button"
                onClick={() => togglePartida(partida._id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs text-foreground hover:bg-disabled"
              >
                <span className="max-w-44 truncate">{partidaDisplayName(partida)}</span>
                <X className="h-3 w-3" />
              </button>
            )) : (
              <span className="text-sm text-disabled-foreground">Selecciona partidas</span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar partidas"
              className="h-9 pl-9 pr-9"
            />
            <CircleAlert className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-disabled-foreground" />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-subtle-foreground">Partidas del proyecto</p>
          {!projectPartidas && (
            <div className="flex h-24 items-center justify-center text-disabled-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {projectPartidas && filteredPartidas.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-subtle-foreground">
              No hay partidas con esa búsqueda.
            </div>
          )}
          {filteredPartidas.map((partida) => {
            const selected = selectedPartidaIds.has(partida._id);
            return (
              <button
                key={partida._id}
                type="button"
                onClick={() => togglePartida(partida._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  selected && "bg-muted"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-subtle-foreground">
                  {partida.nivel}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{partidaDisplayName(partida)}</span>
                  <span className="block truncate text-xs text-subtle-foreground">{partidaContext(partida)}</span>
                </span>
                {selected && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <ListChecks className="h-4 w-4" />
          Se relacionara con la tarea
        </div>
      </PopoverContent>
    </Popover>
  );
});

void InlinePartidaPicker;
void InlinePartidaPickerForCreate;

export function TareasBoard({ proyectoId }: { proyectoId?: string }) {
  const [searchParams] = useSearchParams();
  const openedDeepLinkTaskRef = useRef<string>();
  const isProjectScoped = false;
  const proyecto = undefined;
  const currentUser = useQuery(api.users.getCurrentUser);
  const proyectos = useQuery(api.desarrollos.getAll) as ProjectOption[] | undefined;
  const tareas = useQuery(api.tareas.getAllAccessible, {}) as Task[] | undefined;
  const taskCatalogs = useQuery(api.tareas.getCatalogs, {}) as TaskCatalogs | undefined;
  const organizationScopes = useQuery(api.tareas.getOrganizationScopes, {});
  const [search, setSearch] = useState("");
  const [taskTab, setTaskTab] = useState<"all" | "open" | "overdue" | "done">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [partidaFilter, setPartidaFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "mine" | "created">("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get("proyecto") || "all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tareas"> | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<Id<"tareas"> | null>(null);
  const [subtaskProjectId, setSubtaskProjectId] = useState("");
  const [addingTaskInSection, setAddingTaskInSection] = useState<{projectId: string; statusLabel: string} | null>(null);
  const selectedFormProjectId = form.proyecto;
  const selectedFormOrganizationId = selectedFormProjectId
    ? proyectos?.find((project) => project._id === selectedFormProjectId)?.organization_id
    : form.organization_id || currentUser?.organization_id || organizationScopes?.[0]?.id;
  const lookupProjectIds = useMemo(() => {
    const ids = new Set<string>();

    if (selectedFormProjectId) ids.add(selectedFormProjectId);
    if (subtaskProjectId) ids.add(subtaskProjectId);
    if (projectFilter !== "all" && projectFilter !== GENERAL_SCOPE) ids.add(projectFilter);
    if (addingTaskInSection?.projectId && addingTaskInSection.projectId !== GENERAL_SCOPE) ids.add(addingTaskInSection.projectId);

    for (const task of tareas || []) {
      if (task.proyecto) ids.add(task.proyecto);
    }

    return Array.from(ids) as Id<"desarrollos">[];
  }, [addingTaskInSection, projectFilter, selectedFormProjectId, subtaskProjectId, tareas]);
  const assignableUsersByProject = useQuery(
    api.tareas.getAssignableUsersByProjects,
    lookupProjectIds.length ? { proyectos: lookupProjectIds } : "skip"
  ) as ProjectLookupMap<UserSummary> | undefined;
  const partidasByProject = useQuery(
    api.partida.getByProjects,
    lookupProjectIds.length ? { projectIds: lookupProjectIds } : "skip"
  ) as ProjectLookupMap<PartidaSummary> | undefined;
  const organizationAssignableUsers = useQuery(
    api.tareas.getAssignableUsersForOrganization,
    selectedFormOrganizationId || currentUser?.organization_id
      ? { organization_id: selectedFormOrganizationId || currentUser?.organization_id || "" }
      : "skip"
  ) as UserSummary[] | undefined;
  const activeSubtaskParent = (tareas || []).find((task) => task._id === addingSubtaskFor);
  const subtaskOrganizationId = subtaskProjectId
    ? proyectos?.find((project) => project._id === subtaskProjectId)?.organization_id
    : activeSubtaskParent?.organization_id;
  const subtaskOrganizationUsers = useQuery(
    api.tareas.getAssignableUsersForOrganization,
    !subtaskProjectId && subtaskOrganizationId
      ? { organization_id: subtaskOrganizationId }
      : "skip"
  ) as UserSummary[] | undefined;
  const assignableUsers = selectedFormProjectId
    ? assignableUsersByProject?.[selectedFormProjectId]
    : organizationAssignableUsers;
  const formPartidas = selectedFormProjectId ? partidasByProject?.[selectedFormProjectId] : undefined;
  const taskNotifications = useQuery(api.tareas.getAllNotifications, { limit: 60 }) as TaskNotification[] | undefined;
  const taskNotificationSummary = useQuery(api.tareas.getAllUnreadSummary, {});

  useEffect(() => {
    const requestedProject = searchParams.get("proyecto") || "all";
    setProjectFilter(requestedProject);
  }, [searchParams]);

  useEffect(() => {
    const requestedTaskId = searchParams.get("tarea");
    if (!requestedTaskId || openedDeepLinkTaskRef.current === requestedTaskId || !tareas?.some((task) => task._id === requestedTaskId)) return;
    openedDeepLinkTaskRef.current = requestedTaskId;
    setSelectedTaskId(requestedTaskId as Id<"tareas">);
  }, [searchParams, tareas]);

  const createTask = useMutation(api.tareas.create);
  const updateTask = useMutation(api.tareas.update);
  const updateStatus = useMutation(api.tareas.updateStatus);
  const removeTask = useMutation(api.tareas.remove);
  const addComment = useMutation(api.tareas.addComment);
  const removeComment = useMutation(api.tareas.removeComment);
  const markNotificationsAsRead = useMutation(api.tareas.markNotificationsAsRead);
  const markNotificationAsRead = useMutation(api.tareas.markNotificationAsRead);
  const duplicateTask = useMutation(api.tareas.duplicate);
  const reorderTasks = useMutation(api.tareas.reorderSiblings);

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<"all" | "comments" | "mentions" | "assignments">("all");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [onlyUnreadNotifications, setOnlyUnreadNotifications] = useState(false);
  const [contextMenu, setContextMenu] = useState<TaskContextMenu>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssignees, setSubtaskAssignees] = useState<Id<"users">[]>([]);
  const [subtaskDueDate, setSubtaskDueDate] = useState<string>("");
  const [subtaskPriority, setSubtaskPriority] = useState<string>("Media");
  const [subtaskPartidas, setSubtaskPartidas] = useState<Id<"partidas">[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignees, setNewTaskAssignees] = useState<Id<"users">[]>([]);
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");
  const [newTaskPriority, setNewTaskPriority] = useState<string>("Media");
  const [newTaskPartidas, setNewTaskPartidas] = useState<Id<"partidas">[]>([]);
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [collapsedStatusSections, setCollapsedStatusSections] = useState<Set<string>>(new Set());
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [draggingTaskId, setDraggingTaskId] = useState<Id<"tareas"> | null>(null);
  const [dropIndicator, setDropIndicator] = useState<TaskDropIndicator | null>(null);
  const [orderOverride, setOrderOverride] = useState<Record<string, Id<"tareas">[]>>({});
  const dropIndicatorRef = useRef<TaskDropIndicator | null>(null);
  const subtaskTitleInputRef = useRef<HTMLInputElement>(null);
  const newTaskTitleInputRef = useRef<HTMLInputElement>(null);
  const skipSubtaskCreateOnBlur = useRef(false);
  const skipNewTaskCreateOnBlur = useRef(false);
  const [statusLabels, setStatusLabels] = useState<TaskLabelOption[]>(() =>
    normalizeStoredLabels(window.localStorage.getItem("tareas.statusLabels"), DEFAULT_STATUS_LABELS)
  );
  const [priorityLabels, setPriorityLabels] = useState<TaskLabelOption[]>(() =>
    normalizeStoredLabels(window.localStorage.getItem("tareas.priorityLabels"), DEFAULT_PRIORITY_LABELS)
  );
  const effectiveStatusLabels = useMemo(
    () => mergeLabels(statusLabels, taskCatalogs?.statuses || [], DEFAULT_STATUS_LABELS),
    [statusLabels, taskCatalogs?.statuses]
  );
  const effectivePriorityLabels = useMemo(
    () => mergeLabels(priorityLabels, taskCatalogs?.priorities || [], DEFAULT_PRIORITY_LABELS),
    [priorityLabels, taskCatalogs?.priorities]
  );

  const taskDetail = useQuery(
    api.tareas.getDetail,
    selectedTaskId ? { id: selectedTaskId } : "skip"
  ) as { task: Task; comments: TaskComment[]; history: TaskHistory[] } | undefined;

  const selectedTask = taskDetail?.task || tareas?.find((task) => task._id === selectedTaskId);
  const canCreate = Boolean(currentUser?.role && currentUser.role !== "viewer");
  const canComment = canCreate && selectedTask;
  const unreadNotificationCount = taskNotificationSummary?.total || 0;
  const canManageTask = useCallback(
    (task: Task) => currentUser?.role === "admin" || currentUser?._id === task.created_by_id ||
      Boolean(canCreate && task.tipo === "minuta" && task.origen === "sistema" && task.organization_id === currentUser?.organization_id),
    [canCreate, currentUser?._id, currentUser?.organization_id, currentUser?.role]
  );
  const canChangeTaskStatus = useCallback(
    (task: Task) => Boolean(canCreate && (canManageTask(task) || (currentUser?._id && task.asignados.includes(currentUser._id)))),
    [canCreate, canManageTask, currentUser?._id]
  );
  const assignableUsersForTask = useCallback((task: Task) => (
    task.proyecto
      ? assignableUsersByProject?.[task.proyecto]
      : organizationAssignableUsers
  ), [assignableUsersByProject, organizationAssignableUsers]);
  const assigneeFilterOptions = useMemo(() => {
    const users = new Map<string, UserSummary>();
    for (const task of tareas || []) {
      for (const user of task.assigned_users || []) {
        users.set(user._id, user);
      }
    }
    return Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tareas]);
  const categoryFilterOptions = useMemo(() => {
    const categories = new Set(CATEGORY_OPTIONS);
    for (const category of taskCatalogs?.categories || []) {
      categories.add(category);
    }
    for (const task of tareas || []) {
      if (task.categoria) categories.add(task.categoria);
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [tareas, taskCatalogs?.categories]);
  const inlineCategoryOptions = useMemo(
    () => categoryFilterOptions.map((category) => ({ value: category, label: category })),
    [categoryFilterOptions]
  );
  const partidaFilterOptions = useMemo(() => {
    const partidas = new Map<string, PartidaSummary>();
    for (const task of tareas || []) {
      for (const partida of task.assigned_partidas || []) {
        partidas.set(partida._id, partida);
      }
    }
    for (const projectPartidas of Object.values(partidasByProject || {})) {
      for (const partida of projectPartidas) {
        if (partida.nivel === 1) partidas.set(partida._id, partida);
      }
    }
    return Array.from(partidas.values()).sort((a, b) => partidaDisplayName(a).localeCompare(partidaDisplayName(b)));
  }, [partidasByProject, tareas]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    window.localStorage.setItem("tareas.statusLabels", JSON.stringify(statusLabels));
  }, [statusLabels]);

  useEffect(() => {
    window.localStorage.setItem("tareas.priorityLabels", JSON.stringify(priorityLabels));
  }, [priorityLabels]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (tareas || []).filter((task) => {
      const matchesSearch =
        !term ||
        task.titulo.toLowerCase().includes(term) ||
        task.descripcion?.toLowerCase().includes(term) ||
        task.proyecto_nombre?.toLowerCase().includes(term) ||
        task.assigned_users?.some((user) => user.name.toLowerCase().includes(term));
      const matchesTab =
        taskTab === "all" ||
        (taskTab === "open" && task.status !== "Completada" && task.status !== "Cancelada") ||
        (taskTab === "overdue" && isOverdue(task)) ||
        (taskTab === "done" && task.status === "Completada");
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.prioridad === priorityFilter;
      const matchesCategory = categoryFilter === "all" || (task.categoria || "General") === categoryFilter;
      const matchesPartida = partidaFilter === "all" || (task.partidas || []).includes(partidaFilter as Id<"partidas">);
      const matchesOwnership =
        ownershipFilter === "all" ||
        (ownershipFilter === "mine" && Boolean(currentUser?._id && task.asignados.includes(currentUser._id))) ||
        (ownershipFilter === "created" && currentUser?._id === task.created_by_id);
      const matchesAssignee = assigneeFilter === "all" || task.asignados.includes(assigneeFilter as Id<"users">);
      const matchesProject = projectFilter === "all" ||
        (projectFilter === GENERAL_SCOPE ? !task.proyecto : task.proyecto === projectFilter);
      return matchesSearch && matchesTab && matchesStatus && matchesPriority && matchesCategory && matchesPartida && matchesOwnership && matchesAssignee && matchesProject;
    });
  }, [assigneeFilter, categoryFilter, currentUser?._id, ownershipFilter, partidaFilter, priorityFilter, projectFilter, search, statusFilter, taskTab, tareas]);

  const tasksRelevantToScope = useMemo(() => {
    const list = tareas || [];
    if (projectFilter === "all") return list;
    const directIds = new Set(
      list
        .filter((task) => projectFilter === GENERAL_SCOPE ? !task.proyecto : task.proyecto === projectFilter)
        .map((task) => task._id)
    );
    for (const task of list) {
      if (task.parent_task && directIds.has(task._id)) directIds.add(task.parent_task);
    }
    return list.filter((task) => directIds.has(task._id));
  }, [projectFilter, tareas]);

  const stats = useMemo(() => ({
    total: tasksRelevantToScope.length,
    pending: tasksRelevantToScope.filter((task) => task.status !== "Completada" && task.status !== "Cancelada").length,
    overdue: tasksRelevantToScope.filter(isOverdue).length,
    done: tasksRelevantToScope.filter((task) => task.status === "Completada").length,
  }), [tasksRelevantToScope]);

  const additionalFilterCount = useMemo(() => {
    return [
      priorityFilter !== "all",
      categoryFilter !== "all",
      ownershipFilter !== "all",
      partidaFilter !== "all",
      !isProjectScoped && projectFilter !== "all",
    ].filter(Boolean).length;
  }, [categoryFilter, isProjectScoped, ownershipFilter, partidaFilter, priorityFilter, projectFilter]);

  const { groupedTasks, projectedChildrenByGroup } = useMemo(() => {
    const projectNames = new Map<string, string>();
    const projectOrganizations = new Map<string, string | undefined>();
    for (const project of proyectos || []) {
      projectNames.set(project._id, project.nombre);
      projectOrganizations.set(project._id, project.organization_id);
    }
    const filteredIds = new Set(filteredTasks.map((task) => task._id));
    const allTasksById = new Map((tareas || []).map((task) => [task._id, task]));
    const allChildren = new Map<string, Task[]>();
    for (const task of tareas || []) {
      if (!task.parent_task) continue;
      const children = allChildren.get(task.parent_task) || [];
      children.push(task);
      allChildren.set(task.parent_task, children);
    }
    for (const [parentId, children] of allChildren) {
      allChildren.set(parentId, sortTasksByPosition(children));
    }
    const groups = new Map<string, TaskGroup>();
    const projectedChildren = new Map<string, Task[]>();
    const groupKeyForTask = (task: Task) => task.proyecto || `${GENERAL_SCOPE}:${task.organization_id || "legacy"}`;
    const ensureGroup = (key: string, task: Task) => {
      const isGeneral = key.startsWith(`${GENERAL_SCOPE}:`);
      const organizationId = isGeneral ? key.slice(GENERAL_SCOPE.length + 1) : projectOrganizations.get(key);
      const group = groups.get(key) || {
        projectId: key,
        projectName: isGeneral ? "General" : task.proyecto_nombre || projectNames.get(key) || "Proyecto",
        tasks: [],
        organizationId,
        isGeneral,
      };
      groups.set(key, group);
      return group;
    };

    for (const task of tareas || []) {
      if (task.parent_task) continue;
      const children = allChildren.get(task._id) || [];
      const behavesAsMinute = task.tipo === "minuta" || /^minuta\b/i.test(task.titulo) || children.length > 0;
      if (!behavesAsMinute) {
        if (!filteredIds.has(task._id)) continue;
        ensureGroup(groupKeyForTask(task), task).tasks.push(task);
        continue;
      }

      const matchingChildren = children.filter((child) => filteredIds.has(child._id));
      const scopeKeys = new Set(matchingChildren.map(groupKeyForTask));
      if (filteredIds.has(task._id)) scopeKeys.add(groupKeyForTask(task));
      for (const scopeKey of scopeKeys) {
        const isGeneral = scopeKey.startsWith(`${GENERAL_SCOPE}:`);
        const matchesSelectedScope = projectFilter === "all" ||
          (projectFilter === GENERAL_SCOPE ? isGeneral : scopeKey === projectFilter);
        if (!matchesSelectedScope) continue;
        const scopedChildren = matchingChildren.filter((child) => groupKeyForTask(child) === scopeKey);
        if (!filteredIds.has(task._id) && scopedChildren.length === 0) continue;
        ensureGroup(scopeKey, task).tasks.push(task);
        const firstChild = scopedChildren[0];
        projectedChildren.set(
          `${scopeKey}:${task._id}`,
          applyTaskOrder(scopedChildren, firstChild ? orderOverride[taskOrderScopeKey(firstChild)] : undefined)
        );
      }
    }

    for (const task of filteredTasks) {
      if (!task.parent_task || allTasksById.has(task.parent_task)) continue;
      ensureGroup(groupKeyForTask(task), task).tasks.push(task);
    }

    return {
      groupedTasks: Array.from(groups.values()).map((group) => {
        const firstTask = group.tasks[0];
        return {
          ...group,
          tasks: applyTaskOrder(
            sortTasksByPosition(group.tasks),
            firstTask ? orderOverride[taskOrderScopeKey(firstTask)] : undefined
          ),
        };
      }).sort((a, b) => a.projectName.localeCompare(b.projectName, "es")),
      projectedChildrenByGroup: projectedChildren,
    };
  }, [filteredTasks, orderOverride, organizationScopes, projectFilter, proyectos, tareas]);

  const filteredNotifications = useMemo(() => {
    const term = notificationSearch.trim().toLowerCase();
    return (taskNotifications || []).filter((item) => {
      const matchesTab =
        notificationTab === "all" ||
        (notificationTab === "comments" && item.notification_type === "comment") ||
        (notificationTab === "mentions" && item.notification_type === "mention") ||
        (notificationTab === "assignments" && item.notification_type === "assignment");
      const matchesUnread = !onlyUnreadNotifications || item.is_unread;
      const matchesSearch =
        !term ||
        item.task.titulo.toLowerCase().includes(term) ||
        item.proyecto_nombre?.toLowerCase().includes(term) ||
        item.changed_by_name.toLowerCase().includes(term) ||
        notificationLabel(item).toLowerCase().includes(term);

      return matchesTab && matchesUnread && matchesSearch;
    });
  }, [notificationSearch, notificationTab, onlyUnreadNotifications, taskNotifications]);

  const openCreateDialog = () => {
    setEditingTask(null);
    const initialProject = projectFilter !== "all" && projectFilter !== GENERAL_SCOPE ? projectFilter : "";
    setForm({
      ...emptyForm(),
      proyecto: initialProject,
      organization_id: initialProject
        ? proyectos?.find((project) => project._id === initialProject)?.organization_id || ""
        : currentUser?.organization_id || organizationScopes?.[0]?.id || "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setForm({
      tipo: task.tipo || (/^minuta\b/i.test(task.titulo) && !task.parent_task ? "minuta" : "tarea"),
      organization_id: task.organization_id || "",
      proyecto: task.proyecto || "",
      titulo: task.titulo,
      descripcion: task.descripcion || "",
      prioridad: task.prioridad,
      status: task.status,
      fecha_limite: task.fecha_limite || "",
      categoria: task.categoria || "General",
      asignados: new Set(task.asignados),
      partidas: new Set(task.partidas || []),
    });
    setDialogOpen(true);
  };

  const toggleAssignee = (userId: string) => {
    setForm((current) => {
      const next = new Set(current.asignados);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return { ...current, asignados: next };
    });
  };

  const togglePartida = (partidaId: string) => {
    setForm((current) => {
      const next = new Set(current.partidas);
      if (next.has(partidaId)) {
        next.delete(partidaId);
      } else {
        next.add(partidaId);
      }
      return { ...current, partidas: next };
    });
  };

  const handleSubmit = async () => {
    const targetProjectId = form.proyecto || undefined;
    if (!targetProjectId && !selectedFormOrganizationId) {
      toast.error("No se pudo determinar el alcance General para tu cuenta");
      return;
    }
    if (!form.titulo.trim()) {
      toast.error("Agrega un título para la tarea");
      return;
    }
    setSubmitting(true);
    const payload = {
      titulo: form.titulo,
      descripcion: form.descripcion || undefined,
      asignados: Array.from(form.asignados) as Id<"users">[],
      partidas: targetProjectId ? Array.from(form.partidas) as Id<"partidas">[] : [],
      prioridad: form.prioridad,
      fecha_limite: form.fecha_limite || null,
      categoria: form.categoria,
    };

    try {
      if (editingTask) {
        await updateTask({
          id: editingTask._id,
          proyecto: targetProjectId ? targetProjectId as Id<"desarrollos"> : null,
          organization_id: selectedFormOrganizationId,
          tipo: form.tipo,
          ...payload,
          status: form.status,
          parent_task: editingTask.parent_task ?? null,
        });
        toast.success("Tarea actualizada");
      } else {
        const taskId = await createTask({
          proyecto: targetProjectId as Id<"desarrollos"> | undefined,
          organization_id: selectedFormOrganizationId,
          tipo: form.tipo,
          titulo: payload.titulo,
          descripcion: payload.descripcion,
          asignados: payload.asignados,
          partidas: payload.partidas,
          prioridad: payload.prioridad,
          fecha_limite: form.fecha_limite || undefined,
          categoria: payload.categoria,
        });
        setSelectedTaskId(taskId);
        toast.success("Tarea creada");
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error(mutationErrorMessage(error, "No se pudo guardar la tarea"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (task: Task, status: string) => {
    if (!canChangeTaskStatus(task)) {
      toast.error("Solo responsables, creadores o admins pueden cambiar el estado");
      return;
    }

    setUpdatingStatusId(task._id);
    try {
      await updateStatus({ id: task._id, status });
      toast.success("Estado actualizado");
    } catch (error) {
      console.error("Error updating task status:", error);
      toast.error("No se pudo actualizar el estado");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleInlineUpdate = async (
    task: Task,
    changes: Omit<Partial<Pick<Task, "titulo" | "fecha_limite" | "prioridad" | "status" | "categoria" | "asignados" | "partidas">>, "proyecto"> & {
      proyecto?: Id<"desarrollos"> | null;
    }
  ) => {
    const changedKeys = Object.keys(changes);
    if (changedKeys.length === 1 && changes.status !== undefined) {
      await handleStatusChange(task, changes.status);
      return;
    }

    if (!canManageTask(task)) {
      toast.error("Solo el creador o un admin pueden editar los detalles");
      return;
    }

    const nextTitle = changes.titulo ?? task.titulo;
    if (!nextTitle.trim()) {
      toast.error("El título no puede quedar vacío");
      return;
    }
    const nextAssignees = changes.asignados ?? task.asignados;

    setInlineSavingId(task._id);
    try {
      const hasProjectChange = Object.prototype.hasOwnProperty.call(changes, "proyecto");
      const nextProject = hasProjectChange ? changes.proyecto || undefined : task.proyecto;
      const nextOrganizationId = hasProjectChange && nextProject
        ? proyectos?.find((project) => project._id === nextProject)?.organization_id || task.organization_id
        : task.organization_id;
      const allowedAssignees = hasProjectChange
        ? (nextProject ? assignableUsersByProject?.[nextProject] : organizationAssignableUsers)
        : undefined;
      const scopedAssignees = allowedAssignees
        ? nextAssignees.filter((id) => allowedAssignees.some((user) => user._id === id))
        : nextAssignees;
      const nextDueDate = Object.prototype.hasOwnProperty.call(changes, "fecha_limite")
        ? changes.fecha_limite || undefined
        : task.fecha_limite;
      await updateTask({
        id: task._id,
        proyecto: nextProject ?? null,
        organization_id: nextOrganizationId,
        tipo: task.tipo,
        titulo: nextTitle,
        descripcion: task.descripcion || undefined,
        asignados: scopedAssignees,
        partidas: hasProjectChange ? [] : changes.partidas ?? task.partidas ?? [],
        status: changes.status ?? task.status,
        prioridad: changes.prioridad ?? task.prioridad,
        fecha_limite: nextDueDate ?? null,
        categoria: changes.categoria ?? task.categoria ?? "General",
        parent_task: task.parent_task ?? null,
      });
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error(mutationErrorMessage(error, "No se pudo actualizar la tarea"));
    } finally {
      setInlineSavingId(null);
    }
  };

  const handleCreateSubtask = async (
    parent: Task,
    titleOverride?: string,
    options: { keepAdding?: boolean; openDetails?: boolean } = {}
  ) => {
    const title = (titleOverride ?? subtaskTitle).trim();
    if (!title || submitting) return;
    const { keepAdding = false, openDetails = true } = options;

    setSubmitting(true);
    try {
      const taskId = await createTask({
        proyecto: subtaskProjectId ? subtaskProjectId as Id<"desarrollos"> : undefined,
        organization_id: parent.organization_id,
        tipo: "tarea",
        parent_task: parent._id,
        titulo: title,
        descripcion: undefined,
        asignados: subtaskAssignees,
        partidas: subtaskProjectId ? subtaskPartidas : [],
        prioridad: subtaskPriority || parent.prioridad,
        status: parent.status,
        fecha_limite: subtaskDueDate || undefined,
        categoria: parent.categoria || "General",
      });
      setSubtaskTitle("");
      setSubtaskAssignees([]);
      setSubtaskDueDate("");
      setSubtaskPriority("Media");
      setSubtaskPartidas([]);
      if (!keepAdding) {
        setSubtaskProjectId("");
        setAddingSubtaskFor(null);
      }
      if (openDetails) setSelectedTaskId(taskId);
      toast.success("Subtarea creada");
      if (keepAdding) {
        requestAnimationFrame(() => subtaskTitleInputRef.current?.focus());
      }
    } catch (error) {
      console.error("Error creating subtask:", error);
      toast.error(mutationErrorMessage(error, "No se pudo crear la subtarea"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInlineTask = async (
    projectId: Id<"desarrollos">,
    status: string,
    titleOverride?: string,
    options: { keepAdding?: boolean; openDetails?: boolean } = {}
  ) => {
    const title = (titleOverride ?? newTaskTitle).trim();
    if (!title || submitting) return;
    const { keepAdding = false, openDetails = true } = options;

    setSubmitting(true);
    try {
      const taskId = await createTask({
        proyecto: projectId,
        parent_task: undefined,
        titulo: title,
        descripcion: undefined,
        asignados: newTaskAssignees,
        partidas: newTaskPartidas,
        prioridad: newTaskPriority,
        status,
        fecha_limite: newTaskDueDate || undefined,
        categoria: "General",
      });
      setNewTaskTitle("");
      setNewTaskAssignees([]);
      setNewTaskDueDate("");
      setNewTaskPriority("Media");
      setNewTaskPartidas([]);
      if (!keepAdding) setAddingTaskInSection(null);
      if (openDetails) setSelectedTaskId(taskId);
      toast.success("Tarea creada");
      if (keepAdding) {
        requestAnimationFrame(() => newTaskTitleInputRef.current?.focus());
      }
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error(mutationErrorMessage(error, "No se pudo crear la tarea"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubtaskRef = useRef(handleCreateSubtask);
  handleCreateSubtaskRef.current = handleCreateSubtask;
  const handleCreateInlineTaskRef = useRef(handleCreateInlineTask);
  handleCreateInlineTaskRef.current = handleCreateInlineTask;

  useEffect(() => {
    document.body.style.cursor = draggingTaskId ? "grabbing" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [draggingTaskId]);

  useEffect(() => {
    if (!tareas || Object.keys(orderOverride).length === 0) return;

    setOrderOverride((current) => {
      let changed = false;
      const next = { ...current };
      for (const [scopeKey, orderedIds] of Object.entries(current)) {
        const serverIds = sortTasksByPosition(
          tareas.filter((task) => taskOrderScopeKey(task) === scopeKey)
        ).map((task) => task._id);
        const expected = orderedIds.filter((id) => serverIds.includes(id));
        const actual = serverIds.filter((id) => orderedIds.includes(id));
        if (
          expected.length > 0 &&
          expected.length === actual.length &&
          expected.every((id, index) => id === actual[index])
        ) {
          delete next[scopeKey];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [orderOverride, tareas]);

  useEffect(() => {
    if (!addingSubtaskFor && !addingTaskInSection) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || isPortaledPickerTarget(target)) {
        skipSubtaskCreateOnBlur.current = true;
        skipNewTaskCreateOnBlur.current = true;
        return;
      }

      if (addingSubtaskFor) {
        if (target.closest(".subtask-creation-form")) {
          skipSubtaskCreateOnBlur.current = true;
        } else {
          const parent = (tareas || []).find((task) => task._id === addingSubtaskFor);
          const title = subtaskTitleInputRef.current?.value.trim() || "";
          skipSubtaskCreateOnBlur.current = true;
          if (parent && title) {
            void handleCreateSubtaskRef.current(parent, title, { openDetails: false });
          } else {
            setSubtaskTitle("");
            setSubtaskAssignees([]);
            setSubtaskDueDate("");
            setSubtaskPriority("Media");
            setSubtaskPartidas([]);
            setAddingSubtaskFor(null);
          }
        }
      }

      if (addingTaskInSection) {
        if (target.closest(".task-creation-form")) {
          skipNewTaskCreateOnBlur.current = true;
        } else {
          const title = newTaskTitleInputRef.current?.value.trim() || "";
          skipNewTaskCreateOnBlur.current = true;
          if (title && !addingTaskInSection.projectId.startsWith(GENERAL_SCOPE)) {
            void handleCreateInlineTaskRef.current(
              addingTaskInSection.projectId as Id<"desarrollos">,
              addingTaskInSection.statusLabel,
              title,
              { openDetails: false }
            );
          } else {
            setNewTaskTitle("");
            setNewTaskAssignees([]);
            setNewTaskDueDate("");
            setNewTaskPriority("Media");
            setNewTaskPartidas([]);
            setAddingTaskInSection(null);
          }
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [addingSubtaskFor, addingTaskInSection, tareas]);

  const handleDuplicate = async (task: Task) => {
    try {
      const taskId = await duplicateTask({ id: task._id });
      setSelectedTaskId(taskId);
      toast.success("Tarea duplicada");
    } catch (error) {
      console.error("Error duplicating task:", error);
      toast.error("No se pudo duplicar la tarea");
    }
  };

  const copyTaskName = async (task: Task) => {
    await navigator.clipboard.writeText(task.titulo);
    toast.success("Nombre copiado");
  };

  const copyTaskUrl = async (task: Task) => {
    const scope = task.proyecto ? `proyecto=${task.proyecto}&` : "";
    const url = `${window.location.origin}/tareas?${scope}tarea=${task._id}`;
    await navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  };

  const openProjectTaskRoute = (task: Task) => {
    const scope = task.proyecto ? `proyecto=${task.proyecto}&` : "";
    window.open(`/tareas?${scope}tarea=${task._id}`, "_blank", "noopener,noreferrer");
  };

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const toggleStatusCollapse = (sectionKey: string) => {
    setCollapsedStatusSections((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const toggleTaskCollapse = (taskId: Id<"tareas">) => {
    setCollapsedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const clearDropIndicator = () => {
    dropIndicatorRef.current = null;
    setDropIndicator(null);
  };

  const canReorderPair = (dragged: Task, target: Task) =>
    dragged._id !== target._id &&
    canManageTask(dragged) &&
    canManageTask(target) &&
    (dragged.parent_task || null) === (target.parent_task || null) &&
    dragged.proyecto === target.proyecto &&
    dragged.organization_id === target.organization_id;

  const beginTaskDrag = (event: React.DragEvent, task: Task) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task._id);
    setDraggingTaskId(task._id);
    clearDropIndicator();
  };

  const endTaskDrag = () => {
    setDraggingTaskId(null);
    clearDropIndicator();
  };

  const updateDropIndicator = (event: React.DragEvent, target: Task) => {
    if (!draggingTaskId) return;

    const draggedTask = (tareas || []).find((task) => task._id === draggingTaskId);
    if (!draggedTask || !canReorderPair(draggedTask, target)) {
      const allowBubbleToParent = Boolean(target.parent_task && draggedTask && !draggedTask.parent_task);
      if (!allowBubbleToParent) event.stopPropagation();
      event.dataTransfer.dropEffect = "none";
      if (dropIndicatorRef.current?.taskId === target._id) clearDropIndicator();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const edge: TaskDropIndicator["edge"] =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const next: TaskDropIndicator = { taskId: target._id, edge };
    dropIndicatorRef.current = next;
    setDropIndicator((current) =>
      current?.taskId === next.taskId && current.edge === next.edge ? current : next
    );
  };

  const handleTaskDrop = async (event: React.DragEvent, targetTask: Task) => {
    const draggedId = draggingTaskId;
    const draggedTask = draggedId
      ? (tareas || []).find((task) => task._id === draggedId)
      : undefined;

    if (!draggedTask || !canReorderPair(draggedTask, targetTask)) {
      const allowBubbleToParent = Boolean(targetTask.parent_task && draggedTask && !draggedTask.parent_task);
      if (!allowBubbleToParent) {
        event.preventDefault();
        event.stopPropagation();
        clearDropIndicator();
        setDraggingTaskId(null);
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const edge =
      dropIndicatorRef.current?.taskId === targetTask._id
        ? dropIndicatorRef.current.edge
        : event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2
          ? "before"
          : "after";

    clearDropIndicator();
    setDraggingTaskId(null);

    const siblings = sortTasksByPosition(
      (tareas || []).filter((task) =>
        (task.parent_task || null) === (targetTask.parent_task || null) &&
        task.proyecto === targetTask.proyecto &&
        task.organization_id === targetTask.organization_id
      )
    );
    if (!siblings.every(canManageTask)) {
      toast.error("Solo el creador o un admin pueden reordenar estas tareas");
      return;
    }

    const currentIds = siblings.map((task) => task._id);
    const orderedIds = moveTaskId(currentIds, draggedTask._id, targetTask._id, edge);
    if (orderedIds.join() === currentIds.join()) return;

    const scopeKey = taskOrderScopeKey(targetTask);
    setOrderOverride((current) => ({ ...current, [scopeKey]: orderedIds }));

    try {
      await reorderTasks({ orderedIds });
    } catch (error) {
      console.error("Error reordering tasks:", error);
      setOrderOverride((current) => {
        const next = { ...current };
        delete next[scopeKey];
        return next;
      });
      toast.error("No se pudo reordenar la tarea");
    }
  };

  const handleDelete = async () => {
    if (!taskToDelete) return;
    try {
      await removeTask({ id: taskToDelete._id });
      if (selectedTaskId === taskToDelete._id) setSelectedTaskId(null);
      setTaskToDelete(null);
      toast.success("Tarea eliminada");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("No se pudo eliminar la tarea");
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      await addComment({ id: selectedTask._id, comment: commentText });
      setCommentText("");
      toast.success("Comentario agregado");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("No se pudo agregar el comentario");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleOpenNotification = async (item: TaskNotification) => {
    setSelectedTaskId(item.task._id);
    setNotificationsOpen(false);

    if (!item.is_unread) return;

    try {
      await markNotificationAsRead({ id: item._id });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleRemoveComment = async (commentId: Id<"tarea_comments">) => {
    try {
      await removeComment({ id: commentId });
      toast.success("Comentario eliminado");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("No se pudo eliminar el comentario");
    }
  };

  const getStatusSections = (tasks: Task[], includeEmptyStarter = false) => {
    const statuses = new Map<string, Task[]>();
    for (const task of tasks) {
      const existing = statuses.get(task.status) || [];
      existing.push(task);
      statuses.set(task.status, existing);
    }

    const orderedLabels = [
      ...effectiveStatusLabels,
      ...Array.from(statuses.keys())
        .filter((status) => !effectiveStatusLabels.some((label) => label.label === status))
        .map((status) => labelForValue(status, effectiveStatusLabels)),
    ];

    return orderedLabels
      .map((label) => ({
        label,
        tasks: statuses.get(label.label) || [],
      }))
      .filter((section, index) => section.tasks.length > 0 || (includeEmptyStarter && index === 0));
  };

  const renderTaskContent = (task: Task, level = 0) => {
    const overdue = isOverdue(task);
    const isSaving = inlineSavingId === task._id || updatingStatusId === task._id;
    const canEditTask = canManageTask(task);
    const canEditStatus = canChangeTaskStatus(task);

    return (
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ task, x: event.clientX, y: event.clientY });
        }}
        className={cn(
          "grid min-h-[44px] items-center gap-4 py-3 transition min-[1440px]:py-1.5",
          TASK_TABLE_GRID
        )}
      >
        <div className={cn("flex items-center gap-2", TASK_TITLE_CELL)} style={{ paddingLeft: level * 26 }}>
          <button
            type="button"
            draggable={canEditTask}
            onDragStart={(event) => beginTaskDrag(event, task)}
            onDragEnd={endTaskDrag}
            className={cn(
              "flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-disabled-foreground transition active:cursor-grabbing min-[1440px]:h-5 min-[1440px]:w-4",
              draggingTaskId === task._id ? "opacity-100" : "opacity-40 group-hover:opacity-100"
            )}
            aria-label="Reordenar tarea"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex h-9 shrink-0 items-center gap-2 min-[1440px]:h-6">
            <Checkbox checked={task.status === "Completada"} onCheckedChange={(checked) => handleStatusChange(task, checked ? "Completada" : "Pendiente")} disabled={!canEditStatus || isSaving} className={TASK_CHECKBOX_CLASS} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Input
                defaultValue={task.titulo}
                disabled={!canEditTask || isSaving}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (value && value !== task.titulo) void handleInlineUpdate(task, { titulo: value });
                }}
                className={cn(
                  "h-9 border-transparent bg-transparent px-1 text-sm font-normal text-muted-foreground shadow-none hover:border-border focus-visible:border-border focus-visible:ring-0 min-[1440px]:h-6",
                  level > 0 && "text-subtle-foreground"
                )}
              />
              {overdue && <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />}
              {isSaving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-disabled-foreground" />}
            </div>
          </div>
        </div>
        <div className={TASK_FIELD_CELL}>
          <span className={TASK_MOBILE_LABEL}>Responsable</span>
          <InlineAssigneePicker
            task={task}
            assignableUsers={assignableUsersForTask(task)}
            disabled={!canEditTask}
            onChange={(assignees) => handleInlineUpdate(task, { asignados: assignees })}
          />
        </div>
        <div className={TASK_FIELD_CELL}>
          <span className={TASK_MOBILE_LABEL}>Fecha vencimiento</span>
          <InlineDatePicker
            value={task.fecha_limite}
            disabled={!canEditTask}
            overdue={overdue}
            showRelative={task.status !== "Completada" && task.status !== "Cancelada"}
            onChange={(value) => handleInlineUpdate(task, { fecha_limite: value })}
          />
        </div>
        <div className={TASK_FIELD_CELL}>
          <span className={TASK_MOBILE_LABEL}>Estado</span>
          <InlineLabelPicker
            value={task.status}
            labels={effectiveStatusLabels}
            disabled={!canEditStatus || isSaving}
            onSelect={(status) => handleStatusChange(task, status)}
            onLabelsChange={setStatusLabels}
          />
        </div>
        <div className={TASK_FIELD_CELL}>
          <span className={TASK_MOBILE_LABEL}>Prioridad</span>
          <InlinePriorityPicker
            value={task.prioridad}
            labels={effectivePriorityLabels}
            disabled={!canEditTask}
            onSelect={(value) => handleInlineUpdate(task, { prioridad: value })}
            onLabelsChange={setPriorityLabels}
          />
        </div>
        <div className={TASK_FIELD_CELL}>
          <span className={TASK_MOBILE_LABEL}>Especialidad</span>
          <InlineSingleSelectPicker
            value={task.categoria || "General"}
            displayValue={task.categoria || "General"}
            options={inlineCategoryOptions}
            disabled={!canEditTask}
            searchPlaceholder="Buscar especialidad"
            onSelect={(categoria) => handleInlineUpdate(task, { categoria })}
          />
        </div>
        <div className={TASK_FIELD_CELL}>
          <span className={TASK_MOBILE_LABEL}>Proyecto</span>
          <InlineSingleSelectPicker
            value={task.proyecto || GENERAL_SCOPE}
            displayValue={task.proyecto_nombre || "General"}
            options={[
              { value: GENERAL_SCOPE, label: "General" },
              ...(proyectos || [])
                .filter((project) => !task.organization_id || project.organization_id === task.organization_id)
                .map((project) => ({ value: project._id, label: project.nombre })),
            ]}
            disabled={!canEditTask}
            searchPlaceholder="Buscar proyecto"
            onSelect={(projectId) =>
              handleInlineUpdate(task, {
                proyecto: projectId === GENERAL_SCOPE ? null : projectId as Id<"desarrollos">,
              })
            }
          />
        </div>
        <div className={TASK_ACTION_CELL}>
          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); setContextMenu({ task, x: event.clientX, y: event.clientY }); }} className="h-9 w-9 text-disabled-foreground hover:text-subtle-foreground min-[1440px]:h-6 min-[1440px]:w-6">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const renderTaskRow = (task: Task, groupProjectId: string, level = 0) => {
    const childTasks = projectedChildrenByGroup.get(`${groupProjectId}:${task._id}`) || [];
    const hasChildren = childTasks.length > 0;
    const isTaskCollapsed = collapsedTasks.has(task._id);
    const canEditTask = canManageTask(task);
    const canEditStatus = canChangeTaskStatus(task);

    if (level > 0) {
      return renderTaskContent(task, level);
    }

    return (
      <React.Fragment key={task._id}>
        <div
          key={task._id}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ task, x: event.clientX, y: event.clientY });
          }}
          onDragEnter={(event) => updateDropIndicator(event, task)}
          onDragOver={(event) => updateDropIndicator(event, task)}
          onDragLeave={(event) => {
            const related = event.relatedTarget;
            if (related instanceof Node && event.currentTarget.contains(related)) return;
            if (dropIndicatorRef.current?.taskId === task._id) clearDropIndicator();
          }}
          onDrop={(event) => {
            void handleTaskDrop(event, task);
          }}
          className={cn(
            "group relative border-b bg-transparent px-4 md:px-6 min-[1440px]:px-8 transition hover:bg-muted",
            draggingTaskId === task._id && "opacity-50"
          )}
          style={{ borderColor: TASK_UI_COLORS.tableBorder }}
        >
          {dropIndicator?.taskId === task._id && <TaskDropLine edge={dropIndicator.edge} />}
          <div
            className={cn(
              "grid min-h-[44px] items-center gap-4 py-3 min-[1440px]:py-1.5",
              TASK_TABLE_GRID,
              !isTaskCollapsed && (hasChildren || addingSubtaskFor === task._id) && "border-b"
            )}
            style={!isTaskCollapsed && (hasChildren || addingSubtaskFor === task._id) ? { borderColor: TASK_UI_COLORS.tableBorder } : undefined}
          >
              <div className={cn("flex items-center gap-2", TASK_TITLE_CELL)}>
                <button
                  type="button"
                  draggable={canEditTask}
                  onDragStart={(event) => beginTaskDrag(event, task)}
                  onDragEnd={endTaskDrag}
                  className={cn(
                    "flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-disabled-foreground transition active:cursor-grabbing min-[1440px]:h-5 min-[1440px]:w-4",
                    draggingTaskId === task._id ? "opacity-100" : "opacity-40 group-hover:opacity-100"
                  )}
                  aria-label="Reordenar tarea"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <div className="relative flex h-9 shrink-0 items-center gap-2 min-[1440px]:h-6">
                  <Checkbox checked={task.status === "Completada"} onCheckedChange={(checked) => handleStatusChange(task, checked ? "Completada" : "Pendiente")} disabled={!canEditStatus || inlineSavingId === task._id || updatingStatusId === task._id} className={TASK_CHECKBOX_CLASS} />
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleTaskCollapse(task._id)}
                      className="flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted min-[1440px]:h-5 min-[1440px]:w-5"
                      aria-expanded={!isTaskCollapsed}
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isTaskCollapsed && "-rotate-90")} />
                    </button>
                  ) : canCreate ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (addingSubtaskFor === task._id) {
                          setAddingSubtaskFor(null);
                          setSubtaskTitle("");
                          setSubtaskAssignees([]);
                          setSubtaskDueDate("");
                          setSubtaskPriority("Media");
                          setSubtaskPartidas([]);
                        } else {
                          skipSubtaskCreateOnBlur.current = false;
                          setAddingSubtaskFor(task._id);
                          setSubtaskProjectId(groupProjectId.startsWith(GENERAL_SCOPE) ? "" : groupProjectId);
                          setSubtaskTitle("");
                          setSubtaskAssignees([]);
                          setSubtaskDueDate("");
                          setSubtaskPriority("Media");
                          setSubtaskPartidas([]);
                          setCollapsedTasks((current) => {
                            const next = new Set(current);
                            next.delete(task._id);
                            return next;
                          });
                        }
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-sm text-disabled-foreground hover:bg-muted hover:text-muted-foreground min-[1440px]:h-5 min-[1440px]:w-5"
                      aria-label="Agregar subtarea"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", addingSubtaskFor !== task._id && "-rotate-90")} />
                    </button>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Input
                      defaultValue={task.titulo}
                      disabled={!canEditTask || inlineSavingId === task._id || updatingStatusId === task._id}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim();
                        if (value && value !== task.titulo) void handleInlineUpdate(task, { titulo: value });
                      }}
                      className={cn(
                        "h-9 border-transparent bg-transparent px-1 text-sm font-normal text-muted-foreground shadow-none hover:border-border focus-visible:border-border focus-visible:ring-0 min-[1440px]:h-6",
                        task.parent_task && "text-subtle-foreground"
                      )}
                    />
                    {isOverdue(task) && <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                    {(inlineSavingId === task._id || updatingStatusId === task._id) && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-disabled-foreground" />}
                  </div>
                </div>
              </div>
              <div className={TASK_FIELD_CELL}>
                <span className={TASK_MOBILE_LABEL}>Responsable</span>
                <InlineAssigneePicker
                  task={task}
                  assignableUsers={assignableUsersForTask(task)}
                  disabled={!canEditTask}
                  onChange={(assignees) => handleInlineUpdate(task, { asignados: assignees })}
                />
              </div>
              <div className={TASK_FIELD_CELL}>
                <span className={TASK_MOBILE_LABEL}>Fecha vencimiento</span>
                <InlineDatePicker
                  value={task.fecha_limite}
                  disabled={!canEditTask}
                  overdue={isOverdue(task)}
                  showRelative={task.status !== "Completada" && task.status !== "Cancelada"}
                  onChange={(value) => handleInlineUpdate(task, { fecha_limite: value })}
                />
              </div>
              <div className={TASK_FIELD_CELL}>
                <span className={TASK_MOBILE_LABEL}>Estado</span>
                <InlineLabelPicker
                  value={task.status}
                  labels={effectiveStatusLabels}
                  disabled={!canEditStatus || inlineSavingId === task._id || updatingStatusId === task._id}
                  onSelect={(status) => handleStatusChange(task, status)}
                  onLabelsChange={setStatusLabels}
                />
              </div>
              <div className={TASK_FIELD_CELL}>
                <span className={TASK_MOBILE_LABEL}>Prioridad</span>
                <InlinePriorityPicker
                  value={task.prioridad}
                  labels={effectivePriorityLabels}
                  disabled={!canEditTask}
                  onSelect={(value) => handleInlineUpdate(task, { prioridad: value })}
                  onLabelsChange={setPriorityLabels}
                />
              </div>
              <div className={TASK_FIELD_CELL}>
                <span className={TASK_MOBILE_LABEL}>Especialidad</span>
                <InlineSingleSelectPicker
                  value={task.categoria || "General"}
                  displayValue={task.categoria || "General"}
                  options={inlineCategoryOptions}
                  disabled={!canEditTask}
                  searchPlaceholder="Buscar especialidad"
                  onSelect={(categoria) => handleInlineUpdate(task, { categoria })}
                />
              </div>
              <div className={TASK_FIELD_CELL}>
                <span className={TASK_MOBILE_LABEL}>Proyecto</span>
                <InlineSingleSelectPicker
                  value={task.proyecto || GENERAL_SCOPE}
                  displayValue={task.proyecto_nombre || "General"}
                  options={[
                    { value: GENERAL_SCOPE, label: "General" },
                    ...(proyectos || [])
                      .filter((project) => !task.organization_id || project.organization_id === task.organization_id)
                      .map((project) => ({ value: project._id, label: project.nombre })),
                  ]}
                  disabled={!canEditTask}
                  searchPlaceholder="Buscar proyecto"
                  onSelect={(projectId) =>
                    handleInlineUpdate(task, {
                      proyecto: projectId === GENERAL_SCOPE ? null : projectId as Id<"desarrollos">,
                    })
                  }
                />
              </div>
              <div className={TASK_ACTION_CELL}>
                <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); setContextMenu({ task, x: event.clientX, y: event.clientY }); }} className="h-9 w-9 text-disabled-foreground hover:text-subtle-foreground min-[1440px]:h-6 min-[1440px]:w-6">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {!isTaskCollapsed && hasChildren && (
              <>
                {childTasks.map((child) => (
                  <div
                    key={child._id}
                    className={cn(
                      "group relative border-b",
                      draggingTaskId === child._id && "opacity-50"
                    )}
                    style={{ borderColor: TASK_UI_COLORS.tableBorder }}
                    onDragEnter={(event) => updateDropIndicator(event, child)}
                    onDragOver={(event) => updateDropIndicator(event, child)}
                    onDragLeave={(event) => {
                      const related = event.relatedTarget;
                      if (related instanceof Node && event.currentTarget.contains(related)) return;
                      if (dropIndicatorRef.current?.taskId === child._id) clearDropIndicator();
                    }}
                    onDrop={(event) => {
                      void handleTaskDrop(event, child);
                    }}
                  >
                    {dropIndicator?.taskId === child._id && <TaskDropLine edge={dropIndicator.edge} />}
                    {renderTaskContent(child, 1)}
                  </div>
                ))}
              </>
            )}
            {!isTaskCollapsed && (hasChildren || addingSubtaskFor === task._id) && (
              <>
                <div className="px-4 py-2 min-[1440px]:px-6">
                  {addingSubtaskFor === task._id ? (
                    <div className={cn("grid min-h-[44px] items-center gap-4 subtask-creation-form", TASK_TABLE_GRID)}>
                      <div className={cn("flex items-center gap-2", TASK_TITLE_CELL)} style={{ paddingLeft: 26 }}>
                        <Checkbox disabled className={TASK_CHECKBOX_CLASS} />
                        <Input
                          ref={subtaskTitleInputRef}
                          autoFocus
                          value={subtaskTitle}
                          disabled={submitting}
                          onChange={(event) => setSubtaskTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              skipSubtaskCreateOnBlur.current = true;
                              void handleCreateSubtask(task, event.currentTarget.value, {
                                keepAdding: true,
                                openDetails: false,
                              });
                            }
                            if (event.key === "Escape") {
                              skipSubtaskCreateOnBlur.current = true;
                              setSubtaskTitle("");
                              setSubtaskAssignees([]);
                              setSubtaskDueDate("");
                              setSubtaskPriority("Media");
                              setSubtaskPartidas([]);
                              setAddingSubtaskFor(null);
                            }
                          }}
                          onBlur={(event) => {
                            if (skipSubtaskCreateOnBlur.current) {
                              skipSubtaskCreateOnBlur.current = false;
                              return;
                            }
                            const title = event.currentTarget.value.trim();
                            window.setTimeout(() => {
                              if (skipSubtaskCreateOnBlur.current) {
                                skipSubtaskCreateOnBlur.current = false;
                                return;
                              }
                              if (
                                document.activeElement?.closest(".subtask-creation-form") ||
                                isPortaledPickerOpen()
                              ) return;
                              if (title) {
                                void handleCreateSubtask(task, title, { openDetails: false });
                              } else {
                                setSubtaskTitle("");
                                setSubtaskAssignees([]);
                                setSubtaskDueDate("");
                                setSubtaskPriority("Media");
                                setSubtaskPartidas([]);
                                setAddingSubtaskFor(null);
                              }
                            }, 200);
                          }}
                          placeholder="Nombre de la subtarea"
                          className="h-9 border-0 bg-transparent px-0 text-sm font-normal text-muted-foreground shadow-none focus-visible:ring-0 min-[1440px]:h-6"
                        />
                      </div>
                      <div className={TASK_FIELD_CELL}>
                        <span className={TASK_MOBILE_LABEL}>Responsable</span>
                        <InlineAssigneePickerForCreate
                          assignableUsers={subtaskProjectId ? assignableUsersByProject?.[subtaskProjectId] : (subtaskOrganizationUsers || organizationAssignableUsers)}
                          value={subtaskAssignees}
                          disabled={submitting}
                          onChange={setSubtaskAssignees}
                        />
                      </div>
                      <div className={TASK_FIELD_CELL}>
                        <span className={TASK_MOBILE_LABEL}>Fecha vencimiento</span>
                        <InlineDatePicker
                          value={subtaskDueDate}
                          disabled={submitting}
                          overdue={false}
                          onChange={setSubtaskDueDate}
                        />
                      </div>
                      <div className={TASK_FIELD_CELL}>
                        <span className={TASK_MOBILE_LABEL}>Estado</span>
                        <InlineLabelValue
                          value={task.status}
                          labels={effectiveStatusLabels}
                        />
                      </div>
                      <div className={TASK_FIELD_CELL}>
                        <span className={TASK_MOBILE_LABEL}>Prioridad</span>
                        <InlinePriorityPicker
                          value={subtaskPriority}
                          labels={effectivePriorityLabels}
                          disabled={submitting}
                          onSelect={setSubtaskPriority}
                          onLabelsChange={setPriorityLabels}
                        />
                      </div>
                      <div className={TASK_FIELD_CELL}>
                        <span className={TASK_MOBILE_LABEL}>Especialidad</span>
                        <span className={TASK_VALUE_TEXT}>General</span>
                      </div>
                      <div className={TASK_FIELD_CELL}>
                        <span className={TASK_MOBILE_LABEL}>Proyecto</span>
                        <Select
                          value={subtaskProjectId || GENERAL_SCOPE}
                          onValueChange={(value) => {
                            setSubtaskProjectId(value === GENERAL_SCOPE ? "" : value);
                            setSubtaskAssignees([]);
                            setSubtaskPartidas([]);
                          }}
                        >
                          <SelectTrigger className="h-7 border-0 bg-transparent px-0 text-sm shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={GENERAL_SCOPE}>General</SelectItem>
                            {(proyectos || []).filter((project) =>
                              !task.organization_id || project.organization_id === task.organization_id
                            ).map((project) => (
                              <SelectItem key={project._id} value={project._id}>{project.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className={cn(TASK_ACTION_CELL, "items-center")}>
                        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin text-disabled-foreground" />}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        skipSubtaskCreateOnBlur.current = false;
                        setAddingSubtaskFor(task._id);
                        setSubtaskProjectId(groupProjectId.startsWith(GENERAL_SCOPE) ? "" : groupProjectId);
                        setSubtaskTitle("");
                        setSubtaskAssignees([]);
                        setSubtaskDueDate("");
                        setSubtaskPriority("Media");
                        setSubtaskPartidas([]);
                      }}
                      className="flex h-6 items-center gap-2 text-xs text-disabled-foreground hover:text-disabled-foreground"
                      style={{ paddingLeft: 26 }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar subelemento
                    </button>
                  )}
                </div>
              </>
            )}
        </div>
      </React.Fragment>
    );
  };

  if ((isProjectScoped && !proyecto) || !tareas || !proyectos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-disabled-foreground" />
      </div>
    );
  }

  const contextMenuMaxHeight = Math.min(440, window.innerHeight - 16);
  const contextMenuTop = contextMenu
    ? Math.max(8, Math.min(contextMenu.y, window.innerHeight - contextMenuMaxHeight - 8))
    : 8;
  const contextMenuLeft = contextMenu
    ? Math.max(8, Math.min(contextMenu.x, window.innerWidth - 300))
    : 8;

  return (
    <div className="min-h-screen w-full min-w-0 bg-card text-left">
      <div className="border-b border-border px-4 py-6 sm:px-6 sm:py-8 lg:px-10 min-[1440px]:px-16">
        <div className="flex flex-col gap-5 min-[1200px]:flex-row min-[1200px]:items-end min-[1200px]:justify-between">
          <div>
            <p className="text-sm text-subtle-foreground">General</p>
            <h1 className="mt-1 text-3xl font-normal text-foreground">Tareas</h1>
          </div>
          <div className="flex w-full flex-wrap gap-2 self-start sm:w-auto min-[1200px]:self-auto">
            <Button
              variant="outline"
              onClick={() => setNotificationsOpen(true)}
              className="relative h-11 flex-1 gap-2 rounded-sm border-border bg-card px-4 text-sm font-normal text-subtle-foreground shadow-none hover:bg-card hover:text-subtle-foreground sm:h-14 sm:flex-none sm:gap-3 sm:px-5 sm:text-base"
            >
              <span className="h-3 w-3 rounded-full bg-[#50AC66]" />
              Notificaciones
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#50AC66] px-1.5 text-[11px] font-medium text-on-color">
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </Button>
            {canCreate && (
              <Button
                onClick={openCreateDialog}
                variant="outline"
                className="h-11 flex-1 gap-2 rounded-sm border-border bg-card px-4 text-sm font-normal text-subtle-foreground shadow-none hover:bg-card hover:text-subtle-foreground sm:h-14 sm:flex-none sm:gap-3 sm:px-8 sm:text-base"
              >
                <Plus className="h-5 w-5 text-subtle-foreground" />
                Nueva tarea
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-10 min-[1440px]:px-16">
        <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
          {[
            { id: "all" as const, label: "Total", value: stats.total },
            { id: "open" as const, label: "Abiertas", value: stats.pending },
            { id: "overdue" as const, label: "Vencidas", value: stats.overdue },
            { id: "done" as const, label: "Completas", value: stats.done },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTaskTab(item.id)}
              className={cn(
                "flex min-w-0 items-center justify-center gap-2 px-2 py-3 text-sm text-muted-foreground sm:py-4",
                taskTab === item.id && "border-b-2 border-foreground text-foreground"
              )}
            >
              <span>{item.label}</span>
              <span className="flex h-[24px] min-w-[24px] items-center justify-center rounded-full bg-disabled px-2 text-[15px] text-foreground">
                {item.value}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:p-4 md:grid-cols-2 min-[1440px]:grid-cols-[minmax(280px,1fr)_minmax(180px,0.55fr)_minmax(220px,0.65fr)_auto] min-[1440px]:gap-4">
          <div className="relative md:col-span-2 min-[1440px]:col-span-1">
            <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-disabled-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, descripción o asignado"
              className="h-9 rounded-none border-border bg-card pl-14 text-sm font-normal text-disabled-foreground shadow-none placeholder:text-disabled-foreground focus-visible:ring-ring"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 rounded-none border-border bg-card px-5 text-sm text-disabled-foreground shadow-none focus:ring-ring">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {effectiveStatusLabels.map((status) => (
                <SelectItem key={status.id} value={status.label}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-9 rounded-none border-border bg-card px-5 text-sm text-disabled-foreground shadow-none focus:ring-ring">
              <SelectValue placeholder="Asignado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {assigneeFilterOptions.map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  {user.name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersDialogOpen(true)}
            className="h-9 rounded-none border-border bg-card px-5 text-sm text-disabled-foreground shadow-none hover:bg-card hover:text-disabled-foreground md:col-span-2 min-[1440px]:col-span-1"
          >
            <Filter className="h-4 w-4" />
            Más filtros
            {additionalFilterCount > 0 && (
              <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-inverse px-1.5 text-xs text-on-color">
                {additionalFilterCount}
              </span>
            )}
          </Button>
        </div>

        <div className="space-y-6 bg-card sm:space-y-8 min-[1440px]:space-y-10">
              {groupedTasks.map((group) => {
                const isCollapsed = collapsedProjects.has(group.projectId);

                return (
                  <div
                    key={group.projectId}
                    className={cn(
                      "rounded-md border-none bg-card",
                      isProjectScoped && "border-0"
                    )}
                    style={!isProjectScoped ? { borderColor: TASK_UI_COLORS.projectHeaderBorder } : undefined}
                  >
                    {!isProjectScoped && (
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapse(group.projectId)}
                        className={cn(
                          "flex min-h-20 w-full items-center gap-2 bg-card px-4 text-left sm:px-6 md:px-8 min-[1440px]:min-h-32 min-[1440px]:gap-3",
                          !isCollapsed && "border-b"
                        )}
                        style={!isCollapsed ? { borderColor: TASK_UI_COLORS.tableBorder } : undefined}
                        aria-expanded={!isCollapsed}
                      >
                        <ChevronDown className={cn("h-4 w-4 text-subtle-foreground transition-transform", isCollapsed && "-rotate-90")} />
                        <span className="min-w-0 flex-1 truncate font-medium text-subtle-foreground">{group.projectName}</span>
                        <MoreHorizontal className="h-4 w-4 shrink-0 text-subtle-foreground" />
                        <span className="ml-auto shrink-0 rounded-sm bg-muted px-3 py-2 text-xs text-disabled-foreground sm:px-4 min-[1440px]:px-6">
                          {group.tasks.reduce((count, task) => count + 1 + (projectedChildrenByGroup.get(`${group.projectId}:${task._id}`)?.length || 0), 0)} tareas
                        </span>
                      </button>
                    )}
                    {!isCollapsed && (
                      <div className="w-full min-w-0 overflow-hidden">
                        <div className="min-w-0">
                        {getStatusSections(group.tasks, group.tasks.length === 0).map((section, sectionIndex) => {
                            const sectionKey = `${group.projectId}:${section.label.id}`;
                            const isStatusCollapsed = collapsedStatusSections.has(sectionKey);

                            return (
                              <div
                                key={sectionKey}
                                className={sectionIndex > 0 ? "border-t" : undefined}
                                style={sectionIndex > 0 ? { borderColor: TASK_UI_COLORS.tableBorder } : undefined}
                              >
                                <div className="px-4 pb-3 pt-6 md:px-6 md:pt-8 min-[1440px]:px-8">
                                    <button
                                      type="button"
                                      onClick={() => toggleStatusCollapse(sectionKey)}
                                      className="flex min-w-0 items-center gap-2 text-left text-[14px] text-subtle-foreground hover:text-subtle-foreground"
                                      aria-expanded={!isStatusCollapsed}
                                    >
                                      <ChevronDown className={cn("h-4 w-4 text-subtle-foreground transition-transform", isStatusCollapsed && "-rotate-90")} />
                                      <StatusSectionIcon status={section.label.label} color={section.label.color} />
                                      <span>{section.label.label}</span>
                                      <span className="text-xs text-disabled-foreground">{section.tasks.length}</span>
                                    </button>
                                </div>
                                {!isStatusCollapsed && (
                                  <>
                                    <div
                                      className={cn("hidden items-center gap-4 border-b px-4 py-2 md:px-6 min-[1440px]:grid min-[1440px]:px-8", TASK_COLUMN_TEXT, TASK_TABLE_GRID)}
                                      style={{ borderColor: TASK_UI_COLORS.tableBorder }}
                                    >
                                      <span className={cn("hidden min-[1440px]:block", TASK_TITLE_CELL)}>Nombre</span>
                                      <span className="hidden min-[1440px]:block">Responsable</span>
                                      <span className="hidden min-[1440px]:block">Fecha vencimiento</span>
                                      <span className="hidden min-[1440px]:block">Estado</span>
                                      <span className="hidden min-[1440px]:block">Prioridad</span>
                                      <span className="hidden min-[1440px]:block">Especialidad</span>
                                      <span className="hidden min-[1440px]:block">Proyecto</span>
                                      <span className="hidden min-[1440px]:block" />
                                    </div>
                                    {section.tasks.length > 0 && (
                                      <div>
                                        {section.tasks.map((task) => renderTaskRow(task, group.projectId))}
                                      </div>
                                    )}
                                    {canCreate && (
                                      <div className="px-4 py-2 md:px-6 min-[1440px]:px-8">
                                        {addingTaskInSection?.projectId === group.projectId && addingTaskInSection?.statusLabel === section.label.label ? (
                                          <div className={cn("grid min-h-[44px] items-center gap-4 task-creation-form", TASK_TABLE_GRID)}>
                                            <div className={cn("flex items-center gap-2", TASK_TITLE_CELL)}>
                                              <Checkbox disabled className={TASK_CHECKBOX_CLASS} />
                                              <Input
                                                ref={newTaskTitleInputRef}
                                                autoFocus
                                                value={newTaskTitle}
                                                disabled={submitting}
                                                onChange={(event) => setNewTaskTitle(event.target.value)}
                                                onKeyDown={(event) => {
                                                  if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    skipNewTaskCreateOnBlur.current = true;
                                                    void handleCreateInlineTask(
                                                      group.projectId as Id<"desarrollos">,
                                                      section.label.label,
                                                      event.currentTarget.value,
                                                      { keepAdding: true, openDetails: false }
                                                    );
                                                  }
                                                  if (event.key === "Escape") {
                                                    skipNewTaskCreateOnBlur.current = true;
                                                    setNewTaskTitle("");
                                                    setNewTaskAssignees([]);
                                                    setNewTaskDueDate("");
                                                    setNewTaskPriority("Media");
                                                    setNewTaskPartidas([]);
                                                    setAddingTaskInSection(null);
                                                  }
                                                }}
                                                onBlur={(event) => {
                                                  if (skipNewTaskCreateOnBlur.current) {
                                                    skipNewTaskCreateOnBlur.current = false;
                                                    return;
                                                  }
                                                  const title = event.currentTarget.value.trim();
                                                  window.setTimeout(() => {
                                                    if (skipNewTaskCreateOnBlur.current) {
                                                      skipNewTaskCreateOnBlur.current = false;
                                                      return;
                                                    }
                                                    if (
                                                      document.activeElement?.closest(".task-creation-form") ||
                                                      isPortaledPickerOpen()
                                                    ) return;
                                                    if (title) {
                                                      void handleCreateInlineTask(
                                                        group.projectId as Id<"desarrollos">,
                                                        section.label.label,
                                                        title,
                                                        { openDetails: false }
                                                      );
                                                    } else {
                                                      setNewTaskTitle("");
                                                      setNewTaskAssignees([]);
                                                      setNewTaskDueDate("");
                                                      setNewTaskPriority("Media");
                                                      setNewTaskPartidas([]);
                                                      setAddingTaskInSection(null);
                                                    }
                                                  }, 200);
                                                }}
                                                placeholder="Nombre de la tarea"
                                                className="h-9 border-0 bg-transparent px-0 text-sm font-normal text-muted-foreground shadow-none focus-visible:ring-0 min-[1440px]:h-6"
                                              />
                                            </div>
                                            <div className={TASK_FIELD_CELL}>
                                              <span className={TASK_MOBILE_LABEL}>Responsable</span>
                                              <InlineAssigneePickerForCreate
                                                assignableUsers={assignableUsersByProject?.[group.projectId]}
                                                value={newTaskAssignees}
                                                disabled={submitting}
                                                onChange={setNewTaskAssignees}
                                              />
                                            </div>
                                            <div className={TASK_FIELD_CELL}>
                                              <span className={TASK_MOBILE_LABEL}>Fecha vencimiento</span>
                                              <InlineDatePicker
                                                value={newTaskDueDate}
                                                disabled={submitting}
                                                overdue={false}
                                                onChange={setNewTaskDueDate}
                                              />
                                            </div>
                                            <div className={TASK_FIELD_CELL}>
                                              <span className={TASK_MOBILE_LABEL}>Estado</span>
                                              <InlineLabelValue
                                                value={section.label.label}
                                                labels={effectiveStatusLabels}
                                              />
                                            </div>
                                            <div className={TASK_FIELD_CELL}>
                                              <span className={TASK_MOBILE_LABEL}>Prioridad</span>
                                              <InlinePriorityPicker
                                                value={newTaskPriority}
                                                labels={effectivePriorityLabels}
                                                disabled={submitting}
                                                onSelect={setNewTaskPriority}
                                                onLabelsChange={setPriorityLabels}
                                              />
                                            </div>
                                            <div className={TASK_FIELD_CELL}>
                                              <span className={TASK_MOBILE_LABEL}>Especialidad</span>
                                              <span className={TASK_VALUE_TEXT}>General</span>
                                            </div>
                                            <div className={TASK_FIELD_CELL}>
                                              <span className={TASK_MOBILE_LABEL}>Proyecto</span>
                                              <span className={TASK_VALUE_TEXT}>{group.projectName}</span>
                                            </div>
                                            <div className={cn(TASK_ACTION_CELL, "items-center")}>
                                              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin text-disabled-foreground" />}
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (group.isGeneral) {
                                                setEditingTask(null);
                                                setForm({
                                                  ...emptyForm(),
                                                  organization_id: group.organizationId || currentUser?.organization_id || "",
                                                });
                                                setDialogOpen(true);
                                                return;
                                              }
                                              skipNewTaskCreateOnBlur.current = false;
                                              setAddingTaskInSection({ projectId: group.projectId, statusLabel: section.label.label });
                                              setNewTaskTitle("");
                                              setNewTaskAssignees([]);
                                              setNewTaskDueDate("");
                                              setNewTaskPriority("Media");
                                              setNewTaskPartidas([]);
                                            }}
                                            className="flex h-6 items-center gap-2 text-xs text-disabled-foreground hover:text-disabled-foreground"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                            Agregar tarea
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {!isProjectScoped && <div className="h-6" />}
                      </div>
                    )}
                  </div>
                );
              })}
              {groupedTasks.length === 0 && (
                <div className="flex h-32 items-center justify-center text-subtle-foreground">
                    No hay tareas con los filtros actuales.
                </div>
              )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-md border border-border bg-card p-1 text-foreground shadow-xl"
          style={{
            left: contextMenuLeft,
            top: contextMenuTop,
            maxHeight: contextMenuMaxHeight,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <Command className="bg-card text-foreground">
            <CommandList className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: contextMenuMaxHeight - 8 }}>
              <CommandGroup>
                <CommandItem onSelect={() => { void copyTaskName(contextMenu.task); setContextMenu(null); }} className="data-[selected=true]:bg-muted">
                  <Copy className="h-4 w-4" />
                  Copiar nombre
                </CommandItem>
                <CommandItem onSelect={() => { setSelectedTaskId(contextMenu.task._id); setContextMenu(null); }} className="data-[selected=true]:bg-muted">
                  <Eye className="h-4 w-4" />
                  Abrir tarea
                </CommandItem>
                <CommandItem onSelect={() => { openProjectTaskRoute(contextMenu.task); setContextMenu(null); }} className="data-[selected=true]:bg-muted">
                  <ExternalLink className="h-4 w-4" />
                  Abrir en una pestaña nueva
                </CommandItem>
                <CommandItem onSelect={() => { void copyTaskUrl(contextMenu.task); setContextMenu(null); }} className="data-[selected=true]:bg-muted">
                  <Copy className="h-4 w-4" />
                  Copiar URL de tarea
                </CommandItem>
              </CommandGroup>
              <CommandSeparator className="bg-disabled" />
              <CommandGroup>
                <CommandItem onSelect={() => { void handleDuplicate(contextMenu.task); setContextMenu(null); }} disabled={!canCreate} className="data-[selected=true]:bg-muted">
                  <Copy className="h-4 w-4" />
                  Duplicar
                </CommandItem>
                {!contextMenu.task.parent_task && (
                  <CommandItem onSelect={() => { setAddingSubtaskFor(contextMenu.task._id); setSubtaskProjectId(contextMenu.task.proyecto || ""); setSubtaskTitle(""); setContextMenu(null); }} disabled={!canCreate} className="data-[selected=true]:bg-muted">
                    <Plus className="h-4 w-4" />
                    Agregar subtarea
                  </CommandItem>
                )}
                <CommandItem onSelect={() => { void handleStatusChange(contextMenu.task, "Cancelada"); setContextMenu(null); }} disabled={!canChangeTaskStatus(contextMenu.task)} className="data-[selected=true]:bg-muted">
                  <Archive className="h-4 w-4" />
                  Archivar
                </CommandItem>
              </CommandGroup>
              {!isProjectScoped && canManageTask(contextMenu.task) && (
                <>
                  <CommandSeparator className="bg-disabled" />
                  <CommandGroup heading="Mover a">
                    {contextMenu.task.proyecto && (
                      <CommandItem
                        onSelect={() => {
                          void handleInlineUpdate(contextMenu.task, { proyecto: null });
                          setContextMenu(null);
                        }}
                        className="data-[selected=true]:bg-muted"
                      >
                        <MoveRight className="h-4 w-4" />
                        General
                      </CommandItem>
                    )}
                    {proyectos.filter((project) => project._id !== contextMenu.task.proyecto).slice(0, 6).map((project) => (
                      <CommandItem
                        key={project._id}
                        onSelect={() => {
                          void handleInlineUpdate(contextMenu.task, { proyecto: project._id });
                          setContextMenu(null);
                        }}
                        className="data-[selected=true]:bg-muted"
                      >
                        <MoveRight className="h-4 w-4" />
                        {project.nombre}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {canManageTask(contextMenu.task) && (
                <>
                  <CommandSeparator className="bg-disabled" />
                  <CommandGroup>
                    <CommandItem onSelect={() => { setTaskToDelete(contextMenu.task); setContextMenu(null); }} className="text-red-600 data-[selected=true]:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}

      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l border-border bg-card p-0 text-foreground sm:max-w-xl">
          <SheetHeader className="border-b border-border p-6 text-left">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-left text-2xl font-normal text-foreground">Notificaciones</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markNotificationsAsRead(proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : {})}
                className="text-subtle-foreground hover:bg-muted hover:text-foreground"
              >
                Marcar leídas
              </Button>
            </div>
            <SheetDescription className="text-left text-muted-foreground">
              {isProjectScoped
                ? "Actividad reciente de tareas en este proyecto."
                : "Actividad reciente de tareas en todos tus proyectos."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 p-6">
            <Tabs value={notificationTab} onValueChange={(value) => setNotificationTab(value as typeof notificationTab)}>
              <TabsList className="grid w-full grid-cols-4 bg-muted rounded-none">
                <TabsTrigger className="rounded-none" value="all">Todas</TabsTrigger>
                <TabsTrigger className="rounded-none" value="comments">Comentarios</TabsTrigger>
                <TabsTrigger className="rounded-none" value="mentions">Menciones</TabsTrigger>
                <TabsTrigger className="rounded-none" value="assignments">Asignaciones</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
                <Input
                  value={notificationSearch}
                  onChange={(event) => setNotificationSearch(event.target.value)}
                  placeholder="Busca notificaciones por personas o tareas"
                  className="border-border bg-card pl-9 text-foreground placeholder:text-disabled-foreground"
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyUnreadNotifications((current) => !current)}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span
                  className={cn(
                    "flex h-5 w-9 items-center rounded-full border border-border-strong p-0.5 transition",
                    onlyUnreadNotifications ? "bg-blue-600" : "bg-disabled"
                  )}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full bg-card shadow-sm transition",
                      onlyUnreadNotifications && "translate-x-4"
                    )}
                  />
                </span>
                Solo no leídas
              </button>
            </div>

            <div className="rounded-none border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-blue-50 text-blue-600">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Seguimiento de tareas activo</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Recibe avisos cuando te asignen, mencionen o actualicen tareas.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Ultimos movimientos</h3>
                {unreadNotificationCount > 0 && (
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    {unreadNotificationCount} sin leer
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {!taskNotifications ? (
                  <div className="flex h-24 items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredNotifications.length ? (
                  filteredNotifications.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => void handleOpenNotification(item)}
                      className={cn(
                        "flex w-full gap-3 rounded-none border p-3 text-left transition hover:bg-background",
                        item.is_unread
                          ? "border-blue-200 bg-blue-50"
                          : "border-border bg-card"
                      )}
                    >
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {item.notification_type === "assignment" ? (
                          <ListChecks className="h-4 w-4" />
                        ) : item.notification_type === "mention" || item.notification_type === "comment" ? (
                          <MessageSquare className="h-4 w-4" />
                        ) : (
                          <Clock3 className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm leading-5 break-words text-foreground">
                            <span className="font-medium text-foreground">{item.changed_by_name}</span>{" "}
                            {notificationLabel(item).toLowerCase()}{" "}
                            <span className="font-medium text-foreground">"{item.task.titulo}"</span>
                          </p>
                          <span className="shrink-0 text-xs text-disabled-foreground">{relativeTime(item.created_at)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle-foreground">
                          {!isProjectScoped && item.proyecto_nombre && <span>{item.proyecto_nombre}</span>}
                          <span>{item.task.status}</span>
                          <span>Prioridad {priorityDisplayName(item.task.prioridad)}</span>
                          {item.task.fecha_limite && <span>Límite {formatDate(item.task.fecha_limite)}</span>}
                        </div>
                      </div>
                      {item.is_unread && <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
                    </button>
                  ))
                ) : (
                  <div className="rounded-none border border-dashed border-border p-8 text-center text-sm text-subtle-foreground">
                    No hay notificaciones con los filtros actuales.
                  </div>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selectedTaskId)} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          {selectedTask ? (
            <>
              <SheetHeader className="border-b border-border p-6 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("border", priorityClass(selectedTask.prioridad))}>
                    {priorityDisplayName(selectedTask.prioridad)}
                  </Badge>
                  <Badge variant="outline" className={cn("border", statusClass(selectedTask.status))}>
                    {selectedTask.status}
                  </Badge>
                  {isOverdue(selectedTask) && (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      Vencida
                    </Badge>
                  )}
                </div>
                <SheetTitle className="text-left text-2xl font-normal break-words">{selectedTask.titulo}</SheetTitle>
                <SheetDescription className="text-left">
                  {!isProjectScoped && `${selectedTask.proyecto_nombre || "Sin proyecto"} · `}
                  {selectedTask.categoria || "General"} · Creada por {selectedTask.created_by_name} · {formatDateTime(selectedTask.created_at)}
                </SheetDescription>
                <div className="flex flex-wrap gap-2 pt-2">
                  {canManageTask(selectedTask) && (
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(selectedTask)} className="gap-2">
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  )}
                  {canManageTask(selectedTask) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTaskToDelete(selectedTask)}
                      className="gap-2 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </Button>
                  )}
                </div>
              </SheetHeader>

              <div className="space-y-6 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="border border-border p-3">
                    <p className="text-xs text-subtle-foreground">Fecha límite</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatDate(selectedTask.fecha_limite)}</p>
                  </div>
                  <div className="border border-border p-3">
                    <p className="text-xs text-subtle-foreground">Última actualización</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatDateTime(selectedTask.updated_at || selectedTask.created_at)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Descripción</h3>
                  <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
                    {selectedTask.descripcion || "Sin descripción."}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground">Asignados</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTask.assigned_users?.length ? selectedTask.assigned_users.map((user) => (
                      <span
                        key={user._id}
                        className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground"
                        title={user.email}
                      >
                        {user.name || user.email}
                      </span>
                    )) : <span className="text-sm text-disabled-foreground">Sin asignar</span>}
                  </div>
                </div>

                <Tabs defaultValue="comments">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="comments" className="gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comentarios
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2">
                      <History className="h-4 w-4" />
                      Historial
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="mt-4 space-y-4">
                    {canComment && (
                      <div className="space-y-2">
                        <Textarea
                          value={commentText}
                          onChange={(event) => setCommentText(event.target.value)}
                          placeholder="Agregar comentario"
                          rows={3}
                        />
                        <div className="flex justify-end">
                          <Button onClick={handleAddComment} disabled={commentSubmitting || !commentText.trim()} className="gap-2">
                            {commentSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Enviar
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {taskDetail?.comments?.length ? taskDetail.comments.map((comment) => {
                        const canDeleteComment = currentUser?.role === "admin" || currentUser?._id === comment.user_id;
                        return (
                          <div key={comment._id} className="border border-border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{comment.user_name}</p>
                                <p className="mt-0.5 text-xs text-subtle-foreground">{formatDateTime(comment.created_at)}</p>
                              </div>
                              {canDeleteComment && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveComment(comment._id)}
                                  className="h-8 w-8 text-disabled-foreground hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-foreground">{comment.comment}</p>
                          </div>
                        );
                      }) : (
                        <div className="border border-dashed border-border p-6 text-center text-sm text-subtle-foreground">
                          Aún no hay comentarios en esta tarea.
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <div className="space-y-3">
                      {taskDetail?.history?.length ? taskDetail.history.map((item) => (
                        <div key={item._id} className="flex gap-3 border-b border-border pb-3 last:border-b-0">
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-subtle-foreground">
                            <Clock3 className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm break-words text-foreground">{historyLabel(item)}</p>
                            <p className="mt-1 text-xs text-subtle-foreground">
                              {item.changed_by_name} · {formatDateTime(item.created_at)}
                            </p>
                          </div>
                        </div>
                      )) : (
                        <div className="border border-dashed border-border p-6 text-center text-sm text-subtle-foreground">
                          Aún no hay historial registrado.
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-disabled-foreground" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={filtersDialogOpen} onOpenChange={setFiltersDialogOpen}>
        <DialogContent className="max-w-3xl w-[90vw]">
          <DialogHeader>
            <DialogTitle>Más filtros</DialogTitle>
            <DialogDescription className="sr-only">
              Ajusta los filtros adicionales de tareas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las prioridades</SelectItem>
                  {effectivePriorityLabels.map((priority) => (
                    <SelectItem key={priority.id} value={priority.label}>
                      {priority.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Especialidad</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Especialidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las especialidades</SelectItem>
                  {categoryFilterOptions.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vista</Label>
              <Select value={ownershipFilter} onValueChange={(value) => setOwnershipFilter(value as typeof ownershipFilter)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Vista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las tareas</SelectItem>
                  <SelectItem value="mine">Mis tareas</SelectItem>
                  <SelectItem value="created">Creadas por mí</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Partida</Label>
              <Select value={partidaFilter} onValueChange={setPartidaFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Partida" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las partidas</SelectItem>
                  {partidaFilterOptions.map((partida) => (
                    <SelectItem key={partida._id} value={partida._id}>
                      {partidaDisplayName(partida)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isProjectScoped && (
              <div className="space-y-2 md:col-span-2">
                <Label>Proyecto</Label>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  <SelectItem value={GENERAL_SCOPE}>General</SelectItem>
                    {proyectos.map((project) => (
                      <SelectItem key={project._id} value={project._id}>
                        {project.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPriorityFilter("all");
                setCategoryFilter("all");
                setOwnershipFilter("all");
                setPartidaFilter("all");
                if (!isProjectScoped) setProjectFilter("all");
              }}
              className="rounded-none"
            >
              Limpiar filtros
            </Button>
            <Button type="button" onClick={() => setFiltersDialogOpen(false)} className="rounded-none">
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto text-disabled-foreground [&_label]:font-normal [&_label]:text-muted-foreground">
          <DialogHeader>
            <DialogTitle className="font-normal text-muted-foreground">{editingTask ? `Editar ${form.tipo}` : `Nueva ${form.tipo}`}</DialogTitle>
            <DialogDescription className="font-normal text-disabled-foreground">
              Define el alcance, responsables y fechas para dar seguimiento desde la vista global.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            {!editingTask && (
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value: "tarea" | "minuta") => setForm((current) => ({
                    ...current,
                    tipo: value,
                    titulo: value === "minuta" && !current.titulo.trim() ? suggestedMinuteTitle() : current.titulo,
                  }))}
                >
                  <SelectTrigger className="font-normal text-disabled-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tarea">Tarea independiente</SelectItem>
                    <SelectItem value="minuta">Minuta de obra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Alcance</Label>
              <Select
                value={selectedFormProjectId || GENERAL_SCOPE}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    proyecto: value === GENERAL_SCOPE ? "" : value,
                    organization_id: value === GENERAL_SCOPE
                      ? current.organization_id || currentUser?.organization_id || organizationScopes?.[0]?.id || ""
                      : proyectos?.find((project) => project._id === value)?.organization_id || "",
                    asignados: new Set(),
                    partidas: new Set(),
                  }))
                }
              >
                <SelectTrigger className="font-normal text-disabled-foreground">
                  <SelectValue placeholder="Selecciona el proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GENERAL_SCOPE}>General</SelectItem>
                  {proyectos.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-title">Titulo</Label>
              <Input
                id="task-title"
                value={form.titulo}
                onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))}
                placeholder="Ej. Revisar estimacion de instalaciones"
                className="font-normal text-disabled-foreground placeholder:text-disabled-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Descripción</Label>
              <Textarea
                id="task-description"
                value={form.descripcion}
                onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))}
                placeholder="Notas, contexto o resultado esperado"
                rows={4}
                className="font-normal text-disabled-foreground placeholder:text-disabled-foreground"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select
                  value={form.prioridad}
                  onValueChange={(value) => setForm((current) => ({ ...current, prioridad: value }))}
                >
                  <SelectTrigger className="font-normal text-disabled-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {effectivePriorityLabels.map((priority) => (
                      <SelectItem key={priority.id} value={priority.label}>
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Especialidad</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(value) => setForm((current) => ({ ...current, categoria: value }))}
                >
                  <SelectTrigger className="font-normal text-disabled-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-date">Fecha límite</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={form.fecha_limite}
                  onChange={(event) => setForm((current) => ({ ...current, fecha_limite: event.target.value }))}
                  className="font-normal text-disabled-foreground"
                />
              </div>
            </div>

            {editingTask && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
                >
                  <SelectTrigger className="font-normal text-disabled-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {effectiveStatusLabels.map((status) => (
                      <SelectItem key={status.id} value={status.label}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 min-w-0">
              <Label>Responsables (opcional)</Label>
              <div className="max-h-52 overflow-y-auto overflow-x-hidden border border-border p-3">
                {!selectedFormProjectId && !selectedFormOrganizationId && (
                  <div className="py-4 text-center text-sm text-disabled-foreground">
                    No se encontraron usuarios disponibles para el alcance General.
                  </div>
                )}
                {(selectedFormProjectId || selectedFormOrganizationId) && !assignableUsers && (
                  <div className="flex h-20 items-center justify-center text-disabled-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {(assignableUsers || []).map((user) => (
                  <label
                    key={user._id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border py-2 last:border-b-0"
                  >
                    <Checkbox
                      checked={form.asignados.has(user._id)}
                      onCheckedChange={() => toggleAssignee(user._id)}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-normal text-muted-foreground">{user.name || user.email}</span>
                      <span className="truncate text-xs text-disabled-foreground">{user.email}</span>
                    </span>
                    <span className="ml-auto text-xs text-disabled-foreground">{user.role}</span>
                  </label>
                ))}
              </div>
            </div>

            {selectedFormProjectId && <div className="space-y-2 min-w-0">
              <Label>Partidas</Label>
              <div className="max-h-52 overflow-y-auto overflow-x-hidden border border-border p-3">
                {!selectedFormProjectId && (
                  <div className="py-4 text-center text-sm text-disabled-foreground">
                    Selecciona un proyecto para ver partidas disponibles.
                  </div>
                )}
                {selectedFormProjectId && !formPartidas && (
                  <div className="flex h-20 items-center justify-center text-disabled-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {(formPartidas || []).filter((partida) => partida.nivel === 1).map((partida) => (
                  <label
                    key={partida._id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border py-2 last:border-b-0"
                  >
                    <Checkbox
                      checked={form.partidas.has(partida._id)}
                      onCheckedChange={() => togglePartida(partida._id)}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-normal text-muted-foreground">{partidaDisplayName(partida)}</span>
                      <span className="truncate text-xs text-disabled-foreground">{partidaContext(partida)}</span>
                    </span>
                    <span className="ml-auto text-xs text-disabled-foreground">N{partida.nivel}</span>
                  </label>
                ))}
              </div>
            </div>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(taskToDelete)} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{taskToDelete?.parent_task ? "Eliminar subtarea" : "Eliminar tarea"}</AlertDialogTitle>
            <AlertDialogDescription>
              {taskToDelete?.parent_task
                ? "Esta acción eliminará esta subtarea, sus comentarios e historial. No se puede deshacer."
                : "Esta acción eliminará la tarea, sus subtareas, comentarios e historial. No se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600  hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function TareasPage() {
  return <TareasBoard />;
}
