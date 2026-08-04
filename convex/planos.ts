import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canUserAccessDesarrollo,
  getCurrentUserOrThrow,
} from "./permissions";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_MENTIONS_PER_COMMENT = 20;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type AppCtx = QueryCtx | MutationCtx;

type MentionInput = {
  user_id: Id<"users">;
  start: number;
  end: number;
  label: string;
};

async function ensureProjectAccess(
  ctx: AppCtx,
  proyecto: Id<"desarrollos">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const project = await ctx.db.get(proyecto);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("Proyecto no encontrado o sin acceso");
  }
  return { user, project };
}

async function ensureProjectWriteAccess(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
) {
  const access = await ensureProjectAccess(ctx, proyecto);
  if (access.user.role === "viewer") {
    throw new Error("Unauthorized: Viewer role is read-only");
  }
  return access;
}

async function getPlanOrThrow(ctx: AppCtx, planoId: Id<"planos">) {
  const plano = await ctx.db.get(planoId);
  if (!plano) throw new Error("Plano no encontrado");
  await ensureProjectAccess(ctx, plano.proyecto);
  if (plano.deleting_at) throw new Error("El plano se está eliminando");
  return plano;
}

async function getWritablePlanOrThrow(
  ctx: MutationCtx,
  planoId: Id<"planos">,
) {
  const plano = await getPlanOrThrow(ctx, planoId);
  await ensureProjectWriteAccess(ctx, plano.proyecto);
  return plano;
}

function canManageRecord(user: Doc<"users">, ownerId: Id<"users">) {
  return user.role === "admin" || user._id === ownerId;
}

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} es obligatorio`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} no puede exceder ${maxLength} caracteres`);
  }
  return normalized;
}

function optionalText(value: string | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new Error(`El valor no puede exceder ${maxLength} caracteres`);
  }
  return normalized;
}

function optionalRelativePath(value: string | undefined) {
  const normalized = value?.trim().replace(/\\/g, "/");
  if (!normalized) return undefined;
  if (normalized.length > 500) {
    throw new Error("La ruta relativa no puede exceder 500 caracteres");
  }
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("La ruta relativa del plano no es válida");
  }
  return normalized;
}

function normalizeFolderName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

