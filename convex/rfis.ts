import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  canUserAccessDesarrollo,
  getCurrentUserOrThrow,
} from "./permissions";

const CREATE_ROLES = new Set(["admin", "user", "contratista"]);
const RESPONSIBLE_ROLES = new Set(["admin", "user"]);
const RFI_PREFIX = "RFI";

const impactValidator = v.union(
  v.literal("yes"),
  v.literal("unknown"),
  v.literal("no"),
  v.literal("na"),
);

type RfiContext = QueryCtx | MutationCtx;
type RfiUser = Awaited<ReturnType<typeof getCurrentUserOrThrow>>;

function cleanOptional(value: string | undefined) {
  const clean = value?.trim();
  return clean || undefined;
}

function displayUserName(user: Pick<Doc<"users">, "name" | "email">) {
  const name = user.name.trim();
  const email = user.email.trim();
  const hasPlaceholderName =
    !name ||
    name === email ||
    name.endsWith("@pending.invalid");
  if (!hasPlaceholderName) return name;
  if (email && !email.endsWith("@pending.invalid")) {
    return email.split("@")[0] || "Usuario";
  }
  return "Usuario";
}

function stringifyHistoryValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function uniqueUserIds(values: Id<"users">[]) {
  return Array.from(new Set(values));
}

const SET_LIKE_HISTORY_FIELDS = new Set([
  "assignee_ids",
  "required_assignee_ids",
  "distribution_user_ids",
]);

function historyValuesEqual(field: string, previous: unknown, next: unknown) {
  const normalize = (value: unknown) => {
    if (value === undefined || value === null || value === "") return null;
    if (SET_LIKE_HISTORY_FIELDS.has(field) && Array.isArray(value)) {
      return [...value].map(String).sort();
    }
    return value;
  };
  return JSON.stringify(normalize(previous)) === JSON.stringify(normalize(next));
}

function historyReference(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "string") return parsed;
    if (
      parsed &&
      typeof parsed === "object" &&
      "attachment_id" in parsed &&
      typeof parsed.attachment_id === "string"
    ) {
      return parsed.attachment_id;
    }
  } catch {
    return value;
  }
  return undefined;
}

function isInAudience(user: RfiUser, rfi: Doc<"rfis">) {
  return (
    rfi.creator_id === user._id ||
    rfi.rfi_manager_id === user._id ||
    rfi.assignee_ids.includes(user._id) ||
    rfi.distribution_user_ids.includes(user._id)
  );
}

function canViewRfi(user: RfiUser, rfi: Doc<"rfis">) {
  if (user.role === "admin") return true;
  if (rfi.status === "draft" || rfi.status === "pending_manager_review") {
    return rfi.creator_id === user._id || rfi.rfi_manager_id === user._id;
  }
  if (user.role === "finance") return isInAudience(user, rfi);
  return !rfi.is_private || isInAudience(user, rfi);
}

function canManageRfi(user: RfiUser, rfi: Doc<"rfis">) {
  return (
    user.role === "admin" ||
    (user.role === "user" && rfi.rfi_manager_id === user._id)
  );
}

function canEditRfi(user: RfiUser, rfi: Doc<"rfis">) {
  return (
    (rfi.status === "draft" &&
      (user.role === "admin" || rfi.creator_id === user._id)) ||
    (rfi.status === "pending_manager_review" && canManageRfi(user, rfi))
  );
}

function canRespondToRfi(user: RfiUser, rfi: Doc<"rfis">) {
  if (rfi.status !== "open") return false;
  if (user.role === "admin" || rfi.assignee_ids.includes(user._id)) return true;
  return user.role === "user" && rfi.distribution_user_ids.includes(user._id);
}

function canAttachToRfi(user: RfiUser, rfi: Doc<"rfis">) {
  if (rfi.status === "closed") return false;
  if (canManageRfi(user, rfi)) return true;
  if (rfi.status === "draft" || rfi.status === "pending_manager_review") {
    return rfi.creator_id === user._id;
  }
  return canRespondToRfi(user, rfi);
}

