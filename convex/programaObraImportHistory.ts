import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { checkDesarrolloAccess, getCurrentUserOrThrow, assertCanWrite } from "./permissions";
import { assertProgramCapability } from "./programaObraExecution";
import {
  PROGRAM_IMPORT_MAX_BYTES, PROGRAM_IMPORT_TIMEOUT, programImportConfirmationArgs, programImportDigest,
  programImportSourceValidator, programImportTargetValidator, type ProgramImportResult,
} from "./programaObraImportValidators";

type Ctx = MutationCtx | QueryCtx;
export async function assertProgramImportAccess(ctx: Ctx, proyecto: Id<"desarrollos">) {
  const user = await getCurrentUserOrThrow(ctx);
  // Admin access helpers can allow deleted projects: require the parent explicitly.
  if (!await ctx.db.get(proyecto) || !await checkDesarrolloAccess(ctx, proyecto)) throw new Error("No tienes acceso a este proyecto.");
  return user;
}
export async function assertCanImportProgram(ctx: MutationCtx, proyecto: Id<"desarrollos">) {
  const user = await assertCanWrite(ctx);
  await assertProgramImportAccess(ctx, proyecto);
  const config = await ctx.db.query("programa_obra_config").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).unique();
  if (config) await assertProgramCapability(ctx, proyecto, "plan");
  return user;
}
async function readableAttempt(ctx: Ctx, id: Id<"programa_obra_import_attempts">) {
  const attempt = await ctx.db.get(id);
  if (!attempt) throw new Error("Intento de importación no encontrado.");
  await assertProgramImportAccess(ctx, attempt.proyecto);
  return attempt;
}
export async function writableProgramAttempt(ctx: MutationCtx, id: Id<"programa_obra_import_attempts">) {
  const attempt = await readableAttempt(ctx, id);
  const user = await assertCanImportProgram(ctx, attempt.proyecto);
  if (attempt.imported_by !== user._id) throw new Error("Solo quien inició la carga puede confirmarla o adjuntar su archivo.");
  return attempt;
}
export async function assertProgramAttemptFile(ctx: Ctx, attempt: Doc<"programa_obra_import_attempts">) {
  const metadata = attempt.storage_id ? await ctx.db.system.get(attempt.storage_id) : null;
  if (!metadata) throw new Error("Archivo original no disponible. Guarda el Excel antes de importar.");
  if (metadata.sha256.toLowerCase() !== attempt.source?.file_hash || metadata.size !== attempt.size) throw new Error("El archivo guardado no coincide con el Excel revisado (tamaño o SHA-256).");
  return metadata;
}
async function fileAvailable(ctx: Ctx, attempt: Doc<"programa_obra_import_attempts">) {
  if (!attempt.storage_id || !attempt.source) return false;
  const meta = await ctx.db.system.get(attempt.storage_id);
  return !!meta && meta.size === attempt.size && meta.sha256.toLowerCase() === attempt.source.file_hash;
}
function confirmation(args: { rows: unknown; expected_fingerprint: string; review: unknown }) {
  return { rows: args.rows, expected_fingerprint: args.expected_fingerprint, review: args.review };
}
export async function assertProgramConfirmation(attempt: Doc<"programa_obra_import_attempts">, args: Parameters<typeof confirmation>[0]) {
  if (attempt.confirmation_hash !== await programImportDigest(confirmation(args))) throw new Error("Esta confirmación pertenece a otra revisión. Inicia una nueva carga.");
}

