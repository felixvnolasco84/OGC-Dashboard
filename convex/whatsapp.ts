import { v } from "convex/values";
import { internalAction, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { formatWhatsappRequisition, WHATSAPP_STATE_TEMPLATE } from "./whatsappMessageFormat";
import { canUserAccessDesarrollo, getCurrentUserOrThrow, hasAdminAccess, hasGlobalAdminAccess } from "./permissions";
import { getRequisicionNotificationConfig, requisitionDetailUrl, type RequisicionNotificationType } from "../src/lib/requisicionNotificationMatrix";
import {
  isWhatsappType, normalizeWhatsappPhone, summarizeWhatsapp, whatsappAudience,
  whatsappContactProblem, whatsappReceiptStatus, whatsappResultLabel,
  WHATSAPP_CLAIM_TIMEOUT, WHATSAPP_RECEIPT_TTL, WHATSAPP_RETRY_DELAYS, WHATSAPP_TEMPLATE_NAMES,
} from "./whatsappRules";

async function refreshEvent(ctx: MutationCtx, id: Id<"notification_events">) {
  const event = await ctx.db.get(id);
  if (!event || event.channel !== "whatsapp") return;
  const deliveries = await ctx.db.query("notification_deliveries").withIndex("by_event", q => q.eq("notification_event_id", id)).collect();
  await ctx.db.patch(id, summarizeWhatsapp(deliveries.map(d => d.status)));
}

export async function recordWhatsappNotification(ctx: MutationCtx, args: {
  requisicion: Doc<"requisiciones">; project: Doc<"desarrollos">; users: Doc<"users">[];
  actor: Doc<"users">; historyId: Id<"requisicion_history">; type: RequisicionNotificationType;
}) {
  if (!args.project.whatsapp_requisiciones_enabled || !isWhatsappType(args.type)) return;
  const existing = await ctx.db.query("notification_events").withIndex("by_source_channel", q => q.eq("source_history_id", args.historyId).eq("channel", "whatsapp")).first();
  if (existing) return;
  const currentRequisition = await ctx.db.get(args.requisicion._id) || args.requisicion;
  const config = getRequisicionNotificationConfig(args.type);
  const eventId = await ctx.db.insert("notification_events", {
    proyecto: args.project._id, requisicion_id: args.requisicion._id, source_history_id: args.historyId,
    type: args.type, subject: `${config.subject} - ${args.project.nombre}`, message: config.defaultMessage,
    actor_id: args.actor._id, actor_name: args.actor.name || args.actor.email, channel: "whatsapp",
    whatsapp_result: whatsappResultLabel(args.type, currentRequisition),
    status: "pending", recipient_count: 0, sent_count: 0, failed_count: 0, created_at: Date.now(),
  });
  const phones = new Set<string>();
  if (args.actor.whatsapp_phone) phones.add(args.actor.whatsapp_phone);
  let count = 0;
  const actorEmail = args.actor.email.trim().toLowerCase();
  for (const user of args.users) {
    if ((actorEmail && user.email.trim().toLowerCase() === actorEmail) || !whatsappAudience({
      type: args.type, userId: user._id, actorId: args.actor._id, requesterId: args.requisicion.solicitante_id,
      role: user.role, invitationStatus: user.invitation_status, hasProjectAccess: canUserAccessDesarrollo(user, args.project),
    })) continue;
    let problem = whatsappContactProblem(user);
    if (!problem && phones.has(user.whatsapp_phone!)) problem = "Teléfono duplicado o perteneciente al autor del evento";
    if (!problem) { phones.add(user.whatsapp_phone!); count++; }
    const deliveryId = await ctx.db.insert("notification_deliveries", {
      notification_event_id: eventId, proyecto: args.project._id, requisicion_id: args.requisicion._id,
      recipient_user_id: user._id, recipient_name: user.name || user.email, recipient_email: user.email,
      recipient_phone: user.whatsapp_phone, channel: "whatsapp", status: problem ? "skipped" : "pending",
      error: problem || undefined, attempt_count: 0, created_at: Date.now(),
    });
    if (!problem) await ctx.scheduler.runAfter(0, internal.whatsapp.dispatch, { delivery_id: deliveryId });
  }
  await ctx.db.patch(eventId, { recipient_count: count });
  await refreshEvent(ctx, eventId);
}

async function assertAdmin(ctx: MutationCtx | Parameters<typeof getCurrentUserOrThrow>[0]) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!hasAdminAccess(user)) throw new Error("Solo administración puede configurar WhatsApp");
  return user;
}

