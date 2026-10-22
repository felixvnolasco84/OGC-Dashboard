import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, mutation, internalMutation as rawInternalMutation } from "./_generated/server";
import { internalMutation } from "./functions";
import { createBudgetProjectRecord } from "./desarrollos";
import { createBudgetPartidaRecord } from "./partida";
import { createBudgetTransactionRecord } from "./transacciones";
import { assertBudgetOriginal, writableBudgetAttempt } from "./budgetCreationHistory";
import { BUDGET_IDLE_MS, BUDGET_READER, budgetStorageType, budgetRowValidator, parseBudgetResponse, type BudgetManifest } from "./budgetImportRules";
import type { Id } from "./_generated/dataModel";

const identity = { attempt_id: v.id("budget_creation_attempts") };
export const claim = mutation({ args: identity, handler: async (ctx, args) => {
  const attempt = await writableBudgetAttempt(ctx, args.attempt_id);
  if (attempt.status === "completed") return;
  await assertBudgetOriginal(ctx, attempt);
  await ctx.db.patch(attempt._id, { status: "processing", error: undefined, updated_at: Date.now() });
  await ctx.scheduler.runAfter(BUDGET_IDLE_MS, internal.budgetCreation.expireIdle, args);
} });
export const expireIdle = rawInternalMutation({ args: identity, handler: async (ctx, args) => {
  const attempt = await ctx.db.get(args.attempt_id);
  if (attempt?.status !== "processing") return;
  const remaining = attempt.updated_at + BUDGET_IDLE_MS - Date.now();
  if (remaining > 0) { await ctx.scheduler.runAfter(remaining, internal.budgetCreation.expireIdle, args); return; }
  await ctx.db.patch(attempt._id, { status: "failed", error: "La creación se interrumpió. Puedes reanudarla sin duplicar registros." });
} });
export const beginProject = internalMutation({ args: identity, handler: async (ctx, args): Promise<Id<"desarrollos">> => {
  const attempt = await writableBudgetAttempt(ctx, args.attempt_id);
  await assertBudgetOriginal(ctx, attempt);
  if (attempt.proyecto) return attempt.proyecto;
  if (!attempt.manifest_id || !attempt.row_count) throw new Error("El presupuesto todavía no está preparado.");
  const proyecto = await createBudgetProjectRecord(ctx, { ...attempt.form, image: "" });
  await ctx.db.patch(proyecto, { initial_budget_attempt_id: attempt._id, initial_budget_status: "incomplete" });
  await ctx.db.patch(attempt._id, { proyecto, updated_at: Date.now() });
  return proyecto;
} });

// Creation and its audit checkpoint commit together. Concurrent/late requests
// compare the cursor inside the transaction, before creating financial records.
export const applyNext = internalMutation({
  args: { ...identity, row_index: v.number(), payment_index: v.number(), row: budgetRowValidator },
  handler: async (ctx, args) => {
    const attempt = await writableBudgetAttempt(ctx, args.attempt_id);
    if (attempt.status === "completed" || attempt.row_cursor !== args.row_index || attempt.payment_cursor !== args.payment_index) return;
    if (attempt.status !== "processing" || !attempt.proyecto) throw new Error("Reanuda la creación para continuar.");
    await assertBudgetOriginal(ctx, attempt);
    const { payments, raw_json, ...fields } = args.row;
    let payment_cursor = args.payment_index, row_cursor = args.row_index;
    let partidas_created = attempt.partidas_created, payments_created = attempt.payments_created;
    if (payment_cursor === -1) {
      const partida_id = await createBudgetPartidaRecord(ctx, { ...fields, proyecto: attempt.proyecto, archivo_origen: attempt.file_name });
      await ctx.db.insert("budget_creation_items", { attempt_id: attempt._id, proyecto: attempt.proyecto, source_index: row_cursor,
        partida_id, snapshot_json: JSON.stringify({ interpreted: JSON.parse(raw_json), normalized: fields }) });
      partidas_created++;
      payment_cursor = 0;
    } else {
      const payment = payments[payment_cursor];
      if (!payment) throw new Error("La referencia del pago no coincide con el presupuesto preparado.");
      const source = await ctx.db.query("budget_creation_items").withIndex("by_attempt_row", q => q.eq("attempt_id", attempt._id).eq("source_index", row_cursor).eq("payment_index", undefined)).unique();
      if (!source || !await ctx.db.get(source.partida_id)) throw new Error("La partida de origen ya no existe. No se recreó automáticamente.");
      const created = await createBudgetTransactionRecord(ctx, {
        proyecto: attempt.proyecto, monto_total: payment.amount, fecha: payment.fecha, tipo_pago: "transferencia", moneda: "MXN", tipo_cambio: "1",
        status: "Pendiente", codigo_referencia: `Week-${payment.position}`, banco: "", tarjeta: "", numero_cuenta: "", numero_transferencia: "", factura: "", comprobante: "", presupuesto_archivo: "",
        lineItems: [{ partida_id: source.partida_id, partida: fields.nivel === 1 ? fields.nombre : fields.partida_nombre || fields.nombre,
          familia: fields.familia, sub_partida: fields.sub_partida, monto: payment.amount }],
      });
      await ctx.db.insert("budget_creation_items", { attempt_id: attempt._id, proyecto: attempt.proyecto, source_index: row_cursor,
        payment_index: payment.source_index, partida_id: source.partida_id, transaccion_id: created.transaccionId, snapshot_json: JSON.stringify(payment) });
      payments_created++;
      payment_cursor++;
    }
    if (payment_cursor >= payments.length) { row_cursor++; payment_cursor = -1; }
    const complete = row_cursor === attempt.row_count;
    if (complete && (partidas_created !== attempt.row_count || payments_created !== attempt.payment_count)) throw new Error("El resultado de la creación está incompleto.");
    await ctx.db.patch(attempt._id, { row_cursor, payment_cursor, partidas_created, payments_created, updated_at: Date.now(), status: complete ? "completed" : "processing", error: undefined });
    if (complete) await ctx.db.patch(attempt.proyecto, { initial_budget_status: "completed" });
  },
});