export const startAttempt = mutation({
  args: { ...programImportConfirmationArgs, request_id: v.string(), source: programImportSourceValidator, size: v.number(), content_type: v.string() },
  handler: async (ctx, args) => {
    const user = await assertCanImportProgram(ctx, args.proyecto);
    if (!args.request_id.trim() || args.request_id.length > 100 || args.request_id.startsWith("legacy:")) throw new Error("Identificador de carga inválido.");
    if (!/\.(xlsx|xls)$/i.test(args.source.file_name) || args.source.file_name.length > 255 ||
      !Number.isInteger(args.size) || args.size <= 0 || args.size > PROGRAM_IMPORT_MAX_BYTES || !/^[a-f0-9]{64}$/i.test(args.source.file_hash)) {
      throw new Error("Solo se permiten archivos Excel .xlsx o .xls de hasta 10 MB con una huella válida.");
    }
    if (!args.rows.length || args.rows.length > 2000 || args.review.date_resolutions.length > 2000 ||
      (args.source.sheet_name?.length ?? 0) > 255 || !args.expected_fingerprint) throw new Error("Metadatos de revisión inválidos.");
    if (args.rows.some(row => [row.partida, row.familia, row.subpartida].some(value => (value?.length ?? 0) > 500) ||
      [row.fecha_inicio, row.fecha_fin, row.anticipo_fecha, row.suministro_fecha, row.finiquito_fecha].some(value => (value?.length ?? 0) > 32)) ||
      args.review.date_resolutions.some(d => !Number.isInteger(d.partida_index) || d.partida_index < 0 || !Number.isInteger(d.child_index) || d.child_index < 0 ||
        d.partida.length > 500 || d.child.length > 500 || d.parent_finish.length > 32 || d.child_finish.length > 32)) throw new Error("Los nombres o decisiones de la revisión son inválidos o demasiado extensos.");
    const reviewed_json = JSON.stringify({ rows: args.rows, review: args.review });
    if (new TextEncoder().encode(reviewed_json).length > 750_000) throw new Error("La revisión es demasiado extensa. Divide el Excel en cargas más pequeñas.");
    const source = { ...args.source, file_hash: args.source.file_hash.toLowerCase() };
    const confirmation_hash = await programImportDigest(confirmation(args));
    const existing = await ctx.db.query("programa_obra_import_attempts")
      .withIndex("by_proyecto_request", q => q.eq("proyecto", args.proyecto).eq("request_id", args.request_id)).unique();
    let attemptId: Id<"programa_obra_import_attempts">;
    if (existing) {
      if (existing.imported_by !== user._id || existing.confirmation_hash !== confirmation_hash || existing.size !== args.size ||
        existing.source?.file_name !== source.file_name || existing.source?.file_hash !== source.file_hash || existing.source?.sheet_name !== source.sheet_name) throw new Error("El identificador de carga ya pertenece a otro intento.");
      attemptId = existing._id;
    } else {
      let storageId: Id<"_storage"> | undefined;
      // Reuse bytes within this project, while keeping a new confirmation event and filename.
      for (const candidate of await ctx.db.query("programa_obra_import_attempts")
        .withIndex("by_proyecto_hash", q => q.eq("proyecto", args.proyecto).eq("source.file_hash", source.file_hash)).order("desc").take(50)) {
        if (candidate.size === args.size && await fileAvailable(ctx, candidate)) { storageId = candidate.storage_id; break; }
      }
      attemptId = await ctx.db.insert("programa_obra_import_attempts", {
        proyecto: args.proyecto, request_id: args.request_id, source, size: args.size,
        content_type: args.content_type.slice(0, 255) || "application/octet-stream", storage_id: storageId,
        confirmation_hash, row_count: args.rows.length, status: "processing",
        imported_by: user._id, imported_by_name: user.name, created_at: Date.now(),
      });
      await ctx.db.insert("programa_obra_import_reviews", { proyecto: args.proyecto, attempt_id: attemptId, kind: "confirmed", snapshot_json: reviewed_json });
      await ctx.scheduler.runAfter(PROGRAM_IMPORT_TIMEOUT, internal.programaObraImportHistory.expireAttempt, { attempt_id: attemptId });
    }
    const attempt = (await ctx.db.get(attemptId))!;
    return { attempt_id: attemptId, status: attempt.status, result: attempt.result, error: attempt.error,
      upload_url: attempt.status === "processing" && !attempt.storage_id ? await ctx.storage.generateUploadUrl() : null };
  },
});
export const attachFile = mutation({
  args: { attempt_id: v.id("programa_obra_import_attempts"), storage_id: v.id("_storage") },
  handler: async (ctx, args) => {
    const attempt = await writableProgramAttempt(ctx, args.attempt_id);
    if (attempt.status !== "processing") throw new Error("El intento ya terminó y no acepta archivos.");
    if (Date.now() >= attempt.created_at + PROGRAM_IMPORT_TIMEOUT) throw new Error("El intento de carga expiró.");
    if (attempt.storage_id && attempt.storage_id !== args.storage_id) throw new Error("El intento ya tiene un archivo original.");
    const meta = await assertProgramAttemptFile(ctx, { ...attempt, storage_id: args.storage_id });
    await ctx.db.patch(attempt._id, { storage_id: args.storage_id, content_type: meta.contentType || attempt.content_type });
  },
});
export const failAttempt = mutation({
  args: { attempt_id: v.id("programa_obra_import_attempts"), error: v.string() },
  handler: async (ctx, args) => {
    const attempt = await readableAttempt(ctx, args.attempt_id);
    const user = await getCurrentUserOrThrow(ctx);
    if (user._id !== attempt.imported_by) throw new Error("Solo quien inició la carga puede registrar su fallo.");
    // Logging failure remains possible if planning permission was revoked during upload.
    if (attempt.status === "processing") await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: args.error.slice(0, 1000) || "La importación falló." });
    return attempt.result ?? null;
  },
});
export const expireAttempt = internalMutation({
  args: { attempt_id: v.id("programa_obra_import_attempts") },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attempt_id);
    if (attempt?.status === "processing" && Date.now() >= attempt.created_at + PROGRAM_IMPORT_TIMEOUT) {
      await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: "La carga se interrumpió o superó el límite de 30 minutos." });
    }
  },
});
export const confirmImport = action({
  args: { ...programImportConfirmationArgs, attempt_id: v.id("programa_obra_import_attempts") },
  handler: async (ctx, args): Promise<ProgramImportResult> => {
    try { return await ctx.runMutation(api.programa_obra.bulkUpsertFromExcel, args); }
    catch (error) {
      const message = error instanceof Error ? error.message : "La importación falló.";
      const result = await ctx.runMutation(api.programaObraImportHistory.failAttempt, { attempt_id: args.attempt_id, error: message });
      if (result) return await ctx.runMutation(api.programa_obra.bulkUpsertFromExcel, args);
      throw new ConvexError(message);
    }
  },
});
export const getAttempt = query({
  args: { attempt_id: v.id("programa_obra_import_attempts") },
  handler: async (ctx, args) => {
    const attempt = await readableAttempt(ctx, args.attempt_id);
    const revision = attempt.revision_id ? await ctx.db.get(attempt.revision_id) : null;
    const confirmed = await ctx.db.query("programa_obra_import_reviews").withIndex("by_attempt_kind", q => q.eq("attempt_id", attempt._id).eq("kind", "confirmed")).unique();
    const applied = await ctx.db.query("programa_obra_import_reviews").withIndex("by_attempt_kind", q => q.eq("attempt_id", attempt._id).eq("kind", "applied")).unique();
    return { ...attempt, file_available: await fileAvailable(ctx, attempt), reviewed_json: confirmed?.snapshot_json,
      snapshot_json: applied?.snapshot_json ?? (revision?.proyecto === attempt.proyecto ? revision.snapshot_json : null) };
  },
});
export const listHistory = query({
  args: { proyecto: v.id("desarrollos"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await assertProgramImportAccess(ctx, args.proyecto);
    const page = await ctx.db.query("programa_obra_import_attempts").withIndex("by_proyecto_created", q => q.eq("proyecto", args.proyecto))
      .order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async attempt => ({ ...attempt, file_available: await fileAvailable(ctx, attempt) }))) };
  },
});
export const listAttemptItems = query({
  args: { attempt_id: v.id("programa_obra_import_attempts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await readableAttempt(ctx, args.attempt_id);
    const page = await ctx.db.query("programa_obra_import_items").withIndex("by_attempt", q => q.eq("attempt_id", args.attempt_id))
      .paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async item => {
      const [kind, rawId] = item.target_key.split(":");
      const table = kind === "schedule" ? "programa_obra" : kind === "detail" ? "programa_obra_detalle" : "programa_obra_activities";
      const id = ctx.db.normalizeId(table, rawId);
      const record = id ? await ctx.db.get(id) : null;
      return { ...item, deleted: !record, archived: record?.archived ?? false };
    })) };
  },
});
export const listSources = query({
  args: { proyecto: v.id("desarrollos"), target: programImportTargetValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await assertProgramImportAccess(ctx, args.proyecto);
    const record = await ctx.db.get(args.target.id);
    if (record && record.proyecto !== args.proyecto) throw new Error("El registro no pertenece al proyecto.");
    // Historical IDs remain queryable after a row/activity has been removed.
    const page = await ctx.db.query("programa_obra_import_items")
      .withIndex("by_proyecto_target", q => q.eq("proyecto", args.proyecto).eq("target_key", `${args.target.kind}:${args.target.id}`))
      .order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async item => {
      const attempt = await ctx.db.get(item.attempt_id);
      if (!attempt || attempt.proyecto !== args.proyecto) throw new Error("Referencia histórica inválida.");
      return { ...item, attempt, file_available: await fileAvailable(ctx, attempt) };
    })) };
  },
});
export const getDownloadUrl = query({
  args: { attempt_id: v.id("programa_obra_import_attempts") },
  handler: async (ctx, args) => {
    const attempt = await readableAttempt(ctx, args.attempt_id);
    await assertProgramAttemptFile(ctx, attempt);
    return { url: await ctx.storage.getUrl(attempt.storage_id!), file_name: attempt.source!.file_name };
  },
});

