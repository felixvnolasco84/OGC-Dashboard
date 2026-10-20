import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertCanWrite, checkDesarrolloAccess, getCurrentUserOrThrow } from "./permissions";
import { LABOR_IMPORT_ATTEMPT_TIMEOUT, LABOR_IMPORT_MAX_BYTES, laborImportSourceValidator } from "./laborImportValidators";

async function assertProjectAccess(ctx: QueryCtx | MutationCtx, proyecto: Id<"desarrollos">) {
  await getCurrentUserOrThrow(ctx);
  if (!(await checkDesarrolloAccess(ctx, proyecto))) throw new Error("No tienes acceso a este proyecto.");
}

async function readableAttempt(ctx: QueryCtx | MutationCtx, id: Id<"labor_payment_import_attempts">) {
  const attempt = await ctx.db.get(id);
  if (!attempt) throw new Error("Intento de importación no encontrado.");
  await assertProjectAccess(ctx, attempt.proyecto);
  return attempt;
}

export async function writableAttempt(ctx: MutationCtx, id: Id<"labor_payment_import_attempts">) {
  const user = await assertCanWrite(ctx);
  const attempt = await readableAttempt(ctx, id);
  if (attempt.imported_by !== user._id) throw new Error("Solo quien inició la carga puede confirmarla o adjuntar su archivo.");
  return attempt;
}

export async function assertAttemptFile(ctx: QueryCtx | MutationCtx, attempt: Doc<"labor_payment_import_attempts">) {
  const metadata = attempt.storage_id ? await ctx.db.system.get(attempt.storage_id) : null;
  if (!metadata) throw new Error("Archivo original no disponible. Guarda el Excel antes de importar.");
  if (metadata.sha256.toLowerCase() !== attempt.source.file_hash || metadata.size !== attempt.size) {
    throw new Error("El archivo guardado no coincide con el Excel validado.");
  }
  return metadata;
}

export const startAttempt = mutation({
  args: {
    proyecto: v.id("desarrollos"), request_id: v.string(), source: laborImportSourceValidator,
    size: v.number(), content_type: v.string(), dates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    await assertProjectAccess(ctx, args.proyecto);
    if (!args.request_id.trim() || args.request_id.length > 100 || args.request_id.startsWith("legacy:")) {
      throw new Error("Identificador de carga inválido.");
    }
    if (!/\.(xlsx|xls)$/i.test(args.source.file_name) || args.source.file_name.length > 255 ||
      !Number.isInteger(args.size) || args.size <= 0 || args.size > LABOR_IMPORT_MAX_BYTES ||
      !/^[a-f0-9]{64}$/i.test(args.source.file_hash)) {
      throw new Error("Solo se permiten archivos Excel .xlsx o .xls de hasta 10 MB con una huella válida.");
    }
    if (!args.source.sheet_name.trim() || !args.source.administration.trim() || !args.source.currency.trim() ||
      !Number.isInteger(args.source.row_count) || args.source.row_count < 1 || args.source.row_count > 1000 ||
      !args.dates.length || args.dates.length > 1000 || args.dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      throw new Error("Metadatos de importación inválidos.");
    }
    const source = { ...args.source, file_hash: args.source.file_hash.toLowerCase() };
    const dates = [...new Set(args.dates)].sort();
    const existing = await ctx.db.query("labor_payment_import_attempts")
      .withIndex("by_proyecto_request", q => q.eq("proyecto", args.proyecto).eq("request_id", args.request_id)).unique();
    let attemptId: Id<"labor_payment_import_attempts">;
    if (existing) {
      if (existing.imported_by !== user._id || Object.entries(source).some(([key, value]) => existing.source[key as keyof typeof source] !== value) ||
        existing.size !== args.size || JSON.stringify(existing.dates) !== JSON.stringify(dates)) {
        throw new Error("El identificador de carga ya pertenece a otro intento.");
      }
      attemptId = existing._id;
    } else {
      // Reuse bytes only inside this project; an attempt remains a separate audit event.
      const candidates = ctx.db.query("labor_payment_import_attempts")
        .withIndex("by_proyecto_hash", q => q.eq("proyecto", args.proyecto).eq("source.file_hash", source.file_hash)).order("desc");
      let storageId: Id<"_storage"> | undefined;
      for await (const candidate of candidates) {
        if (!candidate.storage_id || candidate.size !== args.size) continue;
        const metadata = await ctx.db.system.get(candidate.storage_id);
        if (metadata?.sha256.toLowerCase() === source.file_hash && metadata.size === args.size) {
          storageId = candidate.storage_id;
          break;
        }
      }
      attemptId = await ctx.db.insert("labor_payment_import_attempts", {
        proyecto: args.proyecto, request_id: args.request_id, source, dates,
        size: args.size, content_type: args.content_type || "application/octet-stream", storage_id: storageId,
        status: "processing", imported_by: user._id, imported_by_name: user.name, created_at: Date.now(),
      });
      await ctx.scheduler.runAfter(LABOR_IMPORT_ATTEMPT_TIMEOUT, internal.laborImportHistory.expireAttempt, { attempt_id: attemptId });
    }
    const attempt = (await ctx.db.get(attemptId))!;
    return {
      attempt_id: attemptId, status: attempt.status, result: attempt.result,
      upload_url: attempt.status === "processing" && !attempt.storage_id ? await ctx.storage.generateUploadUrl() : null,
    };
  },
});

