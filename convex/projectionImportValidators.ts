import { v, type Infer } from "convex/values";

export const projectionTargetValidator = v.union(
  v.object({ kind: v.literal("expense"), project_id: v.id("desarrollos") }),
  v.object({ kind: v.literal("collection"), project_id: v.id("sales_projects") }),
);
export const projectionFormatValidator = v.union(v.literal("projections"), v.literal("flujo"));
export const projectionRowValidator = v.object({
  partida: v.string(), rowIndex: v.optional(v.number()), total: v.optional(v.number()),
  calculatedTotal: v.optional(v.number()), declaredTotal: v.optional(v.number()), projectionCount: v.optional(v.number()),
  weeklyProjections: v.array(v.object({ week: v.number(), amount: v.number(), position: v.number(), columnLetter: v.optional(v.string()) })),
});
export const projectionResultValidator = v.object({
  outcome: v.union(v.literal("created"), v.literal("replaced"), v.literal("unchanged")),
  rows: v.number(), cells: v.number(), weeks: v.number(), amount: v.number(), start_week: v.number(), end_week: v.number(),
});
export type ProjectionTarget = Infer<typeof projectionTargetValidator>;
export type ProjectionRow = Infer<typeof projectionRowValidator>;
export type ProjectionResult = Infer<typeof projectionResultValidator>;
