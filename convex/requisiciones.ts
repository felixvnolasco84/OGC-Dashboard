import { action, internalAction, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { canUserAccessDesarrollo, getCurrentUserOrThrow } from "./permissions";
import { renderRequisicionEmail } from "./requisicionEmailTemplates";
import { canAddRemissionPhotos, getRequisicionNotificationConfig, isValidRemissionPhoto, notificationForStatusTransition, requisitionDetailUrl, shouldNotifyRequisitionUser, validateOnsitePaymentRequest, type RequisicionNotificationType } from "../src/lib/requisicionNotificationMatrix";

// Convex self-references in actions can create circular inference without this narrowed escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convexApi = api as any;

type RequisicionEmailUser = {
    _id: Id<"users">;
    name: string;
    email: string;
    role: string;
    allowed_desarrollos: Id<"desarrollos">[];
    invitation_status?: string;
    organization_id?: string;
};
type RequisicionEmailRecipient = {
    _id: Id<"users">;
    name: string;
    email: string;
    role: string;
};

function canReceiveProjectNotification(user: RequisicionEmailUser, proyecto: Doc<"desarrollos">) {
    if (!user.email?.trim()) return false;
    if (user.invitation_status === "pending") return false;
    return canUserAccessDesarrollo(user, proyecto);
}

async function recordAutomaticNotification(ctx: MutationCtx, args: {
    requisicion: Doc<"requisiciones">;
    type: RequisicionNotificationType;
    actor: Doc<"users">;
    historyId: Id<"requisicion_history">;
    message?: string;
}) {
    const config = getRequisicionNotificationConfig(args.type);
    const project = await ctx.db.get(args.requisicion.proyecto);
    if (!project) return;
    const users = await ctx.db.query("users").collect();
    const actorEmail = args.actor.email.trim().toLowerCase();
    const recipientsByEmail = new Map<string, Doc<"users">>();
    for (const user of users) {
        const email = user.email.trim().toLowerCase();
        if (email === actorEmail || !shouldNotifyRequisitionUser({
            type: args.type,
            userId: String(user._id),
            actorId: String(args.actor._id),
            requesterId: String(args.requisicion.solicitante_id),
            role: user.role,
            email,
            invitationStatus: user.invitation_status,
            hasProjectAccess: canUserAccessDesarrollo(user, project),
        })) continue;
        if (!recipientsByEmail.has(email)) recipientsByEmail.set(email, user);
    }
    const recipients = [...recipientsByEmail.values()];
    if (recipients.length === 0) return;
    const now = Date.now();
    const eventId = await ctx.db.insert("notification_events", {
        proyecto: args.requisicion.proyecto,
        requisicion_id: args.requisicion._id,
        source_history_id: args.historyId,
        type: args.type,
        subject: `${config.subject} - ${project.nombre}`,
        message: args.message || config.defaultMessage,
        actor_id: args.actor._id,
        actor_name: args.actor.name || args.actor.email,
        channel: "app_email",
        status: "pending",
        recipient_count: recipients.length,
        sent_count: 0,
        failed_count: 0,
        created_at: now,
    });
    for (const user of recipients) {
        for (const channel of ["in_app", "email"] as const) {
            await ctx.db.insert("notification_deliveries", {
                notification_event_id: eventId,
                proyecto: args.requisicion.proyecto,
                requisicion_id: args.requisicion._id,
                recipient_user_id: user._id,
                recipient_name: user.name || user.email,
                recipient_email: user.email.trim().toLowerCase(),
                channel,
                status: channel === "in_app" ? "sent" : "pending",
                created_at: now,
                sent_at: channel === "in_app" ? now : undefined,
            });
        }
    }
    await ctx.scheduler.runAfter(0, internal.requisiciones.dispatchAutomaticEmail, { event_id: eventId });
}

const requisicionStatusDocumentValidator = v.object({
    storage_id: v.id("_storage"),
    nombre: v.string(),
    type: v.string(),
    size: v.number(),
});

async function createRequisicionHistoryDocuments(
    ctx: MutationCtx,
    args: {
        requisicion_id: Id<"requisiciones">;
        proyecto: Id<"desarrollos">;
        documentos?: Array<{
            storage_id: Id<"_storage">;
            nombre: string;
            type: string;
            size: number;
        }>;
        categoria?: string;
        uploaded_by_id: Id<"users">;
        uploaded_by_name: string;
    }
) {
    const documentoIds: Id<"requisicion_documentos">[] = [];

    for (const documento of args.documentos ?? []) {
        const documentoId = await ctx.db.insert("requisicion_documentos", {
            requisicion_id: args.requisicion_id,
            proyecto: args.proyecto,
            categoria: args.categoria,
            storage_id: documento.storage_id,
            nombre: documento.nombre,
            type: documento.type,
            size: documento.size,
            uploaded_at: Date.now(),
            uploaded_by_id: args.uploaded_by_id,
            uploaded_by_name: args.uploaded_by_name,
        });
        documentoIds.push(documentoId);
    }

    return documentoIds;
}

export const claimAutomaticEmailPayload = internalMutation({
    args: { event_id: v.id("notification_events") },
    handler: async (ctx, args) => {
        const event = await ctx.db.get(args.event_id);
        if (!event || event.channel !== "app_email") return null;
        const project = await ctx.db.get(event.proyecto);
        const requisicion = event.requisicion_id ? await ctx.db.get(event.requisicion_id) : null;
        const deliveries = await ctx.db.query("notification_deliveries")
            .withIndex("by_event", q => q.eq("notification_event_id", args.event_id)).collect();
        const pending = [];
        for (const delivery of deliveries) {
            if (delivery.channel !== "email" || delivery.status !== "pending") continue;
            await ctx.db.patch(delivery._id, { status: "sending" });
            const recipient = delivery.recipient_user_id ? await ctx.db.get(delivery.recipient_user_id) : null;
            pending.push({ ...delivery, canSend: Boolean(requisicion && project && recipient && recipient.invitation_status !== "pending" && canUserAccessDesarrollo(recipient, project)) });
        }
        return { event, projectName: project?.nombre || "Proyecto", requisicion, deliveries: pending };
    },
});

export const finishAutomaticEmail = internalMutation({
    args: {
        event_id: v.id("notification_events"),
        outcomes: v.array(v.object({
            delivery_id: v.id("notification_deliveries"),
            status: v.union(v.literal("sent"), v.literal("failed")),
            provider_message_id: v.optional(v.string()),
            error: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        let sent = 0;
        let failed = 0;
        for (const outcome of args.outcomes) {
            const delivery = await ctx.db.get(outcome.delivery_id);
            if (!delivery || delivery.notification_event_id !== args.event_id || delivery.status !== "sending") continue;
            await ctx.db.patch(delivery._id, {
                status: outcome.status,
                provider_message_id: outcome.provider_message_id,
                error: outcome.error,
                sent_at: outcome.status === "sent" ? Date.now() : undefined,
            });
            if (outcome.status === "sent") sent++;
            else failed++;
        }
        await ctx.db.patch(args.event_id, {
            status: failed ? sent ? "partial" : "failed" : "sent",
            sent_count: sent,
            failed_count: failed,
            sent_at: Date.now(),
        });
    },
});

export const dispatchAutomaticEmail = internalAction({
    args: { event_id: v.id("notification_events") },
    handler: async (ctx, args) => {
        const payload = await ctx.runMutation(internal.requisiciones.claimAutomaticEmailPayload, args);
        if (!payload || payload.deliveries.length === 0) return;
        const resendApiKey = process.env.RESEND_API_KEY;
        const from = process.env.RESEND_FROM_EMAIL;
        const appUrl = (process.env.APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");
        const config = getRequisicionNotificationConfig(payload.event.type);
        const ctaUrl = requisitionDetailUrl(appUrl, payload.event.proyecto, payload.event.requisicion_id);
        const html = renderRequisicionEmail({
            actorName: payload.event.actor_name,
            actionLabel: config.actionLabel,
            projectName: payload.projectName,
            requisicionTitle: payload.requisicion?.descripcion || "Requisición",
            statusLabel: config.label,
            message: payload.event.message || config.defaultMessage,
            ctaUrl,
            logoUrl: `${appUrl}/OGC-LOGO.svg`,
            occurredAt: payload.event.created_at,
        });
        const outcomes = await Promise.all(payload.deliveries.map(async (delivery) => {
            if (!delivery.canSend) return { delivery_id: delivery._id, status: "failed" as const, error: "Destinatario sin acceso vigente al proyecto" };
            if (!resendApiKey || !from || !appUrl) {
                return { delivery_id: delivery._id, status: "failed" as const, error: "Falta configurar Resend o APP_URL" };
            }
            try {
                const response = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ from, to: [delivery.recipient_email], subject: payload.event.subject, html }),
                });
                const result = await response.json().catch(() => null);
                if (!response.ok) throw new Error(result?.message || `Resend: ${response.status}`);
                return { delivery_id: delivery._id, status: "sent" as const, provider_message_id: result?.id as string | undefined };
            } catch (error) {
                return { delivery_id: delivery._id, status: "failed" as const, error: error instanceof Error ? error.message : "Error al enviar" };
            }
        }));
        await ctx.runMutation(internal.requisiciones.finishAutomaticEmail, { event_id: args.event_id, outcomes });
    },
});

export const getEmailRecipients = query({
    args: {
        proyecto: v.id("desarrollos"),
        requisicion_id: v.optional(v.id("requisiciones")),
        notification_type: v.optional(v.string()),
        exclude_current_user: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const currentUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!currentUser) {
            throw new Error("Unauthorized");
        }
        if (!["admin", "finance"].includes(currentUser.role)) throw new Error("Sin permisos para enviar avisos manuales");

        const project = await ctx.db.get(args.proyecto);
        if (!project || !canUserAccessDesarrollo(currentUser, project)) {
            throw new Error("Unauthorized");
        }

        const config = args.notification_type
            ? getRequisicionNotificationConfig(args.notification_type)
            : null;
        const requisicion = args.requisicion_id
            ? await ctx.db.get(args.requisicion_id)
            : null;

        if (args.requisicion_id && (!requisicion || requisicion.proyecto !== args.proyecto)) {
            throw new Error("La requisicion no pertenece al proyecto");
        }

        const users = (await ctx.db.query("users").collect()) as RequisicionEmailUser[];
        const recipients = users
            .filter((user) => canReceiveProjectNotification(user, project))
            .filter((user) => config ? shouldNotifyRequisitionUser({
                type: config.type,
                userId: String(user._id),
                actorId: args.exclude_current_user ? String(currentUser._id) : "",
                requesterId: String(requisicion?.solicitante_id || ""),
                role: user.role,
                email: user.email,
                invitationStatus: user.invitation_status,
                hasProjectAccess: canReceiveProjectNotification(user, project),
            }) : true);

        const recipientsByEmail = new Map<string, {
            _id: Id<"users">;
            name: string;
            email: string;
            role: string;
        }>();
        const currentUserEmail = currentUser.email.trim().toLowerCase();

        for (const user of recipients) {
            const normalizedEmail = user.email.trim().toLowerCase();
            if (args.exclude_current_user && normalizedEmail === currentUserEmail) {
                continue;
            }
            if (!recipientsByEmail.has(normalizedEmail)) {
                recipientsByEmail.set(normalizedEmail, {
                    _id: user._id,
                    name: user.name,
                    email: normalizedEmail,
                    role: user.role,
                });
            }
        }

        return Array.from(recipientsByEmail.values());
    },
});