export const saveContact = mutation({
  args: { user_id: v.id("users"), phone: v.string(), enabled: v.boolean(), confirm_consent: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await assertAdmin(ctx), target = await ctx.db.get(args.user_id);
    if (!target || (!hasGlobalAdminAccess(actor) && (!actor.organization_id || actor.organization_id !== target.organization_id))) throw new Error("Usuario fuera de tu organización");
    const phone = args.phone.trim() ? normalizeWhatsappPhone(args.phone) : undefined;
    const changed = target.whatsapp_phone !== phone;
    const validConsent = !changed && !whatsappContactProblem({ ...target, whatsapp_enabled: true });
    if (args.enabled && (!phone || (!args.confirm_consent && !validConsent))) throw new Error("Confirma la autorización del usuario para este número");
    await ctx.db.patch(target._id, {
      whatsapp_phone: phone, whatsapp_enabled: args.enabled,
      whatsapp_consent_at: args.confirm_consent && phone ? Date.now() : changed ? undefined : target.whatsapp_consent_at,
      whatsapp_consent_by: args.confirm_consent && phone ? actor._id : changed ? undefined : target.whatsapp_consent_by,
      whatsapp_opted_out_at: changed ? undefined : target.whatsapp_opted_out_at,
    });
  },
});

export const projectSettings = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx), project = await ctx.db.get(args.proyecto);
    if (!project || !["admin", "finance"].includes(actor.role) || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
    return { enabled: project.whatsapp_requisiciones_enabled ?? false, can_manage: hasAdminAccess(actor) };
  },
});