export const attachFile = mutation({
  args: { attempt_id: v.id("labor_payment_import_attempts"), storage_id: v.id("_storage") },
  handler: async (ctx, args) => {
    const attempt = await writableAttempt(ctx, args.attempt_id);
    if (attempt.status !== "processing") throw new Error("El intento ya terminó y no acepta archivos.");
    if (Date.now() >= attempt.created_at + LABOR_IMPORT_ATTEMPT_TIMEOUT) throw new Error("El intento de carga expiró.");
    if (attempt.storage_id && attempt.storage_id !== args.storage_id) throw new Error("El intento ya tiene un archivo original.");
    const metadata = await assertAttemptFile(ctx, { ...attempt, storage_id: args.storage_id });
    await ctx.db.patch(attempt._id, { storage_id: args.storage_id, content_type: metadata.contentType || attempt.content_type });
  },
});

export const failAttempt = mutation({
  args: { attempt_id: v.id("labor_payment_import_attempts"), error: v.string() },
  handler: async (ctx, args) => {
    const attempt = await writableAttempt(ctx, args.attempt_id);
    // A lost response must never turn a committed import into a failure.
    if (attempt.status === "processing") {
      await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: args.error.slice(0, 1000) || "La importación falló." });
    }
    return attempt.result ?? null;
  },
});

export const expireAttempt = internalMutation({
  args: { attempt_id: v.id("labor_payment_import_attempts") },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attempt_id);
    if (attempt?.status === "processing" && Date.now() >= attempt.created_at + LABOR_IMPORT_ATTEMPT_TIMEOUT) {
      await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: "La carga se interrumpió o superó el límite de 30 minutos." });
    }
  },
});

export const getAttempt = query({
  args: { attempt_id: v.id("labor_payment_import_attempts") },
  handler: async (ctx, args) => readableAttempt(ctx, args.attempt_id),
});

export const listHistory = query({
  args: { proyecto: v.id("desarrollos"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await assertProjectAccess(ctx, args.proyecto);
    const page = await ctx.db.query("labor_payment_import_attempts")
      .withIndex("by_proyecto_created", q => q.eq("proyecto", args.proyecto)).order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 25) });
    return { ...page, page: await Promise.all(page.page.map(async attempt => ({
      ...attempt, file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)),
    }))) };
  },
});

export const listAttemptItems = query({
  args: { attempt_id: v.id("labor_payment_import_attempts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await readableAttempt(ctx, args.attempt_id);
    const page = await ctx.db.query("labor_payment_import_attempt_items")
      .withIndex("by_attempt", q => q.eq("attempt_id", args.attempt_id))
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 25) });
    return { ...page, page: await Promise.all(page.page.map(async item => ({
      ...item, deleted: !(await ctx.db.get(item.transaccion_id)),
    }))) };
  },
});

export const listTransactionSources = query({
  args: { transaccion_id: v.id("transacciones"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transaccion_id);
    if (!transaction) {
      await getCurrentUserOrThrow(ctx);
      return { page: [], isDone: true, continueCursor: "" };
    }
    await assertProjectAccess(ctx, transaction.proyecto);
    const page = await ctx.db.query("labor_payment_import_attempt_items")
      .withIndex("by_transaction", q => q.eq("transaccion_id", args.transaccion_id)).order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 25) });
    return { ...page, page: await Promise.all(page.page.map(async item => {
      const attempt = await ctx.db.get(item.attempt_id);
      if (!attempt || attempt.proyecto !== transaction.proyecto) throw new Error("Referencia de archivo inválida.");
      return { ...item, attempt, file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)) };
    })) };
  },
});

