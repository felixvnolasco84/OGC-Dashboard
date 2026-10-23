import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertCanWrite, checkDesarrolloAccess, getCurrentUserOrThrow, hasAdminAccess, hasGlobalAdminAccess } from "./permissions";
import { projectionFormatValidator, projectionTargetValidator, type ProjectionTarget } from "./projectionImportValidators";
import { projectionFileError, projectionHash, PROJECTION_TIMEOUT } from "./projectionImportRules";

export const projectionScope = (target: ProjectionTarget) => `${target.kind}:${target.project_id}`;
export const projectionStorageType = (id: Id<"projection_import_attempts">) => `application/x-ogc-projection-${id}`;
export async function assertProjectionAccess(ctx: QueryCtx | MutationCtx, target: ProjectionTarget) {
  const user = await getCurrentUserOrThrow(ctx);
  const project = await ctx.db.get(target.project_id);
  if (!project) throw new Error("Proyecto no disponible.");
  const allowed = target.kind === "expense" ? await checkDesarrolloAccess(ctx, target.project_id)
    : hasGlobalAdminAccess(user) || (hasAdminAccess(user) ? Boolean(user.organization_id) && user.organization_id === project.organization_id
      : (user.allowed_sales_projects || []).includes(target.project_id));
  if (!allowed) throw new Error("No tienes acceso a este proyecto.");
  return user;
}
export async function projectionLiveData(ctx: QueryCtx | MutationCtx, target: ProjectionTarget) {
  const rows = target.kind === "expense"
    ? await ctx.db.query("projected_transactions").withIndex("by_proyecto", q => q.eq("proyecto", target.project_id)).collect()
    : await ctx.db.query("sales_projected_transactions").withIndex("by_sales_proyecto", q => q.eq("sales_proyecto", target.project_id)).collect();
  const totals = target.kind === "expense"
    ? await ctx.db.query("weekly_projected_totals").withIndex("by_proyecto", q => q.eq("proyecto", target.project_id)).collect() : [];
  return { rows, totals };
}
export async function projectionRevision(data: Awaited<ReturnType<typeof projectionLiveData>>) {
  return projectionHash(new TextEncoder().encode(JSON.stringify([data.rows, data.totals])));
}
export async function readableProjectionAttempt(ctx: QueryCtx | MutationCtx, id: Id<"projection_import_attempts">) {
  const attempt = await ctx.db.get(id);
  if (!attempt) throw new Error("Carga no encontrada.");
  await assertProjectionAccess(ctx, attempt.target);
  return attempt;
}
export async function writableProjectionAttempt(ctx: MutationCtx, id: Id<"projection_import_attempts">) {
  const user = await assertCanWrite(ctx);
  const attempt = await readableProjectionAttempt(ctx, id);
  if (attempt.imported_by !== user._id) throw new Error("Solo quien inició la carga puede adjuntar o confirmar el Excel.");
  return attempt;
}
export async function assertProjectionOriginal(ctx: QueryCtx | MutationCtx, attempt: Doc<"projection_import_attempts">) {
  const metadata = attempt.storage_id ? await ctx.db.system.get(attempt.storage_id) : null;
  if (!metadata) throw new Error("Archivo original no disponible. Guarda el Excel antes de importar.");
  if (metadata.sha256.toLowerCase() !== attempt.file_hash || metadata.size !== attempt.size) throw new Error("El tamaño o SHA-256 del respaldo no coincide con el Excel confirmado.");
  return metadata;
}
export const getCurrentState = query({
  args: { target: projectionTargetValidator }, handler: async (ctx, { target }) => {
    await assertProjectionAccess(ctx, target);
    const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(target))).unique();
    const active = state?.active_attempt_id ? await ctx.db.get(state.active_attempt_id) : null;
    return { revision: await projectionRevision(await projectionLiveData(ctx, target)), active_attempt_id: active?._id ?? null, active };
  },
});
export const isManaged = query({ args: { target: projectionTargetValidator }, handler: async (ctx, { target }) => {
  await assertProjectionAccess(ctx, target);
  return Boolean(await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(target))).first());
} });
export const startAttempt = mutation({
  args: { target: projectionTargetValidator, format: projectionFormatValidator, request_id: v.string(), file_name: v.string(),
    file_hash: v.string(), size: v.number(), content_type: v.string(), review_hash: v.string(), expected_revision: v.string() },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    await assertProjectionAccess(ctx, args.target);
    const error = projectionFileError({ name: args.file_name, size: args.size });
    if (error) throw new Error(error);
    if (!Number.isInteger(args.size) || !/^[a-zA-Z0-9-]{1,100}$/.test(args.request_id) ||
      ![args.file_hash, args.review_hash, args.expected_revision].every(hash => /^[a-f0-9]{64}$/.test(hash)) || args.content_type.length > 200 ||
      (args.target.kind === "collection" && args.format !== "flujo")) throw new Error("Referencia de carga inválida.");
    const scope = projectionScope(args.target);
    let attempt = await ctx.db.query("projection_import_attempts").withIndex("by_scope_request", q => q.eq("scope", scope).eq("request_id", args.request_id)).unique();
    if (attempt) {
      if (attempt.imported_by !== user._id || attempt.file_hash !== args.file_hash || attempt.file_name !== args.file_name || attempt.size !== args.size ||
        attempt.review_hash !== args.review_hash || attempt.format !== args.format || attempt.content_type !== args.content_type) throw new Error("El identificador pertenece a otro archivo o revisión.");
    } else {
      // Preserve a confirmed attempt even if its reviewed revision has become stale.
      let storageId: Id<"_storage"> | undefined;
      for (const candidate of await ctx.db.query("projection_import_attempts").withIndex("by_scope_hash", q => q.eq("scope", scope).eq("file_hash", args.file_hash)).order("desc").take(50)) {
        if (!candidate.storage_id || candidate.size !== args.size) continue;
        const metadata = await ctx.db.system.get(candidate.storage_id);
        if (metadata?.sha256.toLowerCase() === args.file_hash && metadata.size === args.size) { storageId = candidate.storage_id; break; }
      }
      const createdAt = Date.now();
      const id = await ctx.db.insert("projection_import_attempts", { target: args.target, scope, format: args.format, request_id: args.request_id,
        file_name: args.file_name, file_hash: args.file_hash, size: args.size, content_type: args.content_type,
        review_hash: args.review_hash, base_revision: args.expected_revision, storage_id: storageId,
        imported_by: user._id, imported_by_name: user.name, status: "processing", created_at: createdAt });
      if (!await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", scope)).unique()) await ctx.db.insert("projection_import_states", { scope, target: args.target });
      await ctx.scheduler.runAfter(PROJECTION_TIMEOUT, internal.projectionImportHistory.expireAttempt, { attempt_id: id });
      await ctx.scheduler.runAfter(2 * 60 * 60 * 1000, internal.projectionImportHistory.cleanupUploadObjects, { attempt_id: id, created_at: createdAt, cursor: null });
      attempt = (await ctx.db.get(id))!;
    }
    return { attempt_id: attempt._id, status: attempt.status, result: attempt.result,
      upload_url: attempt.status === "processing" && !attempt.storage_id ? await ctx.storage.generateUploadUrl() : null,
      upload_content_type: projectionStorageType(attempt._id) };
  },
});
export const attachFile = mutation({
  args: { attempt_id: v.id("projection_import_attempts"), storage_id: v.id("_storage") }, handler: async (ctx, args) => {
    const attempt = await writableProjectionAttempt(ctx, args.attempt_id);
    if (attempt.storage_id === args.storage_id) { await assertProjectionOriginal(ctx, attempt); return; }
    if (attempt.status !== "processing" || Date.now() >= attempt.created_at + PROJECTION_TIMEOUT) throw new Error("La carga terminó o expiró.");
    if (attempt.storage_id) throw new Error("La carga ya tiene su original.");
    const metadata = await assertProjectionOriginal(ctx, { ...attempt, storage_id: args.storage_id });
    if (metadata.contentType !== projectionStorageType(attempt._id)) throw new Error("El archivo no pertenece a esta transferencia.");
    await ctx.db.patch(attempt._id, { storage_id: args.storage_id });
  },
});
export const failAttempt = mutation({
  args: { attempt_id: v.id("projection_import_attempts"), error: v.string() }, handler: async (ctx, args) => {
    const attempt = await writableProjectionAttempt(ctx, args.attempt_id);
    if (attempt.status === "processing") await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: args.error.slice(0, 1200) || "La carga falló." });
    return attempt.result ?? null;
  },
});
export const expireAttempt = internalMutation({
  args: { attempt_id: v.id("projection_import_attempts") }, handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attempt_id);
    if (attempt?.status === "processing" && Date.now() >= attempt.created_at + PROJECTION_TIMEOUT)
      await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: "La carga se interrumpió o superó 30 minutos." });
  },
});
// Upload URLs can succeed even when their response never reaches the browser.
// Scan only this upload window, in bounded pages, and retain the attached backup.
export const cleanupUploadObjects = internalMutation({
  args: { attempt_id: v.id("projection_import_attempts"), created_at: v.number(), cursor: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attempt_id);
    const page = await ctx.db.system.query("_storage").withIndex("by_creation_time", q => q.gte("_creationTime", args.created_at).lte("_creationTime", args.created_at + 2 * 60 * 60 * 1000))
      .paginate({ cursor: args.cursor, numItems: 100 });
    for (const file of page.page) if (file.contentType === projectionStorageType(args.attempt_id) && file._id !== attempt?.storage_id) await ctx.storage.delete(file._id);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.projectionImportHistory.cleanupUploadObjects, { ...args, cursor: page.continueCursor });
  },
});
export const getAttempt = query({ args: { attempt_id: v.id("projection_import_attempts") }, handler: async (ctx, args) => readableProjectionAttempt(ctx, args.attempt_id) });
export const listHistory = query({
  args: { target: projectionTargetValidator, paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, args.target);
    const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(args.target))).unique();
    const page = await ctx.db.query("projection_import_attempts").withIndex("by_scope_created", q => q.eq("scope", projectionScope(args.target))).order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async attempt => ({ ...attempt, active: state?.active_attempt_id === attempt._id,
      file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)) }))) };
  },
});
export const listAttemptItems = query({
  args: { attempt_id: v.id("projection_import_attempts"), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
    await readableProjectionAttempt(ctx, args.attempt_id);
    return ctx.db.query("projection_import_items").withIndex("by_attempt", q => q.eq("attempt_id", args.attempt_id))
      .paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
  },
});
export const getDownloadUrl = query({
  args: { attempt_id: v.id("projection_import_attempts") }, handler: async (ctx, args) => {
    const attempt = await readableProjectionAttempt(ctx, args.attempt_id);
    await assertProjectionOriginal(ctx, attempt);
    return { url: await ctx.storage.getUrl(attempt.storage_id!), file_name: attempt.file_name };
  },
});
export const getCurrentSource = query({
  args: { target: projectionTargetValidator, week: v.optional(v.number()), partida: v.optional(v.string()) }, handler: async (ctx, args) => {
    await assertProjectionAccess(ctx, args.target);
    const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(args.target))).unique();
    const attempt = state?.active_attempt_id ? await ctx.db.get(state.active_attempt_id) : null;
    const items = attempt ? await ctx.db.query("projection_import_items").withIndex("by_attempt", q => q.eq("attempt_id", attempt._id)).collect() : [];
    const rows = items.filter(item => args.partida === undefined || item.row.partida === args.partida).map(item => ({ ...item.row, weeklyProjections: item.row.weeklyProjections.filter(cell => args.week === undefined || cell.week === args.week) })).filter(row => row.weeklyProjections.length);
    const legacyNames = attempt ? [] : [...new Set((await projectionLiveData(ctx, args.target)).rows.filter(row => (args.week === undefined || row.week_date === args.week) && (args.partida === undefined || row.partida === args.partida)).map(row => row.file_name))];
    return { attempt, rows, legacy_file_names: legacyNames, file_available: Boolean(attempt?.storage_id && await ctx.db.system.get(attempt.storage_id)) };
  },
});
export async function currentProjectionMetadata(ctx: QueryCtx, target: ProjectionTarget) {
  await assertProjectionAccess(ctx, target);
  const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(target))).unique();
  const attempt = state?.active_attempt_id ? await ctx.db.get(state.active_attempt_id) : null;
  if (attempt) return { upload_id: attempt.legacy_upload_id || String(attempt._id), file_name: attempt.file_name, sheet_name: attempt.sheet_name,
    uploaded_at: attempt.completed_at ?? attempt.created_at, attempt_id: attempt._id, imported_by_name: attempt.imported_by_name };
  const row = target.kind === "expense" ? await ctx.db.query("projected_transactions").withIndex("by_proyecto", q => q.eq("proyecto", target.project_id)).first()
    : await ctx.db.query("sales_projected_transactions").withIndex("by_sales_proyecto", q => q.eq("sales_proyecto", target.project_id)).first();
  return row ? { upload_id: row.upload_id, file_name: row.file_name, sheet_name: row.sheet_name, uploaded_at: row.uploaded_at, attempt_id: null, imported_by_name: "Autor no disponible" } : null;
}
export async function assertLegacyProjectionWrite(ctx: MutationCtx, target: ProjectionTarget) {
  await assertCanWrite(ctx);
  await assertProjectionAccess(ctx, target);
  const managed = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(target))).first();
  if (managed) throw new Error("Este proyecto conserva historial. Actualiza sus proyecciones mediante un Excel respaldado.");
}
export async function deleteProjectionHistory(ctx: MutationCtx, target: ProjectionTarget): Promise<void> {
  const scope = projectionScope(target);
  const items = await ctx.db.query("projection_import_items").withIndex("by_scope", q => q.eq("scope", scope)).take(25);
  for (const item of items) await ctx.db.delete(item._id);
  const attempts = await ctx.db.query("projection_import_attempts").withIndex("by_scope_created", q => q.eq("scope", scope)).take(50);
  for (const attempt of attempts) {
    if (attempt.storage_id && await ctx.db.system.get(attempt.storage_id)) await ctx.storage.delete(attempt.storage_id);
    await ctx.db.delete(attempt._id);
  }
  const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", scope)).unique();
  if (state) await ctx.db.delete(state._id);
  const salesRows = target.kind === "collection" ? await ctx.db.query("sales_projected_transactions").withIndex("by_sales_proyecto", q => q.eq("sales_proyecto", target.project_id)).take(100) : [];
  const salesTotals = target.kind === "collection" ? await ctx.db.query("sales_weekly_projected_totals").withIndex("by_sales_proyecto", q => q.eq("sales_proyecto", target.project_id)).take(100) : [];
  for (const row of [...salesRows, ...salesTotals]) await ctx.db.delete(row._id);
  if (items.length === 25 || attempts.length === 50 || salesRows.length === 100 || salesTotals.length === 100) await ctx.scheduler.runAfter(0, internal.projectionImportHistory.purgeDeletedProject, { target });
}
export const purgeDeletedProject = internalMutation({ args: { target: projectionTargetValidator }, handler: async (ctx, args) => {
  if (await ctx.db.get(args.target.project_id)) return;
  await deleteProjectionHistory(ctx, args.target);
} });