export const migrateLegacyAttempts = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), dry_run: v.boolean() },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("programa_obra_revisions").paginate({ cursor: args.cursor, numItems: 25 });
    let migrated = 0;
    for (const revision of page.page) {
      if (revision.kind !== "import" || revision.import_attempt_id || !await ctx.db.get(revision.proyecto)) continue;
      migrated++;
      if (args.dry_run) continue;
      const request_id = `legacy:${revision._id}`;
      const existing = await ctx.db.query("programa_obra_import_attempts")
        .withIndex("by_proyecto_request", q => q.eq("proyecto", revision.proyecto).eq("request_id", request_id)).unique();
      const user = await ctx.db.get(revision.actor_id);
      const attemptId = existing?._id ?? await ctx.db.insert("programa_obra_import_attempts", {
        proyecto: revision.proyecto, request_id, status: "legacy", imported_by: revision.actor_id,
        imported_by_name: user?.name || "Usuario no disponible", created_at: revision.created_at, completed_at: revision.created_at, revision_id: revision._id,
      });
      // A snapshot proves a revision; current names cannot prove historical row identities or original bytes.
      await ctx.db.patch(revision._id, { import_attempt_id: attemptId });
    }
    return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, migrated };
  },
});

export const purgeDeletedProjectProgram = internalMutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args): Promise<void> => {
    if (!await ctx.db.get(args.proyecto)) await deleteProjectProgramHistory(ctx, args.proyecto);
  },
});
export async function deleteProjectProgramHistory(ctx: MutationCtx, proyecto: Id<"desarrollos">): Promise<void> {
  const continueCleanup = () => ctx.scheduler.runAfter(0, internal.programaObraImportHistory.purgeDeletedProjectProgram, { proyecto });
  const attempts = await ctx.db.query("programa_obra_import_attempts").withIndex("by_proyecto_created", q => q.eq("proyecto", proyecto)).take(5);
  for (const attempt of attempts) {
    if (attempt.storage_id && await ctx.db.system.get(attempt.storage_id)) await ctx.storage.delete(attempt.storage_id);
    await ctx.db.delete(attempt._id);
  }
  if (attempts.length) { await continueCleanup(); return; }
  const items = await ctx.db.query("programa_obra_import_items").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).take(100);
  for (const item of items) await ctx.db.delete(item._id);
  if (items.length) { await continueCleanup(); return; }
  const tables = ["programa_obra_import_reviews", "programa_obra_revisions", "programa_obra_events", "programa_obra_avance_historial", "programa_obra_comentarios",
    "programa_obra_exceptions", "programa_obra_requirements", "programa_obra_dependencies", "programa_obra_activities", "programa_obra_fronts",
    "programa_obra_permissions", "programa_obra_config", "programa_obra_hito_links", "programa_obra_ponderacion", "programa_obra_detalle", "programa_obra", "avance_real"] as const;
  for (const table of tables) {
    const batchSize = table === "programa_obra_revisions" || table === "programa_obra_import_reviews" ? 3 : 50;
    const records = await ctx.db.query(table).withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).take(batchSize);
    for (const record of records) await ctx.db.delete(record._id);
    // Isolate large JSON documents in their own mutation, even across tables.
    if (records.length) { await continueCleanup(); return; }
  }
}
