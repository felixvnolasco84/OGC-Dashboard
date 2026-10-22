import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { checkDesarrolloAccess, getCurrentUserOrThrow, getScopedOrganizationId, hasAdminAccess, hasGlobalAdminAccess } from "./permissions";
import { BUDGET_IDLE_MS, BUDGET_MAX_BYTES, BUDGET_RETENTION_MS, budgetStorageType, budgetFormValidator } from "./budgetImportRules";

export async function readableBudgetAttempt(ctx: QueryCtx | MutationCtx, id: Id<"budget_creation_attempts">) {
  const user = await getCurrentUserOrThrow(ctx);
  const attempt = await ctx.db.get(id);
  if (!attempt) throw new Error("Creación no encontrada.");
  if (attempt.proyecto) {
    if (!(await checkDesarrolloAccess(ctx, attempt.proyecto))) throw new Error("No tienes acceso a este proyecto.");
  } else if (!hasAdminAccess(user) || (!hasGlobalAdminAccess(user) && attempt.organization_id !== getScopedOrganizationId(user))) {
    throw new Error("No tienes acceso a esta creación.");
  }
  return { attempt, user };
}
export async function writableBudgetAttempt(ctx: QueryCtx | MutationCtx, id: Id<"budget_creation_attempts">) {
  const { attempt, user } = await readableBudgetAttempt(ctx, id);
  if (!hasAdminAccess(user) || attempt.created_by !== user._id || attempt.organization_id !== getScopedOrganizationId(user)) {
    throw new Error("Solo quien inició esta creación, con su acceso vigente, puede reanudarla.");
  }
  return attempt;
}
export async function assertBudgetOriginal(ctx: QueryCtx | MutationCtx, attempt: Doc<"budget_creation_attempts">) {
  const metadata = attempt.storage_id ? await ctx.db.system.get(attempt.storage_id) : null;
  if (!metadata || metadata.size !== attempt.size || metadata.sha256.toLowerCase() !== attempt.file_hash) throw new Error("El original no está disponible o no coincide con el Excel confirmado.");
}
export const start = mutation({
  args: { request_id: v.string(), form: budgetFormValidator, file_name: v.string(), file_hash: v.string(), size: v.number(), content_type: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!hasAdminAccess(user)) throw new Error("Se requiere acceso de administrador para crear proyectos.");
    if (!args.request_id.trim() || args.request_id.length > 100 || !/\.(xlsx|xls)$/i.test(args.file_name) || args.file_name.length > 255 ||
      !/^[a-f0-9]{64}$/i.test(args.file_hash) || !Number.isInteger(args.size) || args.size <= 0 || args.size > BUDGET_MAX_BYTES ||
      !args.form.nombre.trim() || !args.form.descripcion.trim()) throw new Error("Datos de creación o archivo Excel inválidos (máximo 10 MB).");
    const existing = await ctx.db.query("budget_creation_attempts").withIndex("by_user_request", q => q.eq("created_by", user._id).eq("request_id", args.request_id)).unique();
    if (existing) {
      await writableBudgetAttempt(ctx, existing._id);
      if (existing.file_hash !== args.file_hash.toLowerCase() || existing.file_name !== args.file_name || existing.size !== args.size || Object.keys({ ...existing.form, ...args.form }).some(key => existing.form[key as keyof typeof args.form] !== args.form[key as keyof typeof args.form])) {
        throw new Error("Este intento ya pertenece a otro archivo o formulario. Reanuda la creación original.");
      }
      return existing._id;
    }
    const now = Date.now();
    const id = await ctx.db.insert("budget_creation_attempts", { ...args, file_hash: args.file_hash.toLowerCase(),
      created_by: user._id, created_by_name: user.name, organization_id: getScopedOrganizationId(user),
      status: "pending", row_cursor: 0, payment_cursor: -1, partidas_created: 0, payments_created: 0, created_at: now, updated_at: now });
    await ctx.scheduler.runAfter(BUDGET_RETENTION_MS, internal.budgetCreationHistory.expireUnbound, { attempt_id: id });
    return id;
  },
});
export const get = query({ args: { attempt_id: v.id("budget_creation_attempts") }, handler: async (ctx, args) => {
  const { attempt, user } = await readableBudgetAttempt(ctx, args.attempt_id);
  return { ...attempt, file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)),
    can_resume: hasAdminAccess(user) && user._id === attempt.created_by && getScopedOrganizationId(user) === attempt.organization_id };
} });
export const list = query({
  args: { proyecto: v.optional(v.id("desarrollos")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (args.proyecto && !(await checkDesarrolloAccess(ctx, args.proyecto))) throw new Error("No tienes acceso al proyecto.");
    if (!args.proyecto && !hasAdminAccess(user)) throw new Error("Se requiere acceso de administrador.");
    const builder = args.proyecto ? ctx.db.query("budget_creation_attempts").withIndex("by_proyecto", q => q.eq("proyecto", args.proyecto))
      : hasGlobalAdminAccess(user) ? ctx.db.query("budget_creation_attempts")
      : ctx.db.query("budget_creation_attempts").withIndex("by_organization_created", q => q.eq("organization_id", getScopedOrganizationId(user)));
    const page = await builder.order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async attempt => {
      // Deleted projects never leave a readable audit entry during a batched purge.
      if (attempt.proyecto && !(await checkDesarrolloAccess(ctx, attempt.proyecto))) return null;
      return { ...attempt, file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)),
        can_resume: hasAdminAccess(user) && user._id === attempt.created_by && getScopedOrganizationId(user) === attempt.organization_id };
    })).then(rows => rows.filter(r => r !== null)) };
  },
});
export const source = query({
  args: { partida_id: v.optional(v.id("partidas")), transaccion_id: v.optional(v.id("transacciones")) },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const record = args.partida_id ? await ctx.db.get(args.partida_id) : args.transaccion_id ? await ctx.db.get(args.transaccion_id) : null;
    if (!record?.proyecto || !(await checkDesarrolloAccess(ctx, record.proyecto))) throw new Error("No tienes acceso al registro.");
    const items = args.transaccion_id ? await ctx.db.query("budget_creation_items").withIndex("by_transaction", q => q.eq("transaccion_id", args.transaccion_id)).take(2)
      : await ctx.db.query("budget_creation_items").withIndex("by_partida", q => q.eq("partida_id", args.partida_id!)).filter(q => q.eq(q.field("transaccion_id"), undefined)).take(2);
    if (!items.length) return { attempt_id: null, legacy_name: "archivo_origen" in record ? record.archivo_origen : null, items: [] };
    const { attempt } = await readableBudgetAttempt(ctx, items[0].attempt_id);
    if (attempt.proyecto !== record.proyecto) throw new Error("Referencia de origen inválida.");
    return { attempt_id: attempt._id, legacy_name: null, items };
  },
});
export const items = query({
  args: { attempt_id: v.id("budget_creation_attempts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await readableBudgetAttempt(ctx, args.attempt_id);
    const page = await ctx.db.query("budget_creation_items").withIndex("by_attempt", q => q.eq("attempt_id", args.attempt_id)).paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async item => ({ ...item, deleted: !await ctx.db.get(item.transaccion_id ?? item.partida_id) }))) };
  },
});
export const attachStored = internalMutation({
  args: { attempt_id: v.id("budget_creation_attempts"), storage_id: v.id("_storage"), kind: v.union(v.literal("original"), v.literal("manifest")), row_count: v.optional(v.number()), payment_count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attempt = await writableBudgetAttempt(ctx, args.attempt_id);
    const metadata = await ctx.db.system.get(args.storage_id);
    if (!metadata || metadata.contentType !== budgetStorageType(attempt._id, args.kind)) throw new Error("Archivo de carga inválido.");
    if (args.kind === "original" && (metadata.sha256.toLowerCase() !== attempt.file_hash || metadata.size !== attempt.size)) throw new Error("El archivo guardado no coincide con el original.");
    const key = args.kind === "original" ? "storage_id" : "manifest_id";
    if (attempt[key] && await ctx.db.system.get(attempt[key]!)) { if (attempt[key] !== args.storage_id) await ctx.storage.delete(args.storage_id); return attempt[key]!; }
    if (attempt.status === "completed") throw new Error("Esta creación ya terminó.");
    await ctx.db.patch(attempt._id, { [key]: args.storage_id, updated_at: Date.now(),
      ...(args.kind === "manifest" ? { row_count: args.row_count, payment_count: args.payment_count } : {}) });
    return args.storage_id;
  },
});
export const pause = mutation({ args: { attempt_id: v.id("budget_creation_attempts"), error: v.string() }, handler: async (ctx, args) => {
  const attempt = await writableBudgetAttempt(ctx, args.attempt_id);
  if (attempt.status !== "completed") await ctx.db.patch(attempt._id, { status: "failed", error: args.error.slice(0, 1000), updated_at: Date.now() });
} });
export async function purgeBudgetAttempt(ctx: MutationCtx, id: Id<"budget_creation_attempts">) {
  const attempt = await ctx.db.get(id);
  if (!attempt) return;
  const page = await ctx.db.query("budget_creation_items").withIndex("by_attempt", q => q.eq("attempt_id", id)).take(100);
  for (const item of page) await ctx.db.delete(item._id);
  if (page.length === 100) { await ctx.scheduler.runAfter(0, internal.budgetCreationHistory.purgeDeleted, { attempt_id: id }); return; }
  for (const storageId of [attempt.storage_id, attempt.manifest_id]) if (storageId && await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
  await ctx.db.delete(id);
}
export const purgeDeleted = internalMutation({ args: { attempt_id: v.id("budget_creation_attempts") }, handler: async (ctx, args) => {
  const attempt = await ctx.db.get(args.attempt_id);
  if (attempt?.proyecto && await ctx.db.get(attempt.proyecto)) return;
  await purgeBudgetAttempt(ctx, args.attempt_id);
} });
export const expireUnbound = internalMutation({ args: { attempt_id: v.id("budget_creation_attempts") }, handler: async (ctx, args) => {
  const attempt = await ctx.db.get(args.attempt_id);
  if (attempt && !attempt.proyecto && Date.now() >= attempt.created_at + BUDGET_RETENTION_MS) await purgeBudgetAttempt(ctx, attempt._id);
} });
export const cleanup = internalMutation({
  args: { cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
    const page = await ctx.db.system.query("_storage").paginate({ numItems: 100, cursor: args.cursor ?? null });
    for (const file of page.page) {
      const match = file.contentType?.match(/^application\/x-ogc-initial-budget;attempt=([^;]+);kind=(original|manifest)$/);
      if (!match || file._creationTime > Date.now() - BUDGET_IDLE_MS * 2) continue;
      const id = ctx.db.normalizeId("budget_creation_attempts", decodeURIComponent(match[1]));
      const attempt = id ? await ctx.db.get(id) : null;
      if (!attempt || (attempt.storage_id !== file._id && attempt.manifest_id !== file._id)) await ctx.storage.delete(file._id);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.budgetCreationHistory.cleanup, { cursor: page.continueCursor });
  },
});
