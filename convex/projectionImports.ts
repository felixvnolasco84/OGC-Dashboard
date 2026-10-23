import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, type MutationCtx } from "./_generated/server";
import { projectionRowValidator, type ProjectionResult, type ProjectionTarget } from "./projectionImportValidators";
import { assertProjectionOriginal, projectionLiveData, projectionRevision, projectionScope, writableProjectionAttempt } from "./projectionImportHistory";
import { normalizeProjectionResponse, projectionFinancialKey, projectionHash, projectionReviewHash, projectionSummary, PROJECTION_MAX_CELLS, PROJECTION_READER, PROJECTION_TIMEOUT } from "./projectionImportRules";

// Preserve only evidence still present in the database. No author, original file,
// source coordinates or original import result can be recovered for old uploads.
export async function archiveLegacyProjections(ctx: MutationCtx, target: ProjectionTarget, data: Awaited<ReturnType<typeof projectionLiveData>>) {
  const scope = projectionScope(target);
  let state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", scope)).unique();
  type LiveRow = typeof data.rows[number];
  const groups = new Map<string, LiveRow[]>();
  for (const row of data.rows) {
    const rows = groups.get(row.upload_id) || [];
    rows.push(row); groups.set(row.upload_id, rows);
  }
  for (const [uploadId, rows] of groups) {
    if (state?.active_attempt_id) break; // Managed data is already represented by immutable snapshots.
    const requestId = `legacy:${uploadId}`;
    const existing = await ctx.db.query("projection_import_attempts").withIndex("by_scope_request", q => q.eq("scope", scope).eq("request_id", requestId)).unique();
    if (existing) continue;
    const first = rows[0];
    const id = await ctx.db.insert("projection_import_attempts", { target, scope, request_id: requestId, file_name: first.file_name,
      sheet_name: first.sheet_name || undefined, legacy_upload_id: uploadId, base_revision: "", status: "legacy",
      imported_by_name: "Autor no disponible", created_at: first.uploaded_at });
    const byPartida = new Map<string, LiveRow[]>();
    for (const row of rows) { const grouped = byPartida.get(row.partida) || []; grouped.push(row); byPartida.set(row.partida, grouped); }
    for (const [partida, cells] of byPartida) await ctx.db.insert("projection_import_items", { scope, attempt_id: id,
      row: { partida, weeklyProjections: cells.map(cell => ({ week: cell.week_date, amount: cell.amount, position: cell.position })) } });
    if (!state) {
      const stateId = await ctx.db.insert("projection_import_states", { scope, target });
      state = (await ctx.db.get(stateId))!;
    }
    if (groups.size === 1) { await ctx.db.patch(state._id, { active_attempt_id: id }); state = (await ctx.db.get(state._id))!; }
  }
}
export const prepareConfirmation = internalMutation({
  args: { attempt_id: v.id("projection_import_attempts") }, handler: async (ctx, args) => {
    const attempt = await writableProjectionAttempt(ctx, args.attempt_id);
    if (attempt.result) return { attempt, url: null };
    if (attempt.status !== "processing" || Date.now() >= attempt.created_at + PROJECTION_TIMEOUT) throw new Error("La carga terminó o expiró. Confirma una nueva carga.");
    await assertProjectionOriginal(ctx, attempt);
    return { attempt, url: await ctx.storage.getUrl(attempt.storage_id!) };
  },
});
export const applyImport = internalMutation({
  args: { attempt_id: v.id("projection_import_attempts"), rows: v.array(projectionRowValidator), sheet_name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ProjectionResult> => {
    const attempt = await writableProjectionAttempt(ctx, args.attempt_id);
    if (attempt.result) return attempt.result;
    if (attempt.status !== "processing" || Date.now() >= attempt.created_at + PROJECTION_TIMEOUT) throw new Error("La carga terminó o expiró.");
    await assertProjectionOriginal(ctx, attempt);
    if (await projectionReviewHash({ rows: args.rows, ...(args.sheet_name ? { sheet_name: args.sheet_name } : {}) }) !== attempt.review_hash) throw new Error("El contenido procesado cambió desde la revisión. Vuelve a validar el Excel.");
    const summary = projectionSummary(args.rows);
    if (summary.cells > PROJECTION_MAX_CELLS || args.rows.length > 1000) throw new Error("La carga excede el límite de proyecciones.");
    const data = await projectionLiveData(ctx, attempt.target);
    if (await projectionRevision(data) !== attempt.base_revision) throw new Error("Las proyecciones cambiaron mientras revisabas el Excel. Revisa la versión vigente y confirma una nueva carga.");
    const cells = args.rows.flatMap(row => row.weeklyProjections.map(cell => ({ partida: row.partida, week_date: cell.week, amount: cell.amount, position: cell.position })));
    const weekly = new Map<number, { amount: number; position: number }>();
    for (const cell of cells) {
      const prior = weekly.get(cell.week_date);
      weekly.set(cell.week_date, { amount: (prior?.amount || 0) + cell.amount, position: prior?.position ?? cell.position });
    }
    const totalsMatch = attempt.target.kind !== "expense" || (data.totals.length === weekly.size && data.totals.every(total => {
      const expected = weekly.get(total.week_date); return expected?.amount === total.weekly_total && expected.position === total.position;
    }));
    const unchanged = projectionFinancialKey(data.rows) === projectionFinancialKey(cells) && totalsMatch;
    const priorState = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", attempt.scope)).unique();
    const legacyRows = priorState?.active_attempt_id ? 0 : new Set(data.rows.map(row => JSON.stringify([row.upload_id, row.partida]))).size;
    const legacyGroups = priorState?.active_attempt_id ? 0 : new Set(data.rows.map(row => row.upload_id)).size;
    // Budget actual row writes, including first-time legacy preservation, with headroom.
    if (data.rows.length + data.totals.length + cells.length + args.rows.length + weekly.size + legacyRows + legacyGroups + 4 > 14000)
      throw new Error("El volumen de esta recarga excede el límite seguro. No se modificaron las proyecciones.");
    await archiveLegacyProjections(ctx, attempt.target, data);
    const now = Date.now();
    const metadata = { upload_id: String(attempt._id), file_name: attempt.file_name, sheet_name: args.sheet_name || "", uploaded_at: now };
    if (!unchanged) {
      for (const row of data.rows) await ctx.db.delete(row._id);
      for (const total of data.totals) await ctx.db.delete(total._id);
      if (attempt.target.kind === "expense") {
        for (const cell of cells) await ctx.db.insert("projected_transactions", { proyecto: attempt.target.project_id, ...cell, ...metadata });
        for (const [date, total] of weekly) await ctx.db.insert("weekly_projected_totals", { proyecto: attempt.target.project_id,
          week_date: date, week_date_formatted: new Date((date - 25569) * 86400000).toLocaleDateString("es-MX", { timeZone: "UTC" }),
          weekly_total: total.amount, position: total.position, upload_id: metadata.upload_id, uploaded_at: now });
      } else {
        for (const cell of cells) await ctx.db.insert("sales_projected_transactions", { sales_proyecto: attempt.target.project_id, ...cell, ...metadata });
      }
    }
    for (const row of args.rows) await ctx.db.insert("projection_import_items", { scope: attempt.scope, attempt_id: attempt._id, row });
    const result: ProjectionResult = { ...summary, outcome: unchanged ? "unchanged" : data.rows.length ? "replaced" : "created" };
    await ctx.db.patch(attempt._id, { status: unchanged ? "unchanged" : "completed", sheet_name: args.sheet_name, result, completed_at: now });
    const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", attempt.scope)).unique();
    const active = state?.active_attempt_id ? await ctx.db.get(state.active_attempt_id) : null;
    if (!state) await ctx.db.insert("projection_import_states", { scope: attempt.scope, target: attempt.target, active_attempt_id: attempt._id });
    else if (!unchanged || !active || active.status === "legacy") await ctx.db.patch(state._id, { active_attempt_id: attempt._id });
    return result;
  },
});
export const confirmImport = action({
  args: { attempt_id: v.id("projection_import_attempts") }, handler: async (ctx, args): Promise<ProjectionResult> => {
    try {
      const { attempt, url } = await ctx.runMutation(internal.projectionImports.prepareConfirmation, args);
      if (attempt.result) return attempt.result;
      if (!url || !attempt.format) throw new Error("Archivo original no disponible.");
      const stored = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!stored.ok) throw new Error("No fue posible leer el Excel respaldado.");
      const original = await stored.blob();
      if (original.size !== attempt.size || await projectionHash(await original.arrayBuffer()) !== attempt.file_hash) throw new Error("El original descargado no coincide con el Excel confirmado.");
      const form = new FormData();
      form.append("file", new Blob([original], { type: attempt.content_type || "application/octet-stream" }), attempt.file_name);
      const response = await fetch(`${PROJECTION_READER}${attempt.format}`, { method: "POST", body: form, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error("El lector de Excel no pudo procesar el original. El respaldo se conservó.");
      const review = normalizeProjectionResponse(await response.json(), attempt.format);
      return await ctx.runMutation(internal.projectionImports.applyImport, { ...args, ...review });
    } catch (error) {
      const message = error instanceof Error ? error.message : "La carga de proyecciones falló.";
      let committed: ProjectionResult | null = null;
      try { committed = await ctx.runMutation(api.projectionImportHistory.failAttempt, { ...args, error: message }); } catch { /* Access may have been revoked; expiry still records abandonment. */ }
      if (committed) return committed;
      throw new ConvexError(message);
    }
  },
});
export const migrateLegacy = internalMutation({
  args: { kind: v.union(v.literal("expense"), v.literal("collection")), cursor: v.union(v.string(), v.null()), dry_run: v.boolean() },
  handler: async (ctx, args) => {
    const page = args.kind === "expense" ? await ctx.db.query("desarrollos").paginate({ cursor: args.cursor, numItems: 1 })
      : await ctx.db.query("sales_projects").paginate({ cursor: args.cursor, numItems: 1 });
    let pending = 0;
    for (const project of page.page) {
      const target = { kind: args.kind, project_id: project._id } as ProjectionTarget;
      const data = await projectionLiveData(ctx, target);
      const state = await ctx.db.query("projection_import_states").withIndex("by_scope", q => q.eq("scope", projectionScope(target))).unique();
      const uploadIds = [...new Set(data.rows.map(row => row.upload_id))];
      let missing = false;
      if (!state?.active_attempt_id) for (const uploadId of uploadIds) {
        if (!await ctx.db.query("projection_import_attempts").withIndex("by_scope_request", q => q.eq("scope", projectionScope(target)).eq("request_id", `legacy:${uploadId}`)).unique()) { missing = true; break; }
      }
      if (missing) {
        pending++;
        if (!args.dry_run) await archiveLegacyProjections(ctx, target, data);
      }
    }
    return { cursor: page.continueCursor, isDone: page.isDone, projects: page.page.length, pending };
  },
});