export const getLegacyTransactionReference = query({
  args: { transaccion_id: v.id("transacciones") },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transaccion_id);
    if (!transaction) return null;
    await assertProjectAccess(ctx, transaction.proyecto);
    const cut = transaction.labor_import_id ? await ctx.db.get(transaction.labor_import_id) : null;
    if (!cut || cut.proyecto !== transaction.proyecto) return null;
    const attempt = cut.source_attempt_id ? await ctx.db.get(cut.source_attempt_id) : null;
    // A consolidated cut isn't proof that its workbook contains this transaction.
    if (attempt && attempt.status !== "legacy") return null;
    return { file_name: cut.source_file_name, sheet_name: cut.source_sheet_name, imported_at: cut.imported_at };
  },
});

export const getDownloadUrl = query({
  args: { attempt_id: v.id("labor_payment_import_attempts") },
  handler: async (ctx, args) => {
    const attempt = await readableAttempt(ctx, args.attempt_id);
    await assertAttemptFile(ctx, attempt);
    return { url: await ctx.storage.getUrl(attempt.storage_id!), file_name: attempt.source.file_name };
  },
});

// Run in bounded pages from the migration script, with a read-only diagnostic mode.
export const migrateLegacyAttempts = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), dry_run: v.boolean() },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("labor_payment_imports").paginate({ cursor: args.cursor, numItems: 25 });
    let migrated = 0;
    for (const cut of page.page) {
      if (cut.source_attempt_id) continue;
      if (!(await ctx.db.get(cut.proyecto))) continue;
      migrated++;
      if (args.dry_run) continue;
      const key = `legacy:${cut.source_file_hash}:${cut.imported_by}:${cut.imported_at}`;
      const existing = await ctx.db.query("labor_payment_import_attempts")
        .withIndex("by_proyecto_request", q => q.eq("proyecto", cut.proyecto).eq("request_id", key)).unique();
      let id = existing?._id;
      if (existing) {
        await ctx.db.patch(existing._id, { dates: [...new Set([...existing.dates, cut.capture_date])].sort() });
      } else {
        const user = await ctx.db.get(cut.imported_by);
        id = await ctx.db.insert("labor_payment_import_attempts", {
          proyecto: cut.proyecto, request_id: key,
          source: { file_name: cut.source_file_name, file_hash: cut.source_file_hash, sheet_name: cut.source_sheet_name,
            administration: cut.source_administration, currency: cut.source_currency, row_count: 0 },
          dates: [cut.capture_date], status: "legacy", imported_by: cut.imported_by,
          imported_by_name: user?.name || "Usuario no disponible", created_at: cut.imported_at, completed_at: cut.imported_at,
        });
      }
      await ctx.db.patch(cut._id, { source_attempt_id: id });
    }
    return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, migrated };
  },
});

export const purgeDeletedProjectHistory = internalMutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args): Promise<void> => {
    // Only continue the cascade after the parent deletion has committed.
    if (await ctx.db.get(args.proyecto)) return;
    await deleteProjectImportHistory(ctx, args.proyecto);
  },
});

export async function deleteProjectImportHistory(ctx: MutationCtx, proyecto: Id<"desarrollos">): Promise<void> {
  // Histories can grow beyond a single mutation's read/write limits.
  const items = await ctx.db.query("labor_payment_import_attempt_items").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).take(100);
  for (const item of items) await ctx.db.delete(item._id);
  const attempts = await ctx.db.query("labor_payment_import_attempts").withIndex("by_proyecto_created", q => q.eq("proyecto", proyecto)).take(100);
  for (const attempt of attempts) {
    if (attempt.storage_id && await ctx.db.system.get(attempt.storage_id)) await ctx.storage.delete(attempt.storage_id);
    await ctx.db.delete(attempt._id);
  }
  const cuts = await ctx.db.query("labor_payment_imports").withIndex("by_proyecto_estado_fecha", q => q.eq("proyecto", proyecto)).take(100);
  for (const cut of cuts) await ctx.db.delete(cut._id);
  if (items.length === 100 || attempts.length === 100 || cuts.length === 100) {
    await ctx.scheduler.runAfter(0, internal.laborImportHistory.purgeDeletedProjectHistory, { proyecto });
  }
}