export const createNotificationEvent = internalMutation({
    args: {
        proyecto: v.id("desarrollos"),
        requisicion_id: v.optional(v.id("requisiciones")),
        type: v.string(),
        subject: v.string(),
        message: v.optional(v.string()),
        actor_id: v.id("users"),
        actor_name: v.string(),
        channel: v.string(),
        status: v.optional(v.string()),
        recipients: v.array(v.object({
            recipient_user_id: v.optional(v.id("users")),
            recipient_name: v.string(),
            recipient_email: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const eventId = await ctx.db.insert("notification_events", {
            proyecto: args.proyecto,
            requisicion_id: args.requisicion_id,
            type: args.type,
            subject: args.subject,
            message: args.message,
            actor_id: args.actor_id,
            actor_name: args.actor_name,
            channel: args.channel,
            status: args.status ?? "pending",
            recipient_count: args.recipients.length,
            sent_count: 0,
            failed_count: 0,
            created_at: now,
        });

        const deliveries = await Promise.all(
            args.recipients.map(async (recipient) => {
                const deliveryId = await ctx.db.insert("notification_deliveries", {
                    notification_event_id: eventId,
                    proyecto: args.proyecto,
                    requisicion_id: args.requisicion_id,
                    recipient_user_id: recipient.recipient_user_id,
                    recipient_name: recipient.recipient_name,
                    recipient_email: recipient.recipient_email,
                    channel: args.channel,
                    status: "pending",
                    created_at: now,
                });

                return {
                    delivery_id: deliveryId,
                    recipient_email: recipient.recipient_email,
                };
            })
        );

        return { eventId, deliveries };
    },
});

export const finalizeNotificationEvent = internalMutation({
    args: {
        event_id: v.id("notification_events"),
        deliveries: v.array(v.object({
            delivery_id: v.id("notification_deliveries"),
            status: v.string(),
            provider_message_id: v.optional(v.string()),
            error: v.optional(v.string()),
            sent_at: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        let sentCount = 0;
        let failedCount = 0;

        for (const delivery of args.deliveries) {
            if (delivery.status === "sent") sentCount += 1;
            if (delivery.status === "failed") failedCount += 1;

            await ctx.db.patch(delivery.delivery_id, {
                status: delivery.status,
                provider_message_id: delivery.provider_message_id,
                error: delivery.error,
                sent_at: delivery.sent_at,
            });
        }

        const event = await ctx.db.get(args.event_id);
        const status =
            (event?.recipient_count ?? args.deliveries.length) === 0
                ? "no_recipients"
                : sentCount > 0 && failedCount > 0
                    ? "partial"
                    : sentCount > 0
                        ? "sent"
                        : "failed";

        await ctx.db.patch(args.event_id, {
            status,
            sent_count: sentCount,
            failed_count: failedCount,
            sent_at: now,
        });

        return { status, sentCount, failedCount };
    },
});

export const getNotificationEventsByProyecto = query({
    args: {
        proyecto: v.id("desarrollos"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (!["admin", "finance"].includes(actor.role)) throw new Error("Sin permisos para consultar los envíos");
        const project = await ctx.db.get(args.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
        const events = await ctx.db
            .query("notification_events")
            .withIndex("by_proyecto_created", (q) => q.eq("proyecto", args.proyecto))
            .order("desc")
            .take(args.limit ?? 10);

        return await Promise.all(
            events.map(async (event) => {
                const deliveries = await ctx.db
                    .query("notification_deliveries")
                    .withIndex("by_event", (q) => q.eq("notification_event_id", event._id))
                    .collect();

                return { ...event, deliveries };
            })
        );
    },
});

export const sendEmailNotification = action({
    args: {
        proyecto: v.id("desarrollos"),
        requisicion_id: v.optional(v.id("requisiciones")),
        notification_type: v.string(),
        message: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (args.notification_type === "onsite_payment_requested") throw new Error("El pago en obra se solicita desde la requisición");
        const config = getRequisicionNotificationConfig(args.notification_type);

        const currentUser = await ctx.runQuery(convexApi.users.getCurrentUser);
        if (!currentUser) {
            throw new Error("Not authenticated");
        }
        if (!["admin", "finance"].includes(currentUser.role)) throw new Error("Sin permisos para enviar avisos manuales");

        const proyecto = await ctx.runQuery(convexApi.desarrollos.getById, { id: args.proyecto });
        if (!proyecto) {
            throw new Error("Project not found");
        }

        const requisicion = args.requisicion_id
            ? await ctx.runQuery(convexApi.requisiciones.getById, { id: args.requisicion_id })
            : null;

        if (config.requiresRequisition && !requisicion) {
            throw new Error("Selecciona una requisicion para este tipo de notificacion");
        }

        if (requisicion && requisicion.proyecto !== args.proyecto) {
            throw new Error("La requisicion no pertenece al proyecto");
        }

        const recipients: RequisicionEmailRecipient[] = await ctx.runQuery(convexApi.requisiciones.getEmailRecipients, {
            proyecto: args.proyecto,
            requisicion_id: args.requisicion_id,
            notification_type: args.notification_type,
            exclude_current_user: true,
        });

        const actorEmail = currentUser.email?.trim().toLowerCase();
        const recipientsToNotify = recipients.filter((recipient) => recipient.email.trim().toLowerCase() !== actorEmail);
        const requisicionTitle = requisicion
            ? `${requisicion.tipo === "equipo" ? "Equipo" : "Material"} solicitado`
            : "Requisiciones";
        const statusLabel = requisicion?.status_revision || requisicion?.status || "On Going";
        const message = args.message?.trim() || requisicion?.descripcion || config.defaultMessage;
        const subject = `${config.subject} - ${proyecto.nombre}`;

        const notificationEvent: {
            eventId: Id<"notification_events">;
            deliveries: Array<{
                delivery_id: Id<"notification_deliveries">;
                recipient_email: string;
            }>;
        } = await ctx.runMutation(internal.requisiciones.createNotificationEvent, {
            proyecto: args.proyecto,
            requisicion_id: args.requisicion_id,
            type: args.notification_type,
            subject,
            message,
            actor_id: currentUser._id,
            actor_name: currentUser.name || currentUser.email,
            channel: "email",
            status: recipientsToNotify.length === 0 ? "no_recipients" : "pending",
            recipients: recipientsToNotify.map((recipient) => ({
                recipient_user_id: recipient._id,
                recipient_name: recipient.name,
                recipient_email: recipient.email,
            })),
        });

        if (recipientsToNotify.length === 0) {
            await ctx.runMutation(internal.requisiciones.finalizeNotificationEvent, {
                event_id: notificationEvent.eventId,
                deliveries: [],
            });
            return { success: true, sent: 0, failed: 0, emailIds: [], failures: [] };
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        const resendFromEmail = process.env.RESEND_FROM_EMAIL;
        const appUrl = (process.env.APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");
        const configurationError = !resendApiKey || !resendFromEmail
            ? "Missing RESEND_API_KEY or RESEND_FROM_EMAIL Convex environment variable"
            : !appUrl
                ? "Missing APP_URL Convex environment variable"
                : null;

        if (configurationError) {
            await ctx.runMutation(internal.requisiciones.finalizeNotificationEvent, {
                event_id: notificationEvent.eventId,
                deliveries: notificationEvent.deliveries.map((delivery) => ({
                    delivery_id: delivery.delivery_id,
                    status: "failed",
                    error: configurationError,
                })),
            });
            throw new Error(configurationError);
        }

        const ctaUrl = requisitionDetailUrl(appUrl, args.proyecto, args.requisicion_id);
        const html = renderRequisicionEmail({
            actorName: currentUser.name || currentUser.email,
            actionLabel: config.actionLabel,
            projectName: proyecto.nombre,
            requisicionTitle,
            statusLabel,
            message,
            ctaUrl,
            logoUrl: `${appUrl}/OGC-LOGO.svg`,
            occurredAt: Date.now(),
        });

        const emailResults = await Promise.allSettled(
            notificationEvent.deliveries.map(async (delivery) => {
                const recipient = recipientsToNotify.find((item) => item.email === delivery.recipient_email);
                if (!recipient) {
                    throw new Error(`Destinatario no encontrado para ${delivery.recipient_email}`);
                }

                const emailResponse = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${resendApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        from: resendFromEmail,
                        to: [recipient.email],
                        subject,
                        html,
                    }),
                });

                const emailResult = await emailResponse.json().catch(() => null);
                if (!emailResponse.ok) {
                    throw new Error(emailResult?.message || `Unable to send requisicion email notification to ${recipient.email}`);
                }
                return { delivery_id: delivery.delivery_id, emailResult };
            })
        );

        const sentResults = emailResults.filter((result) => result.status === "fulfilled");
        const failedResults = emailResults.filter((result) => result.status === "rejected");
        const sentAt = Date.now();

        await ctx.runMutation(internal.requisiciones.finalizeNotificationEvent, {
            event_id: notificationEvent.eventId,
            deliveries: emailResults.map((result, index) => {
                const delivery = notificationEvent.deliveries[index];
                if (result.status === "fulfilled") {
                    return {
                        delivery_id: result.value.delivery_id,
                        status: "sent",
                        provider_message_id: result.value.emailResult?.id,
                        sent_at: sentAt,
                    };
                }

                return {
                    delivery_id: delivery.delivery_id,
                    status: "failed",
                    error: result.reason instanceof Error ? result.reason.message : "Error desconocido",
                };
            }),
        });

        if (sentResults.length === 0 && failedResults.length > 0) {
            const firstFailure = failedResults[0];
            throw new Error(firstFailure.reason instanceof Error ? firstFailure.reason.message : "No se pudo enviar la notificacion");
        }

        return {
            success: true,
            sent: sentResults.length,
            failed: failedResults.length,
            emailIds: sentResults.map((result) => result.value?.emailResult?.id).filter(Boolean),
            failures: failedResults.map((result) =>
                result.reason instanceof Error ? result.reason.message : "Error desconocido"
            ),
        };
    },
});

// Generate upload URL for requisicion documents
export const generateUploadUrl = mutation(async (ctx) => {
    const actor = await getCurrentUserOrThrow(ctx);
    if (actor.role === "almacenista") throw new Error("Usa la carga de notas de remisión");
    return await ctx.storage.generateUploadUrl();
});

export const generateRemissionUploadUrl = mutation({
    args: { id: v.id("requisiciones") },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const requisicion = await ctx.db.get(args.id);
        const project = requisicion ? await ctx.db.get(requisicion.proyecto) : null;
        if (!requisicion || !canAddRemissionPhotos({
            role: actor.role,
            status: requisicion.status,
            hasProjectAccess: Boolean(project && canUserAccessDesarrollo(actor, project)),
        })) throw new Error("Sin permisos para agregar notas de remisión a esta requisición pagada");
        return await ctx.storage.generateUploadUrl();
    },
});

// Get document URL by storage ID
export const getDocumentUrl = query({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const document = await ctx.db.query("requisicion_documentos")
            .withIndex("by_storage_id", q => q.eq("storage_id", args.storageId)).first();
        if (!document) return null;
        const requisicion = await ctx.db.get(document.requisicion_id);
        const project = await ctx.db.get(document.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || (actor.role === "contratista" && requisicion?.solicitante_id !== actor._id)) throw new Error("Sin acceso al documento");
        return await ctx.storage.getUrl(args.storageId);
    },
});

// Delete a requisicion document
export const deleteDocument = mutation({
    args: { id: v.id("requisicion_documentos") },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const doc = await ctx.db.get(args.id);
        if (doc) {
            const requisicion = await ctx.db.get(doc.requisicion_id);
            const project = await ctx.db.get(doc.proyecto);
            if (!requisicion || !project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || actor.role === "user" || (actor.role === "contratista" && requisicion.solicitante_id === actor._id))) throw new Error("Sin permisos para eliminar el documento");
            const history = await ctx.db.query("requisicion_history")
                .withIndex("by_requisicion", q => q.eq("requisicion_id", doc.requisicion_id)).collect();
            if (history.some(item => item.documento_ids?.includes(doc._id))) throw new Error("La evidencia del historial no se puede eliminar");
            // Delete from storage
            await ctx.storage.delete(doc.storage_id);
            // Delete record
            await ctx.db.delete(args.id);
        }
        return { success: true };
    },
});

// Get all requisiciones for a project
export const getByProyecto = query({
    args: {
        proyecto: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const project = await ctx.db.get(args.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
        const requisiciones = await ctx.db
            .query("requisiciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
            .collect();
        const visibleRequisiciones = actor.role === "contratista" ? requisiciones.filter(req => req.solicitante_id === actor._id) : requisiciones;
        
        // Enrich with items, proveedor, and documents data
        const enriched = await Promise.all(
            visibleRequisiciones.map(async (req) => {
                const rawItems = await ctx.db
                    .query("requisicion_items")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                // Enrich items with partida budget data
                const items = await Promise.all(
                    rawItems.map(async (item) => {
                        const partida = await ctx.db.get(item.partida_id);
                        return {
                            ...item,
                            precio_unitario: partida?.precio_unitario ?? 0,
                            presupuesto_aprobado: partida?.presupuesto_aprobado ?? 0,
                            pagado: partida?.pagado ?? 0,
                        };
                    })
                );
                
                const proveedor = req.proveedor_id 
                    ? await ctx.db.get(req.proveedor_id)
                    : null;
                
                // Fetch documents with URLs
                const documentos = await ctx.db
                    .query("requisicion_documentos")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                const enrichedDocumentos = await Promise.all(
                    documentos.map(async (doc) => {
                        const url = await ctx.storage.getUrl(doc.storage_id);
                        return { ...doc, url };
                    })
                );
                
                return {
                    ...req,
                    items,
                    proveedor,
                    documentos: enrichedDocumentos,
                };
            })
        );
        
        return enriched;
    },
});

// Get requisiciones by status
export const getByStatus = query({
    args: {
        proyecto: v.id("desarrollos"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const project = await ctx.db.get(args.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
        const requisiciones = await ctx.db
            .query("requisiciones")
            .withIndex("by_proyecto_status", (q) => 
                q.eq("proyecto", args.proyecto).eq("status", args.status)
            )
            .collect();
        
        const visibleRequisiciones = actor.role === "contratista" ? requisiciones.filter(req => req.solicitante_id === actor._id) : requisiciones;
        const enriched = await Promise.all(
            visibleRequisiciones.map(async (req) => {
                const items = await ctx.db
                    .query("requisicion_items")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                return { ...req, items };
            })
        );
        
        return enriched;
    },
});

// Get single requisicion by ID
export const getById = query({
    args: {
        id: v.id("requisiciones"),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) return null;
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || (actor.role === "contratista" && requisicion.solicitante_id !== actor._id)) throw new Error("Sin acceso a la requisición");
        
        const items = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        const documentos = await ctx.db
            .query("requisicion_documentos")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        const history = await ctx.db.query("requisicion_history")
            .withIndex("by_requisicion", q => q.eq("requisicion_id", args.id)).collect();
        const lockedDocumentIds = new Set(history.flatMap(item => item.documento_ids || []).map(String));
        
        // Enrich documents with URLs
        const enrichedDocuments = await Promise.all(
            documentos.map(async (doc) => {
                const url = await ctx.storage.getUrl(doc.storage_id);
                return { ...doc, url, locked: lockedDocumentIds.has(String(doc._id)) };
            })
        );
        
        const proveedor = requisicion.proveedor_id
            ? await ctx.db.get(requisicion.proveedor_id)
            : null;
        
        // Enrich items with partida data
        const enrichedItems = await Promise.all(
            items.map(async (item) => {
                const partida = await ctx.db.get(item.partida_id);
                return { ...item, partida };
            })
        );
        
        return {
            ...requisicion,
            items: enrichedItems,
            documentos: enrichedDocuments,
            proveedor,
        };
    },
});

// Create new requisicion with items
export const create = mutation({
    args: {
        proyecto: v.id("desarrollos"),
        tipo: v.string(),
        solicitante_id: v.id("users"),
        solicitante_nombre: v.string(),
        proveedor_id: v.optional(v.id("proveedores")),
        fecha_solicitud: v.string(),
        fecha_entrega: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        items: v.array(v.object({
            partida_id: v.id("partidas"),
            familia: v.string(),
            sub_partida: v.optional(v.string()),
            cantidad: v.number(),
            unidad: v.string(),
            monto: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const project = await ctx.db.get(args.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || actor._id !== args.solicitante_id || !["admin", "user", "contratista"].includes(actor.role)) throw new Error("Sin permisos para crear la requisición");
        const { items, ...requisicionData } = args;
        
        // Create requisicion with default statuses
        const requisicionId = await ctx.db.insert("requisiciones", {
            ...requisicionData,
            status: "En proceso",
            status_entrega: "Pendiente",
            status_revision: "Pendiente de revisión",
            created_at: Date.now(),
        });
        
        // Create line items
        for (const item of items) {
            await ctx.db.insert("requisicion_items", {
                requisicion_id: requisicionId,
                partida_id: item.partida_id,
                familia: item.familia,
                sub_partida: item.sub_partida,
                cantidad: item.cantidad,
                unidad: item.unidad,
                monto: item.monto,
                status_revision: "pendiente",
            });
        }
        
        // Log history with detailed info
        const familias = [...new Set(items.map(i => i.familia))];
        const totalMonto = items.reduce((sum, i) => sum + (i.monto || 0), 0);
        const historyId = await ctx.db.insert("requisicion_history", {
            proyecto: args.proyecto,
            requisicion_id: requisicionId,
            action: "created",
            new_value: JSON.stringify({
                tipo: args.tipo,
                solicitante_id: args.solicitante_id,
                solicitante: args.solicitante_nombre,
                fecha_solicitud: args.fecha_solicitud,
                items_count: items.length,
                familias,
                total_monto: totalMonto,
                descripcion: args.descripcion || null,
            }),
            changed_by_id: args.solicitante_id,
            changed_by_name: args.solicitante_nombre,
            created_at: Date.now(),
        });
        const created = await ctx.db.get(requisicionId);
        if (created) await recordAutomaticNotification(ctx, { requisicion: created, type: "created", actor, historyId });
        
        return requisicionId;
    },
});

// Update requisicion payment status
export const updateStatus = mutation({
    args: {
        id: v.id("requisiciones"),
        status: v.string(),
        comentario: v.optional(v.string()),
        documentos: v.optional(v.array(requisicionStatusDocumentValidator)),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== args.changed_by_id || !["admin", "finance"].includes(actor.role)) throw new Error("Sin permisos para actualizar el pago");
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
        if (requisicion.status === args.status) return { success: true };
        
        const oldStatus = requisicion.status;
        const now = Date.now();
        
        await ctx.db.patch(args.id, {
            status: args.status,
            pago_obra: args.status === "Pagado" && requisicion.pago_obra?.estado === "pendiente"
                ? { ...requisicion.pago_obra, estado: "pagado" as const }
                : args.status === "Cancelado" && requisicion.pago_obra?.estado === "pendiente"
                    ? { ...requisicion.pago_obra, estado: "cancelada" as const }
                : requisicion.pago_obra,
            updated_at: now,
        });

        const documentoIds = await createRequisicionHistoryDocuments(ctx, {
            requisicion_id: args.id,
            proyecto: requisicion.proyecto,
            documentos: args.documentos,
            uploaded_by_id: args.changed_by_id,
            uploaded_by_name: args.changed_by_name,
        });
        
        // Log history with requisicion context
        const historyId = await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "status_changed",
            field_changed: "status",
            old_value: JSON.stringify({
                status: oldStatus,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            new_value: JSON.stringify({
                status: args.status,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
                comentario: args.comentario,
                documentos: args.documentos?.map((doc) => ({
                    nombre: doc.nombre,
                    type: doc.type,
                    size: doc.size,
                })),
            }),
            comentario: args.comentario,
            documento_ids: documentoIds.length > 0 ? documentoIds : undefined,
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: now,
        });
        if (notificationForStatusTransition("payment", oldStatus, args.status)) await recordAutomaticNotification(ctx, {
            requisicion, type: "payment", actor, historyId,
            message: args.comentario || "La requisición se marcó como pagada.",
        });
        
        return { success: true };
    },
});

// Update requisicion delivery status
export const requestOnsitePayment = mutation({
    args: { id: v.id("requisiciones"), importe: v.number(), motivo: v.string() },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisición no encontrada");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || actor.role === "user" || (actor.role === "contratista" && requisicion.solicitante_id === actor._id))) throw new Error("Sin permisos para solicitar el pago");
        const motivo = validateOnsitePaymentRequest({ statusRevision: requisicion.status_revision, status: requisicion.status, paymentState: requisicion.pago_obra?.estado, amount: args.importe, reason: args.motivo });
        const now = Date.now();
        await ctx.db.patch(args.id, {
            pago_obra: { importe: args.importe, motivo, solicitado_por_id: actor._id, solicitado_por_nombre: actor.name || actor.email, solicitado_at: now, estado: "pendiente" },
            updated_at: now,
        });
        const historyId = await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "onsite_payment_requested",
            new_value: JSON.stringify({ importe: args.importe, motivo, moneda: "MXN" }),
            comentario: motivo,
            changed_by_id: actor._id,
            changed_by_name: actor.name || actor.email,
            created_at: now,
        });
        await recordAutomaticNotification(ctx, { requisicion, type: "onsite_payment_requested", actor, historyId, message: `Pago en obra por $${args.importe.toLocaleString("es-MX")} MXN. ${motivo}` });
        return { success: true };
    },
});

// Update requisicion delivery status
export const updateStatusEntrega = mutation({
    args: {
        id: v.id("requisiciones"),
        status_entrega: v.string(),
        comentario: v.optional(v.string()),
        documentos: v.optional(v.array(requisicionStatusDocumentValidator)),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== args.changed_by_id) throw new Error("Usuario no autorizado");
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || actor.role === "user" || (actor.role === "contratista" && requisicion.solicitante_id === actor._id))) throw new Error("Sin permisos para registrar la entrega");
        if (requisicion.status_entrega === args.status_entrega) return { success: true };
        if (args.status_entrega === "Parcial" || args.status_entrega === "Completo") {
            for (const doc of args.documentos ?? []) {
                const metadata = await ctx.storage.getMetadata(doc.storage_id);
                if (!metadata || !isValidRemissionPhoto({ type: metadata.contentType || "", size: metadata.size })) throw new Error("La foto de remisión debe ser una imagen menor a 10 MB");
            }
        }
        
        const oldStatusEntrega = requisicion.status_entrega;
        const now = Date.now();
        
        await ctx.db.patch(args.id, {
            status_entrega: args.status_entrega,
            updated_at: now,
        });

        const documentoIds = await createRequisicionHistoryDocuments(ctx, {
            requisicion_id: args.id,
            proyecto: requisicion.proyecto,
            documentos: args.documentos,
            categoria: args.status_entrega === "Parcial" || args.status_entrega === "Completo" ? "nota_remision" : undefined,
            uploaded_by_id: args.changed_by_id,
            uploaded_by_name: args.changed_by_name,
        });
        
        // Log history with requisicion context
        const historyId = await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "status_entrega_changed",
            field_changed: "status_entrega",
            old_value: JSON.stringify({
                status_entrega: oldStatusEntrega,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            new_value: JSON.stringify({
                status_entrega: args.status_entrega,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
                comentario: args.comentario,
                documentos: args.documentos?.map((doc) => ({
                    nombre: doc.nombre,
                    type: doc.type,
                    size: doc.size,
                })),
            }),
            comentario: args.comentario,
            documento_ids: documentoIds.length > 0 ? documentoIds : undefined,
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: now,
        });
        if (notificationForStatusTransition("delivery", oldStatusEntrega, args.status_entrega)) await recordAutomaticNotification(ctx, {
            requisicion, type: "delivery", actor, historyId,
            message: `Entrega ${args.status_entrega.toLowerCase()} registrada${args.documentos?.length ? " con nota de remisión" : ""}.`,
        });
        
        return { success: true };
    },
});

// Cancel requisicion
export const cancel = mutation({
    args: {
        id: v.id("requisiciones"),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== args.changed_by_id) throw new Error("Usuario no autorizado");
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || requisicion.solicitante_id === actor._id)) throw new Error("Sin permisos para cancelar la requisición");
        if (requisicion.status === "Cancelado") return { success: true };
        
        const oldStatus = requisicion.status;
        
        await ctx.db.patch(args.id, {
            status: "Cancelado",
            pago_obra: requisicion.pago_obra?.estado === "pendiente" ? { ...requisicion.pago_obra, estado: "cancelada" as const } : requisicion.pago_obra,
            updated_at: Date.now(),
        });
        
        // Log history
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "cancelled",
            field_changed: "status",
            old_value: oldStatus,
            new_value: "Cancelado",
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: Date.now(),
        });
        
        return { success: true };
    },
});

