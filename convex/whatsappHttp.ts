import type { Infer } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { callbackValidator } from "./whatsapp";
import { isWhatsappCallbackAuthorized } from "./whatsappRules";

const headers = { "Cache-Control": "no-store" };
async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > 16_384) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(result.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

export const claim = httpAction(async (ctx, request) => {
  if (!isWhatsappCallbackAuthorized(request.headers.get("Authorization"), process.env.WHATSAPP_CALLBACK_SECRET)) return new Response("Unauthorized", { status: 401, headers });
  try {
    const body = await readJson(request) as { delivery_id?: unknown };
    if (!body || typeof body.delivery_id !== "string") throw new Error("Invalid delivery");
    const result = await ctx.runMutation(internal.whatsapp.claim, { delivery_id: body.delivery_id as Id<"notification_deliveries">, attempt_token: crypto.randomUUID() });
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "Solicitud inválida" }, { status: 400, headers });
  }
});

export const events = httpAction(async (ctx, request) => {
  if (!isWhatsappCallbackAuthorized(request.headers.get("Authorization"), process.env.WHATSAPP_CALLBACK_SECRET)) return new Response("Unauthorized", { status: 401, headers });
  try {
    const event = await readJson(request) as Infer<typeof callbackValidator>;
    await ctx.runMutation(internal.whatsapp.receiveEvent, { event });
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "Evento inválido" }, { status: 400, headers });
  }
});
