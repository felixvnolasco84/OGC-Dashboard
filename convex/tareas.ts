import { internalMutation, mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow, getUserDesarrollos, hasGlobalAdminAccess } from "./permissions";
import type { TaskEmailNotificationType } from "./taskEmailTemplates";

// New internal functions are absent from generated types until `convex dev` runs once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convexInternal = internal as any;

const WRITE_ROLES = new Set(["admin", "user", "contratista", "finance"]);

type TaskScope = {
  proyecto?: Id<"desarrollos">;
  organization_id?: string;
};

async function ensureProjectAccess(ctx: QueryCtx | MutationCtx, proyecto: Id<"desarrollos">) {
  const user = await getCurrentUserOrThrow(ctx);

  if (hasGlobalAdminAccess(user)) {
    return user;
  }

  const project = await ctx.db.get(proyecto);
  if (!project) {
    throw new Error("Project not found");
  }

  if (user.role === "admin" && project.organization_id === user.organization_id) {
    return user;
  }

  if (!user.allowed_desarrollos.includes(proyecto)) {
    throw new Error("Unauthorized: No project access");
  }

  return user;
}

async function getTaskOrganization(
  ctx: QueryCtx | MutationCtx,
  task: TaskScope,
) {
  if (task.organization_id) return task.organization_id;
  if (!task.proyecto) return undefined;
  const project = await ctx.db.get(task.proyecto);
  return project?.organization_id;
}

async function ensureTaskAccess(ctx: QueryCtx | MutationCtx, task: TaskScope) {
  if (task.proyecto) return await ensureProjectAccess(ctx, task.proyecto);

  const user = await getCurrentUserOrThrow(ctx);
  const organizationId = await getTaskOrganization(ctx, task);
  if (!organizationId) {
    if (!hasGlobalAdminAccess(user)) throw new Error("Unauthorized: Task has no organization");
    return user;
  }
  if (!hasGlobalAdminAccess(user) && user.organization_id !== organizationId) {
    throw new Error("Unauthorized: No organization access");
  }
  return user;
}

async function resolveScope(
  ctx: QueryCtx | MutationCtx,
  args: { proyecto?: Id<"desarrollos">; organization_id?: string },
) {
  const user = args.proyecto
    ? await ensureProjectAccess(ctx, args.proyecto)
    : await getCurrentUserOrThrow(ctx);
  if (args.proyecto) {
    const project = await ctx.db.get(args.proyecto);
    if (!project) throw new Error("Project not found");
    return { user, organizationId: project.organization_id || user.organization_id };
  }

  const organizationId = args.organization_id || user.organization_id;
  if (!organizationId) throw new Error("Selecciona una organización para una tarea general");
  if (!hasGlobalAdminAccess(user) && organizationId !== user.organization_id) {
    throw new Error("Unauthorized: No organization access");
  }
  return { user, organizationId };
}

function canWrite(role: string) {
  return WRITE_ROLES.has(role);
}

function canManageTask(user: Doc<"users">, task: Doc<"tareas">) {
  return user.role === "admin" || task.created_by_id === user._id ||
    (task.tipo === "minuta" && task.origen === "sistema" && canWrite(user.role));
}

function canUpdateTaskStatus(user: Doc<"users">, task: Doc<"tareas">) {
  return canManageTask(user, task) || task.asignados.includes(user._id);
}

function stringifyValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
}

async function replaceTaskDocument(
  ctx: MutationCtx,
  task: Doc<"tareas">,
  changes: Record<string, unknown>
) {
  const { _id, _creationTime, ...current } = task;
  await ctx.db.replace(
    task._id,
    omitUndefined({ ...current, ...changes }) as Omit<Doc<"tareas">, "_id" | "_creationTime">
  );
}

async function scheduleTaskEmail(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tareas">;
    type: TaskEmailNotificationType;
    actorId?: Id<"users">;
    recipientIds?: Id<"users">[];
    detail?: string;
    oldValue?: string;
    newValue?: string;
    occurredAt: number;
    operationKey: string;
  },
) {
  await ctx.scheduler.runAfter(0, convexInternal.taskNotifications.dispatchTaskEmail, args);
}

function notificationTypeForStatus(oldStatus: string, newStatus: string): TaskEmailNotificationType {
  if (newStatus === "Completada") return "completed";
  if (newStatus === "Bloqueada") return "blocked";
  if (newStatus === "Cancelada") return "cancelled";
  if (["Completada", "Cancelada"].includes(oldStatus) && !["Completada", "Cancelada"].includes(newStatus)) {
    return "reopened";
  }
  return "status_changed";
}

function taskFollowerIds(task: Pick<Doc<"tareas">, "asignados" | "created_by_id">) {
  return Array.from(new Set([
    ...task.asignados,
    ...(task.created_by_id ? [task.created_by_id] : []),
  ]));
}

async function ensureAssignableUsersBelongToProject(
  ctx: QueryCtx | MutationCtx,
  asignados: Id<"users">[],
  proyecto: Id<"desarrollos">
) {
  if (new Set(asignados).size !== asignados.length) {
    throw new Error("La tarea no puede tener responsables duplicados");
  }

  const project = await ctx.db.get(proyecto);
  if (!project) {
    throw new Error("Project not found");
  }

  for (const userId of asignados) {
    const assignedUser = await ctx.db.get(userId);
    if (!assignedUser) {
      throw new Error("El responsable seleccionado no existe");
    }

    const belongsToProjectOrganization =
      Boolean(project.organization_id) &&
      assignedUser.organization_id === project.organization_id;
    const hasProjectAccess =
      hasGlobalAdminAccess(assignedUser) ||
      assignedUser.allowed_desarrollos.includes(proyecto) ||
      belongsToProjectOrganization;

    if (!hasProjectAccess) {
      throw new Error("Los responsables deben tener acceso al proyecto");
    }
  }
}