// Add document to requisicion
export const addDocument = mutation({
    args: {
        requisicion_id: v.id("requisiciones"),
        proyecto: v.id("desarrollos"),
        storage_id: v.id("_storage"),
        nombre: v.string(),
        type: v.string(),
        size: v.number(),
        uploaded_by_id: v.id("users"),
        uploaded_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const requisicion = await ctx.db.get(args.requisicion_id);
        const project = await ctx.db.get(args.proyecto);
        if (actor._id !== args.uploaded_by_id || !requisicion || requisicion.proyecto !== args.proyecto || !project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || actor.role === "user" || (actor.role === "contratista" && requisicion.solicitante_id === actor._id))) throw new Error("Sin permisos para adjuntar el documento");
        const docId = await ctx.db.insert("requisicion_documentos", {
            requisicion_id: args.requisicion_id,
            proyecto: args.proyecto,
            storage_id: args.storage_id,
            nombre: args.nombre,
            type: args.type,
            size: args.size,
            uploaded_at: Date.now(),
            uploaded_by_id: args.uploaded_by_id,
            uploaded_by_name: args.uploaded_by_name,
        });
        
        // Log history
        await ctx.db.insert("requisicion_history", {
            proyecto: args.proyecto,
            requisicion_id: args.requisicion_id,
            action: "document_added",
            new_value: args.nombre,
            changed_by_id: args.uploaded_by_id,
            changed_by_name: args.uploaded_by_name,
            created_at: Date.now(),
        });
        
        return docId;
    },
});