export const setProjectEnabled = mutation({
  args: { proyecto: v.id("desarrollos"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await assertAdmin(ctx), project = await ctx.db.get(args.proyecto);
    if (!project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
    if (args.enabled && (!process.env.MAKE_WHATSAPP_WEBHOOK_URL || !process.env.MAKE_WHATSAPP_API_KEY || !process.env.WHATSAPP_CALLBACK_SECRET || !process.env.WHATSAPP_SENDER_ID || !process.env.APP_URL)) throw new Error("Configura primero la conexión de Make, el emisor y APP_URL en el backend");
    await ctx.db.patch(project._id, { whatsapp_requisiciones_enabled: args.enabled });
  },
});

export const beginDispatch = internalMutation({
  args: { delivery_id: v.id("notification_deliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.delivery_id);
    if (!delivery || delivery.channel !== "whatsapp" || delivery.status !== "pending" || (delivery.next_attempt_at ?? 0) > Date.now()) return false;
    await ctx.db.patch(delivery._id, { status: "queued", queued_at: Date.now(), next_attempt_at: undefined, attempt_token: undefined, claimed_at: undefined, error: undefined, attempt_count: (delivery.attempt_count ?? 0) + 1 });
    await ctx.scheduler.runAfter(WHATSAPP_CLAIM_TIMEOUT, internal.whatsapp.watchdog, { delivery_id: delivery._id, attempt_count: (delivery.attempt_count ?? 0) + 1 });
    return true;
  },
});

async function retryOrFail(ctx: MutationCtx, delivery: Doc<"notification_deliveries">, reason: string) {
  const delay = WHATSAPP_RETRY_DELAYS[(delivery.attempt_count ?? 1) - 1];
  await ctx.db.patch(delivery._id, {
    status: delay === undefined ? "failed" : "pending", error: reason,
    next_attempt_at: delay === undefined ? undefined : Date.now() + delay,
  });
  if (delay !== undefined) await ctx.scheduler.runAfter(delay, internal.whatsapp.dispatch, { delivery_id: delivery._id });
  await refreshEvent(ctx, delivery.notification_event_id);
}

export const transportResult = internalMutation({
  args: { delivery_id: v.id("notification_deliveries"), error: v.string(), retryable: v.boolean() },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.delivery_id);
    // Once claimed, a timeout/HTTP error is ambiguous: only the result callback or watchdog may resolve it.
    if (!delivery || delivery.channel !== "whatsapp" || delivery.status !== "queued") return;
    if (args.retryable) return retryOrFail(ctx, delivery, args.error);
    await ctx.db.patch(delivery._id, { status: "failed", error: args.error });
    await refreshEvent(ctx, delivery.notification_event_id);
  },
});

export const dispatch = internalAction({
  args: { delivery_id: v.id("notification_deliveries") },
  handler: async (ctx, args): Promise<void> => {
    if (!await ctx.runMutation(internal.whatsapp.beginDispatch, args)) return;
    const url = process.env.MAKE_WHATSAPP_WEBHOOK_URL, key = process.env.MAKE_WHATSAPP_API_KEY;
    if (!url || !key) {
      await ctx.runMutation(internal.whatsapp.transportResult, { ...args, error: "Conexión de Make sin configurar", retryable: false });
      return;
    }
    try {
      const target = new URL(url);
      if (target.protocol !== "https:" || !/^hook\.(?:[a-z0-9-]+\.)?make\.com$/.test(target.hostname)) throw new Error("URL del webhook de Make inválida");
      const response = await fetch(url, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "x-make-apikey": key }, body: JSON.stringify({ delivery_id: args.delivery_id }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) await ctx.runMutation(internal.whatsapp.transportResult, { ...args, error: `Make respondió HTTP ${response.status}`, retryable: response.status === 429 || response.status >= 500 });
    } catch {
      await ctx.runMutation(internal.whatsapp.transportResult, { ...args, error: "No se pudo confirmar la recepción del webhook de Make", retryable: true });
    }
  },
});

export const claim = internalMutation({
  args: { delivery_id: v.id("notification_deliveries"), attempt_token: v.string() },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.delivery_id);
    if (!delivery || delivery.channel !== "whatsapp" || delivery.status !== "queued") return { send: false as const };
    const event = await ctx.db.get(delivery.notification_event_id), project = await ctx.db.get(delivery.proyecto);
    const recipient = delivery.recipient_user_id ? await ctx.db.get(delivery.recipient_user_id) : null;
    const req = delivery.requisicion_id ? await ctx.db.get(delivery.requisicion_id) : null;
    const actor = event ? await ctx.db.get(event.actor_id) : null;
    const appUrl = process.env.APP_URL || "";
    let reason = !project?.whatsapp_requisiciones_enabled ? "WhatsApp deshabilitado en el proyecto" :
      !recipient || !req || !event || !isWhatsappType(event.type) ? "Requisición o destinatario no disponible" :
      whatsappContactProblem(recipient) || (recipient.whatsapp_phone !== delivery.recipient_phone ? "El teléfono cambió después del evento" : null);
    if (!reason && recipient && event && req && project && (!whatsappAudience({
      type: event.type as RequisicionNotificationType, userId: recipient._id, actorId: event.actor_id, requesterId: req.solicitante_id,
      role: recipient.role, invitationStatus: recipient.invitation_status, hasProjectAccess: canUserAccessDesarrollo(recipient, project),
    }) || (Boolean(actor?.email.trim()) && recipient.email.trim().toLowerCase() === actor?.email.trim().toLowerCase()) || recipient.whatsapp_phone === actor?.whatsapp_phone)) reason = "Destinatario sin acceso vigente o autor del evento";
    if (!/^https:\/\//.test(appUrl)) reason = "APP_URL debe ser una URL pública HTTPS";
    if (!process.env.WHATSAPP_SENDER_ID) reason = "Emisor de WhatsApp sin configurar";
    if (reason || !recipient || !req || !event || !project || !isWhatsappType(event.type)) {
      await ctx.db.patch(delivery._id, { status: "skipped", error: reason || "Evento no disponible" });
      await refreshEvent(ctx, delivery.notification_event_id);
      return { send: false as const };
    }
    await ctx.db.patch(delivery._id, { status: "sending", claimed_at: Date.now(), attempt_token: args.attempt_token });
    const reference = String(req._id);
    const url = requisitionDetailUrl(appUrl, project._id, req._id);
    const items = await ctx.db.query("requisicion_items").withIndex("by_requisicion", q => q.eq("requisicion_id", req._id)).collect();
    const classifications = new Set<string>();
    const partidas = new Map<Id<"partidas">, string>();
    for (const item of items) {
      if (!partidas.has(item.partida_id)) partidas.set(item.partida_id, (await ctx.db.get(item.partida_id))?.nombre || "");
      classifications.add([partidas.get(item.partida_id), item.familia].filter(Boolean).join(" — "));
    }
    return {
      send: true as const, delivery_id: delivery._id, attempt_token: args.attempt_token,
      phone: recipient.whatsapp_phone!, sender_id: process.env.WHATSAPP_SENDER_ID || "",
      template: WHATSAPP_TEMPLATE_NAMES[event.type], language: "es_MX",
      // Positional template parameters: reference, project, responsible, result.
      parameters: [reference, project.nombre.slice(0, 150), event.actor_name.slice(0, 100), event.whatsapp_result || getRequisicionNotificationConfig(event.type).label],
      formatted_template: WHATSAPP_STATE_TEMPLATE,
      formatted_parameters: formatWhatsappRequisition({
        reference: req.folio || reference, projectName: project.nombre,
        classification: [...classifications].filter(Boolean).join(" / "),
        requesterName: req.solicitante_nombre, requestedDate: req.fecha_solicitud,
        review: req.status_revision, payment: req.status, delivery: req.status_entrega,
        onsitePaymentPending: req.pago_obra?.estado === "pendiente",
        paidTo: req.pago_confirmado?.beneficiario, paidAmount: req.pago_confirmado?.importe,
        receivedBy: req.recibido_por_nombre, url,
      }),
      url, url_suffix: url.slice(new URL(appUrl).origin.length + 1),
    };
  },
});