async function ensureAssignableUsersBelongToScope(
  ctx: QueryCtx | MutationCtx,
  asignados: Id<"users">[],
  scope: { proyecto?: Id<"desarrollos">; organization_id?: string },
) {
  if (new Set(asignados).size !== asignados.length) {
    throw new Error("La tarea no puede tener responsables duplicados");
  }
  if (scope.proyecto) {
    if (asignados.length) {
      await ensureAssignableUsersBelongToProject(ctx, asignados, scope.proyecto);
    }
    return;
  }
  if (!scope.organization_id) throw new Error("La tarea general requiere una organización");
  for (const userId of asignados) {
    const assignedUser = await ctx.db.get(userId);
    if (!assignedUser) throw new Error("El responsable seleccionado no existe");
    if (!hasGlobalAdminAccess(assignedUser) && assignedUser.organization_id !== scope.organization_id) {
      throw new Error("Los responsables deben pertenecer a la organización");
    }
  }
}

async function ensurePartidasBelongToProject(
  ctx: QueryCtx | MutationCtx,
  partidas: Id<"partidas">[] | undefined,
  proyecto?: Id<"desarrollos">
) {
  if (!proyecto && (partidas || []).length > 0) {
    throw new Error("Las tareas generales no pueden relacionarse con partidas");
  }
  for (const partidaId of partidas || []) {
    const partida = await ctx.db.get(partidaId);
    if (!partida || partida.proyecto !== proyecto) {
      throw new Error("Las partidas deben pertenecer al mismo proyecto de la tarea");
    }
  }
}

async function insertHistory(
  ctx: MutationCtx,
  args: {
    task: Doc<"tareas"> | { _id: Id<"tareas">; proyecto?: Id<"desarrollos">; organization_id?: string };
    action: string;
    user: Doc<"users">;
    field_changed?: string;
    old_value?: unknown;
    new_value?: unknown;
  }
) {
  await ctx.db.insert("tarea_history", {
    tarea_id: args.task._id,
    proyecto: args.task.proyecto,
    organization_id: args.task.organization_id,
    action: args.action,
    field_changed: args.field_changed,
    old_value: stringifyValue(args.old_value),
    new_value: stringifyValue(args.new_value),
    changed_by_id: args.user._id,
    changed_by_name: args.user.name,
    created_at: Date.now(),
  });
}

async function deleteTaskTree(ctx: MutationCtx, taskId: Id<"tareas">) {
  const children = await ctx.db
    .query("tareas")
    .withIndex("by_parent_task", (q) => q.eq("parent_task", taskId))
    .collect();

  for (const child of children) {
    await deleteTaskTree(ctx, child._id);
  }

  const [comments, history] = await Promise.all([
    ctx.db
      .query("tarea_comments")
      .withIndex("by_tarea", (q) => q.eq("tarea_id", taskId))
      .collect(),
    ctx.db
      .query("tarea_history")
      .withIndex("by_tarea", (q) => q.eq("tarea_id", taskId))
      .collect(),
  ]);

  for (const comment of comments) {
    await ctx.db.delete(comment._id);
  }
  for (const item of history) {
    await ctx.db.delete(item._id);
  }

  await ctx.db.delete(taskId);
}

async function completeParentIfAllChildrenDone(
  ctx: MutationCtx,
  args: {
    parentTaskId?: Id<"tareas">;
    user: Doc<"users">;
  }
) {
  if (!args.parentTaskId) return;

  const parent = await ctx.db.get(args.parentTaskId);
  if (!parent || parent.status === "Completada") return;

  const children = await ctx.db
    .query("tareas")
    .withIndex("by_parent_task", (q) => q.eq("parent_task", args.parentTaskId))
    .collect();

  if (children.length === 0 || children.some((child) => child.status !== "Completada")) {
    return;
  }

  const now = Date.now();
  await ctx.db.patch(args.parentTaskId, {
    status: "Completada",
    updated_at: now,
    completed_at: parent.completed_at || now,
  });

  await insertHistory(ctx, {
    task: parent,
    action: "status_changed",
    field_changed: "status",
    old_value: parent.status,
    new_value: "Completada",
    user: args.user,
  });

  await scheduleTaskEmail(ctx, {
    taskId: parent._id,
    type: "completed",
    actorId: args.user._id,
    occurredAt: now,
    operationKey: `auto-completed:${parent._id}:${now}`,
    detail: "Todas las subtareas fueron completadas, por lo que la tarea principal se cerró automáticamente.",
    oldValue: parent.status,
    newValue: "Completada",
  });
}

async function enrichTask(ctx: QueryCtx | MutationCtx, task: Doc<"tareas">) {
  const assignedUsers = await Promise.all(task.asignados.map((id) => ctx.db.get(id)));
  const assignedPartidas = await Promise.all((task.partidas || []).map((id) => ctx.db.get(id)));
  const creator = task.created_by_id ? await ctx.db.get(task.created_by_id) : null;
  const proyecto = task.proyecto ? await ctx.db.get(task.proyecto) : null;

  return {
    ...task,
    proyecto_nombre: proyecto?.nombre || "General",
    organization_id: task.organization_id || proyecto?.organization_id,
    tipo: task.tipo || (/^minuta\b/i.test(task.titulo) && !task.parent_task ? "minuta" : "tarea"),
    origen: task.origen || "usuario",
    assigned_users: assignedUsers
      .filter((user) => user !== null)
      .map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      })),
    assigned_partidas: assignedPartidas
      .filter((partida) => partida !== null)
      .map((partida) => ({
        _id: partida._id,
        nombre: partida.nombre,
        familia: partida.familia,
        sub_partida: partida.sub_partida,
        partida_nombre: partida.partida_nombre,
        nivel: partida.nivel,
      })),
    creator: creator
      ? {
        _id: creator._id,
        name: creator.name,
        email: creator.email,
      }
      : null,
  };
}

