import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import {
  Bell,
  Archive,
  CheckCircle2,
  ChevronDown,
  Copy,
  CircleAlert,
  Clock3,
  ExternalLink,
  Eye,
  GripVertical,
  History,
  ListChecks,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_OPTIONS = ["General", "Obra", "Finanzas", "Documentos", "Requisicion", "Bitacora"];
const TASK_UI_COLORS = {
  pending: "#ADADAD",
  blue: "#76AFD9",
  green: "#50AC66",
  itemBg: "#FBFBFB",
  itemBorder: "#E6E6E6",
};
const TASK_TABLE_GRID = "grid-cols-[minmax(360px,1.6fr)_minmax(220px,1fr)_180px_160px_160px_minmax(220px,1fr)_48px]";
const TASK_VALUE_TEXT = "text-[#A3A39E]";
const TASK_COLUMN_TEXT = "text-[#A5A5A0]";

type UserSummary = {
  _id: Id<"users">;
  name: string;
  email: string;
  role: string;
};

type Task = {
  _id: Id<"tareas">;
  proyecto: Id<"desarrollos">;
  parent_task?: Id<"tareas">;
  position?: number;
  proyecto_nombre?: string;
  titulo: string;
  descripcion?: string;
  asignados: Id<"users">[];
  partidas?: Id<"partidas">[];
  status: string;
  prioridad: string;
  fecha_limite?: string;
  categoria?: string;
  created_by_id: Id<"users">;
  created_by_name: string;
  created_at: number;
  updated_at?: number;
  completed_at?: number;
  assigned_users?: UserSummary[];
  assigned_partidas?: PartidaSummary[];
};

type PartidaSummary = {
  _id: Id<"partidas">;
  nombre: string;
  familia?: string;
  sub_partida?: string;
  partida_nombre?: string;
  nivel: number;
};

type TaskComment = {
  _id: Id<"tarea_comments">;
  user_id: Id<"users">;
  user_name: string;
  comment: string;
  created_at: number;
};

type TaskHistory = {
  _id: Id<"tarea_history">;
  action: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  changed_by_name: string;
  created_at: number;
};

type TaskNotification = TaskHistory & {
  proyecto_nombre?: string;
  is_unread: boolean;
  notification_type: "assignment" | "mention" | "update";
  task: {
    _id: Id<"tareas">;
    titulo: string;
    status: string;
    prioridad: string;
    fecha_limite?: string;
    asignados: Id<"users">[];
    created_by_id: Id<"users">;
    created_by_name: string;
  };
};

type ProjectOption = {
  _id: Id<"desarrollos">;
  nombre: string;
};

type TaskLabelOption = {
  id: string;
  label: string;
  color: string;
};

type TaskGroup = {
  projectId: string;
  projectName: string;
  tasks: Task[];
};

type TaskContextMenu = {
  task: Task;
  x: number;
  y: number;
} | null;

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
  "#777777",
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
  { id: "Alta", label: "Alta", color: TASK_UI_COLORS.blue },
  { id: "Media", label: "Media", color: TASK_UI_COLORS.green },
  { id: "Baja", label: "Baja", color: TASK_UI_COLORS.pending },
];

