/* eslint-disable @typescript-eslint/no-explicit-any */
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { mutation } from "./functions";
import type { Id } from "./_generated/dataModel";
import {
  canUserAccessDesarrollo,
  canUserReceiveProjectReport,
  getCurrentUserOrThrow,
  withComputedPermissions,
} from "./permissions";
import {
  allowedSectionsForRole,
  profileForRole,
  type ReportFrequency,
  type ReportVisibilityProfile,
} from "./reportTypes";
import {
  canClaimReportSubscription,
  nextRunAt,
  parseProjectDate,
  previousPeriod,
  sanitizeSections,
  REPORT_SUBSCRIPTION_LEASE_MS,
  reportSubscriptionPeriodKey,
  validateTimezone,
} from "./reportingUtils";
import { buildReportSnapshot } from "./reportSnapshot";

const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
);

function ensurePeriod(start: string, end: string) {
  const normalizedStart = parseProjectDate(start);
  const normalizedEnd = parseProjectDate(end);
  if (!normalizedStart || !normalizedEnd || normalizedEnd < normalizedStart) {
    throw new Error("El periodo del reporte no es válido");
  }
  const days = Math.round(
    (Date.parse(`${normalizedEnd}T00:00:00Z`) -
      Date.parse(`${normalizedStart}T00:00:00Z`)) /
      86_400_000,
  );
  if (days > 730) throw new Error("El periodo máximo es de dos años");
  return { start: normalizedStart, end: normalizedEnd };
}

function intersectSections(requested: string[], role: string) {
  const roleSections = new Set<string>(allowedSectionsForRole(role));
  return sanitizeSections(requested).filter((section) => roleSections.has(section));
}

async function requireProject(ctx: any, proyecto: Id<"desarrollos">) {
  const currentUser = await getCurrentUserOrThrow(ctx);
  const project = await ctx.db.get(proyecto);
  if (!project || !canUserAccessDesarrollo(currentUser, project)) {
    throw new Error("Proyecto no encontrado o sin acceso");
  }
  return { project, currentUser };
}

function isEligibleRecipient(user: any, project: any) {
  return Boolean(user && canUserReceiveProjectReport(
    withComputedPermissions(user),
    project,
  ));
}

async function activeUsersForProject(ctx: any, project: any) {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((user: any) => isEligibleRecipient(user, project))
    .map((user: any) => withComputedPermissions(user));
}

export const getPreview = query({
  args: {
    proyecto: v.id("desarrollos"),
    period_start: v.string(),
    period_end: v.string(),
  },
  handler: async (ctx, args) => {
    const { currentUser } = await requireProject(ctx, args.proyecto);
    const period = ensurePeriod(args.period_start, args.period_end);
    const profile = profileForRole(currentUser.role);
    const snapshot = await buildReportSnapshot(ctx, {
      proyecto: args.proyecto,
      periodStart: period.start,
      periodEnd: period.end,
      periodKey: `preview:${period.start}:${period.end}`,
      profile,
    });
    return {
      financial: snapshot.financial,
      earned_value: snapshot.earned_value,
      program: snapshot.program,
      requisitions: snapshot.requisitions,
      data_quality: snapshot.data_quality,
      available_sections: allowedSectionsForRole(currentUser.role),
      profile,
    };
  },
});

export const listRecipients = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const { project, currentUser } = await requireProject(ctx, args.proyecto);
    const eligibleUsers = await activeUsersForProject(ctx, project);
    const visibleUsers = currentUser.role === "admin"
      ? eligibleUsers
      : eligibleUsers.filter((user: any) => user._id === currentUser._id);
    const recipients = visibleUsers.map((user: any) => ({
        user_id: user._id,
        name: user.name,
        email: user.email.trim().toLowerCase(),
        role: user.role,
        profile: profileForRole(user.role),
      }));
    return recipients.sort((a: any, b: any) => a.name.localeCompare(b.name, "es"));
  },
});

export const listSubscriptions = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const { currentUser } = await requireProject(ctx, args.proyecto);
    const rows = await ctx.db
      .query("report_subscriptions")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    const visible = currentUser.role === "admin"
      ? rows
      : rows.filter((row) => row.owner_user_id === currentUser._id);
    return Promise.all(visible.map(async (row) => {
      const recipients = await Promise.all(
        row.recipient_user_ids.map(async (userId) => {
          const user = await ctx.db.get(userId);
          return user ? { user_id: user._id, name: user.name, email: user.email } : null;
        }),
      );
      return {
        ...row,
        recipients: recipients.filter(Boolean),
      };
    }));
  },
});