async function collectAccessibleTasks(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUserOrThrow(ctx);
  if (hasGlobalAdminAccess(user)) {
    return await ctx.db.query("tareas").collect();
  }

  const projects = await getUserDesarrollos(ctx);
  const projectTasks = await Promise.all(
    projects.map((project) =>
      ctx.db.query("tareas").withIndex("by_proyecto", (q) => q.eq("proyecto", project._id)).collect()
    )
  );
  const generalTasks = user.organization_id
    ? (await ctx.db
      .query("tareas")
      .withIndex("by_organization", (q) => q.eq("organization_id", user.organization_id))
      .collect()).filter((task) => !task.proyecto)
    : [];
  const byId = new Map([...projectTasks.flat(), ...generalTasks].map((task) => [task._id, task]));

  for (const task of Array.from(byId.values())) {
    if (!task.parent_task || byId.has(task.parent_task)) continue;
    const parent = await ctx.db.get(task.parent_task);
    if (parent && (
      parent.organization_id === user.organization_id ||
      Boolean(parent.proyecto && projects.some((project) => project._id === parent.proyecto))
    )) {
      byId.set(parent._id, parent);
    }
  }
  return Array.from(byId.values());
}

function sortTasks<T extends { status: string; position?: number; updated_at?: number; created_at: number }>(tasks: T[]) {
  return tasks.sort((a, b) => {
    if (a.position !== undefined || b.position !== undefined) {
      return (a.position ?? a.created_at) - (b.position ?? b.created_at);
    }
    const aCompleted = a.status === "Completada" ? 1 : 0;
    const bCompleted = b.status === "Completada" ? 1 : 0;
    if (aCompleted !== bCompleted) return aCompleted - bCompleted;
    return (b.updated_at || b.created_at) - (a.updated_at || a.created_at);
  });
}

function canSeeTaskHistory(user: Doc<"users">, task: Doc<"tareas">) {
  if (user.role === "admin") return true;
  return task.created_by_id === user._id || task.asignados.includes(user._id);
}

function hasMention(value: string | undefined, user: Doc<"users">) {
  if (!value) return false;

  const text = value.toLowerCase();
  const name = user.name.trim().toLowerCase();
  const email = user.email.trim().toLowerCase();

  return Boolean(
    (name && (text.includes(`@${name}`) || text.includes(name))) ||
    (email && (text.includes(`@${email}`) || text.includes(email)))
  );
}

function getNotificationType(item: Doc<"tarea_history">, task: Doc<"tareas">, user: Doc<"users">) {
  if (item.action === "comment_added" && hasMention(item.new_value, user)) {
    return "mention";
  }

  if (
    item.field_changed === "asignados" ||
    (item.action === "created" && task.asignados.includes(user._id))
  ) {
    return "assignment";
  }

  return "update";
}

async function getTaskNotificationItems(
  ctx: QueryCtx,
  args: {
    proyecto?: Id<"desarrollos">;
    organization_id?: string;
    user: Doc<"users">;
    lastReadAt: number;
    limit?: number;
    unreadOnly?: boolean;
  }
) {
  const takeLimit = Math.max((args.limit ?? 40) * 4, 80);
  let history: Doc<"tarea_history">[] = [];
  if (args.proyecto) {
    history = await ctx.db
      .query("tarea_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .order("desc")
      .take(takeLimit);
  } else if (args.organization_id) {
    history = (await ctx.db
      .query("tarea_history")
      .withIndex("by_organization", (q) => q.eq("organization_id", args.organization_id))
      .order("desc")
      .take(takeLimit)).filter((item) => !item.proyecto);
  }

  if (args.unreadOnly) {
    history = history.filter((item) => item.created_at > args.lastReadAt);
  }

  const enriched = [];
  for (const item of history) {
    const task = await ctx.db.get(item.tarea_id);
    if (!task || !canSeeTaskHistory(args.user, task)) {
      continue;
    }

    const individualRead = await ctx.db
      .query("tarea_notification_reads")
      .withIndex("by_user_history", (q) =>
        q.eq("user_id", args.user._id).eq("tarea_history_id", item._id)
      )
      .first();
    const isUnread = item.created_at > args.lastReadAt && !individualRead;

    if (args.unreadOnly && !isUnread) {
      continue;
    }

    enriched.push({
      ...item,
      is_unread: isUnread,
      notification_type: getNotificationType(item, task, args.user),
      task: {
        _id: task._id,
        titulo: task.titulo,
        status: task.status,
        prioridad: task.prioridad,
        fecha_limite: task.fecha_limite,
        asignados: task.asignados,
        created_by_id: task.created_by_id,
        created_by_name: task.created_by_name,
      },
    });

    if (enriched.length >= (args.limit ?? 40)) {
      break;
    }
  }

  return enriched;
}

export const getByProyecto = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    await ensureProjectAccess(ctx, args.proyecto);

    const projectTasks = await ctx.db
      .query("tareas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    const tasksById = new Map(projectTasks.map((task) => [task._id, task]));
    for (const task of projectTasks) {
      if (!task.parent_task || tasksById.has(task.parent_task)) continue;
      const parent = await ctx.db.get(task.parent_task);
      if (parent) tasksById.set(parent._id, parent);
    }

    const enriched = await Promise.all(Array.from(tasksById.values()).map((task) => enrichTask(ctx, task)));
    return sortTasks(enriched);
  },
});

