import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BUDGET_MAX_BYTES, budgetStorageType } from "./budgetImportRules";

function cors(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (process.env.BUDGET_IMPORT_ALLOWED_ORIGINS || process.env.APP_URL || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Origen no autorizado.");
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" };
}
export const preflight = httpAction(async (_ctx, request) => {
  try { return new Response(null, { status: 204, headers: cors(request) }); } catch { return new Response(null, { status: 403 }); }
});
export const original = httpAction(async (ctx, request) => {
  let headers: Record<string, string> = {};
  try {
    headers = cors(request);
    if (!await ctx.auth.getUserIdentity()) return new Response("Inicia sesión para acceder al Excel.", { status: 401, headers });
    const attempt_id = new URL(request.url).searchParams.get("attempt_id") as Id<"budget_creation_attempts">;
    const attempt = await ctx.runQuery(api.budgetCreationHistory.get, { attempt_id });
    if (request.method === "GET") {
      if (!attempt.storage_id) throw new Error("Archivo original no disponible.");
      const file = await ctx.storage.get(attempt.storage_id);
      if (!file) throw new Error("Archivo original no disponible.");
      return new Response(file, { headers: { ...headers, "Content-Type": attempt.content_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attempt.file_name)}` } });
    }
    if (!attempt.can_resume || attempt.status === "completed") throw new Error("No puedes adjuntar archivos a esta creación.");
    if (!request.body) throw new Error("No se recibió el archivo.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > BUDGET_MAX_BYTES || size > attempt.size) { await reader.cancel(); throw new Error("El tamaño del archivo no coincide con el Excel confirmado."); }
      chunks.push(chunk.value);
    }
    if (!size || size !== attempt.size) throw new Error("El tamaño del archivo no coincide con el Excel confirmado.");
    // A server-owned MIME marker allows scoped orphan reconciliation after a
    // crash between storage.store and attachStored, without scanning user data.
    const storage_id = await ctx.storage.store(new Blob(chunks, { type: budgetStorageType(attempt_id, "original") }));
    await ctx.runMutation(internal.budgetCreationHistory.attachStored, { attempt_id, storage_id, kind: "original" });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "No se pudo acceder al archivo.", { status: 400, headers });
  }
});