function derivedStatus(
  rfi: Doc<"rfis">,
  responseCount = 0,
  officialResponseCount = 0,
) {
  if (rfi.status !== "open") return rfi.status;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (
    rfi.due_date &&
    new Date(`${rfi.due_date}T00:00:00`).getTime() < today.getTime()
  ) {
    return "overdue";
  }
  if (responseCount === 0) return "awaiting_response";
  if (officialResponseCount === 0) return "awaiting_official_response";
  return "open";
}

function rfiCode(rfi: Pick<Doc<"rfis">, "prefix" | "number" | "revision_number">) {
  const base = `${rfi.prefix}-${String(rfi.number).padStart(3, "0")}`;
  return rfi.revision_number > 0 ? `${base}.R${rfi.revision_number}` : base;
}

async function ensureProjectAccess(
  ctx: RfiContext,
  proyecto: Id<"desarrollos">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const project = await ctx.db.get(proyecto);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("Proyecto no encontrado o sin acceso");
  }
  return { user, project };
}

async function getRfiOrThrow(ctx: RfiContext, id: Id<"rfis">) {
  const rfi = await ctx.db.get(id);
  if (!rfi) throw new Error("RFI no encontrada");
  const { user } = await ensureProjectAccess(ctx, rfi.proyecto);
  if (!canViewRfi(user, rfi)) {
    throw new Error("No tienes acceso a esta RFI privada");
  }
  return { rfi, user };
}

async function ensureUsersBelongToProject(
  ctx: RfiContext,
  proyecto: Id<"desarrollos">,
  userIds: Id<"users">[],
) {
  const { project } = await ensureProjectAccess(ctx, proyecto);
  const uniqueIds = uniqueUserIds(userIds);
  const rolesByUser = new Map<string, string>();

  for (const userId of uniqueIds) {
    const user = await ctx.db.get(userId);
    const isPending =
      user?.invitation_status === "pending" ||
      user?.clerkId.startsWith("pending:");
    if (!user || isPending) {
      throw new Error(
        "Todas las personas seleccionadas deben ser usuarios activos",
      );
    }
    if (!canUserAccessDesarrollo(user, project)) {
      throw new Error(`${displayUserName(user)} no tiene acceso al proyecto`);
    }
    rolesByUser.set(userId, user.role);
  }

  return rolesByUser;
}

function ensureResponsibleRole(
  responsibleUserId: Id<"users"> | undefined,
  rolesByUser: Map<string, string>,
) {
  if (!responsibleUserId) return;
  const role = rolesByUser.get(responsibleUserId);
  if (!role || !RESPONSIBLE_ROLES.has(role)) {
    throw new Error(
      "El responsable de la RFI debe tener rol Administrador o Usuario",
    );
  }
}

async function ensurePartidaBelongsToProject(
  ctx: RfiContext,
  proyecto: Id<"desarrollos">,
  partidaId?: Id<"partidas">,
  familia?: string,
  subPartida?: string,
) {
  if (!partidaId) {
    if (familia || subPartida) {
      throw new Error("Selecciona una partida antes de elegir familia o subpartida");
    }
    return;
  }
  const partida = await ctx.db.get(partidaId);
  if (!partida || partida.proyecto !== proyecto || partida.nivel !== 1) {
    throw new Error("La partida debe ser de nivel 1 y pertenecer al proyecto de la RFI");
  }

  const cleanFamilia = cleanOptional(familia);
  const cleanSubPartida = cleanOptional(subPartida);
  if (cleanSubPartida && !cleanFamilia) {
    throw new Error("Selecciona una familia antes de elegir subpartida");
  }

  if (cleanFamilia) {
    const familias = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_partida", (q) =>
        q.eq("proyecto", proyecto).eq("nivel", 2).eq("partida_nombre", partida.nombre),
      )
      .collect();
    if (!familias.some((item) => item.familia === cleanFamilia)) {
      throw new Error("La familia seleccionada no pertenece a la partida");
    }
  }

  if (cleanSubPartida && cleanFamilia) {
    const subPartidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_partida_familia", (q) =>
        q
          .eq("proyecto", proyecto)
          .eq("nivel", 3)
          .eq("partida_nombre", partida.nombre)
          .eq("familia", cleanFamilia),
      )
      .collect();
    if (
      !subPartidas.some(
        (item) => item.sub_partida === cleanSubPartida || item.nombre === cleanSubPartida,
      )
    ) {
      throw new Error("La subpartida seleccionada no pertenece a la familia");
    }
  }
}

