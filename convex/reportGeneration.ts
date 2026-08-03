"use node";

import { createHash } from "node:crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  allowedSectionsForRole,
  type ReportSection,
  type ReportSnapshotV1,
  type ReportVisibilityProfile,
} from "./reportTypes";
import { generateReportInsights } from "./reportInsights";
import { renderReportPdf } from "./reportPdf";
import { shouldAttachReportPdf } from "./reportingUtils";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderReportEmail(args: {
  recipientName: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  reportUrl: string;
  attached: boolean;
  warning?: string;
}) {
  return `
    <div style="background:#f5f6f3;padding:28px;font-family:Arial,sans-serif;color:#222">
      <div style="max-width:620px;margin:auto;background:white;border:1px solid #e2e6df;padding:28px">
        <div style="color:#1d4e2a;font-size:12px;font-weight:700;letter-spacing:.08em">OGC · CONTROL DE OBRA</div>
        <h1 style="font-size:24px;margin:16px 0 8px">Reporte financiero disponible</h1>
        <p>Hola ${escapeHtml(args.recipientName || "equipo")},</p>
        <p>El reporte de <strong>${escapeHtml(args.projectName)}</strong> para el periodo
          <strong>${escapeHtml(args.periodStart)} a ${escapeHtml(args.periodEnd)}</strong> ya está listo.</p>
        ${args.warning ? `<p style="background:#fff7e0;padding:12px;color:#795000">${escapeHtml(args.warning)}</p>` : ""}
        <p>${args.attached
          ? "El PDF se adjunta a este mensaje y también permanecerá disponible en el historial."
          : "El archivo supera el límite de adjuntos; descárgalo desde el historial."}</p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(args.reportUrl)}" style="background:#1d4e2a;color:white;padding:12px 18px;text-decoration:none">
            Abrir historial de reportes
          </a>
        </p>
        <p style="font-size:12px;color:#6b716b">Las cifras son deterministas. Los insights de IA se validan contra métricas del snapshot.</p>
      </div>
    </div>`;
}

type SendResult = {
  status: "sent" | "failed";
  attempts: number;
  providerMessageId?: string;
  error?: string;
};

async function sendReportEmail(args: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  pdf: Uint8Array;
  fileName: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      status: "failed",
      attempts: 0,
      error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL",
    };
  }

  const attach = shouldAttachReportPdf(args.pdf.byteLength);
  let lastError = "Unknown Resend error";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": args.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [args.to],
          subject: args.subject,
          html: args.html,
          attachments: attach
            ? [{
              filename: args.fileName,
              content: Buffer.from(args.pdf).toString("base64"),
            }]
            : undefined,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json().catch(() => null) as
        | { id?: string; message?: string; error?: { message?: string } }
        | null;
      if (response.ok) {
        return {
          status: "sent",
          attempts: attempt,
          providerMessageId: payload?.id,
        };
      }
      lastError = payload?.message || payload?.error?.message || `Resend HTTP ${response.status}`;
      if (![408, 429].includes(response.status) && response.status < 500) {
        return { status: "failed", attempts: attempt, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Resend request failed";
    }
  }
  return { status: "failed", attempts: 3, error: lastError };
}

