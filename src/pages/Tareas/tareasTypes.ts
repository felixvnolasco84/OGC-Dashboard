import type { Id } from "../../../convex/_generated/dataModel";

export type UserSummary = {
  _id: Id<"users">;
  name: string;
  email: string;
  role: string;
};

export type PartidaSummary = {
  _id: Id<"partidas">;
  nombre: string;
  familia?: string;
  sub_partida?: string;
  partida_nombre?: string;
  nivel: number;
};

export type Task = {
  _id: Id<"tareas">;
  proyecto?: Id<"desarrollos">;
  organization_id?: string;
  tipo?: "tarea" | "minuta";
  origen?: "usuario" | "sistema";
  week_start?: string;
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
  created_by_id?: Id<"users">;
  created_by_name: string;
  created_at: number;
  updated_at?: number;
  completed_at?: number;
  assigned_users?: UserSummary[];
  assigned_partidas?: PartidaSummary[];
};

export type TaskComment = {
  _id: Id<"tarea_comments">;
  user_id: Id<"users">;
  user_name: string;
  comment: string;
  created_at: number;
};

export type TaskHistory = {
  _id: Id<"tarea_history">;
  action: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  changed_by_name: string;
  created_at: number;
};

export type TaskNotification = TaskHistory & {
  proyecto_nombre?: string;
  is_unread: boolean;
  notification_type: "assignment" | "mention" | "comment" | "update";
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

export type ProjectOption = {
  _id: Id<"desarrollos">;
  nombre: string;
  organization_id?: string;
};

export type TaskLabelOption = {
  id: string;
  label: string;
  color: string;
};

export type TaskCatalogs = {
  statuses: string[];
  priorities: string[];
  categories: string[];
};

export type TaskGroup = {
  projectId: string;
  projectName: string;
  tasks: Task[];
  organizationId?: string;
  isGeneral?: boolean;
};

export type TaskContextMenu = {
  task: Task;
  x: number;
  y: number;
} | null;

export type ProjectLookupMap<T> = Record<string, T[]>;