async function insertHistory(
  ctx: MutationCtx,
  args: {
    rfi: Doc<"rfis"> | { _id: Id<"rfis">; proyecto: Id<"desarrollos"> };
    user: RfiUser;
    action: string;
    fieldChanged?: string;
    oldValue?: unknown;
    newValue?: unknown;
  },
) {
  return await ctx.db.insert("rfi_history", {
    rfi_id: args.rfi._id,
    proyecto: args.rfi.proyecto,
    action: args.action,
    field_changed: args.fieldChanged,
    old_value: stringifyHistoryValue(args.oldValue),
    new_value: stringifyHistoryValue(args.newValue),
    actor_id: args.user._id,
    actor_name: displayUserName(args.user),
    created_at: Date.now(),
  });
}

async function enrichRfi(ctx: QueryCtx, rfi: Doc<"rfis">, user: RfiUser) {
  const [manager, creator, assignees, responses, attachments, readStatus] = await Promise.all([
    rfi.rfi_manager_id ? ctx.db.get(rfi.rfi_manager_id) : null,
    ctx.db.get(rfi.creator_id),
    Promise.all(rfi.assignee_ids.map((id) => ctx.db.get(id))),
    ctx.db
      .query("rfi_responses")
      .withIndex("by_rfi", (q) => q.eq("rfi_id", rfi._id))
      .collect(),
    ctx.db
      .query("rfi_attachments")
      .withIndex("by_rfi", (q) => q.eq("rfi_id", rfi._id))
      .collect(),
    ctx.db
      .query("rfi_read_status")
      .withIndex("by_rfi_user", (q) =>
        q.eq("rfi_id", rfi._id).eq("user_id", user._id),
      )
      .first(),
  ]);

  const lastActivityAt = Math.max(
    rfi.updated_at,
    ...responses.map((response) => response.updated_at),
  );
  const officialResponseCount = responses.filter((response) => response.is_official).length;

  return {
    ...rfi,
    code: rfiCode(rfi),
    derived_status: derivedStatus(rfi, responses.length, officialResponseCount),
    official_response_count: officialResponseCount,
    response_count: responses.length,
    attachment_count: attachments.filter((attachment) => !attachment.response_id).length,
    first_attachment:
      attachments.find((attachment) => !attachment.response_id) ?? null,
    last_activity_at: lastActivityAt,
    is_unread: (readStatus?.last_read_at ?? 0) < lastActivityAt,
    is_my_responsibility:
      rfi.rfi_manager_id === user._id ||
      rfi.assignee_ids.includes(user._id),
    manager: manager
      ? { _id: manager._id, name: displayUserName(manager), email: manager.email }
      : null,
    creator: creator
      ? { _id: creator._id, name: displayUserName(creator), email: creator.email }
      : null,
    assignees: assignees
      .filter((assigned): assigned is Doc<"users"> => assigned !== null)
      .map((assigned) => ({
        _id: assigned._id,
        name: displayUserName(assigned),
        email: assigned.email,
      })),
  };
}

export const listByProject = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const { user } = await ensureProjectAccess(ctx, args.proyecto);
    const rfis = await ctx.db
      .query("rfis")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();

    const visible = rfis.filter((rfi) => canViewRfi(user, rfi));
    const enriched = await Promise.all(
      visible.map((rfi) => enrichRfi(ctx, rfi, user)),
    );
    return enriched.sort(
      (a, b) =>
        b.number - a.number ||
        b.revision_number - a.revision_number,
    );
  },
});

export const getFormOptions = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const { user, project } = await ensureProjectAccess(ctx, args.proyecto);
    const [allUsers, partidas] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
        .collect(),
    ]);
    const users = allUsers
      .filter(
        (candidate) =>
          candidate.invitation_status !== "pending" &&
          !candidate.clerkId.startsWith("pending:") &&
          canUserAccessDesarrollo(candidate, project),
      )
      .map((candidate) => ({
        _id: candidate._id,
        name: displayUserName(candidate),
        email: candidate.email,
        role: candidate.role,
      }));

    return {
      project: { _id: project._id, nombre: project.nombre },
      current_user: {
        _id: user._id,
        name: displayUserName(user),
        role: user.role,
      },
      can_create: CREATE_ROLES.has(user.role),
      users: users
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
      partidas: partidas
        .map((partida) => ({
          _id: partida._id,
          nombre: partida.nombre,
          nivel: partida.nivel,
          partida_nombre: partida.partida_nombre,
          familia: partida.familia,
          sub_partida: partida.sub_partida,
        }))
        .sort(
          (a, b) =>
            a.nivel - b.nivel ||
            (a.partida_nombre || a.nombre).localeCompare(
              b.partida_nombre || b.nombre,
              "es",
            ) ||
            a.familia.localeCompare(b.familia, "es") ||
            a.sub_partida.localeCompare(b.sub_partida, "es"),
        ),
    };
  },
});

