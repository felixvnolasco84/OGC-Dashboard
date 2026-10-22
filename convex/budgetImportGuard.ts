import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function assertBudgetReady(ctx: Pick<QueryCtx, "db">, proyecto?: Id<"desarrollos">) {
  if (!proyecto) return;
  const project = await ctx.db.get(proyecto);
  if (project?.initial_budget_status === "incomplete") {
    throw new Error("La creación del presupuesto está incompleta. Reanuda la carga antes de modificar partidas o pagos.");
  }
}
