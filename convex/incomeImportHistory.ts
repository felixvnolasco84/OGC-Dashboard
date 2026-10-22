import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertIncomeManager, assertIncomeProjectAccess, getCurrentUserOrThrow } from "./permissions";
import { hasIncomeManagementAccess } from "./ingresoRules";
import { incomeFileError, parseIncomeReview, INCOME_IMPORT_TIMEOUT, incomeStorageType } from "./incomeImportRules";
import type { IncomeImportResult } from "./incomeImportValidators";

export async function readableIncomeAttempt(ctx: QueryCtx | MutationCtx, id: Id<"income_import_attempts">) {
  const user = await getCurrentUserOrThrow(ctx);
  const attempt = await ctx.db.get(id);
  if (!attempt) throw new Error("Intento de carga no encontrado.");
  await assertIncomeProjectAccess(ctx, attempt.proyecto);
  return { attempt, user };
}
export async function writableIncomeAttempt(ctx: MutationCtx, id: Id<"income_import_attempts">) {
  const user = await assertIncomeManager(ctx);
  const { attempt } = await readableIncomeAttempt(ctx, id);
  if (attempt.imported_by !== user._id) throw new Error("Solo quien inició la carga puede adjuntar o confirmar el Excel.");
  return { attempt, user };
}
export async function assertIncomeOriginal(ctx: QueryCtx | MutationCtx, attempt: Doc<"income_import_attempts">) {
  const metadata = attempt.storage_id ? await ctx.db.system.get(attempt.storage_id) : null;
  if (!metadata) throw new Error("Archivo original no disponible. Guarda el Excel antes de importar.");
  if (metadata.sha256.toLowerCase() !== attempt.file_hash || metadata.size !== attempt.size) throw new Error("El tamaño o SHA-256 del respaldo no coincide con el Excel confirmado.");
  return metadata;
}
function publicAttempt(attempt: Doc<"income_import_attempts">) {
  // The immutable review is stored separately, so this remains bounded metadata.
  return attempt;
}

export const startAttempt = mutation({
  args: { proyecto: v.id("desarrollos"), request_id: v.string(), file_name: v.string(), file_hash: v.string(), size: v.number(), content_type: v.string(), review_json: v.string() },
  handler: async (ctx, args) => {
    const user = await assertIncomeManager(ctx);
    await assertIncomeProjectAccess(ctx, args.proyecto);
    const error = incomeFileError({ name: args.file_name, size: args.size });
    if (error) throw new Error(error);
    if (!/^[a-f0-9]{64}$/i.test(args.file_hash) || !/^[a-zA-Z0-9-]{1,100}$/.test(args.request_id) || args.content_type.length > 200) throw new Error("Referencia de carga inválida.");
    const hash = args.file_hash.toLowerCase();
    const existing = await ctx.db.query("income_import_attempts").withIndex("by_proyecto_request", q => q.eq("proyecto", args.proyecto).eq("request_id", args.request_id)).unique();
    if (existing) {
      const review = await ctx.db.query("income_import_reviews").withIndex("by_attempt", q => q.eq("attempt_id", existing._id)).unique();
      if (existing.imported_by !== user._id || existing.file_name !== args.file_name || existing.file_hash !== hash || existing.size !== args.size || review?.review_json !== args.review_json || existing.content_type !== args.content_type) throw new Error("El identificador ya pertenece a otro archivo o vista previa.");
      return { attempt_id: existing._id, status: existing.status, result: existing.result };
    }
    const { rows, parserSummary } = parseIncomeReview(args.review_json);
    const valid = rows.filter(row => row.status === "valid");
    if (!valid.length) throw new Error("No hay ingresos válidos para cargar.");
    const { review_json, ...metadata } = args;
    const id = await ctx.db.insert("income_import_attempts", {
      ...metadata, file_hash: hash, parser_summary: parserSummary, response_rows: rows.length, valid_rows: valid.length,
      rejected_rows: rows.length - valid.length, status: "processing", imported_by: user._id, imported_by_name: user.name, created_at: Date.now(),
    });
    await ctx.db.insert("income_import_reviews", { proyecto: args.proyecto, attempt_id: id, review_json });
    for (const row of rows) await ctx.db.insert("income_import_items", {
      proyecto: args.proyecto, attempt_id: id, position: row.position, source_row: row.rowIndex, raw_json: row.raw_json,
      monto: row.monto, fecha: row.fecha, descripcion: row.descripcion, moneda: row.moneda, errors: row.errors,
      outcome: row.status === "valid" ? "pending" : "rejected",
    });
    await ctx.scheduler.runAfter(INCOME_IMPORT_TIMEOUT, internal.incomeImportHistory.expireAttempt, { attempt_id: id });
    return { attempt_id: id, status: "processing" as const, result: undefined };
  },
});