export const listRuns = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const { currentUser } = await requireProject(ctx, args.proyecto);
    const runs = await ctx.db
      .query("report_runs")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .collect();
    const profile = profileForRole(currentUser.role);
    const result = [];
    for (const run of runs.sort((a, b) => b.created_at - a.created_at).slice(0, 100)) {
      const artifacts = await ctx.db
        .query("report_artifacts")
        .withIndex("by_run", (q) => q.eq("run_id", run._id))
        .collect();
      const artifact = artifacts.find((row) => row.visibility_profile === profile) ||
        (currentUser.role === "admin" ? artifacts[0] : undefined);
      const deliveries = await ctx.db
        .query("report_deliveries")
        .withIndex("by_run", (q) => q.eq("run_id", run._id))
        .collect();
      const downloadUrl = artifact?.storage_id
        ? await ctx.storage.getUrl(artifact.storage_id)
        : null;
      result.push({
        ...run,
        artifact: artifact
          ? {
            _id: artifact._id,
            file_name: artifact.file_name,
            size: artifact.size,
            status: artifact.status,
            visibility_profile: artifact.visibility_profile,
            download_url: downloadUrl,
          }
          : null,
        delivery_summary: {
          sent: deliveries.filter((row) => row.status === "sent").length,
          failed: deliveries.filter((row) => row.status === "failed").length,
          pending: deliveries.filter((row) => row.status === "pending").length,
          revoked: deliveries.filter((row) => row.status === "revoked").length,
        },
      });
    }
    return result;
  },
});

export const saveSubscription = mutation({
  args: {
    subscription_id: v.optional(v.id("report_subscriptions")),
    proyecto: v.id("desarrollos"),
    frequency: frequencyValidator,
    timezone: v.string(),
    local_hour: v.number(),
    local_minute: v.number(),
    day_of_week: v.optional(v.number()),
    day_of_month: v.optional(v.number()),
    sections: v.array(v.string()),
    recipient_user_ids: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { project, currentUser } = await requireProject(ctx, args.proyecto);
    if (!validateTimezone(args.timezone)) throw new Error("Zona horaria IANA inválida");
    if (!Number.isInteger(args.local_hour) || args.local_hour < 0 || args.local_hour > 23) {
      throw new Error("Hora inválida");
    }
    if (!Number.isInteger(args.local_minute) || args.local_minute < 0 || args.local_minute > 59) {
      throw new Error("Minuto inválido");
    }
    if (
      args.frequency === "weekly" &&
      (!Number.isInteger(args.day_of_week) || (args.day_of_week || 0) < 1 || (args.day_of_week || 0) > 7)
    ) {
      throw new Error("Día semanal inválido");
    }
    if (
      args.frequency === "monthly" &&
      (!Number.isInteger(args.day_of_month) || (args.day_of_month || 0) < 1 || (args.day_of_month || 0) > 28)
    ) {
      throw new Error("Día mensual inválido");
    }
    const sections = intersectSections(args.sections, currentUser.role);
    if (!sections.length) throw new Error("Selecciona al menos una sección disponible");

    const requestedRecipientIds = [...new Set(
      (args.recipient_user_ids.length ? args.recipient_user_ids : [currentUser._id])
        .map(String),
    )].map((value) => value as Id<"users">);
    if (
      currentUser.role !== "admin" &&
      (requestedRecipientIds.length !== 1 || requestedRecipientIds[0] !== currentUser._id)
    ) {
      throw new Error("Sólo un administrador puede agregar otros destinatarios");
    }

    for (const recipientId of requestedRecipientIds) {
      const user = await ctx.db.get(recipientId);
      if (!isEligibleRecipient(user, project)) {
        throw new Error("Todos los destinatarios deben tener acceso activo al proyecto");
      }
    }

    const schedule = {
      frequency: args.frequency as ReportFrequency,
      timezone: args.timezone,
      local_hour: args.local_hour,
      local_minute: args.local_minute,
      day_of_week: args.day_of_week,
      day_of_month: args.day_of_month,
    };
    const now = Date.now();
    const values = {
      proyecto: args.proyecto,
      owner_user_id: currentUser._id,
      frequency: args.frequency,
      timezone: args.timezone,
      local_hour: args.local_hour,
      local_minute: args.local_minute,
      day_of_week: args.day_of_week,
      day_of_month: args.day_of_month,
      sections,
      recipient_user_ids: requestedRecipientIds,
      active: true,
      next_run_at: nextRunAt(schedule, now),
      updated_at: now,
    };

    if (args.subscription_id) {
      const existing = await ctx.db.get(args.subscription_id);
      if (!existing || existing.proyecto !== args.proyecto) throw new Error("Programación no encontrada");
      if (
        currentUser.role !== "admin" &&
        existing.owner_user_id !== currentUser._id
      ) {
        throw new Error("No puedes editar esta programación");
      }
      await ctx.db.patch(existing._id, {
        ...values,
        owner_user_id: existing.owner_user_id,
      });
      return existing._id;
    }
    return await ctx.db.insert("report_subscriptions", {
      ...values,
      created_at: now,
    });
  },
});

