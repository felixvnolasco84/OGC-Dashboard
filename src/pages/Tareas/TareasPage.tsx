import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ListChecks,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = ["Pendiente", "En progreso", "Bloqueada", "Completada", "Cancelada"];
const PRIORITY_OPTIONS = ["Baja", "Media", "Alta", "Urgente"];
const CATEGORY_OPTIONS = ["General", "Obra", "Finanzas", "Documentos", "Requisicion", "Bitacora"];

type Task = {
  _id: Id<"tareas">;
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
  assigned_users?: Array<{
    _id: Id<"users">;
    name: string;
    email: string;
    role: string;
  }>;
};

function emptyForm() {
  return {
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

export default function TareasPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const tareas = useQuery(
    api.tareas.getByProyecto,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
  ) as Task[] | undefined;
  const assignableUsers = useQuery(
    api.tareas.getAssignableUsers,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const currentUser = useQuery(api.users.getCurrentUser);

  const createTask = useMutation(api.tareas.create);
  const updateTask = useMutation(api.tareas.update);
  const updateStatus = useMutation(api.tareas.updateStatus);
  const removeTask = useMutation(api.tareas.remove);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const canCreate = currentUser?.role && currentUser.role !== "viewer";

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
        task.assigned_users?.some((user) => user.name.toLowerCase().includes(term));
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesAssignee = assigneeFilter === "all" || task.asignados.includes(assigneeFilter as Id<"users">);
      return matchesSearch && matchesStatus && matchesAssignee;
    });
  }, [assigneeFilter, search, statusFilter, tareas]);

  const openCreateDialog = () => {
    setEditingTask(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setForm({
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
    if (!proyectoId) return;
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
          ...payload,
          status: form.status,
        });
        toast.success("Tarea actualizada");
      } else {
        await createTask({
          proyecto: proyectoId as Id<"desarrollos">,
          ...payload,
        });
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

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`Eliminar la tarea "${task.titulo}"?`)) return;
    try {
      await removeTask({ id: task._id });
      toast.success("Tarea eliminada");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("No se pudo eliminar la tarea");
    }
  };

  if (!proyecto || !tareas || !assignableUsers) {
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
            <p className="text-sm text-gray-500">Proyecto</p>
            <h1 className="mt-1 text-3xl font-normal text-gray-900">
              Tareas {proyecto.nombre}
            </h1>
          </div>
          {canCreate && (
            <Button onClick={openCreateDialog} className="gap-2 self-start lg:self-auto">
              <Plus className="h-4 w-4" />
              Nueva tarea
            </Button>
          )}
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
              {assignableUsers.map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  {user.name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <TableHead className="w-24 text-right">Acciones</TableHead>
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
                        onClick={() => openEditDialog(task)}
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
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(task)}>
                          Editar
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(task)}
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
                {assignableUsers.map((user) => (
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
    </div>
  );
}
