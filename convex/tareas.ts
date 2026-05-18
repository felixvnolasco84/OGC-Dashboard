import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./permissions";

const WRITE_ROLES = new Set(["admin", "user", "contratista", "finance"]);

async function ensureProjectAccess(ctx: Parameters<typeof getCurrentUserOrThrow>[0], proyecto: Id<"desarrollos">) {
  const user = await getCurrentUserOrThrow(ctx);

  if (user.role === "admin") {
    return user;
  }

  if (!user.allowed_desarrollos.includes(proyecto)) {
    throw new Error("Unauthorized: No project access");
  }

  return user;
}

function canWrite(role: string) {
  return WRITE_ROLES.has(role);
}

async function enrichTask(ctx: Parameters<typeof getCurrentUserOrThrow>[0], task: Doc<"tareas">) {
  const assignedUsers = await Promise.all(task.asignados.map((id) => ctx.db.get(id)));
  const creator = await ctx.db.get(task.created_by_id);

  return {
    ...task,
    assigned_users: assignedUsers
      .filter((user) => user !== null)
      .map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
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

export const getByProyecto = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    await ensureProjectAccess(ctx, args.proyecto);

    const tasks = await ctx.db
      .query("tareas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    const enriched = await Promise.all(tasks.map((task) => enrichTask(ctx, task)));
    return enriched.sort((a, b) => {
      const aCompleted = a.status === "Completada" ? 1 : 0;
      const bCompleted = b.status === "Completada" ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      return (b.updated_at || b.created_at) - (a.updated_at || a.created_at);
    });
  },
});

export const getAssignableUsers = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    await ensureProjectAccess(ctx, args.proyecto);

    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => user.role === "admin" || user.allowed_desarrollos.includes(args.proyecto))
      .map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    asignados: v.array(v.id("users")),
    prioridad: v.string(),
    fecha_limite: v.optional(v.string()),
    categoria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ensureProjectAccess(ctx, args.proyecto);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    const titulo = args.titulo.trim();
    if (!titulo) {
      throw new Error("El titulo es obligatorio");
    }

    const taskId = await ctx.db.insert("tareas", {
      proyecto: args.proyecto,
      titulo,
      descripcion: args.descripcion?.trim() || undefined,
      asignados: args.asignados,
      created_by_id: user._id,
      created_by_name: user.name,
      status: "Pendiente",
      prioridad: args.prioridad,
      fecha_limite: args.fecha_limite,
      categoria: args.categoria,
      created_at: Date.now(),
    });

    return taskId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tareas"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    asignados: v.array(v.id("users")),
    status: v.string(),
    prioridad: v.string(),
    fecha_limite: v.optional(v.string()),
    categoria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const user = await ensureProjectAccess(ctx, task.proyecto);
    if (!canWrite(user.role)) {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    const titulo = args.titulo.trim();
    if (!titulo) {
      throw new Error("El titulo es obligatorio");
    }

    await ctx.db.patch(args.id, {
      titulo,
      descripcion: args.descripcion?.trim() || undefined,
      asignados: args.asignados,
      status: args.status,
      prioridad: args.prioridad,
      fecha_limite: args.fecha_limite,
      categoria: args.categoria,
      updated_at: Date.now(),
      completed_at: args.status === "Completada"
        ? (task.completed_at || Date.now())
        : undefined,
    });

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

    const user = await ensureProjectAccess(ctx, task.proyecto);
    const isAssigned = task.asignados.includes(user._id);
    if (!canWrite(user.role) || (user.role !== "admin" && !isAssigned && task.created_by_id !== user._id)) {
      throw new Error("Unauthorized: Only assigned users or creators can update status");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      updated_at: Date.now(),
      completed_at: args.status === "Completada"
        ? (task.completed_at || Date.now())
        : undefined,
    });

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

    const user = await ensureProjectAccess(ctx, task.proyecto);
    if (user.role !== "admin" && task.created_by_id !== user._id) {
      throw new Error("Unauthorized: Only admins or creators can delete tasks");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