export const setSubscriptionActive = mutation({
  args: {
    subscription_id: v.id("report_subscriptions"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscription_id);
    if (!subscription) throw new Error("Programación no encontrada");
    const { currentUser } = await requireProject(ctx, subscription.proyecto);
    if (
      currentUser.role !== "admin" &&
      subscription.owner_user_id !== currentUser._id
    ) {
      throw new Error("No puedes modificar esta programación");
    }
    await ctx.db.patch(subscription._id, {
      active: args.active,
      next_run_at: args.active
        ? nextRunAt({
          frequency: subscription.frequency as ReportFrequency,
          timezone: subscription.timezone,
          local_hour: subscription.local_hour,
          local_minute: subscription.local_minute,
          day_of_week: subscription.day_of_week,
          day_of_month: subscription.day_of_month,
        }, Date.now())
        : subscription.next_run_at,
      lease_until: undefined,
      updated_at: Date.now(),
    });
  },
});

export const deleteSubscription = mutation({
  args: { subscription_id: v.id("report_subscriptions") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscription_id);
    if (!subscription) return;
    const { currentUser } = await requireProject(ctx, subscription.proyecto);
    if (
      currentUser.role !== "admin" &&
      subscription.owner_user_id !== currentUser._id
    ) {
      throw new Error("No puedes eliminar esta programación");
    }
    await ctx.db.delete(subscription._id);
  },
});

export const requestManualRun = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    period_start: v.string(),
    period_end: v.string(),
    sections: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { currentUser } = await requireProject(ctx, args.proyecto);
    const period = ensurePeriod(args.period_start, args.period_end);
    const sections = intersectSections(args.sections, currentUser.role);
    if (!sections.length) throw new Error("Selecciona al menos una sección");
    const now = Date.now();
    const runId = await ctx.db.insert("report_runs", {
      proyecto: args.proyecto,
      requested_by_user_id: currentUser._id,
      source: "manual",
      period_start: period.start,
      period_end: period.end,
      period_key: `manual:${period.start}:${period.end}:${now}`,
      sections,
      status: "queued",
      created_at: now,
      updated_at: now,
    });
    await ctx.scheduler.runAfter(0, internal.reportGeneration.generateRun, {
      run_id: runId,
    });
    return runId;
  },
});

export const retryRun = mutation({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Reporte no encontrado");
    const { currentUser } = await requireProject(ctx, run.proyecto);
    if (
      currentUser.role !== "admin" &&
      run.requested_by_user_id !== currentUser._id
    ) {
      throw new Error("No puedes reintentar este reporte");
    }
    await ctx.db.patch(run._id, {
      status: "queued",
      error: undefined,
      warning: undefined,
      completed_at: undefined,
      updated_at: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.reportGeneration.generateRun, {
      run_id: run._id,
    });
  },
});

export const retryInsights = mutation({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Reporte no encontrado");
    const { currentUser } = await requireProject(ctx, run.proyecto);
    if (
      currentUser.role !== "admin" &&
      run.requested_by_user_id !== currentUser._id
    ) {
      throw new Error("No puedes reintentar los insights de este reporte");
    }
    const artifact = await ctx.db
      .query("report_artifacts")
      .withIndex("by_run", (q) => q.eq("run_id", run._id))
      .first();
    if (!artifact) throw new Error("El reporte no tiene un snapshot para reintentar");
    await ctx.scheduler.runAfter(0, internal.reportGeneration.retryInsightsForRun, {
      run_id: run._id,
    });
  },
});