export const getByProyectoPaginated = query({
  args: {
    proyecto: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await ensureProjectAccess(ctx, args.proyecto);

    const page = await ctx.db
      .query("tareas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .paginate(args.paginationOpts);

    const enriched = await Promise.all(page.page.map((task) => enrichTask(ctx, task)));

    return {
      ...page,
      page: sortTasks(enriched),
    };
  },
});

export const getAllAccessible = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await collectAccessibleTasks(ctx);
    const enriched = await Promise.all(tasks.map((task) => enrichTask(ctx, task)));
    return sortTasks(enriched);
  },
});

export const getCatalogs = query({
  args: {
    proyecto: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    if (args.proyecto) {
      await ensureProjectAccess(ctx, args.proyecto);
    }
    const tasks = args.proyecto
      ? await ctx.db.query("tareas").withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto)).collect()
      : await collectAccessibleTasks(ctx);
    const collectValues = (field: "status" | "prioridad" | "categoria") =>
      Array.from(
        new Set(
          tasks
            .map((task) => task[field])
            .filter((value): value is string => Boolean(value?.trim()))
        )
      ).sort((a, b) => a.localeCompare(b));

    return {
      statuses: collectValues("status"),
      priorities: collectValues("prioridad"),
      categories: collectValues("categoria"),
    };
  },
});

export const getDetail = query({
  args: {
    id: v.id("tareas"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    await ensureTaskAccess(ctx, task);

    const [enrichedTask, comments, history] = await Promise.all([
      enrichTask(ctx, task),
      ctx.db
        .query("tarea_comments")
        .withIndex("by_tarea", (q) => q.eq("tarea_id", args.id))
        .collect(),
      ctx.db
        .query("tarea_history")
        .withIndex("by_tarea", (q) => q.eq("tarea_id", args.id))
        .collect(),
    ]);

    return {
      task: enrichedTask,
      comments: comments.sort((a, b) => a.created_at - b.created_at),
      history: history.sort((a, b) => b.created_at - a.created_at),
    };
  },
});

export const getNotifications = query({
  args: {
    proyecto: v.id("desarrollos"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ensureProjectAccess(ctx, args.proyecto);
    const readStatus = await ctx.db
      .query("tarea_read_status")
      .withIndex("by_user_proyecto", (q) =>
        q.eq("user_id", user._id).eq("proyecto", args.proyecto)
      )
      .first();

    return await getTaskNotificationItems(ctx, {
      proyecto: args.proyecto,
      user,
      lastReadAt: readStatus?.last_read_at ?? 0,
      limit: args.limit ?? 40,
    });
  },
});

export const getAllNotifications = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const proyectos = await getUserDesarrollos(ctx);
    const limitPerProject = Math.max(args.limit ?? 60, 20);
    const accessibleTasks = await collectAccessibleTasks(ctx);
    const organizationIds = Array.from(new Set(
      accessibleTasks.filter((task) => !task.proyecto).map((task) => task.organization_id).filter((id): id is string => Boolean(id))
    ));

    const notificationsByProject = await Promise.all(
      proyectos.map(async (proyecto) => {
        const readStatus = await ctx.db
          .query("tarea_read_status")
          .withIndex("by_user_proyecto", (q) =>
            q.eq("user_id", user._id).eq("proyecto", proyecto._id)
          )
          .first();

        const items = await getTaskNotificationItems(ctx, {
          proyecto: proyecto._id,
          user,
          lastReadAt: readStatus?.last_read_at ?? 0,
          limit: limitPerProject,
        });

        return items.map((item) => ({
          ...item,
          proyecto_nombre: proyecto.nombre,
        }));
      })
    );

    const notificationsByOrganization = await Promise.all(
      organizationIds.map(async (organizationId) => {
        const readStatus = await ctx.db
          .query("tarea_read_status")
          .withIndex("by_user_organization", (q) =>
            q.eq("user_id", user._id).eq("organization_id", organizationId)
          )
          .first();
        const items = await getTaskNotificationItems(ctx, {
          organization_id: organizationId,
          user,
          lastReadAt: readStatus?.last_read_at ?? 0,
          limit: limitPerProject,
        });
        return items.map((item) => ({ ...item, proyecto_nombre: "General" }));
      })
    );

    return [...notificationsByProject, ...notificationsByOrganization]
      .flat()
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, args.limit ?? 60);
  },
});

export const getUnreadSummary = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const user = await ensureProjectAccess(ctx, args.proyecto);
    const readStatus = await ctx.db
      .query("tarea_read_status")
      .withIndex("by_user_proyecto", (q) =>
        q.eq("user_id", user._id).eq("proyecto", args.proyecto)
      )
      .first();

    const unreadItems = await getTaskNotificationItems(ctx, {
      proyecto: args.proyecto,
      user,
      lastReadAt: readStatus?.last_read_at ?? 0,
      limit: 100,
      unreadOnly: true,
    });

    return {
      total: unreadItems.length,
      hasAssignments: unreadItems.some((item) => item.notification_type === "assignment"),
      hasMentions: unreadItems.some((item) => item.notification_type === "mention"),
      hasUpdates: unreadItems.some((item) => item.notification_type === "update"),
    };
  },
});

export const getAllUnreadSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const proyectos = await getUserDesarrollos(ctx);
    const accessibleTasks = await collectAccessibleTasks(ctx);
    const organizationIds = Array.from(new Set(
      accessibleTasks.filter((task) => !task.proyecto).map((task) => task.organization_id).filter((id): id is string => Boolean(id))
    ));
    const unreadByProject = await Promise.all(
      proyectos.map(async (proyecto) => {
        const readStatus = await ctx.db
          .query("tarea_read_status")
          .withIndex("by_user_proyecto", (q) =>
            q.eq("user_id", user._id).eq("proyecto", proyecto._id)
          )
          .first();

        return await getTaskNotificationItems(ctx, {
          proyecto: proyecto._id,
          user,
          lastReadAt: readStatus?.last_read_at ?? 0,
          limit: 100,
          unreadOnly: true,
        });
      })
    );

    const unreadByOrganization = await Promise.all(
      organizationIds.map(async (organizationId) => {
        const readStatus = await ctx.db
          .query("tarea_read_status")
          .withIndex("by_user_organization", (q) =>
            q.eq("user_id", user._id).eq("organization_id", organizationId)
          )
          .first();
        return await getTaskNotificationItems(ctx, {
          organization_id: organizationId,
          user,
          lastReadAt: readStatus?.last_read_at ?? 0,
          limit: 100,
          unreadOnly: true,
        });
      })
    );

    const unreadItems = [...unreadByProject, ...unreadByOrganization].flat();
    return {
      total: unreadItems.length,
      hasAssignments: unreadItems.some((item) => item.notification_type === "assignment"),
      hasMentions: unreadItems.some((item) => item.notification_type === "mention"),
      hasUpdates: unreadItems.some((item) => item.notification_type === "update"),
    };
  },
});