export const continueCreation = action({ args: identity, handler: async (ctx, args): Promise<{ completed: boolean; proyecto?: Id<"desarrollos"> }> => {
  try {
    await ctx.runMutation(api.budgetCreation.claim, args);
    let attempt = await ctx.runQuery(api.budgetCreationHistory.get, args);
    if (!attempt.can_resume) throw new Error("No tienes permiso para reanudar esta creación.");
    if (attempt.status === "completed") return { completed: true, proyecto: attempt.proyecto };
    let manifest: BudgetManifest;
    if (attempt.manifest_id) {
      const file = await ctx.storage.get(attempt.manifest_id);
      if (!file) throw new Error("No está disponible la interpretación guardada del presupuesto.");
      manifest = JSON.parse(await file.text());
    } else {
      const original = await ctx.storage.get(attempt.storage_id!);
      if (!original) throw new Error("El Excel original no está disponible.");
      const form = new FormData();
      form.append("file", new Blob([original], { type: attempt.content_type }), attempt.file_name);
      const response = await fetch(BUDGET_READER, { method: "POST", body: form, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`El lector de Excel respondió con error ${response.status}.`);
      manifest = parseBudgetResponse(await response.json());
      const storage_id = await ctx.storage.store(new Blob([JSON.stringify(manifest)], { type: budgetStorageType(attempt._id, "manifest") }));
      const canonical = await ctx.runMutation(internal.budgetCreationHistory.attachStored, { ...args, storage_id, kind: "manifest", row_count: manifest.rows.length,
        payment_count: manifest.rows.reduce((sum, row) => sum + row.payments.length, 0) });
      if (canonical !== storage_id) {
        const saved = await ctx.storage.get(canonical);
        if (!saved) throw new Error("La interpretación guardada no está disponible.");
        manifest = JSON.parse(await saved.text());
      }
    }
    await ctx.runMutation(internal.budgetCreation.beginProject, args);
    // Bounded calls survive form closure; the next request resumes this cursor.
    for (let index = 0; index < 10; index++) {
      attempt = await ctx.runQuery(api.budgetCreationHistory.get, args);
      if (attempt.status === "completed") break;
      const row = manifest.rows[attempt.row_cursor];
      if (!row) throw new Error("El avance no coincide con la interpretación guardada.");
      await ctx.runMutation(internal.budgetCreation.applyNext, { ...args, row_index: attempt.row_cursor, payment_index: attempt.payment_cursor, row });
    }
    attempt = await ctx.runQuery(api.budgetCreationHistory.get, args);
    return { completed: attempt.status === "completed", proyecto: attempt.proyecto };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la creación.";
    // A delayed failure must not overwrite a completed creation.
    try { await ctx.runMutation(api.budgetCreationHistory.pause, { ...args, error: message }); } catch { /* access may have been revoked */ }
    throw new ConvexError(message);
  }
} });