// Add delivery evidence without changing the delivery status.
export const addRemissionPhotos = mutation({
    args: {
        id: v.id("requisiciones"),
        documentos: v.array(requisicionStatusDocumentValidator),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisición no encontrada");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!canAddRemissionPhotos({
            role: actor.role,
            status: requisicion.status,
            hasProjectAccess: Boolean(project && canUserAccessDesarrollo(actor, project)),
        })) throw new Error("Sin permisos para agregar notas de remisión a esta requisición pagada");
        if (args.documentos.length === 0) throw new Error("Selecciona al menos una foto de la nota de remisión");

        const documentos = [];
        for (const documento of args.documentos) {
            const metadata = await ctx.storage.getMetadata(documento.storage_id);
            if (!metadata || !isValidRemissionPhoto({ type: metadata.contentType || "", size: metadata.size })) {
                throw new Error("Cada nota de remisión debe ser una imagen menor a 10 MB");
            }
            documentos.push({
                storage_id: documento.storage_id,
                nombre: documento.nombre,
                type: metadata.contentType || "",
                size: metadata.size,
            });
        }

        const uploadedByName = actor.name || actor.email;
        const documentoIds = await createRequisicionHistoryDocuments(ctx, {
            requisicion_id: requisicion._id,
            proyecto: requisicion.proyecto,
            documentos,
            categoria: "nota_remision",
            uploaded_by_id: actor._id,
            uploaded_by_name: uploadedByName,
        });
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: requisicion._id,
            action: "remission_photos_added",
            new_value: `${documentos.length} foto(s) de nota de remisión`,
            documento_ids: documentoIds,
            changed_by_id: actor._id,
            changed_by_name: uploadedByName,
            created_at: Date.now(),
        });
        return { success: true, uploaded: documentoIds.length };
    },
});