export const getDetail = query({
  args: { id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    const [enriched, responses, attachments, history] = await Promise.all([
      enrichRfi(ctx, rfi, user),
      ctx.db
        .query("rfi_responses")
        .withIndex("by_rfi", (q) => q.eq("rfi_id", rfi._id))
        .collect(),
      ctx.db
        .query("rfi_attachments")
        .withIndex("by_rfi", (q) => q.eq("rfi_id", rfi._id))
        .collect(),
      ctx.db
        .query("rfi_history")
        .withIndex("by_rfi", (q) => q.eq("rfi_id", rfi._id))
        .collect(),
    ]);

    const attachmentsWithUrls = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        url: await ctx.storage.getUrl(attachment.storage_id),
      })),
    );
    const historyWithAttachments = history
      .sort(
        (a, b) =>
          b.created_at - a.created_at ||
          b._creationTime - a._creationTime,
      )
      .map((item) => {
        const legacyAttachmentId =
          item.action === "attachment_added"
            ? historyReference(item.new_value)
            : undefined;
        return {
          ...item,
          attachments: attachmentsWithUrls.filter(
            (attachment) =>
              attachment.history_id === item._id ||
              attachment._id === legacyAttachmentId,
          ),
        };
      });

    return {
      rfi: enriched,
      responses: responses
        .sort((a, b) => a.created_at - b.created_at)
        .map((response) => ({
          ...response,
          attachments: attachmentsWithUrls.filter(
            (attachment) => attachment.response_id === response._id,
          ),
        })),
      attachments: attachmentsWithUrls.filter(
        (attachment) => !attachment.response_id,
      ),
      history: historyWithAttachments,
      permissions: {
        can_edit: canEditRfi(user, rfi),
        can_submit:
          rfi.status === "draft" &&
          (user.role === "admin" || rfi.creator_id === user._id),
        can_open:
          rfi.status === "pending_manager_review" && canManageRfi(user, rfi),
        can_respond: canRespondToRfi(user, rfi),
        can_mark_official:
          rfi.status === "open" && canManageRfi(user, rfi),
        can_close: rfi.status === "open" && canManageRfi(user, rfi),
        can_reopen: rfi.status === "closed" && canManageRfi(user, rfi),
        can_attach: canAttachToRfi(user, rfi),
      },
    };
  },
});

