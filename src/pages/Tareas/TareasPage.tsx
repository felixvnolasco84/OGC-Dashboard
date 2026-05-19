import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Eye,
  History,
  ListChecks,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = ["Pendiente", "En progreso", "Bloqueada", "Completada", "Cancelada"];
const PRIORITY_OPTIONS = ["Baja", "Media", "Alta", "Urgente"];
const CATEGORY_OPTIONS = ["General", "Obra", "Finanzas", "Documentos", "Requisicion", "Bitacora"];

type UserSummary = {
  _id: Id<"users">;
  name: string;
  email: string;
  role: string;
};

type Task = {
  _id: Id<"tareas">;
  proyecto: Id<"desarrollos">;
  proyecto_nombre?: string;
  titulo: string;
  descripcion?: string;
  asignados: Id<"users">[];
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

export default function TareasPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
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

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<"all" | "mentions" | "assignments">("all");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [onlyUnreadNotifications, setOnlyUnreadNotifications] = useState(false);

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
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesAssignee = assigneeFilter === "all" || task.asignados.includes(assigneeFilter as Id<"users">);
      const matchesProject = projectFilter === "all" || task.proyecto === projectFilter;
      return matchesSearch && matchesStatus && matchesAssignee && matchesProject;
    });
  }, [assigneeFilter, projectFilter, search, statusFilter, tareas]);

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

  if ((isProjectScoped && !proyecto) || !tareas || !proyectos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

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
              className="relative gap-2"
            >
              <Bell className="h-4 w-4" />
              Notificaciones
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-medium ">
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </Button>
            {canCreate && (
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                Nueva tarea
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-8 lg:px-16">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-sm">Total</span>
              <ListChecks className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-medium text-gray-900">{stats.total}</p>
          </div>
          <div className="border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-sm">Abiertas</span>
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-medium text-gray-900">{stats.pending}</p>
          </div>
          <div className="border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-sm">Vencidas</span>
              <CalendarClock className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-medium text-gray-900">{stats.overdue}</p>
          </div>
          <div className="border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-sm">Completadas</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-medium text-gray-900">{stats.done}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border border-gray-200 p-4 lg:flex-row lg:items-center">
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
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
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

        <div className="border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[34%] px-4">Tarea</TableHead>
                <TableHead>Asignados</TableHead>
                <TableHead>Fecha limite</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-28 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => {
                const overdue = isOverdue(task);
                const canDelete = currentUser?.role === "admin" || currentUser?._id === task.created_by_id;
                return (
                  <TableRow key={task._id}>
                    <TableCell className="px-4">
                      <button
                        type="button"
                        onClick={() => setSelectedTaskId(task._id)}
                        className="block w-full text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{task.titulo}</span>
                          {overdue && <CircleAlert className="h-4 w-4 text-red-500" />}
                        </div>
                        {task.descripcion && (
                          <p className="mt-1 line-clamp-1 text-sm text-gray-500">{task.descripcion}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          {!isProjectScoped && `${task.proyecto_nombre || "Sin proyecto"} · `}
                          {task.categoria || "General"} · Creada por {task.created_by_name}
                        </p>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {task.assigned_users?.length ? task.assigned_users.map((user) => (
                          <span
                            key={user._id}
                            className="inline-flex h-7 items-center rounded-full border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700"
                            title={user.email}
                          >
                            {user.name || user.email}
                          </span>
                        )) : <span className="text-sm text-gray-400">Sin asignar</span>}
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-sm text-gray-600", overdue && "font-medium text-red-600")}>
                      {formatDate(task.fecha_limite)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", priorityClass(task.prioridad))}>
                        {task.prioridad}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={task.status}
                        onValueChange={(value) => handleStatusChange(task, value)}
                        disabled={updatingStatusId === task._id || currentUser?.role === "viewer"}
                      >
                        <SelectTrigger className={cn("h-8 w-36 border", statusClass(task.status))}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedTaskId(task._id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(task)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTaskToDelete(task)}
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredTasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-gray-500">
                    No hay tareas con los filtros actuales.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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
                          <p className="text-sm leading-5 text-gray-700">
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
                <SheetTitle className="text-left text-2xl font-normal">{selectedTask.titulo}</SheetTitle>
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
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">
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
                            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">{comment.comment}</p>
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
                            <p className="text-sm text-gray-900">{historyLabel(item)}</p>
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
        <DialogContent className="max-w-2xl">
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
                    {PRIORITY_OPTIONS.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
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
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Asignados</Label>
              <div className="max-h-52 overflow-y-auto border border-gray-200 p-3">
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion eliminara la tarea, sus comentarios y su historial. No se puede deshacer.
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