// Update requisicion
export const update = mutation({
    args: {
        id: v.id("requisiciones"),
        tipo: v.optional(v.string()),
        proveedor_id: v.optional(v.id("proveedores")),
        fecha_entrega: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        items: v.optional(v.array(v.object({
            partida_id: v.id("partidas"),
            familia: v.string(),
            sub_partida: v.optional(v.string()),
            cantidad: v.number(),
            unidad: v.string(),
            monto: v.optional(v.number()),
        }))),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const { id, items, changed_by_id, changed_by_name, ...updateData } = args;
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== changed_by_id) throw new Error("Usuario no autorizado");
        
        const requisicion = await ctx.db.get(id);
        if (!requisicion) throw new Error("Requisicion not found");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || actor.role === "user" || (actor.role === "contratista" && requisicion.solicitante_id === actor._id))) throw new Error("Sin permisos para editar la requisición");
        
        // Fetch old items for comparison
        const oldItems = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", id))
            .collect();
        
        // Resolve old proveedor name
        let oldProveedorName: string | null = null;
        if (requisicion.proveedor_id) {
            const oldProv = await ctx.db.get(requisicion.proveedor_id);
            oldProveedorName = oldProv?.razon_social ?? null;
        }
        
        // Resolve new proveedor name
        let newProveedorName: string | null = null;
        if (updateData.proveedor_id) {
            const newProv = await ctx.db.get(updateData.proveedor_id);
            newProveedorName = newProv?.razon_social ?? null;
        }
        
        // Build per-field diffs
        const fieldDiffs: { field: string; old_val: string; new_val: string }[] = [];
        
        if (updateData.tipo && updateData.tipo !== requisicion.tipo) {
            fieldDiffs.push({ field: "tipo", old_val: requisicion.tipo, new_val: updateData.tipo });
        }
        if (updateData.proveedor_id && updateData.proveedor_id !== requisicion.proveedor_id) {
            fieldDiffs.push({ field: "proveedor", old_val: oldProveedorName || "Sin proveedor", new_val: newProveedorName || "Sin proveedor" });
        }
        if (updateData.fecha_entrega && updateData.fecha_entrega !== requisicion.fecha_entrega) {
            fieldDiffs.push({ field: "fecha_entrega", old_val: requisicion.fecha_entrega || "Sin fecha", new_val: updateData.fecha_entrega });
        }
        if (updateData.descripcion !== undefined && updateData.descripcion !== requisicion.descripcion) {
            fieldDiffs.push({ field: "descripcion", old_val: requisicion.descripcion || "Sin descripción", new_val: updateData.descripcion || "Sin descripción" });
        }
        if (items) {
            // Build readable items summary
            const oldItemsSummary = oldItems.map(i => `${i.familia}${i.sub_partida ? ` > ${i.sub_partida}` : ""}: ${i.cantidad} ${i.unidad}${i.monto ? ` ($${i.monto.toLocaleString()})` : ""}`).join("; ");
            const newItemsSummary = items.map(i => `${i.familia}${i.sub_partida ? ` > ${i.sub_partida}` : ""}: ${i.cantidad} ${i.unidad}${i.monto ? ` ($${i.monto.toLocaleString()})` : ""}`).join("; ");
            fieldDiffs.push({ field: "items", old_val: oldItemsSummary || "Sin items", new_val: newItemsSummary });
        }
        
        // Check if this is a re-submission after review
        const wasReviewed = requisicion.status_revision === "Rechazada" || requisicion.status_revision === "Parcialmente Aprobada";
        
        // Update requisicion data
        const patchData: Record<string, unknown> = {
            ...updateData,
            updated_at: Date.now(),
        };
        
        // Reset review fields on re-submission
        if (wasReviewed) {
            patchData.status_revision = "Pendiente de revisión";
            patchData.nota_revision = undefined;
            patchData.revisado_por_id = undefined;
            patchData.revisado_por_nombre = undefined;
            patchData.revisado_at = undefined;
        }
        
        await ctx.db.patch(id, patchData);
        
        // If items provided, delete old items and create new ones
        if (items) {
            for (const item of oldItems) {
                await ctx.db.delete(item._id);
            }
            
            for (const item of items) {
                await ctx.db.insert("requisicion_items", {
                    requisicion_id: id,
                    partida_id: item.partida_id,
                    familia: item.familia,
                    sub_partida: item.sub_partida,
                    cantidad: item.cantidad,
                    unidad: item.unidad,
                    monto: item.monto,
                    status_revision: "pendiente",
                });
            }
        } else if (wasReviewed) {
            // Reset item review status even if items weren't changed
            for (const item of oldItems) {
                await ctx.db.patch(item._id, {
                    status_revision: "pendiente",
                    cantidad_aprobada: undefined,
                    nota_item: undefined,
                });
            }
        }
        
        // Log one history entry per changed field
        if (fieldDiffs.length > 0) {
            for (const diff of fieldDiffs) {
                const historyId = await ctx.db.insert("requisicion_history", {
                    proyecto: requisicion.proyecto,
                    requisicion_id: id,
                    action: "updated",
                    field_changed: diff.field,
                    old_value: diff.old_val,
                    new_value: diff.new_val,
                    changed_by_id: changed_by_id,
                    changed_by_name: changed_by_name,
                    created_at: Date.now(),
                });
                if (diff.field === "proveedor") await recordAutomaticNotification(ctx, {
                    requisicion, type: "assigned", actor, historyId,
                    message: `Se asignó el proveedor ${diff.new_val}.`,
                });
            }
        }
        
        // Log re-submission history
        if (wasReviewed) {
            await ctx.db.insert("requisicion_history", {
                proyecto: requisicion.proyecto,
                requisicion_id: id,
                action: "resubmitted",
                old_value: JSON.stringify({
                    previous_status_revision: requisicion.status_revision,
                    nota_revision: requisicion.nota_revision,
                    solicitante: requisicion.solicitante_nombre,
                    tipo: requisicion.tipo,
                }),
                new_value: JSON.stringify({
                    status_revision: "Pendiente de revisión",
                    solicitante: requisicion.solicitante_nombre,
                    tipo: requisicion.tipo,
                }),
                changed_by_id: changed_by_id,
                changed_by_name: changed_by_name,
                created_at: Date.now(),
            });
        }
        
        return { success: true };
    },
});