export const generateRun = internalAction({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.reportes.claimRun, {
      run_id: args.run_id,
    });
    if (!claimed) return;

    try {
      const context = await ctx.runQuery(internal.reportes.getRunContext, {
        run_id: args.run_id,
      });
      const profileGroups = new Map<
        ReportVisibilityProfile,
        typeof context.recipients
      >();
      for (const recipient of context.recipients) {
        const profile = recipient.profile as ReportVisibilityProfile;
        const group = profileGroups.get(profile) || [];
        group.push(recipient);
        profileGroups.set(profile, group);
      }

      if (!profileGroups.size) {
        profileGroups.set("viewer", []);
      }

      const warnings: string[] = [];
      for (const [profile, recipients] of profileGroups) {
        const snapshot = await ctx.runQuery(internal.reportes.getSnapshotForRun, {
          run_id: args.run_id,
          profile,
        });
        const role = profile === "full"
          ? "user"
          : profile === "contractor"
            ? "contratista"
            : profile;
        const allowed = new Set<string>(allowedSectionsForRole(role));
        const sections = claimed.sections
          .filter((section) => allowed.has(section)) as ReportSection[];
        const insightResult = await generateReportInsights(snapshot);
        if (insightResult.insights.warning) {
          warnings.push(insightResult.insights.warning);
        }
        const pdf = renderReportPdf(snapshot, insightResult.insights, sections);
        const safeProject = context.project.nombre
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "proyecto";
        const fileName = `reporte-${safeProject}-${claimed.period_start}-${claimed.period_end}-${profile}.pdf`;
        const storageId = await ctx.storage.store(
          new Blob([pdf], { type: "application/pdf" }),
        );
        const snapshotJson = JSON.stringify(snapshot);
        const snapshotStorageId = await ctx.storage.store(
          new Blob([snapshotJson], { type: "application/json" }),
        );
        const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");
        const artifactId = await ctx.runMutation(internal.reportes.upsertArtifact, {
          run_id: args.run_id,
          profile,
          storage_id: storageId,
          snapshot_storage_id: snapshotStorageId,
          file_name: fileName,
          size: pdf.byteLength,
          snapshot_json: snapshotJson,
          snapshot_hash: snapshotHash,
          insights_json: JSON.stringify(insightResult.insights),
          ai_provider: insightResult.provider,
          ai_model: insightResult.model,
          ai_response_id: insightResult.responseId,
          input_tokens: insightResult.inputTokens,
          output_tokens: insightResult.outputTokens,
          status: insightResult.insights.warning ? "warning" : "ready",
          error: insightResult.insights.warning,
        });

        const appUrl = (process.env.APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");
        const reportUrl = appUrl
          ? `${appUrl}/proyecto/${claimed.proyecto}/reportes?tab=historial`
          : "";
        for (const recipient of recipients) {
          const idempotencyKey = `financial-report/${args.run_id}/${recipient.user_id}/${profile}`;
          const latestRecipient = await ctx.runQuery(
            internal.reportes.getRecipientForDelivery,
            {
              run_id: args.run_id,
              recipient_user_id: recipient.user_id as Id<"users">,
            },
          );
          if (!latestRecipient.active || latestRecipient.profile !== profile) {
            await ctx.runMutation(internal.reportes.upsertDelivery, {
              run_id: args.run_id,
              artifact_id: artifactId,
              recipient_user_id: recipient.user_id as Id<"users">,
              recipient_email: latestRecipient.email,
              profile,
              status: "revoked",
              attempts: 0,
              idempotency_key: idempotencyKey,
              error: latestRecipient.active
                ? "El rol del destinatario cambió durante la generación"
                : "El destinatario ya no tiene acceso activo al proyecto",
            });
            continue;
          }
          if (!reportUrl) {
            await ctx.runMutation(internal.reportes.upsertDelivery, {
              run_id: args.run_id,
              artifact_id: artifactId,
              recipient_user_id: recipient.user_id as Id<"users">,
              recipient_email: latestRecipient.email,
              profile,
              status: "failed",
              attempts: 0,
              idempotency_key: idempotencyKey,
              error: "Missing APP_URL",
            });
            continue;
          }
          const sendResult = await sendReportEmail({
            to: latestRecipient.email,
            subject: `Reporte financiero · ${context.project.nombre}`,
            html: renderReportEmail({
              recipientName: latestRecipient.name,
              projectName: context.project.nombre,
              periodStart: claimed.period_start,
              periodEnd: claimed.period_end,
              reportUrl,
              attached: shouldAttachReportPdf(pdf.byteLength),
              warning: insightResult.insights.warning,
            }),
            idempotencyKey,
            pdf,
            fileName,
          });
          await ctx.runMutation(internal.reportes.upsertDelivery, {
            run_id: args.run_id,
            artifact_id: artifactId,
            recipient_user_id: recipient.user_id as Id<"users">,
            recipient_email: latestRecipient.email,
            profile,
            status: sendResult.status,
            attempts: sendResult.attempts,
            idempotency_key: idempotencyKey,
            provider_message_id: sendResult.providerMessageId,
            error: sendResult.error,
            sent_at: sendResult.status === "sent" ? Date.now() : undefined,
          });
        }
      }

      await ctx.runMutation(internal.reportes.finishRun, {
        run_id: args.run_id,
        generation_warning: warnings.length
          ? [...new Set(warnings)].join(" | ").slice(0, 1000)
          : undefined,
      });
    } catch (error) {
      await ctx.runMutation(internal.reportes.failRun, {
        run_id: args.run_id,
        error: error instanceof Error ? error.message : "Unknown report generation error",
      });
      throw error;
    }
  },
});

export const retryInsightsForRun = internalAction({
  args: { run_id: v.id("report_runs") },
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.reportes.claimInsightsRetry, {
      run_id: args.run_id,
    });
    if (!claimed) return;

    try {
      const artifacts = await ctx.runQuery(internal.reportes.getArtifactsForRun, {
        run_id: args.run_id,
      });
      const warnings: string[] = [];
      for (const artifact of artifacts) {
        const snapshot = JSON.parse(artifact.snapshot_json) as ReportSnapshotV1;
        const insightResult = await generateReportInsights(snapshot);
        if (insightResult.insights.warning) warnings.push(insightResult.insights.warning);
        const profile = artifact.visibility_profile as ReportVisibilityProfile;
        const role = profile === "full"
          ? "user"
          : profile === "contractor"
            ? "contratista"
            : profile;
        const allowed = new Set<string>(allowedSectionsForRole(role));
        const sections = claimed.sections
          .filter((section) => allowed.has(section)) as ReportSection[];
        const pdf = renderReportPdf(snapshot, insightResult.insights, sections);
        const storageId = await ctx.storage.store(
          new Blob([pdf], { type: "application/pdf" }),
        );
        const snapshotStorageId = artifact.snapshot_storage_id ||
          await ctx.storage.store(
            new Blob([artifact.snapshot_json], { type: "application/json" }),
          );
        await ctx.runMutation(internal.reportes.upsertArtifact, {
          run_id: args.run_id,
          profile,
          storage_id: storageId,
          snapshot_storage_id: snapshotStorageId,
          file_name: artifact.file_name || `reporte-${args.run_id}-${profile}.pdf`,
          size: pdf.byteLength,
          snapshot_json: artifact.snapshot_json,
          snapshot_hash: artifact.snapshot_hash,
          insights_json: JSON.stringify(insightResult.insights),
          ai_provider: insightResult.provider,
          ai_model: insightResult.model,
          ai_response_id: insightResult.responseId,
          input_tokens: insightResult.inputTokens,
          output_tokens: insightResult.outputTokens,
          status: insightResult.insights.warning ? "warning" : "ready",
          error: insightResult.insights.warning,
        });
      }
      await ctx.runMutation(internal.reportes.finishRun, {
        run_id: args.run_id,
        generation_warning: warnings.length
          ? [...new Set(warnings)].join(" | ").slice(0, 1000)
          : undefined,
      });
    } catch (error) {
      await ctx.runMutation(internal.reportes.finishRun, {
        run_id: args.run_id,
        generation_warning: `No se pudieron reintentar los insights: ${
          error instanceof Error ? error.message : "unknown error"
        }`.slice(0, 1000),
      });
    }
  },
});