export const scanDueSubscriptions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("report_subscriptions")
      .withIndex("by_active_next_run", (q) =>
        q.eq("active", true).lte("next_run_at", now))
      .take(50);
    let created = 0;
    for (const subscription of due) {
      if (!canClaimReportSubscription(subscription.lease_until, now)) continue;
      const dueAt = subscription.next_run_at;
      await ctx.db.patch(subscription._id, {
        lease_until: now + REPORT_SUBSCRIPTION_LEASE_MS,
      });
      const period = previousPeriod(
        subscription.frequency as ReportFrequency,
        dueAt,
        subscription.timezone,
      );
      const idempotencyKey = reportSubscriptionPeriodKey(
        String(subscription._id),
        period.key,
      );
      const existing = await ctx.db
        .query("report_runs")
        .withIndex("by_subscription_period", (q) =>
          q.eq("subscription_period_key", idempotencyKey))
        .first();
      const next = nextRunAt({
        frequency: subscription.frequency as ReportFrequency,
        timezone: subscription.timezone,
        local_hour: subscription.local_hour,
        local_minute: subscription.local_minute,
        day_of_week: subscription.day_of_week,
        day_of_month: subscription.day_of_month,
      }, now);
      if (!existing) {
        const runId = await ctx.db.insert("report_runs", {
          proyecto: subscription.proyecto,
          subscription_id: subscription._id,
          requested_by_user_id: subscription.owner_user_id,
          source: "scheduled",
          period_start: period.start,
          period_end: period.end,
          period_key: period.key,
          subscription_period_key: idempotencyKey,
          sections: subscription.sections,
          status: "queued",
          created_at: now,
          updated_at: now,
        });
        await ctx.scheduler.runAfter(0, internal.reportGeneration.generateRun, {
          run_id: runId,
        });
        created += 1;
      }
      await ctx.db.patch(subscription._id, {
        next_run_at: next,
        last_run_at: now,
        lease_until: undefined,
        updated_at: now,
      });
    }
    return { scanned: due.length, created };
  },
});

export const claimRun = internalMutation({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status !== "queued") return null;
    await ctx.db.patch(run._id, {
      status: "generating",
      error: undefined,
      started_at: Date.now(),
      updated_at: Date.now(),
    });
    return run;
  },
});

export const claimInsightsRetry = internalMutation({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run || run.status === "generating" || run.status === "queued") return null;
    const artifact = await ctx.db
      .query("report_artifacts")
      .withIndex("by_run", (q) => q.eq("run_id", run._id))
      .first();
    if (!artifact) return null;
    await ctx.db.patch(run._id, {
      status: "generating",
      warning: undefined,
      updated_at: Date.now(),
    });
    return run;
  },
});

export const getRunContext = internalQuery({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Report run not found");
    const project = await ctx.db.get(run.proyecto);
    if (!project) throw new Error("Project not found");
    const subscription = run.subscription_id
      ? await ctx.db.get(run.subscription_id)
      : null;
    const recipientIds = subscription?.recipient_user_ids?.length
      ? subscription.recipient_user_ids
      : [run.requested_by_user_id];
    const recipients = [];
    for (const userId of recipientIds) {
      const user = await ctx.db.get(userId);
      const resolvedUser = user ? withComputedPermissions(user) : null;
      if (!resolvedUser || !isEligibleRecipient(resolvedUser, project)) {
        recipients.push({
          user_id: userId,
          email: user?.email || "",
          name: user?.name || "",
          role: resolvedUser?.role || "viewer",
          profile: profileForRole(resolvedUser?.role || "viewer"),
          active: false,
        });
        continue;
      }
      recipients.push({
        user_id: resolvedUser._id,
        email: resolvedUser.email.trim().toLowerCase(),
        name: resolvedUser.name,
        role: resolvedUser.role,
        profile: profileForRole(resolvedUser.role),
        active: true,
      });
    }
    return { run, project, recipients };
  },
});

// The action calls this immediately before each external send. This prevents a
// role, access, invitation or email change during PDF generation from leaking a
// report produced for the recipient's previous profile.
export const getRecipientForDelivery = internalQuery({
  args: {
    run_id: v.id("report_runs"),
    recipient_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Report run not found");
    const project = await ctx.db.get(run.proyecto);
    if (!project) throw new Error("Project not found");
    const user = await ctx.db.get(args.recipient_user_id);
    const resolvedUser = user ? withComputedPermissions(user) : null;
    if (!resolvedUser || !isEligibleRecipient(resolvedUser, project)) {
      return {
        user_id: args.recipient_user_id,
        email: user?.email || "",
        name: user?.name || "",
        role: resolvedUser?.role || "viewer",
        profile: profileForRole(resolvedUser?.role || "viewer"),
        active: false,
      };
    }
    return {
      user_id: resolvedUser._id,
      email: resolvedUser.email.trim().toLowerCase(),
      name: resolvedUser.name,
      role: resolvedUser.role,
      profile: profileForRole(resolvedUser.role),
      active: true,
    };
  },
});

export const getSnapshotForRun = internalQuery({
  args: {
    run_id: v.id("report_runs"),
    profile: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Report run not found");
    return await buildReportSnapshot(ctx, {
      proyecto: run.proyecto,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      periodKey: run.period_key,
      profile: args.profile as ReportVisibilityProfile,
    });
  },
});