export const prepareUpload = mutation({
  args: { attempt_id: v.id("income_import_attempts") },
  handler: async (ctx, args) => {
    const { attempt } = await writableIncomeAttempt(ctx, args.attempt_id);
    if (attempt.result) return { upload_url: null, content_type: "", result: attempt.result };
    if (attempt.status !== "processing" || Date.now() >= attempt.created_at + INCOME_IMPORT_TIMEOUT) throw new Error("El intento terminó o expiró. Inicia una nueva carga.");
    if (attempt.storage_id) {
      await assertIncomeOriginal(ctx, attempt);
      return { upload_url: null, content_type: "", result: undefined };
    }
    return { upload_url: await ctx.storage.generateUploadUrl(), content_type: incomeStorageType(attempt._id), result: undefined };
  },
});
export const attachFile = mutation({
  args: { attempt_id: v.id("income_import_attempts"), storage_id: v.id("_storage") },
  handler: async (ctx, args) => {
    const { attempt } = await writableIncomeAttempt(ctx, args.attempt_id);
    // Idempotent attachment also recovers a lost attachment/confirmation response.
    if (attempt.storage_id === args.storage_id) { await assertIncomeOriginal(ctx, attempt); return; }
    if (attempt.status !== "processing" || Date.now() >= attempt.created_at + INCOME_IMPORT_TIMEOUT) throw new Error("El intento terminó o expiró.");
    if (attempt.storage_id) throw new Error("El intento ya tiene un archivo original.");
    const metadata = await assertIncomeOriginal(ctx, { ...attempt, storage_id: args.storage_id });
    if (metadata.contentType !== incomeStorageType(attempt._id)) throw new Error("El archivo no pertenece a esta transferencia.");
    const linked = await ctx.db.query("income_import_attempts").withIndex("by_storage", q => q.eq("storage_id", args.storage_id)).first();
    if (linked) throw new Error("El archivo ya pertenece a otra carga.");
    await ctx.db.patch(attempt._id, { storage_id: args.storage_id, error: undefined });
  },
});
export const failAttempt = mutation({
  args: { attempt_id: v.id("income_import_attempts"), error: v.string() },
  handler: async (ctx, args) => {
    const { attempt } = await writableIncomeAttempt(ctx, args.attempt_id);
    if (attempt.status === "processing") await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: args.error.slice(0, 1000) || "La carga falló." });
    return attempt.result ?? null;
  },
});
export const recordTransferError = mutation({
  args: { attempt_id: v.id("income_import_attempts"), error: v.string() }, handler: async (ctx, args) => {
    const { attempt } = await writableIncomeAttempt(ctx, args.attempt_id);
    if (attempt.status === "processing") await ctx.db.patch(attempt._id, { error: args.error.slice(0, 1000) });
  },
});
export const expireAttempt = internalMutation({
  args: { attempt_id: v.id("income_import_attempts") },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attempt_id);
    if (attempt?.status === "processing" && Date.now() >= attempt.created_at + INCOME_IMPORT_TIMEOUT) await ctx.db.patch(attempt._id, { status: "failed", completed_at: Date.now(), error: `${attempt.error ? `${attempt.error} ` : ""}La carga se interrumpió o superó 30 minutos. No se crearon ingresos.`.slice(0, 1200) });
  },
});
export const confirmImport = action({
  args: { attempt_id: v.id("income_import_attempts") },
  handler: async (ctx, args): Promise<IncomeImportResult> => {
    try { return await ctx.runMutation(api.ingresos.bulkCreate, args); }
    catch (error) {
      const message = error instanceof Error ? error.message : "La carga falló.";
      const result = await ctx.runMutation(api.incomeImportHistory.failAttempt, { ...args, error: message });
      if (result) return result;
      throw new ConvexError(message);
    }
  },
});
export const getAttempt = query({
  args: { attempt_id: v.id("income_import_attempts") }, handler: async (ctx, args) => {
    const { attempt, user } = await readableIncomeAttempt(ctx, args.attempt_id);
    return { ...publicAttempt(attempt), file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)), can_resume: hasIncomeManagementAccess(user) && user._id === attempt.imported_by && attempt.status === "processing" };
  },
});
export const getRequestAttempt = query({
  args: { proyecto: v.id("desarrollos"), request_id: v.string() }, handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertIncomeProjectAccess(ctx, args.proyecto);
    const attempt = await ctx.db.query("income_import_attempts").withIndex("by_proyecto_request", q => q.eq("proyecto", args.proyecto).eq("request_id", args.request_id)).unique();
    if (!attempt) return null;
    return { ...publicAttempt(attempt), file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)), can_resume: hasIncomeManagementAccess(user) && user._id === attempt.imported_by && attempt.status === "processing" };
  },
});
export const listHistory = query({
  args: { proyecto: v.id("desarrollos"), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertIncomeProjectAccess(ctx, args.proyecto);
    const page = await ctx.db.query("income_import_attempts").withIndex("by_proyecto_created", q => q.eq("proyecto", args.proyecto)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async attempt => ({ ...publicAttempt(attempt), file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)), can_resume: hasIncomeManagementAccess(user) && user._id === attempt.imported_by && attempt.status === "processing" }))) };
  },
});
export const listAttemptItems = query({
  args: { attempt_id: v.id("income_import_attempts"), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
    await readableIncomeAttempt(ctx, args.attempt_id);
    const page = await ctx.db.query("income_import_items").withIndex("by_attempt_position", q => q.eq("attempt_id", args.attempt_id)).paginate({ ...args.paginationOpts, numItems: Math.min(25, args.paginationOpts.numItems) });
    return { ...page, page: await Promise.all(page.page.map(async item => {
      const current = item.ingreso_id ? await ctx.db.get(item.ingreso_id) : null;
      return { ...item, deleted: Boolean(item.ingreso_id && !current), modified: Boolean(current && (current.monto !== item.monto || current.fecha !== item.fecha || (current.descripcion || "") !== item.descripcion || current.moneda !== item.moneda)) };
    })) };
  },
});
export const getIngresoSource = query({
  args: { ingreso_id: v.id("ingresos") }, handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const ingreso = await ctx.db.get(args.ingreso_id);
    if (!ingreso) return null;
    await assertIncomeProjectAccess(ctx, ingreso.proyecto);
    const item = await ctx.db.query("income_import_items").withIndex("by_ingreso", q => q.eq("ingreso_id", args.ingreso_id)).unique();
    if (!item) return null;
    const { attempt } = await readableIncomeAttempt(ctx, item.attempt_id);
    if (attempt.proyecto !== ingreso.proyecto || item.proyecto !== ingreso.proyecto) throw new Error("Referencia de origen inválida.");
    return { item, attempt: publicAttempt(attempt), file_available: Boolean(attempt.storage_id && await ctx.db.system.get(attempt.storage_id)) };
  },
});
export const findPreviousFile = query({
  args: { proyecto: v.id("desarrollos"), file_hash: v.string() }, handler: async (ctx, args) => {
    await assertIncomeProjectAccess(ctx, args.proyecto);
    const attempt = await ctx.db.query("income_import_attempts").withIndex("by_proyecto_hash", q => q.eq("proyecto", args.proyecto).eq("file_hash", args.file_hash).eq("status", "completed")).order("desc").first();
    return attempt ? { created_at: attempt.created_at, file_name: attempt.file_name } : null;
  },
});
export const getDownloadUrl = query({
  args: { attempt_id: v.id("income_import_attempts") }, handler: async (ctx, args) => {
    const { attempt } = await readableIncomeAttempt(ctx, args.attempt_id);
    await assertIncomeOriginal(ctx, attempt);
    return { url: await ctx.storage.getUrl(attempt.storage_id!), file_name: attempt.file_name };
  },
});