function normalizedCoordinate(value: number | undefined, field: string) {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} debe estar entre 0 y 1`);
  }
  return value;
}

function isPlaceholderEmail(value: string) {
  return !value || value.endsWith("@pending.invalid");
}

function fallbackNameFromEmail(email: string) {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Usuario sin perfil";
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toLocaleUpperCase("es") + part.slice(1))
    .join(" ");
}

async function getMentionableProjectUsers(
  ctx: AppCtx,
  proyecto: Id<"desarrollos">,
) {
  const { project } = await ensureProjectAccess(ctx, proyecto);
  const users = await ctx.db.query("users").collect();

  return users
    .filter((user) => canUserAccessDesarrollo(user, project))
    .map((user) => {
      const email = user.email.trim().toLocaleLowerCase("es");
      const storedName = user.name.trim();
      const hasPlaceholderName =
        !storedName || storedName === email || storedName.endsWith("@pending.invalid");
      return {
        _id: user._id,
        clerkId: user.clerkId,
        name: hasPlaceholderName ? fallbackNameFromEmail(email) : storedName,
        email: email || "Correo no disponible",
        role: user.role,
        identity_incomplete: hasPlaceholderName || isPlaceholderEmail(email),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

async function resolveMentions(
  ctx: AppCtx,
  proyecto: Id<"desarrollos">,
  rawText: string,
  normalizedText: string,
  requestedMentions: MentionInput[],
) {
  if (requestedMentions.length > MAX_MENTIONS_PER_COMMENT) {
    throw new Error(
      `Puedes mencionar hasta ${MAX_MENTIONS_PER_COMMENT} integrantes por comentario`,
    );
  }

  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const normalizedMentions = requestedMentions
    .map((mention) => ({
      ...mention,
      start: mention.start - leadingWhitespace,
      end: mention.end - leadingWhitespace,
    }))
    .sort((a, b) => a.start - b.start);

  const uniqueMentionedUserIds = new Set<string>();
  let previousMentionEnd = -1;
  for (const mention of normalizedMentions) {
    if (
      !Number.isInteger(mention.start) ||
      !Number.isInteger(mention.end) ||
      mention.start < 0 ||
      mention.end <= mention.start ||
      mention.end > normalizedText.length
    ) {
      throw new Error("La posición de una mención no es válida");
    }
    if (mention.start < previousMentionEnd) {
      throw new Error("Las menciones no pueden superponerse");
    }
    if (normalizedText.slice(mention.start, mention.end) !== mention.label) {
      throw new Error("El texto de una mención fue modificado");
    }
    if (uniqueMentionedUserIds.has(mention.user_id)) {
      throw new Error("No puedes mencionar dos veces al mismo integrante");
    }
    uniqueMentionedUserIds.add(mention.user_id);
    previousMentionEnd = mention.end;
  }

  const mentionableUsers = await getMentionableProjectUsers(ctx, proyecto);
  const mentionableUsersById = new Map(
    mentionableUsers.map((user) => [user._id, user]),
  );

  return normalizedMentions.map((mention) => {
    const mentionedUser = mentionableUsersById.get(mention.user_id);
    if (!mentionedUser) {
      throw new Error("Solo puedes mencionar integrantes con acceso al proyecto");
    }

    const normalizedLabel = mention.label.toLocaleLowerCase("es");
    const validLabels = [mentionedUser.name, mentionedUser.email]
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => `@${value}`.toLocaleLowerCase("es"));
    const labelName = mention.label.startsWith("@")
      ? mention.label.slice(1).trim()
      : "";
    const canUseIdentityFallback =
      mentionedUser.identity_incomplete &&
      Boolean(labelName) &&
      labelName.length <= 160 &&
      !/[\r\n]/.test(labelName);
    if (!validLabels.includes(normalizedLabel) && !canUseIdentityFallback) {
      throw new Error(
        `La etiqueta de ${mentionedUser.name} ya no coincide con su perfil`,
      );
    }

    return {
      user_id: mentionedUser._id,
      name: validLabels.includes(normalizedLabel)
        ? mentionedUser.name
        : labelName,
      email: mentionedUser.email,
      start: mention.start,
      end: mention.end,
      label: mention.label,
    };
  });
}

async function createMentionNotifications(
  ctx: MutationCtx,
  args: {
    proyecto: Id<"desarrollos">;
    planoId: Id<"planos">;
    annotationId?: Id<"plano_anotaciones">;
    commentId?: Id<"plano_comentarios">;
    actor: Doc<"users">;
    text: string;
    mentions: Array<{
      user_id: Id<"users">;
      name: string;
      email: string;
    }>;
    createdAt: number;
  },
) {
  for (const mentionedUser of args.mentions) {
    if (mentionedUser.user_id === args.actor._id) continue;
    await ctx.db.insert("plano_mention_notifications", {
      proyecto: args.proyecto,
      plano_id: args.planoId,
      anotacion_id: args.annotationId,
      comentario_id: args.commentId,
      recipient_user_id: mentionedUser.user_id,
      actor_id: args.actor._id,
      actor_name: args.actor.name,
      comment_excerpt:
        args.text.length > 180 ? `${args.text.slice(0, 177)}...` : args.text,
      created_at: args.createdAt,
    });
  }
}

async function adjustPlanCounters(
  ctx: MutationCtx,
  planId: Id<"planos">,
  deltas: {
    annotations?: number;
    openAnnotations?: number;
    comments?: number;
  },
) {
  const plan = await ctx.db.get(planId);
  if (!plan) return;
  const patch: {
    annotation_count?: number;
    open_annotation_count?: number;
    comment_count?: number;
  } = {};
  if (deltas.annotations && typeof plan.annotation_count === "number") {
    patch.annotation_count = Math.max(0, plan.annotation_count + deltas.annotations);
  }
  if (deltas.openAnnotations && typeof plan.open_annotation_count === "number") {
    patch.open_annotation_count = Math.max(
      0,
      plan.open_annotation_count + deltas.openAnnotations,
    );
  }
  if (deltas.comments && typeof plan.comment_count === "number") {
    patch.comment_count = Math.max(0, plan.comment_count + deltas.comments);
  }
  if (Object.keys(patch).length > 0) await ctx.db.patch(planId, patch);
}

async function removeCommentNotifications(
  ctx: MutationCtx,
  commentId: Id<"plano_comentarios">,
) {
  const notifications = await ctx.db
    .query("plano_mention_notifications")
    .withIndex("by_comment", (q) => q.eq("comentario_id", commentId))
    .collect();
  for (const notification of notifications) await ctx.db.delete(notification._id);
}

async function canSeeProject(
  ctx: AppCtx,
  user: Doc<"users">,
  proyecto: Id<"desarrollos">,
) {
  const project = await ctx.db.get(proyecto);
  return Boolean(project && canUserAccessDesarrollo(user, project));
}

export const getMentionableUsers = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => getMentionableProjectUsers(ctx, args.proyecto),
});

export const getMentionNotifications = query({
  args: {
    proyecto: v.optional(v.id("desarrollos")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = args.proyecto
      ? (await ensureProjectAccess(ctx, args.proyecto)).user
      : await getCurrentUserOrThrow(ctx);
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const candidates = args.proyecto
      ? await ctx.db
          .query("plano_mention_notifications")
          .withIndex("by_recipient_project", (q) =>
            q.eq("recipient_user_id", user._id).eq("proyecto", args.proyecto!),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("plano_mention_notifications")
          .withIndex("by_recipient", (q) => q.eq("recipient_user_id", user._id))
          .order("desc")
          .take(200);

    const visible = [];
    for (const notification of candidates) {
      if (args.proyecto || (await canSeeProject(ctx, user, notification.proyecto))) {
        visible.push(notification);
      }
      if (visible.length === limit) break;
    }

    return Promise.all(
      visible.map(async (notification) => {
        const [plano, annotation, project] = await Promise.all([
          ctx.db.get(notification.plano_id),
          notification.anotacion_id
            ? ctx.db.get(notification.anotacion_id)
            : Promise.resolve(null),
          ctx.db.get(notification.proyecto),
        ]);
        return {
          ...notification,
          plano_titulo: plano?.titulo || "Plano no disponible",
          proyecto_nombre: project?.nombre || "Proyecto no disponible",
          pagina: annotation?.pagina,
          is_unread: !notification.read_at,
        };
      }),
    );
  },
});

export const getUnreadMentionCount = query({
  args: { proyecto: v.optional(v.id("desarrollos")) },
  handler: async (ctx, args) => {
    const user = args.proyecto
      ? (await ensureProjectAccess(ctx, args.proyecto)).user
      : await getCurrentUserOrThrow(ctx);
    const candidates = args.proyecto
      ? await ctx.db
          .query("plano_mention_notifications")
          .withIndex("by_recipient_project_read", (q) =>
            q
              .eq("recipient_user_id", user._id)
              .eq("proyecto", args.proyecto!)
              .eq("read_at", undefined),
          )
          .take(100)
      : await ctx.db
          .query("plano_mention_notifications")
          .withIndex("by_recipient_read", (q) =>
            q.eq("recipient_user_id", user._id).eq("read_at", undefined),
          )
          .take(200);

    if (args.proyecto) return candidates.length;
    let count = 0;
    for (const notification of candidates) {
      if (await canSeeProject(ctx, user, notification.proyecto)) count += 1;
      if (count === 100) break;
    }
    return count;
  },
});

export const markMentionNotificationsRead = mutation({
  args: {
    proyecto: v.optional(v.id("desarrollos")),
    notification_ids: v.optional(v.array(v.id("plano_mention_notifications"))),
  },
  handler: async (ctx, args) => {
    const user = args.proyecto
      ? (await ensureProjectAccess(ctx, args.proyecto)).user
      : await getCurrentUserOrThrow(ctx);
    if ((args.notification_ids?.length || 0) > 100) {
      throw new Error("Solo se pueden actualizar 100 notificaciones por lote");
    }

    const candidates = args.notification_ids
      ? (await Promise.all(args.notification_ids.map((id) => ctx.db.get(id))))
          .filter(
            (item): item is Doc<"plano_mention_notifications"> =>
              Boolean(
                item &&
                  item.recipient_user_id === user._id &&
                  (!args.proyecto || item.proyecto === args.proyecto),
              ),
          )
      : args.proyecto
        ? await ctx.db
            .query("plano_mention_notifications")
            .withIndex("by_recipient_project_read", (q) =>
              q
                .eq("recipient_user_id", user._id)
                .eq("proyecto", args.proyecto!)
                .eq("read_at", undefined),
            )
            .take(100)
        : await ctx.db
            .query("plano_mention_notifications")
            .withIndex("by_recipient_read", (q) =>
              q.eq("recipient_user_id", user._id).eq("read_at", undefined),
            )
            .take(200);

    const notifications = [];
    for (const notification of candidates) {
      if (args.proyecto || (await canSeeProject(ctx, user, notification.proyecto))) {
        notifications.push(notification);
      }
      if (notifications.length === 100) break;
    }

    const now = Date.now();
    for (const notification of notifications) {
      if (!notification.read_at) await ctx.db.patch(notification._id, { read_at: now });
    }
    return {
      success: true,
      updated: notifications.length,
      has_more: !args.notification_ids && notifications.length === 100,
    };
  },
});

export const getByProject = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await ensureProjectAccess(ctx, args.proyecto);
    const planos = await ctx.db
      .query("planos")
      .withIndex("by_proyecto_created", (q) => q.eq("proyecto", args.proyecto))
      .order("desc")
      .collect();

    return Promise.all(
      planos
        .filter((plano) => !plano.deleting_at)
        .map(async (plano) => {
          const hasCounters =
            typeof plano.annotation_count === "number" &&
            typeof plano.open_annotation_count === "number" &&
            typeof plano.comment_count === "number";
          const [annotations, comments, url] = await Promise.all([
            hasCounters
              ? Promise.resolve([])
              : ctx.db
                  .query("plano_anotaciones")
                  .withIndex("by_plano", (q) => q.eq("plano_id", plano._id))
                  .collect(),
            hasCounters
              ? Promise.resolve([])
              : ctx.db
                  .query("plano_comentarios")
                  .withIndex("by_plano", (q) => q.eq("plano_id", plano._id))
                  .collect(),
            ctx.storage.getUrl(plano.storage_id),
          ]);
          const visibleAnnotations = annotations.filter((item) => !item.deleting_at);
          return {
            ...plano,
            url,
            annotation_count: plano.annotation_count ?? visibleAnnotations.length,
            open_annotation_count:
              plano.open_annotation_count ??
              visibleAnnotations.filter((item) => item.status === "Abierta").length,
            comment_count: plano.comment_count ?? comments.length,
          };
        }),
    );
  },
});

export const getFoldersByProject = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await ensureProjectAccess(ctx, args.proyecto);
    const [folders, plans] = await Promise.all([
      ctx.db
        .query("plano_carpetas")
        .withIndex("by_proyecto_created", (q) => q.eq("proyecto", args.proyecto))
        .order("desc")
        .collect(),
      ctx.db
        .query("planos")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
        .collect(),
    ]);
    const planCountByFolder = new Map<string, number>();
    for (const plan of plans) {
      if (!plan.carpeta_id || plan.deleting_at) continue;
      planCountByFolder.set(
        plan.carpeta_id,
        (planCountByFolder.get(plan.carpeta_id) || 0) + 1,
      );
    }
    return folders
      .map((folder) => ({
        ...folder,
        plan_count: planCountByFolder.get(folder._id) || 0,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  },
});

export const getDetail = query({
  args: { plano_id: v.id("planos") },
  handler: async (ctx, args) => {
    const plano = await getPlanOrThrow(ctx, args.plano_id);
    const [annotations, comments, url] = await Promise.all([
      ctx.db
        .query("plano_anotaciones")
        .withIndex("by_plano", (q) => q.eq("plano_id", args.plano_id))
        .collect(),
      ctx.db
        .query("plano_comentarios")
        .withIndex("by_plano", (q) => q.eq("plano_id", args.plano_id))
        .collect(),
      ctx.storage.getUrl(plano.storage_id),
    ]);
    const commentCountByAnnotation = new Map<string, number>();
    for (const comment of comments) {
      if (!comment.anotacion_id) continue;
      commentCountByAnnotation.set(
        comment.anotacion_id,
        (commentCountByAnnotation.get(comment.anotacion_id) || 0) + 1,
      );
    }
    return {
      ...plano,
      url,
      annotations: annotations
        .filter((annotation) => !annotation.deleting_at)
        .map((annotation) => ({
          ...annotation,
          comment_count: commentCountByAnnotation.get(annotation._id) || 0,
        }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "Abierta" ? -1 : 1;
          return b.created_at - a.created_at;
        }),
      comments: comments.sort((a, b) => a.created_at - b.created_at),
    };
  },
});

export const generateUploadUrl = mutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await ensureProjectWriteAccess(ctx, args.proyecto);
    return ctx.storage.generateUploadUrl();
  },
});

export const createFolder = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    nombre: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProjectWriteAccess(ctx, args.proyecto);
    const nombre = requiredText(args.nombre, "El nombre de la carpeta", 160);
    if (/[\\/:*?"<>|]/.test(nombre)) {
      throw new Error("El nombre de la carpeta contiene caracteres no permitidos");
    }
    const normalizedName = normalizeFolderName(nombre);
    const folders = await ctx.db
      .query("plano_carpetas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    const existing = folders.find(
      (folder) => normalizeFolderName(folder.nombre) === normalizedName,
    );
    if (existing) return existing._id;

    return ctx.db.insert("plano_carpetas", {
      proyecto: args.proyecto,
      nombre,
      created_by_id: user._id,
      created_by_name: user.name,
      created_at: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    carpeta_id: v.optional(v.id("plano_carpetas")),
    ruta_relativa: v.optional(v.string()),
    storage_id: v.id("_storage"),
    nombre_archivo: v.string(),
    titulo: v.string(),
    numero: v.optional(v.string()),
    disciplina: v.optional(v.string()),
    revision: v.optional(v.string()),
    status: v.string(),
    type: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProjectWriteAccess(ctx, args.proyecto);
    if (args.carpeta_id) {
      const folder = await ctx.db.get(args.carpeta_id);
      if (!folder || folder.proyecto !== args.proyecto) {
        throw new Error("La carpeta no pertenece a este proyecto");
      }
      if (args.type !== "application/pdf") {
        throw new Error("Las carpetas de planos solo admiten archivos PDF");
      }
    }
    if (!ALLOWED_FILE_TYPES.has(args.type)) {
      throw new Error("Formato no compatible. Usa PDF, JPG, PNG o WebP");
    }
    if (!Number.isFinite(args.size) || args.size <= 0 || args.size > MAX_FILE_SIZE) {
      throw new Error("El archivo debe pesar menos de 50 MB");
    }

    return ctx.db.insert("planos", {
      proyecto: args.proyecto,
      carpeta_id: args.carpeta_id,
      ruta_relativa: optionalRelativePath(args.ruta_relativa),
      storage_id: args.storage_id,
      nombre_archivo: requiredText(args.nombre_archivo, "El nombre del archivo", 240),
      titulo: requiredText(args.titulo, "El título", 160),
      numero: optionalText(args.numero, 80),
      disciplina: optionalText(args.disciplina, 80),
      revision: optionalText(args.revision, 40),
      status: args.status === "Borrador" ? "Borrador" : "Vigente",
      type: args.type,
      size: args.size,
      uploaded_by_id: user._id,
      uploaded_by_name: user.name,
      annotation_count: 0,
      open_annotation_count: 0,
      comment_count: 0,
      created_at: Date.now(),
    });
  },
});

export const updateMetadata = mutation({
  args: {
    plano_id: v.id("planos"),
    titulo: v.string(),
    numero: v.optional(v.string()),
    disciplina: v.optional(v.string()),
    revision: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const plano = await getWritablePlanOrThrow(ctx, args.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    if (!canManageRecord(user, plano.uploaded_by_id)) {
      throw new Error("Solo el autor o un administrador puede editar el plano");
    }
    await ctx.db.patch(args.plano_id, {
      titulo: requiredText(args.titulo, "El título", 160),
      numero: optionalText(args.numero, 80),
      disciplina: optionalText(args.disciplina, 80),
      revision: optionalText(args.revision, 40),
      status: ["Vigente", "Borrador", "Archivado"].includes(args.status)
        ? args.status
        : plano.status,
      updated_at: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { plano_id: v.id("planos") },
  handler: async (ctx, args) => {
    const plano = await getWritablePlanOrThrow(ctx, args.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    if (!canManageRecord(user, plano.uploaded_by_id)) {
      throw new Error("Solo el autor o un administrador puede eliminar el plano");
    }
    if (!plano.deleting_at) {
      await ctx.db.patch(args.plano_id, { deleting_at: Date.now() });
    }
    await ctx.scheduler.runAfter(0, internal.planos.removePlanBatch, {
      plano_id: args.plano_id,
    });
    return { scheduled: true };
  },
});

export const removePlanBatch = internalMutation({
  args: { plano_id: v.id("planos") },
  handler: async (ctx, args): Promise<null> => {
    const plano = await ctx.db.get(args.plano_id);
    if (!plano) return null;
    const [annotations, comments, notifications] = await Promise.all([
      ctx.db
        .query("plano_anotaciones")
        .withIndex("by_plano", (q) => q.eq("plano_id", args.plano_id))
        .take(50),
      ctx.db
        .query("plano_comentarios")
        .withIndex("by_plano", (q) => q.eq("plano_id", args.plano_id))
        .take(50),
      ctx.db
        .query("plano_mention_notifications")
        .withIndex("by_plano", (q) => q.eq("plano_id", args.plano_id))
        .take(50),
    ]);
    for (const notification of notifications) await ctx.db.delete(notification._id);
    for (const comment of comments) await ctx.db.delete(comment._id);
    for (const annotation of annotations) await ctx.db.delete(annotation._id);

    if (annotations.length || comments.length || notifications.length) {
      await ctx.scheduler.runAfter(0, internal.planos.removePlanBatch, args);
      return null;
    }
    await ctx.db.delete(args.plano_id);
    await ctx.storage.delete(plano.storage_id);
    return null;
  },
});

export const createAnnotation = mutation({
  args: {
    plano_id: v.id("planos"),
    pagina: v.number(),
    tipo: v.union(
      v.literal("pin"),
      v.literal("rectangle"),
      v.literal("cloud"),
      v.literal("freehand"),
    ),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    puntos: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
    comentario: v.string(),
    mentions: v.optional(v.array(v.object({
      user_id: v.id("users"),
      start: v.number(),
      end: v.number(),
      label: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const plano = await getWritablePlanOrThrow(ctx, args.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    if (!Number.isInteger(args.pagina) || args.pagina < 1 || args.pagina > 10000) {
      throw new Error("La página no es válida");
    }

    const geometry: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      puntos?: Array<{ x: number; y: number }>;
    } = {};
    if (args.tipo === "pin") {
      geometry.x = normalizedCoordinate(args.x, "x");
      geometry.y = normalizedCoordinate(args.y, "y");
    }
    if (args.tipo === "rectangle" || args.tipo === "cloud") {
      geometry.x = normalizedCoordinate(args.x, "x");
      geometry.y = normalizedCoordinate(args.y, "y");
      geometry.width = normalizedCoordinate(args.width, "width");
      geometry.height = normalizedCoordinate(args.height, "height");
      if (geometry.width < 0.01 || geometry.height < 0.01) {
        throw new Error("La nube es demasiado pequeña");
      }
      if (geometry.x + geometry.width > 1.001 || geometry.y + geometry.height > 1.001) {
        throw new Error("La anotación debe permanecer dentro del plano");
      }
    }
    if (args.tipo === "freehand") {
      if (!args.puntos || args.puntos.length < 2 || args.puntos.length > 600) {
        throw new Error("El trazo debe contener entre 2 y 600 puntos");
      }
      geometry.puntos = args.puntos.map((point) => ({
        x: normalizedCoordinate(point.x, "x"),
        y: normalizedCoordinate(point.y, "y"),
      }));
    }

    const comment = requiredText(args.comentario, "El comentario", 2000);
    const mentionedUsers = await resolveMentions(
      ctx,
      plano.proyecto,
      args.comentario,
      comment,
      args.mentions || [],
    );
    const now = Date.now();
    const annotationId = await ctx.db.insert("plano_anotaciones", {
      plano_id: plano._id,
      proyecto: plano.proyecto,
      pagina: args.pagina,
      tipo: args.tipo,
      ...geometry,
      comentario: comment,
      mentioned_user_ids: mentionedUsers.map((mention) => mention.user_id),
      mentioned_users: mentionedUsers,
      status: "Abierta",
      created_by_id: user._id,
      created_by_name: user.name,
      created_at: now,
    });
    await adjustPlanCounters(ctx, plano._id, {
      annotations: 1,
      openAnnotations: 1,
    });
    await createMentionNotifications(ctx, {
      proyecto: plano.proyecto,
      planoId: plano._id,
      annotationId,
      actor: user,
      text: comment,
      mentions: mentionedUsers,
      createdAt: now,
    });
    return annotationId;
  },
});

export const setAnnotationStatus = mutation({
  args: {
    anotacion_id: v.id("plano_anotaciones"),
    status: v.union(v.literal("Abierta"), v.literal("Resuelta")),
  },
  handler: async (ctx, args) => {
    const annotation = await ctx.db.get(args.anotacion_id);
    if (!annotation || annotation.deleting_at) {
      throw new Error("Anotación no encontrada");
    }
    await getWritablePlanOrThrow(ctx, annotation.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    const isResolved = args.status === "Resuelta";
    await ctx.db.patch(args.anotacion_id, {
      status: args.status,
      updated_at: Date.now(),
      resolved_at: isResolved ? Date.now() : undefined,
      resolved_by_id: isResolved ? user._id : undefined,
    });
    if (annotation.status !== args.status) {
      await adjustPlanCounters(ctx, annotation.plano_id, {
        openAnnotations: args.status === "Abierta" ? 1 : -1,
      });
    }
  },
});

export const removeAnnotation = mutation({
  args: { anotacion_id: v.id("plano_anotaciones") },
  handler: async (ctx, args) => {
    const annotation = await ctx.db.get(args.anotacion_id);
    if (!annotation) throw new Error("Anotación no encontrada");
    await getWritablePlanOrThrow(ctx, annotation.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    if (!canManageRecord(user, annotation.created_by_id)) {
      throw new Error("Solo el autor o un administrador puede eliminar la anotación");
    }
    if (!annotation.deleting_at) {
      await ctx.db.patch(args.anotacion_id, { deleting_at: Date.now() });
      await ctx.scheduler.runAfter(0, internal.planos.removeAnnotationBatch, {
        anotacion_id: args.anotacion_id,
        deleted_comments: 0,
      });
    }
    return { scheduled: true };
  },
});

export const removeAnnotationBatch = internalMutation({
  args: {
    anotacion_id: v.id("plano_anotaciones"),
    deleted_comments: v.number(),
  },
  handler: async (ctx, args): Promise<null> => {
    const annotation = await ctx.db.get(args.anotacion_id);
    if (!annotation) return null;
    const [comments, notifications] = await Promise.all([
      ctx.db
        .query("plano_comentarios")
        .withIndex("by_anotacion", (q) => q.eq("anotacion_id", args.anotacion_id))
        .take(50),
      ctx.db
        .query("plano_mention_notifications")
        .withIndex("by_annotation", (q) => q.eq("anotacion_id", args.anotacion_id))
        .take(50),
    ]);
    for (const notification of notifications) await ctx.db.delete(notification._id);
    for (const comment of comments) await ctx.db.delete(comment._id);
    const deletedComments = args.deleted_comments + comments.length;
    if (comments.length || notifications.length) {
      await ctx.scheduler.runAfter(0, internal.planos.removeAnnotationBatch, {
        anotacion_id: args.anotacion_id,
        deleted_comments: deletedComments,
      });
      return null;
    }
    await ctx.db.delete(args.anotacion_id);
    await adjustPlanCounters(ctx, annotation.plano_id, {
      annotations: -1,
      openAnnotations: annotation.status === "Abierta" ? -1 : 0,
      comments: -deletedComments,
    });
    return null;
  },
});

export const addComment = mutation({
  args: {
    plano_id: v.id("planos"),
    anotacion_id: v.optional(v.id("plano_anotaciones")),
    comentario: v.string(),
    mentions: v.optional(v.array(v.object({
      user_id: v.id("users"),
      start: v.number(),
      end: v.number(),
      label: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const plano = await getWritablePlanOrThrow(ctx, args.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    const comment = requiredText(args.comentario, "El comentario", 3000);
    if (args.anotacion_id) {
      const annotation = await ctx.db.get(args.anotacion_id);
      if (!annotation || annotation.deleting_at || annotation.plano_id !== plano._id) {
        throw new Error("La anotación no pertenece a este plano");
      }
    }
    const mentionedUsers = await resolveMentions(
      ctx,
      plano.proyecto,
      args.comentario,
      comment,
      args.mentions || [],
    );
    const now = Date.now();
    const commentId = await ctx.db.insert("plano_comentarios", {
      plano_id: plano._id,
      anotacion_id: args.anotacion_id,
      proyecto: plano.proyecto,
      user_id: user._id,
      user_name: user.name,
      comentario: comment,
      mentioned_user_ids: mentionedUsers.map((mention) => mention.user_id),
      mentioned_users: mentionedUsers,
      created_at: now,
    });
    await adjustPlanCounters(ctx, plano._id, { comments: 1 });
    await createMentionNotifications(ctx, {
      proyecto: plano.proyecto,
      planoId: plano._id,
      annotationId: args.anotacion_id,
      commentId,
      actor: user,
      text: comment,
      mentions: mentionedUsers,
      createdAt: now,
    });
    return commentId;
  },
});

export const removeComment = mutation({
  args: { comentario_id: v.id("plano_comentarios") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.comentario_id);
    if (!comment) throw new Error("Comentario no encontrado");
    await getWritablePlanOrThrow(ctx, comment.plano_id);
    const user = await getCurrentUserOrThrow(ctx);
    if (!canManageRecord(user, comment.user_id)) {
      throw new Error("Solo el autor o un administrador puede eliminar el comentario");
    }
    await removeCommentNotifications(ctx, comment._id);
    await ctx.db.delete(args.comentario_id);
    await adjustPlanCounters(ctx, comment.plano_id, { comments: -1 });
  },
});