function emptyForm() {
  return {
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

function parseDateString(date?: string) {
  if (!date) return undefined;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function priorityClass(priority: string) {
  switch (priority) {
    case "Urgente":
      return "bg-red-50 text-red-700 border-red-200";
    case "Alta":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "Baja":
      return "bg-gray-50 text-gray-600 border-gray-200";
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
  if (item.action === "created") return "Creo la tarea";
  if (item.action === "comment_added") return "Agrego un comentario";
  if (item.action === "status_changed") {
    return `Cambio el estado de ${formatHistoryValue(item.old_value)} a ${formatHistoryValue(item.new_value)}`;
  }
  if (item.field_changed === "asignados") return "Actualizo los asignados";
  if (item.field_changed === "partidas") return "Actualizo las partidas";
  if (item.field_changed) return `Actualizo ${item.field_changed.replace("_", " ")}`;
  return "Actualizo la tarea";
}

function notificationLabel(item: TaskNotification) {
  if (item.notification_type === "mention") {
    return "Te menciono en un comentario";
  }
  if (item.notification_type === "assignment") {
    return item.action === "created" ? "Te asigno una nueva tarea" : "Actualizo los asignados";
  }
  if (item.action === "created") return "Creo una tarea";
  if (item.action === "comment_added") return "Agrego un comentario";
  if (item.action === "status_changed") {
    return `Cambio el estado a ${formatHistoryValue(item.new_value)}`;
  }
  if (item.field_changed) return `Actualizo ${item.field_changed.replace("_", " ")}`;
  return "Actualizo una tarea";
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
  return `${value} dia${value === 1 ? "" : "s"}`;
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

function InlineDatePicker({
  value,
  disabled,
  overdue,
  onChange,
}: {
  value?: string;
  disabled: boolean;
  overdue: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateString(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-6 w-44 justify-start rounded-none border-0 bg-transparent px-0 text-left text-sm font-normal shadow-none hover:bg-transparent",
            overdue ? "font-medium text-red-600" : TASK_VALUE_TEXT
          )}
        >
          {formatDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-gray-200 bg-white p-0 text-gray-900 shadow-xl">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateInputValue(date));
            setOpen(false);
          }}
          buttonVariant="ghost"
        />
        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
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
          className="h-6 w-36 justify-start gap-2 rounded-none border-0 bg-transparent px-0 text-sm font-normal text-[#A3A39E] shadow-none hover:bg-transparent hover:text-[#898982]"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: activeLabel.color }} />
          <span className="truncate">{activeLabel.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={6} className="w-72 overflow-visible border-gray-200 bg-white p-0 text-gray-900 shadow-xl">
        <div className="mx-auto -mt-2 h-4 w-4 rotate-45 border-l border-t border-gray-200 bg-white" />
        <div className="space-y-2 p-4 pt-2">
          {(editing ? draftLabels : labels).map((label) => (
            <div key={label.id} className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => editing ? setColorTargetId(colorTargetId === label.id ? null : label.id) : onSelect(label.label)}
                className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-sm px-3 text-sm font-medium text-white hover:brightness-95"
                style={{ backgroundColor: label.color }}
              >
                {editing ? (
                  <Input
                    value={label.label}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => updateDraftLabel(label.id, { label: event.target.value })}
                    className="h-7 border-white/30 bg-white/10 text-center text-white placeholder:text-white/70 focus-visible:ring-0"
                  />
                ) : (
                  <span className="truncate">{label.label}</span>
                )}
              </button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDraftLabels((current) => current.filter((item) => item.id !== label.id))}
                  className="h-8 w-8 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {editing && colorTargetId === label.id && (
                <div className="absolute left-4 top-full z-50 mt-2 grid w-40 grid-cols-4 gap-2 rounded-md border border-gray-200 bg-white p-3 shadow-xl">
                  {LABEL_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        updateDraftLabel(label.id, { color });
                        setColorTargetId(null);
                      }}
                      className="h-6 w-6 rounded-md border border-white shadow-sm"
                      style={{ backgroundColor: color }}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {editing && (
            <Button type="button" variant="outline" onClick={addDraftLabel} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Etiqueta nueva
            </Button>
          )}
        </div>
        <div className="border-t border-gray-100 p-3">
          {editing ? (
            <Button type="button" variant="ghost" onClick={applyLabels} className="w-full">
              Aplicar
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setEditing(true)} className="w-full gap-2 text-gray-600">
              <Pencil className="h-4 w-4" />
              Editar etiquetas
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlineAssigneePicker({
  task,
  disabled,
  onChange,
}: {
  task: Task;
  disabled: boolean;
  onChange: (assignees: Id<"users">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const assignableUsers = useQuery(api.tareas.getAssignableUsers, { proyecto: task.proyecto }) as UserSummary[] | undefined;
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
            "flex h-6 w-full min-w-44 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-left hover:bg-transparent",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {assignedUsers.length ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#DDDCD8] bg-[#DDDCD8] text-xs font-medium text-[#898982]">
                {userInitials(assignedUsers[0])}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-4 text-[#A3A39E]">
                {assignedUsers.map((user) => user.name || user.email).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0E0E0] text-xs font-medium text-[#898982]">
                -
              </span>
              <span className="text-sm text-[#A3A39E]">Sin asignar</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-gray-200 bg-white p-0 text-gray-900 shadow-xl">
        <div className="border-b border-gray-100 p-3">
          <div className="flex flex-wrap gap-1.5">
            {assignedUsers.length ? assignedUsers.map((user) => (
              <button
                key={user._id}
                type="button"
                onClick={() => toggleUser(user._id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-gray-100 px-2 text-xs text-gray-700 hover:bg-gray-200"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] font-medium text-gray-500">
                  {userInitials(user)}
                </span>
                <span className="max-w-36 truncate">{user.name || user.email}</span>
                <X className="h-3 w-3" />
              </button>
            )) : (
              <span className="text-sm text-gray-400">Selecciona responsables</span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nombres, roles o equipos"
              className="h-9 pl-9 pr-9"
            />
            <CircleAlert className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-gray-500">Personas sugeridas</p>
          {!assignableUsers && (
            <div className="flex h-24 items-center justify-center text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {assignableUsers && filteredUsers.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-gray-500">
              No hay usuarios con esa busqueda.
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
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-100",
                  selected && "bg-gray-100"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-medium text-gray-500">
                  {userInitials(user)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-800">{user.name || user.email}</span>
                  <span className="block truncate text-xs text-gray-500">{user.role}</span>
                </span>
                {selected && <CheckCircle2 className="h-4 w-4 text-gray-600" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Bell className="h-4 w-4" />
          Se notificara a los responsables
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlinePartidaPicker({
  task,
  disabled,
  onChange,
}: {
  task: Task;
  disabled: boolean;
  onChange: (partidas: Id<"partidas">[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const projectPartidas = useQuery(api.partida.getByProject, { projectId: task.proyecto }) as PartidaSummary[] | undefined;
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
      if (!term) return true;
      return (
        partida.nombre.toLowerCase().includes(term) ||
        partida.familia?.toLowerCase().includes(term) ||
        partida.sub_partida?.toLowerCase().includes(term) ||
        partida.partida_nombre?.toLowerCase().includes(term)
      );
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
            "flex h-6 w-full min-w-44 items-center gap-2 rounded-none border-0 bg-transparent px-0 text-left hover:bg-transparent",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {selectedPartidas.length ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#DDDCD8] bg-[#F5F5F5] text-xs font-medium text-[#898982]">
                {selectedPartidas.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-4 text-[#A3A39E]">
                {selectedPartidas.map(partidaDisplayName).join(", ")}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0E0E0] text-xs font-medium text-[#898982]">
                -
              </span>
              <span className="text-sm text-[#A3A39E]">Sin partidas</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-gray-200 bg-white p-0 text-gray-900 shadow-xl">
        <div className="border-b border-gray-100 p-3">
          <div className="flex flex-wrap gap-1.5">
            {selectedPartidas.length ? selectedPartidas.map((partida) => (
              <button
                key={partida._id}
                type="button"
                onClick={() => togglePartida(partida._id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-gray-100 px-2 text-xs text-gray-700 hover:bg-gray-200"
              >
                <span className="max-w-44 truncate">{partidaDisplayName(partida)}</span>
                <X className="h-3 w-3" />
              </button>
            )) : (
              <span className="text-sm text-gray-400">Selecciona partidas</span>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar partidas, familias o subpartidas"
              className="h-9 pl-9 pr-9"
            />
            <CircleAlert className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          <p className="px-2 pb-1 text-xs font-medium text-gray-500">Partidas del proyecto</p>
          {!projectPartidas && (
            <div className="flex h-24 items-center justify-center text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {projectPartidas && filteredPartidas.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-gray-500">
              No hay partidas con esa busqueda.
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
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-100",
                  selected && "bg-gray-100"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-medium text-gray-500">
                  {partida.nivel}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-800">{partidaDisplayName(partida)}</span>
                  <span className="block truncate text-xs text-gray-500">{partidaContext(partida)}</span>
                </span>
                {selected && <CheckCircle2 className="h-4 w-4 text-gray-600" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <ListChecks className="h-4 w-4" />
          Se relacionara con la tarea
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TareasBoard({ proyectoId }: { proyectoId?: string }) {
  const isProjectScoped = Boolean(proyectoId);
  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const proyectos = useQuery(api.desarrollos.getAll) as ProjectOption[] | undefined;
  const projectTasks = useQuery(
    api.tareas.getByProyecto,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
  ) as Task[] | undefined;
  const globalTasks = useQuery(
    api.tareas.getAllAccessible,
    proyectoId ? "skip" : {}
  ) as Task[] | undefined;
  const tareas = isProjectScoped ? projectTasks : globalTasks;
  const [search, setSearch] = useState("");
  const [taskTab, setTaskTab] = useState<"all" | "open" | "overdue" | "done">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tareas"> | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const selectedFormProjectId = proyectoId || form.proyecto;
  const assignableUsers = useQuery(
    api.tareas.getAssignableUsers,
    selectedFormProjectId ? { proyecto: selectedFormProjectId as Id<"desarrollos"> } : "skip"
  );
  const formPartidas = useQuery(
    api.partida.getByProject,
    selectedFormProjectId ? { projectId: selectedFormProjectId as Id<"desarrollos"> } : "skip"
  ) as PartidaSummary[] | undefined;
  const projectNotifications = useQuery(
    api.tareas.getNotifications,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos">, limit: 60 } : "skip"
  ) as TaskNotification[] | undefined;
  const globalNotifications = useQuery(
    api.tareas.getAllNotifications,
    proyectoId ? "skip" : { limit: 60 }
  ) as TaskNotification[] | undefined;
  const taskNotifications = isProjectScoped ? projectNotifications : globalNotifications;
  const projectNotificationSummary = useQuery(
    api.tareas.getUnreadSummary,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const globalNotificationSummary = useQuery(
    api.tareas.getAllUnreadSummary,
    proyectoId ? "skip" : {}
  );
  const taskNotificationSummary = isProjectScoped ? projectNotificationSummary : globalNotificationSummary;
  const currentUser = useQuery(api.users.getCurrentUser);

  const createTask = useMutation(api.tareas.create);
  const updateTask = useMutation(api.tareas.update);
  const updateStatus = useMutation(api.tareas.updateStatus);
  const removeTask = useMutation(api.tareas.remove);
  const addComment = useMutation(api.tareas.addComment);
  const removeComment = useMutation(api.tareas.removeComment);
  const markNotificationsAsRead = useMutation(api.tareas.markNotificationsAsRead);
  const duplicateTask = useMutation(api.tareas.duplicate);
  const reorderTasks = useMutation(api.tareas.reorderSiblings);

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<"all" | "mentions" | "assignments">("all");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [onlyUnreadNotifications, setOnlyUnreadNotifications] = useState(false);
  const [contextMenu, setContextMenu] = useState<TaskContextMenu>(null);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<Id<"tareas"> | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [addingTaskInSection, setAddingTaskInSection] = useState<{projectId: string; statusLabel: string} | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [collapsedStatusSections, setCollapsedStatusSections] = useState<Set<string>>(new Set());
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [draggingTaskId, setDraggingTaskId] = useState<Id<"tareas"> | null>(null);
  const [statusLabels, setStatusLabels] = useState<TaskLabelOption[]>(() =>
    normalizeStoredLabels(window.localStorage.getItem("tareas.statusLabels"), DEFAULT_STATUS_LABELS)
  );
  const [priorityLabels, setPriorityLabels] = useState<TaskLabelOption[]>(() =>
    normalizeStoredLabels(window.localStorage.getItem("tareas.priorityLabels"), DEFAULT_PRIORITY_LABELS)
  );

  const taskDetail = useQuery(
    api.tareas.getDetail,
    selectedTaskId ? { id: selectedTaskId } : "skip"
  ) as { task: Task; comments: TaskComment[]; history: TaskHistory[] } | undefined;

  const selectedTask = taskDetail?.task || tareas?.find((task) => task._id === selectedTaskId);
  const canCreate = currentUser?.role && currentUser.role !== "viewer";
  const canComment = canCreate && selectedTask;
  const unreadNotificationCount = taskNotificationSummary?.total || 0;
  const assigneeFilterOptions = useMemo(() => {
    const users = new Map<string, UserSummary>();
    for (const task of tareas || []) {
      for (const user of task.assigned_users || []) {
        users.set(user._id, user);
      }
    }
    return Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tareas]);

  useEffect(() => {
    if (!notificationsOpen) return;

    void markNotificationsAsRead(
      proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : {}
    );
  }, [markNotificationsAsRead, notificationsOpen, proyectoId]);

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

  const stats = useMemo(() => {
    const list = tareas || [];
    return {
      total: list.length,
      pending: list.filter((task) => task.status !== "Completada" && task.status !== "Cancelada").length,
      overdue: list.filter(isOverdue).length,
      done: list.filter((task) => task.status === "Completada").length,
    };
  }, [tareas]);

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
      const matchesAssignee = assigneeFilter === "all" || task.asignados.includes(assigneeFilter as Id<"users">);
      const matchesProject = projectFilter === "all" || task.proyecto === projectFilter;
      return matchesSearch && matchesTab && matchesStatus && matchesAssignee && matchesProject;
    });
  }, [assigneeFilter, projectFilter, search, statusFilter, taskTab, tareas]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      if (!task.parent_task) continue;
      const children = map.get(task.parent_task) || [];
      children.push(task);
      map.set(task.parent_task, children);
    }
    return map;
  }, [filteredTasks]);

  const groupedTasks = useMemo<TaskGroup[]>(() => {
    const projectNames = new Map<string, string>();
    for (const project of proyectos || []) {
      projectNames.set(project._id, project.nombre);
    }
    const filteredIds = new Set(filteredTasks.map((task) => task._id));

    const groups = new Map<string, TaskGroup>();
    for (const task of filteredTasks) {
      if (task.parent_task && filteredIds.has(task.parent_task)) continue;
      const projectId = task.proyecto;
      const group = groups.get(projectId) || {
        projectId,
        projectName: task.proyecto_nombre || projectNames.get(projectId) || "Sin proyecto",
        tasks: [],
      };
      group.tasks.push(task);
      groups.set(projectId, group);
    }

    return Array.from(groups.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [filteredTasks, proyectos]);

  const filteredNotifications = useMemo(() => {
    const term = notificationSearch.trim().toLowerCase();
    return (taskNotifications || []).filter((item) => {
      const matchesTab =
        notificationTab === "all" ||
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
    setForm({
      ...emptyForm(),
      proyecto: proyectoId || "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setForm({
      proyecto: task.proyecto,
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
    const targetProjectId = proyectoId || form.proyecto;
    if (!targetProjectId) {
      toast.error("Selecciona un proyecto para la tarea");
      return;
    }
    if (!form.titulo.trim()) {
      toast.error("Agrega un titulo para la tarea");
      return;
    }
    if (form.asignados.size === 0) {
      toast.error("Asigna al menos un usuario");
      return;
    }

    setSubmitting(true);
    const payload = {
      titulo: form.titulo,
      descripcion: form.descripcion || undefined,
      asignados: Array.from(form.asignados) as Id<"users">[],
      partidas: Array.from(form.partidas) as Id<"partidas">[],
      prioridad: form.prioridad,
      fecha_limite: form.fecha_limite || undefined,
      categoria: form.categoria,
    };

    try {
      if (editingTask) {
        await updateTask({
          id: editingTask._id,
          proyecto: targetProjectId as Id<"desarrollos">,
          ...payload,
          status: form.status,
          parent_task: editingTask.parent_task,
        });
        toast.success("Tarea actualizada");
      } else {
        const taskId = await createTask({
          proyecto: targetProjectId as Id<"desarrollos">,
          ...payload,
        });
        setSelectedTaskId(taskId);
        toast.success("Tarea creada");
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error("No se pudo guardar la tarea");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (task: Task, status: string) => {
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
    changes: Partial<Pick<Task, "titulo" | "fecha_limite" | "prioridad" | "status" | "categoria" | "proyecto" | "asignados" | "partidas">>
  ) => {
    if (currentUser?.role === "viewer") return;

    const nextTitle = changes.titulo ?? task.titulo;
    if (!nextTitle.trim()) {
      toast.error("El titulo no puede quedar vacio");
      return;
    }

    setInlineSavingId(task._id);
    try {
      await updateTask({
        id: task._id,
        proyecto: changes.proyecto ?? task.proyecto,
        titulo: nextTitle,
        descripcion: task.descripcion || undefined,
        asignados: changes.asignados ?? task.asignados,
        partidas: changes.partidas ?? task.partidas ?? [],
        status: changes.status ?? task.status,
        prioridad: changes.prioridad ?? task.prioridad,
        fecha_limite: changes.fecha_limite || undefined,
        categoria: changes.categoria ?? task.categoria ?? "General",
        parent_task: changes.proyecto && changes.proyecto !== task.proyecto ? undefined : task.parent_task,
      });
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("No se pudo actualizar la tarea");
    } finally {
      setInlineSavingId(null);
    }
  };

  const handleCreateSubtask = async (parent: Task) => {
    if (!subtaskTitle.trim()) return;

    setSubmitting(true);
    try {
      const taskId = await createTask({
        proyecto: parent.proyecto,
        parent_task: parent._id,
        titulo: subtaskTitle,
        descripcion: undefined,
        asignados: parent.asignados,
        partidas: parent.partidas || [],
        prioridad: parent.prioridad,
        fecha_limite: undefined,
        categoria: parent.categoria || "General",
      });
      setSubtaskTitle("");
      setAddingSubtaskFor(null);
      setSelectedTaskId(taskId);
      toast.success("Subtarea creada");
    } catch (error) {
      console.error("Error creating subtask:", error);
      toast.error("No se pudo crear la subtarea");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInlineTask = async (projectId: Id<"desarrollos">, status: string) => {
    if (!newTaskTitle.trim()) return;

    setSubmitting(true);
    try {
      const taskId = await createTask({
        proyecto: projectId,
        parent_task: undefined,
        titulo: newTaskTitle,
        descripcion: undefined,
        asignados: [],
        partidas: [],
        prioridad: "Media",
        status,
        fecha_limite: undefined,
        categoria: "General",
      });
      setNewTaskTitle("");
      setAddingTaskInSection(null);
      setSelectedTaskId(taskId);
      toast.success("Tarea creada");
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("No se pudo crear la tarea");
    } finally {
      setSubmitting(false);
    }
  };

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
    const url = `${window.location.origin}/proyecto/${task.proyecto}/tareas?task=${task._id}`;
    await navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  };

  const openProjectTaskRoute = (task: Task) => {
    window.open(`/proyecto/${task.proyecto}/tareas?task=${task._id}`, "_blank", "noopener,noreferrer");
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

  const handleTaskDrop = async (targetTask: Task) => {
    if (!draggingTaskId || draggingTaskId === targetTask._id || currentUser?.role === "viewer") {
      setDraggingTaskId(null);
      return;
    }

    const draggedTask = filteredTasks.find((task) => task._id === draggingTaskId);
    if (
      !draggedTask ||
      draggedTask.proyecto !== targetTask.proyecto ||
      (draggedTask.parent_task || null) !== (targetTask.parent_task || null)
    ) {
      setDraggingTaskId(null);
      return;
    }

    const siblings = targetTask.parent_task
      ? (childrenByParent.get(targetTask.parent_task) || [])
      : (groupedTasks.find((group) => group.projectId === targetTask.proyecto)?.tasks || []);
    const orderedIds = siblings.map((task) => task._id);
    const from = orderedIds.indexOf(draggingTaskId);
    const to = orderedIds.indexOf(targetTask._id);

    if (from < 0 || to < 0) {
      setDraggingTaskId(null);
      return;
    }

    orderedIds.splice(from, 1);
    orderedIds.splice(to, 0, draggingTaskId);

    try {
      await reorderTasks({ orderedIds });
    } catch (error) {
      console.error("Error reordering tasks:", error);
      toast.error("No se pudo reordenar la tarea");
    } finally {
      setDraggingTaskId(null);
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

  const handleRemoveComment = async (commentId: Id<"tarea_comments">) => {
    try {
      await removeComment({ id: commentId });
      toast.success("Comentario eliminado");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("No se pudo eliminar el comentario");
    }
  };

  const getStatusSections = (tasks: Task[]) => {
    const statuses = new Map<string, Task[]>();
    for (const task of tasks) {
      const existing = statuses.get(task.status) || [];
      existing.push(task);
      statuses.set(task.status, existing);
    }

    const orderedLabels = [
      ...statusLabels,
      ...Array.from(statuses.keys())
        .filter((status) => !statusLabels.some((label) => label.label === status))
        .map((status) => labelForValue(status, statusLabels)),
    ];

    return orderedLabels
      .map((label) => ({
        label,
        tasks: statuses.get(label.label) || [],
      }))
      .filter((section) => section.tasks.length > 0);
  };

  const renderTaskContent = (task: Task, level = 0, parentHasSubtasks = false) => {
    const overdue = isOverdue(task);
    const isSaving = inlineSavingId === task._id || updatingStatusId === task._id;

    return (
      <div
        className={cn(
          "grid min-h-[44px] items-center gap-4 px-6 py-1.5 transition",
          TASK_TABLE_GRID
        )}
      >
        <div className="flex items-center gap-2" style={{ paddingLeft: level * 26 }}>
          <button
            type="button"
            draggable={currentUser?.role !== "viewer"}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", task._id);
              setDraggingTaskId(task._id);
            }}
            onDragEnd={() => setDraggingTaskId(null)}
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-[#A3A39E] opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            aria-label="Reordenar tarea"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex h-6 shrink-0 items-center gap-2">
            <Checkbox checked={task.status === "Completada"} onCheckedChange={(checked) => handleStatusChange(task, checked ? "Completada" : "Pendiente")} disabled={currentUser?.role === "viewer"} className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Input
                defaultValue={task.titulo}
                disabled={currentUser?.role === "viewer" || isSaving}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (value && value !== task.titulo) void handleInlineUpdate(task, { titulo: value });
                }}
                className={cn(
                  "h-6 border-transparent bg-transparent px-1 text-sm font-medium text-gray-900 shadow-none hover:border-[#E6E6E6] focus-visible:border-[#E6E6E6] focus-visible:ring-0",
                  level > 0 && "font-normal"
                )}
              />
              {overdue && <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />}
              {isSaving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" />}
            </div>
          </div>
        </div>
        <InlineAssigneePicker
          task={task}
          disabled={currentUser?.role === "viewer" || isSaving}
          onChange={(assignees) => handleInlineUpdate(task, { asignados: assignees })}
        />
        <InlineDatePicker
          value={task.fecha_limite}
          disabled={currentUser?.role === "viewer" || isSaving}
          overdue={overdue}
          onChange={(value) => handleInlineUpdate(task, { fecha_limite: value })}
        />
        <InlineLabelPicker
          value={task.prioridad}
          labels={priorityLabels}
          disabled={currentUser?.role === "viewer" || isSaving}
          onSelect={(value) => handleInlineUpdate(task, { prioridad: value })}
          onLabelsChange={setPriorityLabels}
        />
        <InlineLabelPicker
          value={task.status}
          labels={statusLabels}
          disabled={isSaving || currentUser?.role === "viewer"}
          onSelect={(value) => handleStatusChange(task, value)}
          onLabelsChange={setStatusLabels}
        />
        <InlinePartidaPicker
          task={task}
          disabled={currentUser?.role === "viewer" || isSaving}
          onChange={(partidas) => handleInlineUpdate(task, { partidas })}
        />
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); setContextMenu({ task, x: event.clientX, y: event.clientY }); }} className="h-6 w-6 text-[#A3A39E] hover:text-[#898982]">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const renderTaskRow = (task: Task, level = 0) => {
    const childTasks = childrenByParent.get(task._id) || [];
    const hasChildren = childTasks.length > 0;
    const isTaskCollapsed = collapsedTasks.has(task._id);

    if (level > 0) {
      return renderTaskContent(task, level, false);
    }

    return (
      <React.Fragment key={task._id}>
        <div
          key={task._id}
          onDragOver={(event) => {
            if (!draggingTaskId || draggingTaskId === task._id) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void handleTaskDrop(task);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ task, x: event.clientX, y: event.clientY });
          }}
          className={cn(
            "group bg-transparent px-8 py-1",
            draggingTaskId === task._id && "opacity-50",
            draggingTaskId && draggingTaskId !== task._id && "data-[drop=true]:bg-blue-50"
          )}
        >
          <div
            className="overflow-hidden rounded-md border bg-[#FBFBFB] transition group-hover:bg-[#F1F1F1]"
            style={{ borderColor: TASK_UI_COLORS.itemBorder }}
          >
            <div className={cn("grid min-h-[44px] items-center gap-4 px-6 py-1.5", TASK_TABLE_GRID)}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  draggable={currentUser?.role !== "viewer"}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", task._id);
                    setDraggingTaskId(task._id);
                  }}
                  onDragEnd={() => setDraggingTaskId(null)}
                  className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-[#A3A39E] opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
                  aria-label="Reordenar tarea"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <div className="relative flex h-6 shrink-0 items-center gap-2">
                  <Checkbox checked={task.status === "Completada"} onCheckedChange={(checked) => handleStatusChange(task, checked ? "Completada" : "Pendiente")} disabled={currentUser?.role === "viewer"} className="h-4 w-4" />
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleTaskCollapse(task._id)}
                      className="flex h-5 w-5 items-center justify-center rounded-sm border border-[#E6E6E6] hover:bg-[#F1F1F1] text-gray-600"
                      aria-expanded={!isTaskCollapsed}
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isTaskCollapsed && "-rotate-90")} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (addingSubtaskFor === task._id) {
                          setAddingSubtaskFor(null);
                          setSubtaskTitle("");
                        } else {
                          setAddingSubtaskFor(task._id);
                          setSubtaskTitle("");
                          setCollapsedTasks((current) => {
                            const next = new Set(current);
                            next.delete(task._id);
                            return next;
                          });
                        }
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-sm text-gray-400 hover:bg-[#F1F1F1] hover:text-gray-600"
                      aria-label="Agregar subtarea"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", addingSubtaskFor !== task._id && "-rotate-90")} />
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Input
                      defaultValue={task.titulo}
                      disabled={currentUser?.role === "viewer" || inlineSavingId === task._id || updatingStatusId === task._id}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim();
                        if (value && value !== task.titulo) void handleInlineUpdate(task, { titulo: value });
                      }}
                      className="h-6 border-transparent bg-transparent px-1 text-sm font-medium text-gray-900 shadow-none hover:border-[#E6E6E6] focus-visible:border-[#E6E6E6] focus-visible:ring-0"
                    />
                    {isOverdue(task) && <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                    {(inlineSavingId === task._id || updatingStatusId === task._id) && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" />}
                  </div>
                </div>
              </div>
              <InlineAssigneePicker
                task={task}
                disabled={currentUser?.role === "viewer" || inlineSavingId === task._id || updatingStatusId === task._id}
                onChange={(assignees) => handleInlineUpdate(task, { asignados: assignees })}
              />
              <InlineDatePicker
                value={task.fecha_limite}
                disabled={currentUser?.role === "viewer" || inlineSavingId === task._id || updatingStatusId === task._id}
                overdue={isOverdue(task)}
                onChange={(value) => handleInlineUpdate(task, { fecha_limite: value })}
              />
              <InlineLabelPicker
                value={task.prioridad}
                labels={priorityLabels}
                disabled={currentUser?.role === "viewer" || inlineSavingId === task._id || updatingStatusId === task._id}
                onSelect={(value) => handleInlineUpdate(task, { prioridad: value })}
                onLabelsChange={setPriorityLabels}
              />
              <InlineLabelPicker
                value={task.status}
                labels={statusLabels}
                disabled={inlineSavingId === task._id || updatingStatusId === task._id || currentUser?.role === "viewer"}
                onSelect={(value) => handleStatusChange(task, value)}
                onLabelsChange={setStatusLabels}
              />
              <InlinePartidaPicker
                task={task}
                disabled={currentUser?.role === "viewer" || inlineSavingId === task._id || updatingStatusId === task._id}
                onChange={(partidas) => handleInlineUpdate(task, { partidas })}
              />
              <div className="flex justify-end">
                <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); setContextMenu({ task, x: event.clientX, y: event.clientY }); }} className="h-6 w-6 text-[#A3A39E] hover:text-[#898982]">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {!isTaskCollapsed && hasChildren && (
              <>
                {childTasks.map((child) => (
                  <React.Fragment key={child._id}>
                    <div className="border-t border-[#E6E6E6]" />
                    {renderTaskContent(child, 1, true)}
                  </React.Fragment>
                ))}
              </>
            )}
            {!isTaskCollapsed && (hasChildren || addingSubtaskFor === task._id) && (
              <>
                <div className="border-t border-[#E6E6E6]" />
                <div className="px-6 py-2">
                  {addingSubtaskFor === task._id ? (
                    <div className="flex items-center gap-2" style={{ paddingLeft: 26 }}>
                      <Checkbox disabled className="h-4 w-4" />
                      <Input
                        autoFocus
                        value={subtaskTitle}
                        onChange={(event) => setSubtaskTitle(event.target.value)}
                        onBlur={() => {
                          if (subtaskTitle.trim()) {
                            void handleCreateSubtask(task);
                          } else {
                            setAddingSubtaskFor(null);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            setSubtaskTitle("");
                            setAddingSubtaskFor(null);
                          }
                        }}
                        placeholder="+ Agregar subelemento"
                        className="h-6 max-w-sm border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingSubtaskFor(task._id);
                        setSubtaskTitle("");
                      }}
                      className="flex h-6 items-center gap-2 text-xs text-gray-500 hover:text-gray-900"
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
        </div>
      </React.Fragment>
    );
  };

  if ((isProjectScoped && !proyecto) || !tareas || !proyectos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
    <div className="min-h-screen bg-white text-left">
      <div className="border-b border-gray-200 px-6 py-8 lg:px-16">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-gray-500">{isProjectScoped ? "Proyecto" : "General"}</p>
            <h1 className="mt-1 text-3xl font-normal text-gray-900">
              {isProjectScoped ? `Tareas ${proyecto?.nombre}` : "Tareas"}
            </h1>
          </div>
          <div className="flex gap-2 self-start lg:self-auto">
            <Button
              variant="outline"
              onClick={() => setNotificationsOpen(true)}
              className="relative h-14 gap-3 rounded-sm border-[#DBDBDB] bg-white px-5 text-base font-normal text-[#898982] shadow-none hover:bg-white hover:text-[#898982]"
            >
              <span className="h-3 w-3 rounded-full bg-[#50AC66]" />
              Notificaciones
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#50AC66] px-1.5 text-[11px] font-medium text-white">
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </Button>
            {canCreate && (
              <Button
                onClick={openCreateDialog}
                variant="outline"
                className="h-14 gap-3 rounded-sm border-[#DBDBDB] bg-white px-8 text-base font-normal text-[#898982] shadow-none hover:bg-white hover:text-[#898982]"
              >
                <Plus className="h-5 w-5 text-[#898982]" />
                Nueva tarea
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-8 px-6 py-8 lg:px-16">
        <div className="flex border-b border-[#E6E6E6]">
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
                "flex min-w-36 items-center gap-4 px-1 py-4 text-sm text-gray-600",
                taskTab === item.id && "border-b-2 border-gray-900 text-gray-900"
              )}
            >
              <span>{item.label}</span>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#FBFBFB] px-2 text-xs text-gray-600">
                {item.value}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-[#E6E6E6] bg-white p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por titulo, descripcion o asignado"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {statusLabels.map((status) => (
                <SelectItem key={status.id} value={status.label}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-full lg:w-56">
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
          {!isProjectScoped && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full lg:w-56">
                <SelectValue placeholder="Proyecto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {proyectos.map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-10 bg-white">
              {groupedTasks.map((group) => {
                const isCollapsed = collapsedProjects.has(group.projectId);

                return (
                  <div
                    key={group.projectId}
                    className={cn(
                      "rounded-md border border-[#E6E6E6] bg-white",
                      isProjectScoped && "border-0"
                    )}
                  >
                    {!isProjectScoped && (
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapse(group.projectId)}
                        className={cn(
                          "flex min-h-32 w-full items-center gap-3 bg-white px-8 text-left",
                          !isCollapsed && "border-b border-[#E6E6E6]"
                        )}
                        aria-expanded={!isCollapsed}
                      >
                        <ChevronDown className={cn("h-4 w-4 text-[#898982] transition-transform", isCollapsed && "-rotate-90")} />
                        <span className="font-medium text-[#898982]">{group.projectName}</span>
                        <MoreHorizontal className="h-4 w-4 text-[#898982]" />
                        <span className="ml-8 rounded-sm bg-[#FBFBFB] px-6 py-2 text-xs text-[#A3A39E]">{group.tasks.length} tareas</span>
                      </button>
                    )}
                    {!isCollapsed && (
                      <div className="overflow-x-auto w-full">
                        <div className="w-max min-w-full">
                        {getStatusSections(group.tasks).map((section) => {
                            const sectionKey = `${group.projectId}:${section.label.id}`;
                            const isStatusCollapsed = collapsedStatusSections.has(sectionKey);

                            return (
                              <div key={sectionKey}>
                                <div className={cn("px-8 pb-2", isProjectScoped ? "pt-8" : "pt-10")}>
                                    <div className={cn("grid items-center gap-4 text-sm", TASK_COLUMN_TEXT, TASK_TABLE_GRID)}>
                                      <button
                                        type="button"
                                        onClick={() => toggleStatusCollapse(sectionKey)}
                                        className="flex min-w-0 items-center gap-2 text-left text-[#898982] hover:text-[#898982]"
                                        aria-expanded={!isStatusCollapsed}
                                      >
                                        <ChevronDown className={cn("h-4 w-4 text-[#898982] transition-transform", isStatusCollapsed && "-rotate-90")} />
                                        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: section.label.color }} />
                                        <span>{section.label.label}</span>
                                        <span className="text-xs text-[#A3A39E]">{section.tasks.length}</span>
                                      </button>
                                      <span className="text-base text-[#A5A5A0]">Responsable</span>
                                      <span className="text-base text-[#A5A5A0]">Fecha vencimiento</span>
                                      <span className="text-base text-[#A5A5A0]">Prioridad</span>
                                      <span className="text-base text-[#A5A5A0]">Estado</span>
                                      <span className="text-base text-[#A5A5A0]">Partida</span>
                                      <span />
                                    </div>
                                </div>
                                {!isStatusCollapsed && (
                                  <>
                                    {section.tasks.map((task) => renderTaskRow(task))}
                                    {canCreate && (
                                      <div className="px-8 py-2">
                                        {addingTaskInSection?.projectId === group.projectId && addingTaskInSection?.statusLabel === section.label.id ? (
                                          <div className="flex items-center gap-2">
                                            <Checkbox disabled className="h-4 w-4" />
                                            <Input
                                              autoFocus
                                              value={newTaskTitle}
                                              onChange={(event) => setNewTaskTitle(event.target.value)}
                                              onBlur={() => {
                                                if (newTaskTitle.trim()) {
                                                  void handleCreateInlineTask(group.projectId as Id<"desarrollos">, section.label.label);
                                                } else {
                                                  setAddingTaskInSection(null);
                                                }
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter") event.currentTarget.blur();
                                                if (event.key === "Escape") {
                                                  setNewTaskTitle("");
                                                  setAddingTaskInSection(null);
                                                }
                                              }}
                                              placeholder="+ Agregar tarea"
                                              className="h-6 max-w-sm border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                                            />
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAddingTaskInSection({ projectId: group.projectId, statusLabel: section.label.id });
                                              setNewTaskTitle("");
                                            }}
                                            className="flex h-6 items-center gap-2 text-xs text-gray-500 hover:text-gray-900"
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
                <div className="flex h-32 items-center justify-center text-gray-500">
                    No hay tareas con los filtros actuales.
                </div>
              )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-900 shadow-xl"
          style={{
            left: contextMenuLeft,
            top: contextMenuTop,
            maxHeight: contextMenuMaxHeight,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <Command className="bg-white text-gray-900">
            <CommandList className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: contextMenuMaxHeight - 8 }}>
              <CommandGroup>
                <CommandItem onSelect={() => { void copyTaskName(contextMenu.task); setContextMenu(null); }} className="data-[selected=true]:bg-gray-100">
                  <Copy className="h-4 w-4" />
                  Copiar nombre
                </CommandItem>
                <CommandItem onSelect={() => { setSelectedTaskId(contextMenu.task._id); setContextMenu(null); }} className="data-[selected=true]:bg-gray-100">
                  <Eye className="h-4 w-4" />
                  Abrir tarea
                </CommandItem>
                <CommandItem onSelect={() => { openProjectTaskRoute(contextMenu.task); setContextMenu(null); }} className="data-[selected=true]:bg-gray-100">
                  <ExternalLink className="h-4 w-4" />
                  Abrir en una pestana nueva
                </CommandItem>
                <CommandItem onSelect={() => { void copyTaskUrl(contextMenu.task); setContextMenu(null); }} className="data-[selected=true]:bg-gray-100">
                  <Copy className="h-4 w-4" />
                  Copiar URL de tarea
                </CommandItem>
              </CommandGroup>
              <CommandSeparator className="bg-gray-200" />
              <CommandGroup>
                <CommandItem onSelect={() => { void handleDuplicate(contextMenu.task); setContextMenu(null); }} disabled={!canCreate} className="data-[selected=true]:bg-gray-100">
                  <Copy className="h-4 w-4" />
                  Duplicar
                </CommandItem>
                {!contextMenu.task.parent_task && (
                  <CommandItem onSelect={() => { setAddingSubtaskFor(contextMenu.task._id); setSubtaskTitle(""); setContextMenu(null); }} disabled={!canCreate} className="data-[selected=true]:bg-gray-100">
                    <Plus className="h-4 w-4" />
                    Agregar subtarea
                  </CommandItem>
                )}
                <CommandItem onSelect={() => { void handleInlineUpdate(contextMenu.task, { status: "Cancelada" }); setContextMenu(null); }} disabled={!canCreate} className="data-[selected=true]:bg-gray-100">
                  <Archive className="h-4 w-4" />
                  Archivar
                </CommandItem>
              </CommandGroup>
              {!isProjectScoped && canCreate && (
                <>
                  <CommandSeparator className="bg-gray-200" />
                  <CommandGroup heading="Mover a">
                    {proyectos.filter((project) => project._id !== contextMenu.task.proyecto).slice(0, 6).map((project) => (
                      <CommandItem
                        key={project._id}
                        onSelect={() => {
                          void handleInlineUpdate(contextMenu.task, { proyecto: project._id });
                          setContextMenu(null);
                        }}
                        className="data-[selected=true]:bg-gray-100"
                      >
                        <MoveRight className="h-4 w-4" />
                        {project.nombre}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {(currentUser?.role === "admin" || currentUser?._id === contextMenu.task.created_by_id) && (
                <>
                  <CommandSeparator className="bg-gray-200" />
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
        <SheetContent side="right" className="w-full overflow-y-auto border-l border-gray-200 bg-white p-0 text-gray-900 sm:max-w-xl">
          <SheetHeader className="border-b border-gray-200 p-6 text-left">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-left text-2xl font-normal text-gray-900">Notificaciones</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markNotificationsAsRead(proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : {})}
                className="text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                Marcar leidas
              </Button>
            </div>
            <SheetDescription className="text-left text-gray-600">
              {isProjectScoped
                ? "Actividad reciente de tareas en este proyecto."
                : "Actividad reciente de tareas en todos tus proyectos."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 p-6">
            <Tabs value={notificationTab} onValueChange={(value) => setNotificationTab(value as typeof notificationTab)}>
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 rounded-none">
                <TabsTrigger className="rounded-none" value="all">Todas</TabsTrigger>
                <TabsTrigger className="rounded-none" value="mentions">Menciones</TabsTrigger>
                <TabsTrigger className="rounded-none" value="assignments">Asignaciones</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={notificationSearch}
                  onChange={(event) => setNotificationSearch(event.target.value)}
                  placeholder="Busca notificaciones por personas o tareas"
                  className="border-gray-200 bg-white pl-9 text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyUnreadNotifications((current) => !current)}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <span
                  className={cn(
                    "flex h-5 w-9 items-center rounded-full border border-gray-300 p-0.5 transition",
                    onlyUnreadNotifications ? "bg-blue-600" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full bg-white shadow-sm transition",
                      onlyUnreadNotifications && "translate-x-4"
                    )}
                  />
                </span>
                Solo no leidas
              </button>
            </div>

            <div className="rounded-none border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-blue-50 text-blue-600">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Seguimiento de tareas activo</p>
                  <p className="mt-1 text-sm leading-5 text-gray-600">
                    Recibe avisos cuando te asignen, mencionen o actualicen tareas.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Ultimos movimientos</h3>
                {unreadNotificationCount > 0 && (
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    {unreadNotificationCount} sin leer
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {!taskNotifications ? (
                  <div className="flex h-24 items-center justify-center text-gray-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredNotifications.length ? (
                  filteredNotifications.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => {
                        setSelectedTaskId(item.task._id);
                        setNotificationsOpen(false);
                      }}
                      className={cn(
                        "flex w-full gap-3 rounded-none border p-3 text-left transition hover:bg-gray-50",
                        item.is_unread
                          ? "border-blue-200 bg-blue-50"
                          : "border-gray-200 bg-white"
                      )}
                    >
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                        {item.notification_type === "assignment" ? (
                          <ListChecks className="h-4 w-4" />
                        ) : item.notification_type === "mention" ? (
                          <MessageSquare className="h-4 w-4" />
                        ) : (
                          <Clock3 className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm leading-5 break-words text-gray-700">
                            <span className="font-medium text-gray-900">{item.changed_by_name}</span>{" "}
                            {notificationLabel(item).toLowerCase()}{" "}
                            <span className="font-medium text-gray-900">"{item.task.titulo}"</span>
                          </p>
                          <span className="shrink-0 text-xs text-gray-400">{relativeTime(item.created_at)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          {!isProjectScoped && item.proyecto_nombre && <span>{item.proyecto_nombre}</span>}
                          <span>{item.task.status}</span>
                          <span>Prioridad {item.task.prioridad}</span>
                          {item.task.fecha_limite && <span>Limite {formatDate(item.task.fecha_limite)}</span>}
                        </div>
                      </div>
                      {item.is_unread && <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
                    </button>
                  ))
                ) : (
                  <div className="rounded-none border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
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
              <SheetHeader className="border-b border-gray-200 p-6 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("border", priorityClass(selectedTask.prioridad))}>
                    {selectedTask.prioridad}
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
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(selectedTask)} className="gap-2">
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  {(currentUser?.role === "admin" || currentUser?._id === selectedTask.created_by_id) && (
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
                  <div className="border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Fecha limite</p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{formatDate(selectedTask.fecha_limite)}</p>
                  </div>
                  <div className="border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Ultima actualizacion</p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{formatDateTime(selectedTask.updated_at || selectedTask.created_at)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900">Descripcion</h3>
                  <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-gray-600">
                    {selectedTask.descripcion || "Sin descripcion."}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900">Asignados</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTask.assigned_users?.length ? selectedTask.assigned_users.map((user) => (
                      <span
                        key={user._id}
                        className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700"
                        title={user.email}
                      >
                        {user.name || user.email}
                      </span>
                    )) : <span className="text-sm text-gray-400">Sin asignar</span>}
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
                          <div key={comment._id} className="border border-gray-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{comment.user_name}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{formatDateTime(comment.created_at)}</p>
                              </div>
                              {canDeleteComment && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveComment(comment._id)}
                                  className="h-8 w-8 text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-gray-700">{comment.comment}</p>
                          </div>
                        );
                      }) : (
                        <div className="border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                          Aun no hay comentarios en esta tarea.
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <div className="space-y-3">
                      {taskDetail?.history?.length ? taskDetail.history.map((item) => (
                        <div key={item._id} className="flex gap-3 border-b border-gray-100 pb-3 last:border-b-0">
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                            <Clock3 className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm break-words text-gray-900">{historyLabel(item)}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.changed_by_name} · {formatDateTime(item.created_at)}
                            </p>
                          </div>
                        </div>
                      )) : (
                        <div className="border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                          Aun no hay historial registrado.
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
            <DialogDescription>
              Asigna responsables, prioridad y fecha limite para dar seguimiento al trabajo del proyecto.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="space-y-2">
              <Label>Proyecto</Label>
              <Select
                value={selectedFormProjectId}
                disabled={isProjectScoped}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    proyecto: value,
                    asignados: new Set(),
                    partidas: new Set(),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el proyecto" />
                </SelectTrigger>
                <SelectContent>
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Descripcion</Label>
              <Textarea
                id="task-description"
                value={form.descripcion}
                onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))}
                placeholder="Notas, contexto o resultado esperado"
                rows={4}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select
                  value={form.prioridad}
                  onValueChange={(value) => setForm((current) => ({ ...current, prioridad: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityLabels.map((priority) => (
                      <SelectItem key={priority.id} value={priority.label}>
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(value) => setForm((current) => ({ ...current, categoria: value }))}
                >
                  <SelectTrigger>
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
                <Label htmlFor="task-date">Fecha limite</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={form.fecha_limite}
                  onChange={(event) => setForm((current) => ({ ...current, fecha_limite: event.target.value }))}
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusLabels.map((status) => (
                      <SelectItem key={status.id} value={status.label}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 min-w-0">
              <Label>Asignados</Label>
              <div className="max-h-52 overflow-y-auto overflow-x-hidden border border-gray-200 p-3">
                {!selectedFormProjectId && (
                  <div className="py-4 text-center text-sm text-gray-500">
                    Selecciona un proyecto para ver usuarios disponibles.
                  </div>
                )}
                {selectedFormProjectId && !assignableUsers && (
                  <div className="flex h-20 items-center justify-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {(assignableUsers || []).map((user) => (
                  <label
                    key={user._id}
                    className="flex cursor-pointer items-center gap-3 border-b border-gray-100 py-2 last:border-b-0"
                  >
                    <Checkbox
                      checked={form.asignados.has(user._id)}
                      onCheckedChange={() => toggleAssignee(user._id)}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-gray-900">{user.name || user.email}</span>
                      <span className="truncate text-xs text-gray-500">{user.email}</span>
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{user.role}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <Label>Partidas</Label>
              <div className="max-h-52 overflow-y-auto overflow-x-hidden border border-gray-200 p-3">
                {!selectedFormProjectId && (
                  <div className="py-4 text-center text-sm text-gray-500">
                    Selecciona un proyecto para ver partidas disponibles.
                  </div>
                )}
                {selectedFormProjectId && !formPartidas && (
                  <div className="flex h-20 items-center justify-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {(formPartidas || []).map((partida) => (
                  <label
                    key={partida._id}
                    className="flex cursor-pointer items-center gap-3 border-b border-gray-100 py-2 last:border-b-0"
                  >
                    <Checkbox
                      checked={form.partidas.has(partida._id)}
                      onCheckedChange={() => togglePartida(partida._id)}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-gray-900">{partidaDisplayName(partida)}</span>
                      <span className="truncate text-xs text-gray-500">{partidaContext(partida)}</span>
                    </span>
                    <span className="ml-auto text-xs text-gray-400">N{partida.nivel}</span>
                  </label>
                ))}
              </div>
            </div>
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
            <AlertDialogTitle>Eliminar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion eliminara la tarea, sus subtareas, comentarios e historial. No se puede deshacer.
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