// Delete requisicion and operational line items while preserving audit history.
export const deleteRequisicion = mutation({
    args: {
        id: v.id("requisiciones"),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== args.changed_by_id) throw new Error("Usuario no autorizado");
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project) || !(actor.role === "admin" || (actor.role === "contratista" && requisicion.solicitante_id === actor._id))) throw new Error("Sin permisos para eliminar la requisición");

        const items = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();

        const documentos = await ctx.db
            .query("requisicion_documentos")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();

        const totalMonto = items.reduce((sum, item) => sum + (item.monto || 0), 0);

        // Log history before deletion and keep it for audit after the requisicion is gone.
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "deleted",
            old_value: JSON.stringify({
                tipo: requisicion.tipo,
                status: requisicion.status,
                status_revision: requisicion.status_revision,
                status_entrega: requisicion.status_entrega,
                solicitante_id: requisicion.solicitante_id,
                solicitante_nombre: requisicion.solicitante_nombre,
                fecha_solicitud: requisicion.fecha_solicitud,
                descripcion: requisicion.descripcion || null,
                items_count: items.length,
                documentos_count: documentos.length,
                total_monto: totalMonto,
                documentos: documentos.map((doc) => ({
                    nombre: doc.nombre,
                    type: doc.type,
                    size: doc.size,
                })),
            }),
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: Date.now(),
        });

        // Delete operational items. Documents and history stay available for audit context.
        for (const item of items) {
            await ctx.db.delete(item._id);
        }
        
        // Delete the requisicion
        const notificationDeliveries = await ctx.db.query("notification_deliveries")
            .withIndex("by_requisicion", q => q.eq("requisicion_id", args.id)).collect();
        for (const delivery of notificationDeliveries) {
            if (delivery.channel === "in_app" && !delivery.read_at) await ctx.db.patch(delivery._id, { status: "read", read_at: Date.now() });
        }
        await ctx.db.delete(args.id);
        
        return {
            success: true,
            preserved_history: true,
            preserved_documentos: documentos.length,
        };
    },
});