const receiptStatus = v.union(v.literal("sent"), v.literal("delivered"), v.literal("read"), v.literal("failed"));
export const callbackValidator = v.union(
  v.object({ kind: v.literal("accepted"), delivery_id: v.id("notification_deliveries"), attempt_token: v.string(), sender_id: v.string(), provider_message_id: v.string() }),
  v.object({ kind: v.literal("error"), delivery_id: v.id("notification_deliveries"), attempt_token: v.string(), sender_id: v.string(), outcome: v.union(v.literal("rejected"), v.literal("unknown")), retryable: v.boolean(), error: v.string() }),
  v.object({ kind: v.literal("status"), sender_id: v.string(), provider_message_id: v.string(), phone: v.string(), status: receiptStatus, occurred_at: v.number(), error: v.optional(v.string()) }),
  v.object({ kind: v.literal("inbound"), sender_id: v.string(), phone: v.string(), text: v.string(), occurred_at: v.number() }),
);

async function applyReceipt(ctx: MutationCtx, delivery: Doc<"notification_deliveries">, receipt: { status: string; occurred_at: number; error?: string }) {
  const status = whatsappReceiptStatus(delivery.status, receipt.status);
  await ctx.db.patch(delivery._id, {
    status,
    sent_at: receipt.status === "sent" ? delivery.sent_at ?? receipt.occurred_at : delivery.sent_at,
    delivered_at: ["delivered", "read"].includes(receipt.status) ? delivery.delivered_at ?? receipt.occurred_at : delivery.delivered_at,
    provider_read_at: receipt.status === "read" ? delivery.provider_read_at ?? receipt.occurred_at : delivery.provider_read_at,
    provider_error: receipt.status === "failed" && status === "failed" ? (receipt.error || "WhatsApp rechazó el mensaje").slice(0, 500) : delivery.provider_error,
  });
}

