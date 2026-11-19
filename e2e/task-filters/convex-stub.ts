import { getFunctionName } from "convex/server";
import type { Task, UserSummary } from "../../src/pages/Tareas/tareasTypes";
import type { Id } from "../../convex/_generated/dataModel";

const params = new URLSearchParams(location.search);
const user = (id: string, name: string): UserSummary => ({ _id: id as Id<"users">, name, email: `${id}@example.invalid`, role: "admin" });
const ana = user("ana", "Ana Prueba");
const bruno = user("bruno", "Bruno Prueba");
const users = [ana, bruno];
const partidas = [{ _id: "estructura", nombre: "Estructura", nivel: 1 }, { _id: "acabados", nombre: "Acabados", nivel: 1 }];
const projects = [{ _id: "obra", nombre: "Obra de prueba", organization_id: "org" }, { _id: "otra", nombre: "Otra obra", organization_id: "org2" }];
const dateAtOffset = (days: number) => {
  const date = new Date(); date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
function task(id: string, titulo: string, status: string, input: Record<string, unknown> = {}): Task {
  const result = {
    _id: id, titulo, status, proyecto: "obra", proyecto_nombre: "Obra de prueba", organization_id: "org",
    asignados: ["ana"], created_by_id: "bruno", created_by_name: "Bruno Prueba", created_at: Date.now(),
    prioridad: "Alta", categoria: "Obra", fecha_limite: dateAtOffset(-2), partidas: ["estructura"], ...input,
  };
  return { ...result, assigned_users: users.filter((entry) => result.asignados.includes(entry._id)), assigned_partidas: partidas.filter((entry) => result.partidas.includes(entry._id)) } as Task;
}
const tasks = [
  task("pending", "Revisar cimentación", "Pendiente"),
  task("progress", "Revisar instalación", "En progreso", { asignados: ["bruno"], created_by_id: "ana", categoria: "Instalaciones", partidas: ["acabados"] }),
  task("custom", "Revisión de estructura", "En revisión técnica", { created_by_id: "ana" }),
  task("future", "Preparar documentos", "Pendiente", { asignados: ["bruno"], prioridad: "Baja", categoria: "Documentos", fecha_limite: dateAtOffset(5), partidas: [] }),
  task("done", "Entrega terminada", "Completada", { created_by_id: "ana" }),
  task("cancelled", "Visita cancelada", "Cancelada", { asignados: ["bruno"] }),
  task("general-review", "Revisión general", "En revisión técnica", { proyecto: undefined, proyecto_nombre: undefined, asignados: ["bruno"], created_by_id: "ana", partidas: [] }),
  task("general-pending", "Coordinación general", "Pendiente", { proyecto: undefined, proyecto_nombre: undefined, fecha_limite: undefined, partidas: [] }),
  task("other", "Planeación otra obra", "Pendiente", { proyecto: "otra", proyecto_nombre: "Otra obra", organization_id: "org2", fecha_limite: dateAtOffset(8), asignados: ["bruno"] }),
  task("minute", "Minuta semanal", "En progreso", { tipo: "minuta", proyecto: undefined, proyecto_nombre: undefined, fecha_limite: undefined, partidas: [] }),
  task("child", "Validar plano", "Bloqueada", { parent_task: "minute", prioridad: "Media" }),
];
const fixture = { calls: [] as Array<{ name: string; args: unknown }> };
Object.assign(window, { taskFiltersFixture: fixture });

export function useQuery(query: Parameters<typeof getFunctionName>[0], args?: unknown): any {
  if (args === "skip") return undefined;
  const name = getFunctionName(query);
  if (params.get("state") === "loading") return undefined;
  switch (name) {
    case "users:getCurrentUser": return { ...ana, role: params.get("role") || "admin", organization_id: "org" };
    case "desarrollos:getAll": return projects;
    case "tareas:getAllAccessible": return params.get("state") === "empty" ? [] : tasks;
    case "tareas:getCatalogs": return { statuses: ["En revisión técnica"], priorities: ["Alta", "Media", "Baja"], categories: ["Obra", "Instalaciones", "Documentos"] };
    case "tareas:getOrganizationScopes": return [{ id: "org", name: "Organización de prueba" }, { id: "org2", name: "Otra organización" }];
    case "tareas:getAssignableUsersByProjects": return { obra: users, otra: users };
    case "tareas:getAssignableUsersForOrganization": return users;
    case "partida:getByProjects": return { obra: partidas, otra: partidas };
    case "tareas:getAllNotifications": return [];
    case "tareas:getAllUnreadSummary": return { total: 0 };
    default: throw new Error(`Consulta no prevista en fixture P26: ${name}`);
  }
}
export function useMutation(mutation: Parameters<typeof getFunctionName>[0]) {
  return async (args: unknown) => {
    const name = getFunctionName(mutation);
    fixture.calls.push({ name, args });
    throw new Error(`El fixture P26 bloquea mutaciones: ${name}`);
  };
}
