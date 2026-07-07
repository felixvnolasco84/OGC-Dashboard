import { action, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const OGC_LOGO_URL = "https://www.ogc.mx/_next/static/media/Logo.a1dfe6e3.svg";
// Convex self-references in actions can create circular inference without this narrowed escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convexApi = api as any;

const REQUISICION_NOTIFICATION_MATRIX = [
    {
        type: "created",
        actionLabel: "creo una requisicion",
        subject: "Nueva requisicion",
        defaultMessage: "Hay una nueva requisicion pendiente de revision en el proyecto.",
        audience: ["project_admins", "finance_team"],
        requiresRequisition: true,
    },
    {
        type: "updated",
        actionLabel: "actualizo una requisicion",
        subject: "Requisicion actualizada",
        defaultMessage: "Hay una actualizacion en una requisicion del proyecto.",
        audience: ["project_admins", "finance_team", "requester"],
        requiresRequisition: true,
    },
    {
        type: "reviewed",
        actionLabel: "reviso una requisicion",
        subject: "Requisicion revisada",
        defaultMessage: "La requisicion fue revisada. Consulta el resultado y los comentarios.",
        audience: ["requester", "project_admins", "finance_team"],
        requiresRequisition: true,
    },
    {
        type: "assigned",
        actionLabel: "asigno proveedor",
        subject: "Proveedor asignado",
        defaultMessage: "Se asigno un proveedor a la requisicion.",
        audience: ["requester", "project_admins", "finance_team"],
        requiresRequisition: true,
    },
    {
        type: "payment",
        actionLabel: "actualizo pago",
        subject: "Pago actualizado",
        defaultMessage: "El estado de pago de la requisicion fue actualizado.",
        audience: ["requester", "project_admins", "finance_team"],
        requiresRequisition: true,
    },
    {
        type: "delivery",
        actionLabel: "actualizo entrega",
        subject: "Entrega actualizada",
        defaultMessage: "El estado de entrega de la requisicion fue actualizado.",
        audience: ["requester", "project_admins", "finance_team"],
        requiresRequisition: true,
    },
] as const;

type RequisicionNotificationAudience = typeof REQUISICION_NOTIFICATION_MATRIX[number]["audience"][number];
type RequisicionEmailUser = {
    _id: Id<"users">;
    name: string;
    email: string;
    role: string;
    allowed_desarrollos: Id<"desarrollos">[];
    invitation_status?: string;
};
type RequisicionNotificationContext = {
    proyecto: Id<"desarrollos">;
    requisicion?: {
        solicitante_id: Id<"users">;
    } | null;
};
type RequisicionEmailRecipient = {
    _id: Id<"users">;
    name: string;
    email: string;
    role: string;
};

function getRequisicionNotificationConfig(type: string) {
    const config = REQUISICION_NOTIFICATION_MATRIX.find((item) => item.type === type);
    if (!config) {
        throw new Error("Tipo de notificacion no soportado");
    }
    return config;
}

function canReceiveProjectNotification(user: RequisicionEmailUser, proyecto: Id<"desarrollos">) {
    if (!user.email?.trim()) return false;
    if (user.invitation_status === "pending") return false;
    return user.allowed_desarrollos.includes(proyecto) || user.role === "admin" || user.role === "finance";
}

function matchesNotificationAudience(
    audience: readonly RequisicionNotificationAudience[],
    user: RequisicionEmailUser,
    context: RequisicionNotificationContext
) {
    return audience.some((audienceKey) => {
        if (audienceKey === "project_admins") return user.role === "admin";
        if (audienceKey === "finance_team") return user.role === "finance";
        if (audienceKey === "requester") return context.requisicion?.solicitante_id === user._id;
        return false;
    });
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
        uploaded_by_id: Id<"users">;
        uploaded_by_name: string;
    }
) {
    const documentoIds: Id<"requisicion_documentos">[] = [];

    for (const documento of args.documentos ?? []) {
        const documentoId = await ctx.db.insert("requisicion_documentos", {
            requisicion_id: args.requisicion_id,
            proyecto: args.proyecto,
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

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderRequisicionEmail(args: {
    actorName: string;
    actionLabel: string;
    projectName: string;
    requisicionTitle: string;
    statusLabel: string;
    message: string;
    ctaUrl: string;
}) {
    const actorName = escapeHtml(args.actorName);
    const actionLabel = escapeHtml(args.actionLabel);
    const projectName = escapeHtml(args.projectName);
    const requisicionTitle = escapeHtml(args.requisicionTitle);
    const statusLabel = escapeHtml(args.statusLabel);
    const message = escapeHtml(args.message);
    const ctaUrl = escapeHtml(args.ctaUrl);
    const initials = actorName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "OG";

    return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#202124;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:672px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td align="center" style="padding:34px 32px 28px;">
                <img src="${OGC_LOGO_URL}" alt="OGC" style="display:block;height:54px;max-width:190px;width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="height:4px;background:#20243d;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:72px 56px 52px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="top" width="58">
                      <div style="width:48px;height:48px;border-radius:8px;background:#eef3f1;color:#20243d;font-size:16px;font-weight:700;line-height:48px;text-align:center;">${initials}</div>
                    </td>
                    <td style="padding-left:18px;">
                      <div style="font-size:28px;line-height:1.45;color:#292b33;font-weight:400;">
                        <strong style="font-weight:400;">${actorName}</strong>
                        <span style="color:#0073ea;"> ${actionLabel}</span>
                        <span> en </span>
                        <strong style="font-weight:700;color:#202124;">${requisicionTitle}</strong>
                      </div>
                      <div style="padding-top:12px;font-size:18px;line-height:1.4;color:#5b6170;">
                        <span style="color:#50AC66;">●</span>
                        <span> ${projectName}</span>
                        <span style="padding:0 8px;color:#8b9099;">›</span>
                        <span>${statusLabel}</span>
                      </div>
                      <div style="padding-top:34px;font-size:16px;line-height:1.5;color:#5b6170;">
                        ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                      <p style="margin:24px 0 42px;font-size:20px;line-height:1.55;color:#202124;">${message}</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
                        <tr>
                          <td bgcolor="#0073ea" style="border-radius:5px;">
                            <a href="${ctaUrl}" style="display:inline-block;padding:15px 32px;color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;">Ver requisiciones</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

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

        const canAccessProject =
            currentUser.allowed_desarrollos.includes(args.proyecto) ||
            currentUser.role === "admin" ||
            currentUser.role === "finance";

        if (!canAccessProject) {
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
            .filter((user) => canReceiveProjectNotification(user, args.proyecto))
            .filter((user) =>
                config
                    ? matchesNotificationAudience(config.audience as readonly RequisicionNotificationAudience[], user, {
                        proyecto: args.proyecto,
                        requisicion,
                    })
                    : true
            );

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

export const createNotificationEvent = mutation({
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

export const finalizeNotificationEvent = mutation({
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
        const config = getRequisicionNotificationConfig(args.notification_type);

        const currentUser = await ctx.runQuery(convexApi.users.getCurrentUser);
        if (!currentUser) {
            throw new Error("Not authenticated");
        }

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
        } = await ctx.runMutation(convexApi.requisiciones.createNotificationEvent, {
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
            await ctx.runMutation(convexApi.requisiciones.finalizeNotificationEvent, {
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
            await ctx.runMutation(convexApi.requisiciones.finalizeNotificationEvent, {
                event_id: notificationEvent.eventId,
                deliveries: notificationEvent.deliveries.map((delivery) => ({
                    delivery_id: delivery.delivery_id,
                    status: "failed",
                    error: configurationError,
                })),
            });
            throw new Error(configurationError);
        }

        const ctaUrl = `${appUrl}/proyecto/${args.proyecto}/requisiciones`;
        const html = renderRequisicionEmail({
            actorName: currentUser.name || currentUser.email,
            actionLabel: config.actionLabel,
            projectName: proyecto.nombre,
            requisicionTitle,
            statusLabel,
            message,
            ctaUrl,
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

        await ctx.runMutation(convexApi.requisiciones.finalizeNotificationEvent, {
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
    return await ctx.storage.generateUploadUrl();
});

// Get document URL by storage ID
export const getDocumentUrl = query({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storageId);
    },
});

// Delete a requisicion document
export const deleteDocument = mutation({
    args: { id: v.id("requisicion_documentos") },
    handler: async (ctx, args) => {
        const doc = await ctx.db.get(args.id);
        if (doc) {
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
        const requisiciones = await ctx.db
            .query("requisiciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
            .collect();
        
        // Enrich with items, proveedor, and documents data
        const enriched = await Promise.all(
            requisiciones.map(async (req) => {
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
        const requisiciones = await ctx.db
            .query("requisiciones")
            .withIndex("by_proyecto_status", (q) => 
                q.eq("proyecto", args.proyecto).eq("status", args.status)
            )
            .collect();
        
        const enriched = await Promise.all(
            requisiciones.map(async (req) => {
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
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) return null;
        
        const items = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        const documentos = await ctx.db
            .query("requisicion_documentos")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        // Enrich documents with URLs
        const enrichedDocuments = await Promise.all(
            documentos.map(async (doc) => {
                const url = await ctx.storage.getUrl(doc.storage_id);
                return { ...doc, url };
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
        await ctx.db.insert("requisicion_history", {
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
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        const oldStatus = requisicion.status;
        const now = Date.now();
        
        await ctx.db.patch(args.id, {
            status: args.status,
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
        await ctx.db.insert("requisicion_history", {
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
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
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
            uploaded_by_id: args.changed_by_id,
            uploaded_by_name: args.changed_by_name,
        });
        
        // Log history with requisicion context
        await ctx.db.insert("requisicion_history", {
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
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        const oldStatus = requisicion.status;
        
        await ctx.db.patch(args.id, {
            status: "Cancelado",
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
        
        const requisicion = await ctx.db.get(id);
        if (!requisicion) throw new Error("Requisicion not found");
        
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
                await ctx.db.insert("requisicion_history", {
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
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");

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
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
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
        
        await ctx.db.insert("requisicion_history", {
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
        const item = await ctx.db.get(args.item_id);
        if (!item) throw new Error("Item not found");
        
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
        
        // If at least one item approved → "Aprobada", all rejected → "Rechazada"
        const overallStatus = approvedCount > 0 ? "Aprobada" : "Rechazada";
        
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
            
            await ctx.db.insert("requisicion_history", {
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