// Review requisicion - Finance/Admin approve, partially approve, or reject
export const reviewRequisicion = mutation({
    args: {
        id: v.id("requisiciones"),
        reviewer_id: v.id("users"),
        reviewer_name: v.string(),
        nota_revision: v.optional(v.string()),
        comentario: v.optional(v.string()),
        documentos: v.optional(v.array(requisicionStatusDocumentValidator)),
        items: v.array(v.object({
            item_id: v.id("requisicion_items"),
            status_revision: v.string(), // "aprobado" | "rechazado"
            cantidad_aprobada: v.optional(v.number()),
            nota_item: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== args.reviewer_id || !["admin", "finance"].includes(actor.role)) throw new Error("Sin permisos para revisar la requisición");
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        const project = await ctx.db.get(requisicion.proyecto);
        if (!project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
        
        // Patch each item with review decision
        for (const itemDecision of args.items) {
            const item = await ctx.db.get(itemDecision.item_id);
            if (!item) continue;
            
            await ctx.db.patch(itemDecision.item_id, {
                status_revision: itemDecision.status_revision,
                cantidad_aprobada: itemDecision.status_revision === "aprobado"
                    ? (itemDecision.cantidad_aprobada ?? item.cantidad)
                    : undefined,
                nota_item: itemDecision.nota_item,
            });
        }
        
        // Compute overall status_revision
        const approvedCount = args.items.filter(i => i.status_revision === "aprobado").length;
        const rejectedCount = args.items.filter(i => i.status_revision === "rechazado").length;
        const totalCount = args.items.length;
        
        let overallStatus: string;
        if (approvedCount === totalCount) {
            // Check if any quantities were modified
            let hasModifiedQty = false;
            for (const itemDecision of args.items) {
                if (itemDecision.cantidad_aprobada !== undefined) {
                    const item = await ctx.db.get(itemDecision.item_id);
                    if (item && itemDecision.cantidad_aprobada !== item.cantidad) {
                        hasModifiedQty = true;
                        break;
                    }
                }
            }
            overallStatus = hasModifiedQty ? "Parcialmente Aprobada" : "Aprobada";
        } else if (rejectedCount === totalCount) {
            overallStatus = "Rechazada";
        } else {
            overallStatus = "Parcialmente Aprobada";
        }
        
        // Update requisicion with review result
        await ctx.db.patch(args.id, {
            status_revision: overallStatus,
            nota_revision: args.nota_revision,
            revisado_por_id: args.reviewer_id,
            revisado_por_nombre: args.reviewer_name,
            revisado_at: Date.now(),
            updated_at: Date.now(),
        });
        
        // Fetch items for history details
        const allItems = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();

        const documentoIds = await createRequisicionHistoryDocuments(ctx, {
            requisicion_id: args.id,
            proyecto: requisicion.proyecto,
            documentos: args.documentos,
            uploaded_by_id: args.reviewer_id,
            uploaded_by_name: args.reviewer_name,
        });
        
        // Build detailed history
        const itemDetails = allItems.map(item => {
            const decision = args.items.find(d => d.item_id === item._id);
            return {
                familia: item.familia,
                sub_partida: item.sub_partida,
                cantidad_solicitada: item.cantidad,
                cantidad_aprobada: item.cantidad_aprobada,
                unidad: item.unidad,
                monto: item.monto,
                status_revision: item.status_revision,
                nota_item: decision?.nota_item,
            };
        });
        
        const historyId = await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "reviewed",
            new_value: JSON.stringify({
                status_revision: overallStatus,
                nota_revision: args.nota_revision,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
                items_approved: approvedCount,
                items_rejected: rejectedCount,
                items_total: totalCount,
                items: itemDetails,
                comentario: args.comentario,
                documentos: args.documentos?.map((doc) => ({
                    nombre: doc.nombre,
                    type: doc.type,
                    size: doc.size,
                })),
            }),
            old_value: JSON.stringify({
                status_revision: requisicion.status_revision,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            comentario: args.comentario,
            documento_ids: documentoIds.length > 0 ? documentoIds : undefined,
            changed_by_id: args.reviewer_id,
            changed_by_name: args.reviewer_name,
            created_at: Date.now(),
        });
        if (notificationForStatusTransition("review", requisicion.status_revision, overallStatus)) await recordAutomaticNotification(ctx, {
            requisicion, type: "reviewed", actor, historyId,
            message: `La requisición fue ${overallStatus.toLowerCase()}. ${args.nota_revision || args.comentario || "Consulta el detalle de la revisión."}`,
        });
        
        return { success: true, status_revision: overallStatus };
    },
});

// Review a single item immediately (inline review)
export const reviewSingleItem = mutation({
    args: {
        item_id: v.id("requisicion_items"),
        status_revision: v.string(), // "aprobado" | "rechazado"
        cantidad_aprobada: v.optional(v.number()),
        reviewer_id: v.id("users"),
        reviewer_name: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await getCurrentUserOrThrow(ctx);
        if (actor._id !== args.reviewer_id || !["admin", "finance"].includes(actor.role)) throw new Error("Sin permisos para revisar la requisición");
        const item = await ctx.db.get(args.item_id);
        if (!item) throw new Error("Item not found");
        const target = await ctx.db.get(item.requisicion_id);
        const project = target ? await ctx.db.get(target.proyecto) : null;
        if (!target || !project || !canUserAccessDesarrollo(actor, project)) throw new Error("Sin acceso al proyecto");
        
        // Update this item
        await ctx.db.patch(args.item_id, {
            status_revision: args.status_revision,
            cantidad_aprobada: args.status_revision === "aprobado"
                ? (args.cantidad_aprobada ?? item.cantidad)
                : undefined,
        });
        
        // Check if ALL items for this requisicion have been reviewed
        const allItems = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", item.requisicion_id))
            .collect();
        
        const allReviewed = allItems.every(i => {
            if (i._id === args.item_id) return true;
            return i.status_revision === "aprobado" || i.status_revision === "rechazado";
        });
        
        if (!allReviewed) return { allReviewed: false };
        
        // All items reviewed - compute overall status
        const approvedCount = allItems.filter(i =>
            i._id === args.item_id
                ? args.status_revision === "aprobado"
                : i.status_revision === "aprobado"
        ).length;
        const totalCount = allItems.length;
        
        const overallStatus = approvedCount === totalCount ? "Aprobada" : approvedCount === 0 ? "Rechazada" : "Parcialmente Aprobada";
        
        const requisicion = await ctx.db.get(item.requisicion_id);
        
        await ctx.db.patch(item.requisicion_id, {
            status_revision: overallStatus,
            revisado_por_id: args.reviewer_id,
            revisado_por_nombre: args.reviewer_name,
            revisado_at: Date.now(),
            updated_at: Date.now(),
        });
        
        // Build history
        if (requisicion) {
            const itemDetails = allItems.map(i => ({
                familia: i.familia,
                sub_partida: i.sub_partida,
                cantidad_solicitada: i.cantidad,
                cantidad_aprobada: i._id === args.item_id
                    ? (args.status_revision === "aprobado" ? (args.cantidad_aprobada ?? i.cantidad) : undefined)
                    : i.cantidad_aprobada,
                unidad: i.unidad,
                monto: i.monto,
                status_revision: i._id === args.item_id ? args.status_revision : i.status_revision,
            }));
            
            const historyId = await ctx.db.insert("requisicion_history", {
                proyecto: requisicion.proyecto,
                requisicion_id: item.requisicion_id,
                action: "reviewed",
                new_value: JSON.stringify({
                    status_revision: overallStatus,
                    solicitante: requisicion.solicitante_nombre,
                    tipo: requisicion.tipo,
                    items_approved: approvedCount,
                    items_rejected: totalCount - approvedCount,
                    items_total: totalCount,
                    items: itemDetails,
                }),
                old_value: JSON.stringify({
                    status_revision: requisicion.status_revision,
                }),
                changed_by_id: args.reviewer_id,
                changed_by_name: args.reviewer_name,
                created_at: Date.now(),
            });
            if (notificationForStatusTransition("review", requisicion.status_revision, overallStatus)) await recordAutomaticNotification(ctx, {
                requisicion, type: "reviewed", actor, historyId,
                message: `La requisición fue ${overallStatus.toLowerCase()}. Consulta el resultado de la revisión.`,
            });
        }
        
        return { allReviewed: true, status_revision: overallStatus };
    },
});

// Get budget remaining for a partida/familia/sub_partida selection
export const getBudgetRemaining = query({
    args: {
        proyecto: v.id("desarrollos"),
        partida_nombre: v.string(),
        familia: v.optional(v.string()),
        sub_partida: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Get partidas matching the selection
        let partidas;
        
        if (args.sub_partida) {
            // Get specific sub_partida (nivel 3)
            partidas = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .filter((q) => 
                    q.and(
                        q.eq(q.field("nivel"), 3),
                        q.eq(q.field("partida_nombre"), args.partida_nombre),
                        q.eq(q.field("familia"), args.familia),
                        q.eq(q.field("sub_partida"), args.sub_partida)
                    )
                )
                .collect();
        } else if (args.familia) {
            // Get familia level (nivel 2)
            partidas = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .filter((q) => 
                    q.and(
                        q.eq(q.field("nivel"), 2),
                        q.eq(q.field("partida_nombre"), args.partida_nombre),
                        q.eq(q.field("familia"), args.familia)
                    )
                )
                .collect();
        } else {
            // Get partida level (nivel 1)
            partidas = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .filter((q) => 
                    q.and(
                        q.eq(q.field("nivel"), 1),
                        q.eq(q.field("nombre"), args.partida_nombre)
                    )
                )
                .collect();
        }
        
        if (partidas.length === 0) {
            return { presupuesto_aprobado: 0, pagado: 0, por_gastar: 0 };
        }
        
        const partida = partidas[0];
        return {
            presupuesto_aprobado: partida.presupuesto_aprobado,
            pagado: partida.pagado,
            por_gastar: partida.por_gastar ?? (partida.presupuesto_aprobado - partida.pagado),
            unidad: partida.unidad,
        };
    },
});