export const getArtifactsForRun = internalQuery({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Report run not found");
    return await ctx.db
      .query("report_artifacts")
      .withIndex("by_run", (q) => q.eq("run_id", run._id))
      .collect();
  },
});

export const upsertArtifact = internalMutation({
  args: {
    run_id: v.id("report_runs"),
    profile: v.string(),
    storage_id: v.id("_storage"),
    snapshot_storage_id: v.id("_storage"),
    file_name: v.string(),
    size: v.number(),
    snapshot_json: v.string(),
    snapshot_hash: v.string(),
    insights_json: v.string(),
    ai_provider: v.optional(v.string()),
    ai_model: v.optional(v.string()),
    ai_response_id: v.optional(v.string()),
    input_tokens: v.optional(v.number()),
    output_tokens: v.optional(v.number()),
    status: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Report run not found");
    const existing = await ctx.db
      .query("report_artifacts")
      .withIndex("by_run_profile", (q) =>
        q.eq("run_id", run._id).eq("visibility_profile", args.profile))
      .first();
    const values = {
      proyecto: run.proyecto,
      run_id: run._id,
      visibility_profile: args.profile,
      storage_id: args.storage_id,
      snapshot_storage_id: args.snapshot_storage_id,
      file_name: args.file_name,
      size: args.size,
      snapshot_json: args.snapshot_json,
      snapshot_hash: args.snapshot_hash,
      insights_json: args.insights_json,
      ai_provider: args.ai_provider,
      ai_model: args.ai_model,
      ai_response_id: args.ai_response_id,
      input_tokens: args.input_tokens,
      output_tokens: args.output_tokens,
      status: args.status,
      error: args.error,
      created_at: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      const replacedStorageIds = [existing.storage_id, existing.snapshot_storage_id]
        .filter((storageId) =>
          storageId &&
          storageId !== args.storage_id &&
          storageId !== args.snapshot_storage_id,
        );
      for (const storageId of replacedStorageIds) {
        await ctx.storage.delete(storageId!);
      }
      return existing._id;
    }
    return await ctx.db.insert("report_artifacts", values);
  },
});

export const upsertDelivery = internalMutation({
  args: {
    run_id: v.id("report_runs"),
    artifact_id: v.optional(v.id("report_artifacts")),
    recipient_user_id: v.id("users"),
    recipient_email: v.string(),
    profile: v.string(),
    status: v.string(),
    attempts: v.number(),
    idempotency_key: v.string(),
    provider_message_id: v.optional(v.string()),
    error: v.optional(v.string()),
    sent_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Report run not found");
    const existing = await ctx.db
      .query("report_deliveries")
      .withIndex("by_run_recipient", (q) =>
        q.eq("run_id", run._id).eq("recipient_user_id", args.recipient_user_id))
      .first();
    const values = {
      artifact_id: args.artifact_id,
      recipient_email: args.recipient_email,
      visibility_profile: args.profile,
      status: args.status,
      attempts: args.attempts,
      idempotency_key: args.idempotency_key,
      provider_message_id: args.provider_message_id,
      error: args.error,
      sent_at: args.sent_at,
      updated_at: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return await ctx.db.insert("report_deliveries", {
      proyecto: run.proyecto,
      run_id: run._id,
      recipient_user_id: args.recipient_user_id,
      ...values,
      created_at: Date.now(),
    });
  },
});

export const finishRun = internalMutation({
  args: {
    run_id: v.id("report_runs"),
    generation_warning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) return;
    const [artifacts, deliveries] = await Promise.all([
      ctx.db.query("report_artifacts").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect(),
      ctx.db.query("report_deliveries").withIndex("by_run", (q) => q.eq("run_id", run._id)).collect(),
    ]);
    const sent = deliveries.filter((row) => row.status === "sent").length;
    const failed = deliveries.filter((row) => row.status === "failed").length;
    const revoked = deliveries.filter((row) => row.status === "revoked").length;
    let status = "completed";
    if (!artifacts.length) status = "failed";
    else if (sent > 0 && failed + revoked > 0) status = "partial";
    else if (failed > 0 && sent === 0) status = "warning";
    else if (args.generation_warning || artifacts.some((row) => row.status === "warning")) {
      status = "warning";
    }
    await ctx.db.patch(run._id, {
      status,
      warning: args.generation_warning,
      completed_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const failRun = internalMutation({
  args: {
    run_id: v.id("report_runs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) return;
    await ctx.db.patch(run._id, {
      status: "failed",
      error: args.error.slice(0, 1000),
      completed_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});