// Known objects are deleted only once their project is gone. A source Excel is
// never registered as an ingreso_documento, so deleting a receipt cannot erase it.
async function boundedBatch<T>(query: AsyncIterable<T>, maximum = 100): Promise<T[]> {
  const rows: T[] = [];
  let bytes = 0;
  for await (const row of query) {
    rows.push(row);
    bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
    if (rows.length >= maximum || bytes >= 256 * 1024) break;
  }
  return rows;
}
export async function deleteProjectIncomeHistory(ctx: MutationCtx, proyecto: Id<"desarrollos">): Promise<void> {
  // Start after the parent deletion commits. The parent cascade already does
  // substantial work; income cleanup gets its own bounded mutation budget.
  if (await ctx.db.get(proyecto)) {
    const hasIncomeData = await ctx.db.query("income_import_attempts").withIndex("by_proyecto_created", q => q.eq("proyecto", proyecto)).first()
      || await ctx.db.query("ingresos").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).first()
      || await ctx.db.query("ingresos_documentos").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).first()
      || await ctx.db.query("ingresos_totals").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)).first();
    if (hasIncomeData) await ctx.scheduler.runAfter(0, internal.incomeImportHistory.purgeDeletedProjectHistory, { proyecto });
    return;
  }
  const reviews = await boundedBatch(ctx.db.query("income_import_reviews").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)), 10);
  for (const review of reviews) await ctx.db.delete(review._id);
  const items = await boundedBatch(ctx.db.query("income_import_items").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)));
  for (const item of items) await ctx.db.delete(item._id);
  const attempts = await boundedBatch(ctx.db.query("income_import_attempts").withIndex("by_proyecto_created", q => q.eq("proyecto", proyecto)), 50);
  for (const attempt of attempts) {
    if (attempt.storage_id) {
      const foreignReference = await ctx.db.query("income_import_attempts").withIndex("by_storage", q => q.eq("storage_id", attempt.storage_id)).filter(q => q.neq(q.field("proyecto"), proyecto)).first();
      if (!foreignReference && await ctx.db.system.get(attempt.storage_id)) await ctx.storage.delete(attempt.storage_id);
    }
    await ctx.db.delete(attempt._id);
  }
  const documents = await boundedBatch(ctx.db.query("ingresos_documentos").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)));
  for (const doc of documents) {
    const source = await ctx.db.query("income_import_attempts").withIndex("by_storage", q => q.eq("storage_id", doc.storage_id)).first();
    if (!source && await ctx.db.system.get(doc.storage_id)) await ctx.storage.delete(doc.storage_id);
    await ctx.db.delete(doc._id);
  }
  const incomes = await boundedBatch(ctx.db.query("ingresos").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)));
  for (const ingreso of incomes) await ctx.db.delete(ingreso._id);
  const totals = await boundedBatch(ctx.db.query("ingresos_totals").withIndex("by_proyecto", q => q.eq("proyecto", proyecto)));
  for (const total of totals) await ctx.db.delete(total._id);
  // A byte budget can finish before the row limit; one final empty page is
  // cheaper and safer than assuming a short batch means the purge is complete.
  if (reviews.length || items.length || attempts.length || documents.length || incomes.length || totals.length) await ctx.scheduler.runAfter(0, internal.incomeImportHistory.purgeDeletedProjectHistory, { proyecto });
}
export const purgeDeletedProjectHistory = internalMutation({ args: { proyecto: v.id("desarrollos") }, handler: async (ctx, args) => {
  if (!await ctx.db.get(args.proyecto)) await deleteProjectIncomeHistory(ctx, args.proyecto);
} });
// Reconcile only upload objects explicitly marked for this feature. This covers
// a successful POST whose response/storage ID never reached the browser.
export const cleanupUnattachedUploads = internalMutation({ args: { cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
  const page = await ctx.db.system.query("_storage").paginate({ cursor: args.cursor ?? null, numItems: 100 });
  for (const file of page.page) {
    const match = file.contentType?.match(/^application\/x-ogc-income-original;attempt=([^;]+)$/);
    if (!match || file._creationTime > Date.now() - INCOME_IMPORT_TIMEOUT * 2) continue;
    let sourceId: string;
    try { sourceId = decodeURIComponent(match[1]); } catch { continue; }
    const id = ctx.db.normalizeId("income_import_attempts", sourceId);
    const attempt = id ? await ctx.db.get(id) : null;
    const linked = await ctx.db.query("income_import_attempts").withIndex("by_storage", q => q.eq("storage_id", file._id)).first();
    if (!linked && (!attempt || attempt.storage_id !== file._id)) await ctx.storage.delete(file._id);
  }
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.incomeImportHistory.cleanupUnattachedUploads, { cursor: page.continueCursor });
} });