export const markNotificationsAsRead = mutation({
  args: {
    proyecto: v.optional(v.id("desarrollos")),
    organization_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = args.proyecto
      ? await ensureProjectAccess(ctx, args.proyecto)
      : await getCurrentUserOrThrow(ctx);
    const proyectos = args.proyecto
      ? [{ _id: args.proyecto }]
      : await getUserDesarrollos(ctx);

    for (const proyecto of proyectos) {
      const existing = await ctx.db
        .query("tarea_read_status")
        .withIndex("by_user_proyecto", (q) =>
          q.eq("user_id", user._id).eq("proyecto", proyecto._id)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { last_read_at: Date.now() });
      } else {
        await ctx.db.insert("tarea_read_status", {
          user_id: user._id,
          proyecto: proyecto._id,
          last_read_at: Date.now(),
        });
      }
    }

    const organizationIds = args.organization_id
      ? [args.organization_id]
      : user.organization_id
        ? [user.organization_id]
        : Array.from(new Set((await ctx.db.query("tareas").collect()).map((task) => task.organization_id).filter((id): id is string => Boolean(id))));
    for (const organizationId of organizationIds) {
      const existing = await ctx.db
        .query("tarea_read_status")
        .withIndex("by_user_organization", (q) =>
          q.eq("user_id", user._id).eq("organization_id", organizationId)
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { last_read_at: Date.now() });
      } else {
        await ctx.db.insert("tarea_read_status", {
          user_id: user._id,
          organization_id: organizationId,
          last_read_at: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

export const markNotificationAsRead = mutation({
  args: {
    id: v.id("tarea_history"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) {
      throw new Error("Notification not found");
    }

    const task = await ctx.db.get(item.tarea_id);
    const user = task ? await ensureTaskAccess(ctx, task) : await getCurrentUserOrThrow(ctx);
    if (!task || !canSeeTaskHistory(user, task)) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db
      .query("tarea_notification_reads")
      .withIndex("by_user_history", (q) =>
        q.eq("user_id", user._id).eq("tarea_history_id", item._id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { read_at: Date.now() });
    } else {
      await ctx.db.insert("tarea_notification_reads", {
        user_id: user._id,
        tarea_history_id: item._id,
        proyecto: item.proyecto,
        organization_id: item.organization_id,
        read_at: Date.now(),
      });
    }

    return { success: true };
  },
});

export const getAssignableUsers = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const currentUser = await ensureProjectAccess(ctx, args.proyecto);
    const proyecto = await ctx.db.get(args.proyecto);
    if (!proyecto) {
      throw new Error("Project not found");
    }

    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => {
        if (hasGlobalAdminAccess(currentUser)) {
          return true;
        }

        const hasProjectAccess = user.allowed_desarrollos.includes(args.proyecto);
        const belongsToProjectOrganization =
          Boolean(proyecto.organization_id) &&
          user.organization_id === proyecto.organization_id;

        return hasProjectAccess || belongsToProjectOrganization;
      })
      .map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getAssignableUsersByProjects = query({
  args: {
    proyectos: v.array(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    const uniqueProjectIds = Array.from(new Set(args.proyectos));
    const currentUser = await getCurrentUserOrThrow(ctx);
    const users = await ctx.db.query("users").collect();
    const result: Record<string, {
      _id: Id<"users">;
      name: string;
      email: string;
      role: string;
    }[]> = {};

    for (const projectId of uniqueProjectIds) {
      const proyecto = await ctx.db.get(projectId);
      if (!proyecto) {
        result[projectId] = [];
        continue;
      }

      if (!hasGlobalAdminAccess(currentUser)) {
        const hasProjectAccess =
          (currentUser.role === "admin" && proyecto.organization_id === currentUser.organization_id) ||
          currentUser.allowed_desarrollos.includes(projectId);

        if (!hasProjectAccess) {
          result[projectId] = [];
          continue;
        }
      }

      result[projectId] = users
        .filter((user) => {
          if (hasGlobalAdminAccess(currentUser)) {
            return true;
          }

          const hasProjectAccess = user.allowed_desarrollos.includes(projectId);
          const belongsToProjectOrganization =
            Boolean(proyecto.organization_id) &&
            user.organization_id === proyecto.organization_id;

          return hasProjectAccess || belongsToProjectOrganization;
        })
        .map((user) => ({
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  },
});

export const getOrganizationScopes = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const users = await ctx.db.query("users").collect();
    const projects = await getUserDesarrollos(ctx);
    const ids = hasGlobalAdminAccess(currentUser)
      ? Array.from(new Set([
        ...users.map((user) => user.organization_id),
        ...projects.map((project) => project.organization_id),
      ].filter((id): id is string => Boolean(id))))
      : currentUser.organization_id ? [currentUser.organization_id] : [];

    return ids.map((organizationId) => {
      const admin = users.find((user) =>
        user.organization_id === organizationId && user.role === "admin" && !hasGlobalAdminAccess(user)
      );
      return {
        id: organizationId,
        label: admin?.name?.trim() || admin?.email || organizationId,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, "es"));
  },
});

export const getAssignableUsersForOrganization = query({
  args: { organization_id: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    if (!hasGlobalAdminAccess(currentUser) && currentUser.organization_id !== args.organization_id) {
      throw new Error("Unauthorized: No organization access");
    }
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organization_id", args.organization_id))
      .collect();
    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  },
});

export const create = mutation({
  args: {
    proyecto: v.optional(v.id("desarrollos")),
    organization_id: v.optional(v.string()),
    tipo: v.optional(v.union(v.literal("tarea"), v.literal("minuta"))),
    parent_task: v.optional(v.id("tareas")),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    asignados: v.array(v.id("users")),
    partidas: v.optional(v.array(v.id("partidas"))),
    status: v.optional(v.string()),
    prioridad: v.string(),
    fecha_limite: v.optional(v.string()),
    categoria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, organizationId } = await resolveScope(ctx, args);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    const titulo = args.titulo.trim();
    if (!titulo) {
      throw new Error("El título es obligatorio");
    }
    const tipo = args.parent_task ? "tarea" : (args.tipo || "tarea");
    await ensureAssignableUsersBelongToScope(
      ctx,
      args.asignados,
      { proyecto: args.proyecto, organization_id: organizationId },
    );
    if (args.parent_task) {
      const parent = await ctx.db.get(args.parent_task);
      if (!parent) throw new Error("La tarea padre no existe");
      const parentOrganization = await getTaskOrganization(ctx, parent);
      if (parentOrganization !== organizationId) {
        throw new Error("La subtarea debe pertenecer a la misma organización que la tarea padre");
      }
    }
    await ensurePartidasBelongToProject(ctx, args.partidas, args.proyecto);

    const now = Date.now();
    const taskId = await ctx.db.insert("tareas", {
      proyecto: args.proyecto,
      organization_id: organizationId,
      tipo,
      origen: "usuario",
      parent_task: args.parent_task,
      position: now,
      titulo,
      descripcion: args.descripcion?.trim() || undefined,
      asignados: args.asignados,
      partidas: args.partidas || [],
      created_by_id: user._id,
      created_by_name: user.name,
      status: args.status || "Pendiente",
      prioridad: args.prioridad,
      fecha_limite: args.fecha_limite,
      categoria: args.categoria,
      created_at: now,
    });

    await insertHistory(ctx, {
      task: { _id: taskId, proyecto: args.proyecto, organization_id: organizationId },
      action: "created",
      user,
      new_value: titulo,
    });

    if (args.asignados.length > 0) {
      await scheduleTaskEmail(ctx, {
        taskId,
        type: "assigned",
        actorId: user._id,
        recipientIds: args.asignados,
        occurredAt: now,
        operationKey: `created:${taskId}:${now}`,
      });
    }

    return taskId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tareas"),
    proyecto: v.optional(v.union(v.id("desarrollos"), v.null())),
    organization_id: v.optional(v.string()),
    tipo: v.optional(v.union(v.literal("tarea"), v.literal("minuta"))),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    asignados: v.array(v.id("users")),
    partidas: v.optional(v.array(v.id("partidas"))),
    status: v.string(),
    prioridad: v.string(),
    fecha_limite: v.optional(v.union(v.string(), v.null())),
    categoria: v.optional(v.string()),
    parent_task: v.optional(v.union(v.id("tareas"), v.null())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const user = await ensureTaskAccess(ctx, task);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    const titulo = args.titulo.trim();
    if (!titulo) {
      throw new Error("El título es obligatorio");
    }

    const now = Date.now();
    const nextProject = args.proyecto === undefined ? task.proyecto : args.proyecto ?? undefined;
    const nextFechaLimite = args.fecha_limite === undefined ? task.fecha_limite : args.fecha_limite ?? undefined;
    const nextParentTask = args.parent_task === undefined ? task.parent_task : args.parent_task ?? undefined;
    const resolved = await resolveScope(ctx, {
      proyecto: nextProject,
      organization_id: args.organization_id || task.organization_id,
    });
    const nextOrganizationId = resolved.organizationId;
    if (nextParentTask) {
      const parent = await ctx.db.get(nextParentTask);
      const parentOrganization = parent ? await getTaskOrganization(ctx, parent) : undefined;
      if (!parent || parentOrganization !== nextOrganizationId || parent._id === args.id) {
        throw new Error("La subtarea debe pertenecer a la misma organización que la tarea padre");
      }
    }
    const nextType = nextParentTask ? "tarea" : (args.tipo || task.tipo || "tarea");
    await ensureAssignableUsersBelongToScope(
      ctx,
      args.asignados,
      { proyecto: nextProject, organization_id: nextOrganizationId },
    );
    await ensurePartidasBelongToProject(ctx, args.partidas, nextProject);
    const nextTask = {
      proyecto: nextProject,
      organization_id: nextOrganizationId,
      tipo: nextType,
      parent_task: nextParentTask,
      titulo,
      descripcion: args.descripcion?.trim() || undefined,
      asignados: args.asignados,
      partidas: args.partidas || [],
      status: args.status,
      prioridad: args.prioridad,
      fecha_limite: nextFechaLimite,
      categoria: args.categoria,
      updated_at: now,
      completed_at: args.status === "Completada"
        ? (task.completed_at || now)
        : undefined,
    };

    const trackedFields: Array<keyof typeof nextTask> = [
      "proyecto",
      "organization_id",
      "tipo",
      "titulo",
      "descripcion",
      "asignados",
      "partidas",
      "status",
      "prioridad",
      "fecha_limite",
      "categoria",
      "parent_task",
    ];

    const changedFields = trackedFields.filter((field) => {
      const previous = task[field as keyof Doc<"tareas">];
      const next = nextTask[field];
      return JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null);
    });
    const changedNonStatusFields = changedFields.filter((field) => field !== "status");
    if (changedNonStatusFields.length > 0 && !canManageTask(user, task)) {
      throw new Error("Unauthorized: Only admins or creators can edit task details");
    }
    if (changedFields.includes("status") && !canUpdateTaskStatus(user, task)) {
      throw new Error("Unauthorized: Only assigned users or creators can update status");
    }

    await replaceTaskDocument(ctx, task, nextTask);

    if (nextProject !== task.proyecto || nextOrganizationId !== task.organization_id) {
      const [comments, history] = await Promise.all([
        ctx.db
          .query("tarea_comments")
          .withIndex("by_tarea", (q) => q.eq("tarea_id", args.id))
          .collect(),
        ctx.db
          .query("tarea_history")
          .withIndex("by_tarea", (q) => q.eq("tarea_id", args.id))
          .collect(),
      ]);

      for (const comment of comments) {
        await ctx.db.patch(comment._id, { proyecto: nextProject, organization_id: nextOrganizationId });
      }
      for (const item of history) {
        await ctx.db.patch(item._id, { proyecto: nextProject, organization_id: nextOrganizationId });
      }
    }

    const historyTask = { _id: task._id, proyecto: nextTask.proyecto, organization_id: nextOrganizationId };
    for (const field of changedFields) {
      const previous = task[field as keyof Doc<"tareas">];
      const next = nextTask[field];
      await insertHistory(ctx, {
        task: historyTask,
        action: field === "status" ? "status_changed" : "updated",
        field_changed: field,
        old_value: previous,
        new_value: next,
        user,
      });
    }

    if (changedFields.includes("asignados")) {
      const previousIds = new Set(task.asignados);
      const nextIds = new Set(nextTask.asignados);
      const added = nextTask.asignados.filter((id) => !previousIds.has(id));
      const removed = task.asignados.filter((id) => !nextIds.has(id));
      if (added.length > 0) {
        await scheduleTaskEmail(ctx, {
          taskId: task._id,
          type: "assigned",
          actorId: user._id,
          recipientIds: added,
          occurredAt: now,
          operationKey: `assigned:${task._id}:${now}`,
        });
      }
      if (removed.length > 0) {
        await scheduleTaskEmail(ctx, {
          taskId: task._id,
          type: "unassigned",
          actorId: user._id,
          recipientIds: removed,
          occurredAt: now,
          operationKey: `unassigned:${task._id}:${now}`,
        });
      }
    }
    if (changedFields.includes("status")) {
      await scheduleTaskEmail(ctx, {
        taskId: task._id,
        type: notificationTypeForStatus(task.status, nextTask.status),
        actorId: user._id,
        occurredAt: now,
        operationKey: `status:${task._id}:${now}`,
        oldValue: task.status,
        newValue: nextTask.status,
      });
    }
    if (changedFields.includes("fecha_limite")) {
      await scheduleTaskEmail(ctx, {
        taskId: task._id,
        type: "due_date_changed",
        actorId: user._id,
        occurredAt: now,
        operationKey: `due-date:${task._id}:${now}`,
        oldValue: task.fecha_limite,
        newValue: nextTask.fecha_limite,
      });
    }
    if (changedFields.includes("prioridad")) {
      await scheduleTaskEmail(ctx, {
        taskId: task._id,
        type: "priority_changed",
        actorId: user._id,
        occurredAt: now,
        operationKey: `priority:${task._id}:${now}`,
        oldValue: task.prioridad,
        newValue: nextTask.prioridad,
      });
    }

    await completeParentIfAllChildrenDone(ctx, {
      parentTaskId: nextTask.parent_task,
      user,
    });

    return { success: true };
  },
});

export const duplicate = mutation({
  args: {
    id: v.id("tareas"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const user = await ensureTaskAccess(ctx, task);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("tareas", {
      proyecto: task.proyecto,
      organization_id: task.organization_id,
      tipo: task.tipo || "tarea",
      origen: "usuario",
      parent_task: task.parent_task,
      position: now,
      titulo: `${task.titulo} copia`,
      descripcion: task.descripcion,
      asignados: task.asignados,
      partidas: task.partidas || [],
      created_by_id: user._id,
      created_by_name: user.name,
      status: "Pendiente",
      prioridad: task.prioridad,
      fecha_limite: task.fecha_limite,
      categoria: task.categoria,
      created_at: now,
    });

    await insertHistory(ctx, {
      task: { _id: taskId, proyecto: task.proyecto, organization_id: task.organization_id },
      action: "created",
      user,
      new_value: `${task.titulo} copia`,
    });

    if (task.asignados.length > 0) {
      await scheduleTaskEmail(ctx, {
        taskId,
        type: "assigned",
        actorId: user._id,
        recipientIds: task.asignados,
        occurredAt: now,
        operationKey: `duplicated:${taskId}:${now}`,
      });
    }

    return taskId;
  },
});

export const reorderSiblings = mutation({
  args: {
    orderedIds: v.array(v.id("tareas")),
  },
  handler: async (ctx, args) => {
    if (args.orderedIds.length === 0) {
      return { success: true };
    }

    const tasks = [];
    for (const id of args.orderedIds) {
      const task = await ctx.db.get(id);
      if (!task) {
        throw new Error("Task not found");
      }
      tasks.push(task);
    }

    const [firstTask] = tasks;
    const user = await ensureTaskAccess(ctx, firstTask);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    for (const task of tasks) {
      if (task.proyecto !== firstTask.proyecto || task.organization_id !== firstTask.organization_id || task.parent_task !== firstTask.parent_task) {
        throw new Error("Solo se pueden reordenar tareas del mismo nivel");
      }
      if (!canManageTask(user, task)) {
        throw new Error("Unauthorized: Only admins or creators can reorder tasks");
      }
    }

    const now = Date.now();
    for (const [index, task] of tasks.entries()) {
      await ctx.db.patch(task._id, {
        position: now + index,
        updated_at: now,
      });
    }

    return { success: true };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tareas"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const user = await ensureTaskAccess(ctx, task);
    if (!canWrite(user.role) || !canUpdateTaskStatus(user, task)) {
      throw new Error("Unauthorized: Only assigned users or creators can update status");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      updated_at: now,
      completed_at: args.status === "Completada"
        ? (task.completed_at || now)
        : undefined,
    });

    if (task.status !== args.status) {
      await insertHistory(ctx, {
        task,
        action: "status_changed",
        field_changed: "status",
        old_value: task.status,
        new_value: args.status,
        user,
      });

      await scheduleTaskEmail(ctx, {
        taskId: task._id,
        type: notificationTypeForStatus(task.status, args.status),
        actorId: user._id,
        occurredAt: now,
        operationKey: `status:${task._id}:${now}`,
        oldValue: task.status,
        newValue: args.status,
      });
    }

    await completeParentIfAllChildrenDone(ctx, {
      parentTaskId: task.parent_task,
      user,
    });

    return { success: true };
  },
});

export const addComment = mutation({
  args: {
    id: v.id("tareas"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const user = await ensureTaskAccess(ctx, task);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    const comment = args.comment.trim();
    if (!comment) {
      throw new Error("El comentario es obligatorio");
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("tarea_comments", {
      tarea_id: args.id,
      proyecto: task.proyecto,
      organization_id: task.organization_id,
      user_id: user._id,
      user_name: user.name,
      comment,
      created_at: now,
    });

    await insertHistory(ctx, {
      task,
      action: "comment_added",
      field_changed: "comment",
      new_value: comment,
      user,
    });

    const followerIds = taskFollowerIds(task);
    const followerUsers = (await Promise.all(followerIds.map((id) => ctx.db.get(id))))
      .filter((candidate) => candidate !== null);
    const mentionedIds = followerUsers
      .filter((candidate) => candidate._id !== user._id && hasMention(comment, candidate))
      .map((candidate) => candidate._id);
    if (mentionedIds.length > 0) {
      await scheduleTaskEmail(ctx, {
        taskId: task._id,
        type: "mentioned",
        actorId: user._id,
        recipientIds: mentionedIds,
        detail: comment,
        occurredAt: now,
        operationKey: `mention:${task._id}:${commentId}`,
      });
    }
    const mentionedSet = new Set(mentionedIds);
    const commentRecipients = followerIds.filter((id) => id !== user._id && !mentionedSet.has(id));
    if (commentRecipients.length > 0) {
      await scheduleTaskEmail(ctx, {
        taskId: task._id,
        type: "comment_added",
        actorId: user._id,
        recipientIds: commentRecipients,
        detail: comment,
        occurredAt: now,
        operationKey: `comment:${task._id}:${commentId}`,
      });
    }

    return commentId;
  },
});

export const removeComment = mutation({
  args: {
    id: v.id("tarea_comments"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) {
      throw new Error("Comment not found");
    }

    const user = await ensureTaskAccess(ctx, comment);
    if (user.role !== "admin" && comment.user_id !== user._id) {
      throw new Error("Unauthorized: Only admins or comment authors can delete comments");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const remove = mutation({
  args: {
    id: v.id("tareas"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const user = await ensureTaskAccess(ctx, task);
    if (!canManageTask(user, task)) {
      throw new Error("Unauthorized: Only admins or creators can delete tasks");
    }

    await deleteTaskTree(ctx, args.id);
    return { success: true };
  },
});

function mexicoCityWeekStart(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = new Date(`${values.year}-${values.month}-${values.day}T12:00:00.000Z`);
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

function weeklyMinuteTitle(weekStart: string) {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  const day = date.getUTCDate();
  const month = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(date);
  return `Minuta Semana ${day} ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

export const generateWeeklyMinutes = internalMutation({
  args: { timestamp: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.timestamp ?? Date.now();
    const weekStart = mexicoCityWeekStart(now);

    const legacyTasks = await ctx.db.query("tareas").collect();
    for (const task of legacyTasks) {
      if (task.organization_id && task.tipo && task.origen) continue;
      const project = task.proyecto ? await ctx.db.get(task.proyecto) : null;
      await ctx.db.patch(task._id, {
        organization_id: task.organization_id || project?.organization_id,
        tipo: task.tipo || (/^minuta\b/i.test(task.titulo) && !task.parent_task ? "minuta" : "tarea"),
        origen: task.origen || "usuario",
      });
    }

    const projects = await ctx.db.query("desarrollos").collect();
    const organizationIds = Array.from(new Set(
      projects
        .filter((project) => project.status !== "Cancelado")
        .map((project) => project.organization_id)
        .filter((id): id is string => Boolean(id))
    ));

    let created = 0;
    for (const organizationId of organizationIds) {
      const existing = await ctx.db
        .query("tareas")
        .withIndex("by_organization_week", (q) =>
          q.eq("organization_id", organizationId).eq("week_start", weekStart)
        )
        .filter((q) => q.eq(q.field("tipo"), "minuta"))
        .first();
      if (existing) continue;

      await ctx.db.insert("tareas", {
        organization_id: organizationId,
        tipo: "minuta",
        origen: "sistema",
        week_start: weekStart,
        position: now,
        titulo: weeklyMinuteTitle(weekStart),
        asignados: [],
        partidas: [],
        created_by_name: "Sistema",
        status: "Pendiente",
        prioridad: "Media",
        categoria: "General",
        created_at: now,
      });
      created += 1;
    }

    return { created, weekStart };
  },
});
