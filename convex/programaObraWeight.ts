import { ConvexError, v } from "convex/values";
import { query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertAdmin,
  assertCanWrite,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
  hasAdminAccess,
} from "./permissions";
import {
  assertProgramCapability,
  bumpProgramVersion,
  event,
  executionContext,
} from "./programaObraExecution";
import { programToday } from "../src/lib/programa-obra-rules";
import {
  previewProgramWeight,
  programWeightDigest,
  programWeightSource,
} from "../src/lib/programa-obra-weight";

export const weightTargetValidator = v.union(
  v.object({ kind: v.literal("schedule"), id: v.id("programa_obra") }),
  v.object({ kind: v.literal("detail"), id: v.id("programa_obra_detalle") }),
);
type Target =
  | { kind: "schedule"; id: Id<"programa_obra"> }
  | { kind: "detail"; id: Id<"programa_obra_detalle"> };
export const WEIGHT_REVIEW_CONFLICT =
  "El programa cambió después de la revisión. Revisa los datos actualizados antes de guardar; tu peso propuesto se conserva.";

async function loadWeightReview(
  ctx: QueryCtx | MutationCtx,
  proyecto: Id<"desarrollos">,
  target: Target,
  peso: number,
) {
  const user = await getCurrentUserOrThrow(ctx);
  if (
    ["viewer", "almacenista"].includes(user.role) ||
    !(await checkDesarrolloAccess(ctx, proyecto))
  ) {
    throw new ConvexError(
      "No tienes permiso para editar la ponderación de este proyecto.",
    );
  }
  const [schedules, details, execution] = await Promise.all([
    ctx.db
      .query("programa_obra")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto))
      .collect(),
    ctx.db
      .query("programa_obra_detalle")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto))
      .collect(),
    executionContext(ctx, proyecto),
  ]);
  if (
    !hasAdminAccess(user) &&
    (!execution.config ||
      !execution.permissions.some((p) => p.user_id === user._id && p.plan))
  ) {
    throw new ConvexError(
      "No tienes autorización para editar ponderaciones en este programa.",
    );
  }
  const detail =
    target.kind === "detail"
      ? details.find((d) => d._id === target.id)
      : undefined;
  if (
    target.kind === "detail" &&
    (!detail || detail.nivel !== 2 || detail.archived)
  )
    throw new ConvexError("Selecciona una familia activa del proyecto.");
  const schedule = schedules.find(
    (s) =>
      s._id ===
      (target.kind === "schedule" ? target.id : detail?.programa_obra_id),
  );
  const partida = schedule ? await ctx.db.get(schedule.partida_id) : null;
  if (
    !schedule ||
    schedule.archived ||
    !partida ||
    partida.proyecto !== proyecto ||
    partida.nivel !== 1
  ) {
    throw new ConvexError(
      "La partida ya no pertenece al programa activo de este proyecto.",
    );
  }
  const cutoff = programToday();
  const impact = previewProgramWeight(
    schedules,
    details,
    execution.activities,
    target,
    peso,
    cutoff,
    execution.calendar,
  );
  const sourceToken = await programWeightDigest(
    JSON.stringify([
      proyecto,
      programWeightSource(
        schedules,
        details,
        execution.activities,
        cutoff,
        execution.calendar,
      ),
    ]),
  );
  const reviewToken = await programWeightDigest(
    JSON.stringify([sourceToken, target, peso]),
  );
  // Query only: never initialize a config or create a revision for a preview.
  const baseline = await ctx.db
    .query("programa_obra_revisions")
    .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto))
    .filter((q) => q.eq(q.field("kind"), "baseline"))
    .first();
  return {
    impact,
    sourceToken,
    reviewToken,
    baseline: !!baseline,
    scheduleName: partida.nombre,
    familyName: detail?.familia ?? null,
  };
}

export const previewWeightChange = query({
  args: {
    proyecto: v.id("desarrollos"),
    target: weightTargetValidator,
    peso: v.number(),
    refresh_day: v.string(),
    refresh: v.optional(v.number()),
  },
  handler: async (ctx, { proyecto, target, peso }) => {
    try {
      return {
        ok: true as const,
        ...(await loadWeightReview(ctx, proyecto, target, peso)),
      };
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof Error
            ? error.message
            : "No se pudo revisar la ponderación.",
      };
    }
  },
});

export async function saveProgramWeight(
  ctx: MutationCtx,
  target: Target,
  peso: number,
  reviewToken: string,
) {
  await assertCanWrite(ctx);
  const row = await ctx.db.get(target.id);
  if (!row) throw new ConvexError("El elemento ya no existe.");
  const review = await loadWeightReview(ctx, row.proyecto, target, peso);
  const execution = await executionContext(ctx, row.proyecto);
  if (execution.config)
    await assertProgramCapability(ctx, row.proyecto, "plan");
  else await assertAdmin(ctx);
  // A lost response or repeated submission cannot create another weight event.
  if (review.impact.oldWeight === peso)
    return { success: true, changed: false };
  if (reviewToken !== review.reviewToken)
    throw new ConvexError({
      code: "WEIGHT_REVIEW_CONFLICT",
      message: WEIGHT_REVIEW_CONFLICT,
    });
  await ctx.db.patch(target.id, { peso });
  await bumpProgramVersion(ctx, row.proyecto);
  await event(
    ctx,
    row.proyecto,
    "weight_changed",
    target.kind === "detail"
      ? "Ponderación de familia actualizada"
      : "Ponderación de partida actualizada",
    { id: target.id, old_weight: review.impact.oldWeight, weight: peso },
  );
  return { success: true, changed: true };
}