export const create = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    subject: v.string(),
    background: v.optional(v.string()),
    question: v.string(),
    received_from_id: v.optional(v.id("users")),
    rfi_manager_id: v.optional(v.id("users")),
    assignee_ids: v.array(v.id("users")),
    required_assignee_ids: v.array(v.id("users")),
    distribution_user_ids: v.array(v.id("users")),
    due_date: v.optional(v.string()),
    location: v.optional(v.string()),
    drawing_number: v.optional(v.string()),
    spec_section: v.optional(v.string()),
    partida_id: v.optional(v.id("partidas")),
    familia: v.optional(v.string()),
    sub_partida: v.optional(v.string()),
    project_stage: v.optional(v.string()),
    cost_impact: impactValidator,
    cost_impact_amount: v.optional(v.number()),
    schedule_impact: impactValidator,
    schedule_impact_days: v.optional(v.number()),
    is_private: v.boolean(),
    submit_for_review: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProjectAccess(ctx, args.proyecto);
    if (!CREATE_ROLES.has(user.role)) {
      throw new Error("Tu rol no permite crear RFIs");
    }

    const subject = args.subject.trim();
    const question = args.question.trim();
    if (!subject) throw new Error("El asunto es obligatorio");
    if (!question) throw new Error("La pregunta es obligatoria");
    if (args.submit_for_review && !args.rfi_manager_id) {
      throw new Error("Selecciona al responsable de la RFI antes de enviarla a revisión");
    }

    const assigneeIds = uniqueUserIds(args.assignee_ids);
    const requiredAssigneeIds = uniqueUserIds(args.required_assignee_ids);
    const distributionUserIds = uniqueUserIds(args.distribution_user_ids);
    if (
      requiredAssigneeIds.some((id) => !assigneeIds.includes(id))
    ) {
      throw new Error("Toda respuesta requerida debe pertenecer a una persona asignada");
    }

    const [rolesByUser] = await Promise.all([
      ensureUsersBelongToProject(ctx, args.proyecto, [
        ...assigneeIds,
        ...distributionUserIds,
        ...(args.rfi_manager_id ? [args.rfi_manager_id] : []),
        ...(args.received_from_id ? [args.received_from_id] : []),
      ]),
      ensurePartidaBelongsToProject(
        ctx,
        args.proyecto,
        args.partida_id,
        args.familia,
        args.sub_partida,
      ),
    ]);
    ensureResponsibleRole(args.rfi_manager_id, rolesByUser);

    const existing = await ctx.db
      .query("rfis")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    const nextNumber =
      Math.max(
        0,
        ...existing
          .filter((rfi) => rfi.revision_number === 0)
          .map((rfi) => rfi.number),
      ) + 1;
    const now = Date.now();
    const status = args.submit_for_review
      ? "pending_manager_review" as const
      : "draft" as const;

    const rfiId = await ctx.db.insert("rfis", {
      proyecto: args.proyecto,
      number: nextNumber,
      prefix: RFI_PREFIX,
      revision_number: 0,
      subject,
      background: cleanOptional(args.background),
      question,
      status,
      creator_id: user._id,
      received_from_id: args.received_from_id,
      rfi_manager_id: args.rfi_manager_id,
      assignee_ids: assigneeIds,
      required_assignee_ids: requiredAssigneeIds,
      distribution_user_ids: distributionUserIds,
      due_date: args.due_date,
      location: cleanOptional(args.location),
      drawing_number: cleanOptional(args.drawing_number),
      spec_section: cleanOptional(args.spec_section),
      partida_id: args.partida_id,
      familia: cleanOptional(args.familia),
      sub_partida: cleanOptional(args.sub_partida),
      project_stage: cleanOptional(args.project_stage),
      cost_impact: args.cost_impact,
      cost_impact_amount:
        args.cost_impact === "yes" ? args.cost_impact_amount : undefined,
      schedule_impact: args.schedule_impact,
      schedule_impact_days:
        args.schedule_impact === "yes" ? args.schedule_impact_days : undefined,
      is_private: args.is_private,
      created_at: now,
      updated_at: now,
    });

    const rfi = { _id: rfiId, proyecto: args.proyecto };
    await insertHistory(ctx, {
      rfi,
      user,
      action: "created",
      newValue: subject,
    });
    if (args.submit_for_review) {
      await insertHistory(ctx, {
        rfi,
        user,
        action: "submitted_for_review",
        fieldChanged: "status",
        oldValue: "draft",
        newValue: status,
      });
    }
    return rfiId;
  },
});

