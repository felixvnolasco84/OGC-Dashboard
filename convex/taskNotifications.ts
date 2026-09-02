import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildTaskEmailMockData,
  getTaskEmailSubject,
  renderTaskEmail,
  TASK_EMAIL_NOTIFICATION_TYPES,
  type TaskEmailNotificationType,
  type TaskEmailTemplateData,
} from "./taskEmailTemplates";

// New internal functions are absent from generated types until `convex dev` runs once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convexInternal = internal as any;

const taskNotificationTypeValidator = v.union(
  ...TASK_EMAIL_NOTIFICATION_TYPES.map((type) => v.literal(type)),
);

const COMMENT_MOCK_USER_EMAILS = [
  "felixvnolasco@gmail.com",
  "felix@polygon.com",
] as const;

const dispatchArgs = {
  taskId: v.id("tareas"),
  type: taskNotificationTypeValidator,
  actorId: v.optional(v.id("users")),
  recipientIds: v.optional(v.array(v.id("users"))),
  detail: v.optional(v.string()),
  oldValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  occurredAt: v.number(),
  operationKey: v.string(),
};

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function dateInMexicoCity(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function dayDifference(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T12:00:00Z`);
  const to = Date.parse(`${toDate}T12:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function publicTaskUrl(appUrl: string, taskId: Id<"tareas">, projectId?: Id<"desarrollos">) {
  const base = appUrl.replace(/\/$/, "");
  return projectId
    ? `${base}/proyecto/${projectId}/tareas?tarea=${taskId}`
    : `${base}/tareas?tarea=${taskId}`;
}

export const prepareTaskEmail = internalQuery({
  args: dispatchArgs,
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const [project, actor] = await Promise.all([
      task.proyecto ? ctx.db.get(task.proyecto) : null,
      args.actorId ? ctx.db.get(args.actorId) : null,
    ]);
    const recipientIds = args.recipientIds ?? Array.from(new Set([
      ...task.asignados,
      ...(task.created_by_id ? [task.created_by_id] : []),
    ]));
    const recipients = (await Promise.all(recipientIds.map((id) => ctx.db.get(id))))
      .filter((user) => user !== null)
      .filter((user) => Boolean(user.email?.trim()))
      .filter((user) => user.invitation_status !== "pending")
      .filter((user) => !args.actorId || user._id !== args.actorId)
      .map((user) => ({
        id: user._id,
        name: user.name || user.email,
        email: normalizedEmail(user.email),
      }));

    const recipientsByEmail = new Map(recipients.map((recipient) => [recipient.email, recipient]));
    return {
      task: {
        id: task._id,
        projectId: task.proyecto,
        title: task.titulo,
        description: task.descripcion,
        status: task.status,
        priority: task.prioridad,
        dueDate: task.fecha_limite,
        category: task.categoria,
      },
      projectName: project?.nombre || "General",
      actorName: actor?.name || actor?.email || "OGC Dashboard",
      recipients: Array.from(recipientsByEmail.values()),
    };
  },
});

export const getCommentMockUsers = internalQuery({
  args: {
    emails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedEmails = Array.from(new Set(args.emails.map(normalizedEmail)));
    const indexedUsers = await Promise.all(normalizedEmails.map(async (email) => {
      return await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
    }));

    const indexedByEmail = new Map(
      indexedUsers
        .filter((user) => user !== null)
        .map((user) => [normalizedEmail(user.email), user]),
    );
    const missingEmails = normalizedEmails.filter((email) => !indexedByEmail.has(email));
    if (missingEmails.length > 0) {
      const missingSet = new Set(missingEmails);
      const caseInsensitiveMatches = (await ctx.db.query("users").collect())
        .filter((user) => missingSet.has(normalizedEmail(user.email)));
      for (const user of caseInsensitiveMatches) {
        indexedByEmail.set(normalizedEmail(user.email), user);
      }
    }

    return normalizedEmails
      .map((email) => indexedByEmail.get(email))
      .filter((user) => user !== undefined)
      .map((user) => ({
        id: user._id,
        name: user.name || user.email,
        email: normalizedEmail(user.email),
      }));
  },
});

export const claimTaskEmailDelivery = internalMutation({
  args: {
    taskId: v.id("tareas"),
    type: taskNotificationTypeValidator,
    recipientUserId: v.id("users"),
    recipientEmail: v.string(),
    subject: v.string(),
    dedupeKey: v.string(),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("task_email_deliveries")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupe_key", args.dedupeKey))
      .first();
    if (existing && (existing.status !== "failed" || existing.attempt_count >= 3)) {
      return null;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "sending",
        error: undefined,
        attempt_count: existing.attempt_count + 1,
        updated_at: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("task_email_deliveries", {
      tarea_id: args.taskId,
      type: args.type,
      recipient_user_id: args.recipientUserId,
      recipient_email: args.recipientEmail,
      actor_id: args.actorId,
      subject: args.subject,
      status: "sending",
      dedupe_key: args.dedupeKey,
      attempt_count: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const finishTaskEmailDelivery = internalMutation({
  args: {
    deliveryId: v.id("task_email_deliveries"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      provider_message_id: args.providerMessageId,
      error: args.error,
      sent_at: args.status === "sent" ? Date.now() : undefined,
      updated_at: Date.now(),
    });
  },
});

async function sendBatchWithResend(args: {
  apiKey: string;
  emails: Array<{
    from: string;
    to: string[];
    subject: string;
    html: string;
    tags?: Array<{ name: string; value: string }>;
  }>;
  idempotencyKey: string;
}) {
  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": args.idempotencyKey,
    },
    body: JSON.stringify(args.emails),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.message || `Resend batch HTTP ${response.status}`);
  }
  return (result?.data || []) as Array<{ id?: string }>;
}

function stableKeyHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const dispatchTaskEmail = internalAction({
  args: dispatchArgs,
  handler: async (ctx, args) => {
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;
    const appUrl = process.env.APP_URL || process.env.SITE_URL;
    if (!resendApiKey || !resendFromEmail || !appUrl) {
      throw new Error("Task email notifications require RESEND_API_KEY, RESEND_FROM_EMAIL and APP_URL");
    }

    const prepared = await ctx.runQuery(convexInternal.taskNotifications.prepareTaskEmail, args);
    if (!prepared || prepared.recipients.length === 0) {
      return { sent: 0, failed: 0, skipped: prepared ? 0 : 1 };
    }

    const claimed = (await Promise.all(prepared.recipients.map(async (recipient: {
      id: Id<"users">;
      name: string;
      email: string;
    }) => {
      const templateData: TaskEmailTemplateData = {
        type: args.type,
        recipientName: recipient.name,
        actorName: prepared.actorName,
        projectName: prepared.projectName,
        taskTitle: prepared.task.title,
        taskDescription: prepared.task.description,
        status: prepared.task.status,
        priority: prepared.task.priority,
        dueDate: prepared.task.dueDate,
        category: prepared.task.category,
        detail: args.detail,
        oldValue: args.oldValue,
        newValue: args.newValue,
        taskUrl: publicTaskUrl(appUrl, prepared.task.id, prepared.task.projectId),
        logoUrl: `${appUrl.replace(/\/$/, "")}/OGC-LOGO.svg`,
        occurredAt: args.occurredAt,
      };
      const subject = getTaskEmailSubject(templateData);
      const deliveryId: Id<"task_email_deliveries"> | null = await ctx.runMutation(
        convexInternal.taskNotifications.claimTaskEmailDelivery,
        {
          taskId: args.taskId,
          type: args.type,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          subject,
          dedupeKey: `${args.operationKey}:${recipient.id}`,
          actorId: args.actorId,
        },
      );
      if (!deliveryId) return null;
      return {
        deliveryId,
        recipientId: recipient.id,
        payload: {
          from: resendFromEmail,
          to: [recipient.email],
          subject,
          html: renderTaskEmail(templateData),
          tags: [
            { name: "module", value: "tasks" },
            { name: "template", value: args.type },
            { name: "kind", value: "transactional" },
          ],
        },
      };
    }))).filter((item) => item !== null);

    const skipped = prepared.recipients.length - claimed.length;
    if (claimed.length === 0) {
      return { sent: 0, failed: 0, skipped };
    }

    try {
      const responseItems = await sendBatchWithResend({
        apiKey: resendApiKey,
        emails: claimed.map((item) => item.payload),
        idempotencyKey: `task-${stableKeyHash(`${args.operationKey}:${claimed.map((item) => item.recipientId).join(",")}`)}`,
      });
      if (responseItems.length !== claimed.length) {
        throw new Error(`Resend returned ${responseItems.length} ids for ${claimed.length} task emails`);
      }
      await Promise.all(claimed.map(async (item, index) => {
        await ctx.runMutation(convexInternal.taskNotifications.finishTaskEmailDelivery, {
          deliveryId: item.deliveryId,
          status: "sent",
          providerMessageId: responseItems[index]?.id,
        });
      }));
      return { sent: claimed.length, failed: 0, skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown task email delivery error";
      await Promise.all(claimed.map(async (item) => {
        await ctx.runMutation(convexInternal.taskNotifications.finishTaskEmailDelivery, {
          deliveryId: item.deliveryId,
          status: "failed",
          error: message,
        });
      }));
      return { sent: 0, failed: claimed.length, skipped };
    }
  },
});

export const getDueTaskCandidates = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tareas").collect();
    return tasks.flatMap((task) => {
      if (!task.fecha_limite || task.asignados.length === 0 || ["Completada", "Cancelada"].includes(task.status)) {
        return [];
      }
      const days = dayDifference(args.today, task.fecha_limite);
      const type: TaskEmailNotificationType | null = days < 0
        ? "overdue"
        : days === 0
          ? "due_today"
          : days <= 3
            ? "due_soon"
            : null;
      return type ? [{
        taskId: task._id,
        type,
        recipientIds: task.asignados,
        dueDate: task.fecha_limite,
      }] : [];
    });
  },
});

export const scanDueTaskNotifications = internalAction({
  args: {},
  handler: async (ctx) => {
    const today = dateInMexicoCity();
    const candidates: Array<{
      taskId: Id<"tareas">;
      type: "due_soon" | "due_today" | "overdue";
      recipientIds: Id<"users">[];
      dueDate: string;
    }> = await ctx.runQuery(convexInternal.taskNotifications.getDueTaskCandidates, { today });
    const results = [];
    for (const candidate of candidates) {
      results.push(await ctx.runAction(convexInternal.taskNotifications.dispatchTaskEmail, {
        taskId: candidate.taskId,
        type: candidate.type,
        recipientIds: candidate.recipientIds,
        occurredAt: Date.now(),
        operationKey: `${candidate.type}:${candidate.taskId}:${candidate.dueDate}`,
      }));
    }
    return {
      date: today,
      candidates: candidates.length,
      sent: results.reduce((total, result) => total + result.sent, 0),
      failed: results.reduce((total, result) => total + result.failed, 0),
      skipped: results.reduce((total, result) => total + result.skipped, 0),
    };
  },
});

export const sendMockEmailSuite = action({
  args: {
    recipient: v.string(),
    mockKey: v.string(),
  },
  handler: async (_ctx, args) => {
    const configuredKey = process.env.TASK_EMAIL_MOCK_SECRET;
    const allowedRecipient = normalizedEmail(process.env.TASK_EMAIL_MOCK_RECIPIENT || "felixvnolasco@gmail.com");
    if (!configuredKey || args.mockKey !== configuredKey) {
      throw new Error("Invalid task email mock key");
    }
    if (normalizedEmail(args.recipient) !== allowedRecipient) {
      throw new Error("This mock endpoint may only send to the configured test recipient");
    }
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;
    const appUrl = (process.env.APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");
    if (!resendApiKey || !resendFromEmail || !appUrl) {
      throw new Error("Mock emails require RESEND_API_KEY, RESEND_FROM_EMAIL and APP_URL");
    }

    const mockEmails = TASK_EMAIL_NOTIFICATION_TYPES.map((type, index) => {
      const data = buildTaskEmailMockData(
        type,
        { current: index + 1, total: TASK_EMAIL_NOTIFICATION_TYPES.length },
        {
          recipientName: "Felix Nolasco",
          taskUrl: `${appUrl}/tareas?mock=${type}`,
          logoUrl: `${appUrl}/OGC-LOGO.svg`,
        },
      );
      return {
        type,
        payload: {
          from: resendFromEmail,
          to: [allowedRecipient],
          subject: getTaskEmailSubject(data),
          html: renderTaskEmail(data),
          tags: [
            { name: "module", value: "tasks" },
            { name: "template", value: type },
            { name: "kind", value: "mock" },
          ],
        },
      };
    });

    let results: Array<{
      type: TaskEmailNotificationType;
      status: "sent" | "failed";
      id?: string;
      error?: string;
    }>;
    try {
      const responseItems = await sendBatchWithResend({
        apiKey: resendApiKey,
        emails: mockEmails.map((item) => item.payload),
        idempotencyKey: `task-email-mocks-${Date.now()}`,
      });
      if (responseItems.length !== mockEmails.length) {
        throw new Error(`Resend returned ${responseItems.length} ids for ${mockEmails.length} mock emails`);
      }
      results = mockEmails.map((item, index) => ({
        type: item.type,
        status: "sent",
        id: responseItems[index]?.id,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown mock email batch error";
      results = mockEmails.map((item) => ({
        type: item.type,
        status: "failed",
        error: message,
      }));
    }
    return {
      recipient: allowedRecipient,
      total: results.length,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };
  },
});

export const sendCommentMockEmails = action({
  args: {
    recipient: v.string(),
    mockKey: v.string(),
  },
  handler: async (ctx, args) => {
    const configuredKey = process.env.TASK_EMAIL_MOCK_SECRET;
    const allowedRecipient = normalizedEmail(process.env.TASK_EMAIL_MOCK_RECIPIENT || COMMENT_MOCK_USER_EMAILS[0]);
    if (!configuredKey || args.mockKey !== configuredKey) {
      throw new Error("Invalid task email mock key");
    }
    if (normalizedEmail(args.recipient) !== allowedRecipient) {
      throw new Error("Comment mocks may only be sent to the configured test recipient");
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;
    const appUrl = (process.env.APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");
    if (!resendApiKey || !resendFromEmail || !appUrl) {
      throw new Error("Comment mock emails require RESEND_API_KEY, RESEND_FROM_EMAIL and APP_URL");
    }

    const users: Array<{ id: Id<"users">; name: string; email: string }> = await ctx.runQuery(
      convexInternal.taskNotifications.getCommentMockUsers,
      { emails: [...COMMENT_MOCK_USER_EMAILS] },
    );
    const usersByEmail = new Map(users.map((user) => [user.email, user]));
    type CommentMockUser = { name: string; email: string };
    const mockUser = (email: typeof COMMENT_MOCK_USER_EMAILS[number]): CommentMockUser => {
      return usersByEmail.get(email) || { name: email, email };
    };
    const gmailUser = mockUser(COMMENT_MOCK_USER_EMAILS[0]);
    const polygonUser = mockUser(COMMENT_MOCK_USER_EMAILS[1]);

    const scenarios: Array<{
      type: "comment_added" | "mentioned";
      actor: CommentMockUser;
      simulatedRecipient: CommentMockUser;
      detail: string;
    }> = [
      {
        type: "comment_added",
        actor: polygonUser,
        simulatedRecipient: gmailUser,
        detail: "Ya revisé la tarea. La propuesta está lista para validar y continuar con el siguiente paso.",
      },
      {
        type: "mentioned",
        actor: gmailUser,
        simulatedRecipient: polygonUser,
        detail: `@${polygonUser.name} ¿puedes revisar este comentario y confirmar si procedemos con la actualización?`,
      },
    ];

    const mockEmails = scenarios.map((scenario, index) => {
      const data = buildTaskEmailMockData(
        scenario.type,
        { current: index + 1, total: scenarios.length },
        {
          recipientName: scenario.simulatedRecipient.name,
          actorName: scenario.actor.name,
          detail: scenario.detail,
          taskUrl: `${appUrl}/tareas?mock=${scenario.type}`,
          logoUrl: `${appUrl}/OGC-LOGO.svg`,
        },
      );
      return {
        type: scenario.type,
        actorEmail: scenario.actor.email,
        simulatedRecipientEmail: scenario.simulatedRecipient.email,
        payload: {
          from: resendFromEmail,
          to: [allowedRecipient],
          subject: getTaskEmailSubject(data),
          html: renderTaskEmail(data),
          tags: [
            { name: "module", value: "tasks" },
            { name: "template", value: scenario.type },
            { name: "kind", value: "comment-mock" },
          ],
        },
      };
    });

    let results: Array<{
      type: "comment_added" | "mentioned";
      actorEmail: string;
      simulatedRecipientEmail: string;
      deliveryRecipient: string;
      status: "sent" | "failed";
      id?: string;
      error?: string;
    }>;
    try {
      const responseItems = await sendBatchWithResend({
        apiKey: resendApiKey,
        emails: mockEmails.map((item) => item.payload),
        idempotencyKey: `task-comment-mocks-${Date.now()}`,
      });
      if (responseItems.length !== mockEmails.length) {
        throw new Error(`Resend returned ${responseItems.length} ids for ${mockEmails.length} comment mock emails`);
      }
      results = mockEmails.map((item, index) => ({
        type: item.type,
        actorEmail: item.actorEmail,
        simulatedRecipientEmail: item.simulatedRecipientEmail,
        deliveryRecipient: allowedRecipient,
        status: "sent",
        id: responseItems[index]?.id,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown comment mock batch error";
      results = mockEmails.map((item) => ({
        type: item.type,
        actorEmail: item.actorEmail,
        simulatedRecipientEmail: item.simulatedRecipientEmail,
        deliveryRecipient: allowedRecipient,
        status: "failed",
        error: message,
      }));
    }

    return {
      recipient: allowedRecipient,
      total: results.length,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };
  },
});