export const receiveEvent = internalMutation({
  args: { event: callbackValidator },
  handler: async (ctx, { event: input }) => {
    if (!process.env.WHATSAPP_SENDER_ID || input.sender_id !== process.env.WHATSAPP_SENDER_ID) throw new Error("Emisor no autorizado");
    if (input.kind === "inbound" || input.kind === "status") {
      if (!Number.isFinite(input.occurred_at) || input.occurred_at > Date.now() + 300_000 || input.occurred_at < Date.now() - WHATSAPP_RECEIPT_TTL) throw new Error("Fecha de evento inválida");
      const phone = normalizeWhatsappPhone(input.phone);
      if (input.kind === "inbound") {
        if (input.text.trim().toUpperCase() !== "BAJA") return;
        const users = await ctx.db.query("users").withIndex("by_whatsapp_phone", q => q.eq("whatsapp_phone", phone)).collect();
        for (const user of users) {
          if (input.occurred_at < (user.whatsapp_consent_at ?? 0)) continue;
          await ctx.db.patch(user._id, { whatsapp_enabled: false, whatsapp_opted_out_at: Math.max(input.occurred_at, user.whatsapp_opted_out_at ?? 0) });
        }
        return;
      }
      if (!input.provider_message_id || input.provider_message_id.length > 256) throw new Error("Identificador de mensaje inválido");
      const delivery = await ctx.db.query("notification_deliveries").withIndex("by_provider_message", q => q.eq("provider_message_id", input.provider_message_id)).first();
      if (delivery) {
        if (delivery.channel !== "whatsapp" || delivery.recipient_phone !== phone) throw new Error("El destinatario no coincide");
        await applyReceipt(ctx, delivery, input);
        await refreshEvent(ctx, delivery.notification_event_id);
      } else {
        const existing = await ctx.db.query("whatsapp_receipts").withIndex("by_message", q => q.eq("provider_message_id", input.provider_message_id)).collect();
        if (existing.some(r => r.phone !== phone)) throw new Error("El destinatario no coincide");
        if (!existing.some(r => r.status === input.status)) await ctx.db.insert("whatsapp_receipts", { provider_message_id: input.provider_message_id, phone, status: input.status, occurred_at: input.occurred_at, error: input.error?.slice(0, 500), expires_at: Date.now() + WHATSAPP_RECEIPT_TTL });
      }
      return;
    }
    const delivery = await ctx.db.get(input.delivery_id);
    if (!delivery || delivery.channel !== "whatsapp" || !input.attempt_token || input.attempt_token !== delivery.attempt_token) throw new Error("Intento de entrega no autorizado");
    if (input.kind === "accepted") {
      if (!input.provider_message_id || input.provider_message_id.length > 256) throw new Error("Identificador de mensaje inválido");
      if (delivery.provider_message_id) {
        if (delivery.provider_message_id !== input.provider_message_id) throw new Error("La entrega ya tiene otro identificador");
        return;
      }
      if (!["sending", "unknown"].includes(delivery.status)) throw new Error("La entrega no espera un resultado");
      const duplicate = await ctx.db.query("notification_deliveries").withIndex("by_provider_message", q => q.eq("provider_message_id", input.provider_message_id)).first();
      if (duplicate) throw new Error("Identificador de mensaje ya utilizado");
      const receipts = await ctx.db.query("whatsapp_receipts").withIndex("by_message", q => q.eq("provider_message_id", input.provider_message_id)).collect();
      if (receipts.some(r => r.phone !== delivery.recipient_phone)) throw new Error("El destinatario no coincide");
      await ctx.db.patch(delivery._id, { status: "accepted", provider_message_id: input.provider_message_id, accepted_at: Date.now(), error: undefined });
      for (const receipt of receipts) {
        await applyReceipt(ctx, (await ctx.db.get(delivery._id))!, receipt);
        await ctx.db.delete(receipt._id);
      }
    } else {
      if (!["sending", "unknown"].includes(delivery.status) || delivery.provider_message_id) return;
      const error = input.error.slice(0, 500);
      // Unknown outcomes can never be retried automatically, even if a later error says retryable.
      if (input.outcome === "unknown" || delivery.status === "unknown") await ctx.db.patch(delivery._id, { status: "unknown", error: "Resultado incierto; revisar en Make antes de reenviar" });
      else if (input.retryable) return retryOrFail(ctx, delivery, error);
      else await ctx.db.patch(delivery._id, { status: "failed", error });
    }
    await refreshEvent(ctx, delivery.notification_event_id);
  },
});

export const watchdog = internalMutation({
  args: { delivery_id: v.id("notification_deliveries"), attempt_count: v.number() },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.delivery_id);
    if (!delivery || delivery.channel !== "whatsapp" || delivery.attempt_count !== args.attempt_count) return;
    if (delivery.status === "queued") return retryOrFail(ctx, delivery, "Make no reclamó la entrega a tiempo");
    if (delivery.status === "sending") {
      await ctx.db.patch(delivery._id, { status: "unknown", error: "Make reclamó la entrega pero no confirmó el resultado; revisar antes de reenviar" });
      await refreshEvent(ctx, delivery.notification_event_id);
    }
  },
});

export const cleanupReceipts = internalMutation({
  args: {}, handler: async ctx => {
    const expired = await ctx.db.query("whatsapp_receipts").withIndex("by_expiry", q => q.lt("expires_at", Date.now())).take(200);
    for (const receipt of expired) await ctx.db.delete(receipt._id);
  },
});