export const updateDraft = mutation({
  args: {
    id: v.id("rfis"),
    subject: v.string(),
    background: v.optional(v.string()),
    question: v.string(),
    received_from_id: v.optional(v.id("users")),
    rfi_manager_id: v.optional(v.id("users")),
    assignee_ids: v.array(v.id("users")),
    required_assignee_ids: v.array(v.id("users")),
    distribution_user_ids: v.array(v.id("users")),
    due_date: v.optional(v.string()),
    location: v.optional(v.string()),
    drawing_number: v.optional(v.string()),
    spec_section: v.optional(v.string()),
    partida_id: v.optional(v.id("partidas")),
    familia: v.optional(v.string()),
    sub_partida: v.optional(v.string()),
    project_stage: v.optional(v.string()),
    cost_impact: impactValidator,
    cost_impact_amount: v.optional(v.number()),
    schedule_impact: impactValidator,
    schedule_impact_days: v.optional(v.number()),
    is_private: v.boolean(),
    submit_for_review: v.boolean(),
    remove_attachment_ids: v.array(v.id("rfi_attachments")),
  },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    const canEdit =
      (rfi.status === "draft" &&
        (user.role === "admin" || rfi.creator_id === user._id)) ||
      (rfi.status === "pending_manager_review" && canManageRfi(user, rfi));
    if (!canEdit) {
      throw new Error("Esta RFI ya no puede editarse");
    }

    const subject = args.subject.trim();
    const question = args.question.trim();
    if (!subject) throw new Error("El asunto es obligatorio");
    if (!question) throw new Error("La pregunta es obligatoria");
    if (args.submit_for_review && !args.rfi_manager_id) {
      throw new Error("Selecciona al responsable de la RFI antes de enviarla a revisión");
    }

    const assigneeIds = uniqueUserIds(args.assignee_ids);
    const requiredAssigneeIds = uniqueUserIds(args.required_assignee_ids);
    const distributionUserIds = uniqueUserIds(args.distribution_user_ids);
    if (requiredAssigneeIds.some((id) => !assigneeIds.includes(id))) {
      throw new Error("Toda respuesta requerida debe pertenecer a una persona asignada");
    }

    const [rolesByUser] = await Promise.all([
      ensureUsersBelongToProject(ctx, rfi.proyecto, [
        ...assigneeIds,
        ...distributionUserIds,
        ...(args.rfi_manager_id ? [args.rfi_manager_id] : []),
        ...(args.received_from_id ? [args.received_from_id] : []),
      ]),
      ensurePartidaBelongsToProject(
        ctx,
        rfi.proyecto,
        args.partida_id,
        args.familia,
        args.sub_partida,
      ),
    ]);
    ensureResponsibleRole(args.rfi_manager_id, rolesByUser);

    const attachmentIdsToRemove = Array.from(
      new Set(args.remove_attachment_ids.map(String)),
    ) as Id<"rfi_attachments">[];
    const attachmentsToRemove = await Promise.all(
      attachmentIdsToRemove.map((attachmentId) => ctx.db.get(attachmentId)),
    );
    for (const attachment of attachmentsToRemove) {
      if (!attachment || attachment.rfi_id !== rfi._id || attachment.response_id) {
        throw new Error("Uno de los archivos seleccionados no pertenece a esta RFI");
      }
    }

    const nextStatus =
      args.submit_for_review && rfi.status === "draft"
        ? "pending_manager_review" as const
        : rfi.status;
    const nextValues = {
      subject,
      background: cleanOptional(args.background),
      question,
      received_from_id: args.received_from_id,
      rfi_manager_id: args.rfi_manager_id,
      assignee_ids: assigneeIds,
      required_assignee_ids: requiredAssigneeIds,
      distribution_user_ids: distributionUserIds,
      due_date: cleanOptional(args.due_date),
      location: cleanOptional(args.location),
      drawing_number: cleanOptional(args.drawing_number),
      spec_section: cleanOptional(args.spec_section),
      partida_id: args.partida_id,
      familia: cleanOptional(args.familia),
      sub_partida: cleanOptional(args.sub_partida),
      project_stage: cleanOptional(args.project_stage),
      cost_impact: args.cost_impact,
      cost_impact_amount:
        args.cost_impact === "yes" ? args.cost_impact_amount : undefined,
      schedule_impact: args.schedule_impact,
      schedule_impact_days:
        args.schedule_impact === "yes" ? args.schedule_impact_days : undefined,
      is_private: args.is_private,
      status: nextStatus,
    };
    const trackedFields: Array<keyof typeof nextValues> = [
      "subject",
      "background",
      "question",
      "received_from_id",
      "rfi_manager_id",
      "assignee_ids",
      "required_assignee_ids",
      "distribution_user_ids",
      "due_date",
      "location",
      "drawing_number",
      "spec_section",
      "partida_id",
      "familia",
      "sub_partida",
      "project_stage",
      "cost_impact",
      "cost_impact_amount",
      "schedule_impact",
      "schedule_impact_days",
      "is_private",
      "status",
    ];
    const changedFields = trackedFields.filter((field) =>
      !historyValuesEqual(
        field,
        rfi[field as keyof Doc<"rfis">],
        nextValues[field],
      ));

    if (changedFields.length === 0 && attachmentsToRemove.length === 0) {
      return rfi._id;
    }

    await ctx.db.patch(rfi._id, {
      ...nextValues,
      updated_at: Date.now(),
    });

    for (const field of changedFields) {
      await insertHistory(ctx, {
        rfi,
        user,
        action: field === "status" ? "submitted_for_review" : "updated",
        fieldChanged: field,
        oldValue: rfi[field as keyof Doc<"rfis">],
        newValue: nextValues[field],
      });
    }
    for (const attachment of attachmentsToRemove) {
      if (!attachment) continue;
      await ctx.storage.delete(attachment.storage_id);
      await ctx.db.delete(attachment._id);
      await insertHistory(ctx, {
        rfi,
        user,
        action: "attachment_removed",
        fieldChanged: "attachments",
        oldValue: {
          attachment_id: attachment._id,
          name: attachment.nombre,
          type: attachment.type,
          size: attachment.size,
        },
      });
    }
    return rfi._id;
  },
});

export const submitForReview = mutation({
  args: { id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    if (
      rfi.status !== "draft" ||
      (user.role !== "admin" && rfi.creator_id !== user._id)
    ) {
      throw new Error("Esta RFI no puede enviarse a revisión");
    }
    if (!rfi.rfi_manager_id) {
      throw new Error("La RFI necesita una persona responsable");
    }
    const rolesByUser = await ensureUsersBelongToProject(
      ctx,
      rfi.proyecto,
      [rfi.rfi_manager_id],
    );
    ensureResponsibleRole(rfi.rfi_manager_id, rolesByUser);
    const now = Date.now();
    await ctx.db.patch(rfi._id, {
      status: "pending_manager_review",
      updated_at: now,
    });
    await insertHistory(ctx, {
      rfi,
      user,
      action: "submitted_for_review",
      fieldChanged: "status",
      oldValue: rfi.status,
      newValue: "pending_manager_review",
    });
  },
});

export const openRfi = mutation({
  args: { id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    if (rfi.status !== "pending_manager_review" || !canManageRfi(user, rfi)) {
      throw new Error("Solo el responsable de la RFI puede abrirla después de la revisión");
    }
    if (rfi.assignee_ids.length === 0) {
      throw new Error("Asigna al menos una persona antes de abrir la RFI");
    }
    if (!rfi.due_date) {
      throw new Error("Define una fecha límite antes de abrir la RFI");
    }
    const now = Date.now();
    await ctx.db.patch(rfi._id, {
      status: "open",
      opened_at: now,
      closed_at: undefined,
      updated_at: now,
    });
    await insertHistory(ctx, {
      rfi,
      user,
      action: "opened",
      fieldChanged: "status",
      oldValue: rfi.status,
      newValue: "open",
    });
  },
});

export const addResponse = mutation({
  args: { rfi_id: v.id("rfis"), body: v.string() },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.rfi_id);
    if (!canRespondToRfi(user, rfi)) {
      throw new Error("No puedes responder esta RFI");
    }
    const body = args.body.trim();
    if (!body) throw new Error("La respuesta no puede estar vacía");
    const now = Date.now();
    const responseId = await ctx.db.insert("rfi_responses", {
      rfi_id: rfi._id,
      proyecto: rfi.proyecto,
      author_id: user._id,
      author_name: displayUserName(user),
      body,
      is_official: false,
      created_at: now,
      updated_at: now,
    });
    await ctx.db.patch(rfi._id, { updated_at: now });
    await insertHistory(ctx, {
      rfi,
      user,
      action: "response_added",
      fieldChanged: "responses",
      newValue: {
        response_id: responseId,
        body,
        author_name: displayUserName(user),
      },
    });
    return responseId;
  },
});

export const markResponseOfficial = mutation({
  args: { response_id: v.id("rfi_responses") },
  handler: async (ctx, args) => {
    const response = await ctx.db.get(args.response_id);
    if (!response) throw new Error("Respuesta no encontrada");
    const { rfi, user } = await getRfiOrThrow(ctx, response.rfi_id);
    if (rfi.status !== "open" || !canManageRfi(user, rfi)) {
      throw new Error("Solo el responsable de la RFI puede seleccionar una respuesta oficial");
    }
    if (!response.is_official) {
      const now = Date.now();
      await ctx.db.patch(response._id, {
        is_official: true,
        updated_at: now,
      });
      await ctx.db.patch(rfi._id, { updated_at: now });
      await insertHistory(ctx, {
        rfi,
        user,
        action: "official_response_selected",
        fieldChanged: "official_response",
        newValue: {
          response_id: response._id,
          body: response.body,
          author_name: response.author_name,
        },
      });
    }
  },
});

export const closeRfi = mutation({
  args: { id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    if (rfi.status !== "open" || !canManageRfi(user, rfi)) {
      throw new Error("Solo el responsable de la RFI puede cerrarla");
    }
    const official = await ctx.db
      .query("rfi_responses")
      .withIndex("by_rfi", (q) => q.eq("rfi_id", rfi._id))
      .filter((q) => q.eq(q.field("is_official"), true))
      .first();
    if (!official) {
      throw new Error("Selecciona al menos una respuesta oficial antes de cerrar");
    }
    const now = Date.now();
    await ctx.db.patch(rfi._id, {
      status: "closed",
      closed_at: now,
      updated_at: now,
    });
    await insertHistory(ctx, {
      rfi,
      user,
      action: "closed",
      fieldChanged: "status",
      oldValue: rfi.status,
      newValue: "closed",
    });
  },
});

export const reopenRfi = mutation({
  args: { id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    if (rfi.status !== "closed" || !canManageRfi(user, rfi)) {
      throw new Error("Solo el responsable de la RFI puede reabrirla");
    }
    const now = Date.now();
    await ctx.db.patch(rfi._id, {
      status: "open",
      closed_at: undefined,
      updated_at: now,
    });
    await insertHistory(ctx, {
      rfi,
      user,
      action: "reopened",
      fieldChanged: "status",
      oldValue: rfi.status,
      newValue: "open",
    });
  },
});

export const generateUploadUrl = mutation({
  args: { rfi_id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.rfi_id);
    if (!canAttachToRfi(user, rfi)) {
      throw new Error("No puedes adjuntar archivos a esta RFI");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const addAttachment = mutation({
  args: {
    rfi_id: v.id("rfis"),
    response_id: v.optional(v.id("rfi_responses")),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    type: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.rfi_id);
    if (!canAttachToRfi(user, rfi)) {
      throw new Error("No puedes adjuntar archivos a esta RFI");
    }
    if (args.response_id) {
      const response = await ctx.db.get(args.response_id);
      if (!response || response.rfi_id !== rfi._id) {
        throw new Error("La respuesta no pertenece a esta RFI");
      }
    }
    const now = Date.now();
    const attachmentId = await ctx.db.insert("rfi_attachments", {
      rfi_id: rfi._id,
      proyecto: rfi.proyecto,
      response_id: args.response_id,
      storage_id: args.storage_id,
      nombre: args.nombre.trim() || "Archivo",
      type: args.type || "application/octet-stream",
      size: args.size,
      uploaded_by_id: user._id,
      uploaded_at: now,
    });
    await ctx.db.patch(rfi._id, { updated_at: now });
    const historyId = await insertHistory(ctx, {
      rfi,
      user,
      action: "attachment_added",
      fieldChanged: args.response_id ? "response_attachment" : "attachments",
      newValue: {
        attachment_id: attachmentId,
        name: args.nombre.trim() || "Archivo",
        type: args.type || "application/octet-stream",
        size: args.size,
        response_id: args.response_id,
      },
    });
    await ctx.db.patch(attachmentId, { history_id: historyId });
    return attachmentId;
  },
});

export const markAsRead = mutation({
  args: { id: v.id("rfis") },
  handler: async (ctx, args) => {
    const { rfi, user } = await getRfiOrThrow(ctx, args.id);
    const existing = await ctx.db
      .query("rfi_read_status")
      .withIndex("by_rfi_user", (q) =>
        q.eq("rfi_id", rfi._id).eq("user_id", user._id),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { last_read_at: Date.now() });
    } else {
      await ctx.db.insert("rfi_read_status", {
        rfi_id: rfi._id,
        proyecto: rfi.proyecto,
        user_id: user._id,
        last_read_at: Date.now(),
      });
    }
  },
});
