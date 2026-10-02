import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeHierarchyText } from "./partidaRules";

type Context = MutationCtx | QueryCtx;

export async function assertBudgetFamilyTags(ctx: Context, projectId: Id<"desarrollos">, rootId: Id<"partidas">, tags: readonly string[]) {
  const root = await assertBudgetReference(ctx, rootId, projectId, 1);
  if (!tags.length) return;
  const families = await ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", q =>
    q.eq("proyecto", projectId).eq("nivel", 2)).collect();
  if (tags.some(tag => !families.some(p => (p.partida_nombre || p.nombre) === root.nombre && normalizeHierarchyText(p.familia) === normalizeHierarchyText(tag)))) {
    throw new ConvexError("Una familia de la bitácora ya no existe en la partida seleccionada. Actualiza el formulario.");
  }
}

// Read in the same transaction as the write. If deletion wins the race,
// this check fails instead of recreating a dangling reference.
export async function assertBudgetReference(ctx: Context, id: Id<"partidas">, projectId: Id<"desarrollos">, nivel?: number) {
  const partida = await ctx.db.get(id);
  if (!partida || partida.proyecto !== projectId || (nivel !== undefined && partida.nivel !== nivel)) {
    throw new ConvexError("El concepto presupuestario ya no existe o no pertenece al proyecto y nivel seleccionados. Actualiza el formulario.");
  }
  return partida;
}

export async function assertBudgetParent(ctx: Context, projectId: Id<"desarrollos">, root: string, family?: string) {
  const parent = await ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", q =>
    q.eq("proyecto", projectId).eq("nivel", 1).eq("nombre", root)).first();
  if (!parent) throw new ConvexError("La partida padre ya no existe en este proyecto. Actualiza el formulario.");
  if (family !== undefined) {
    // Match historical rows that used nombre instead of partida_nombre.
    const families = await ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", q =>
      q.eq("proyecto", projectId).eq("nivel", 2)).collect();
    if (!families.some(p => (p.partida_nombre || p.nombre) === root && p.familia === family)) {
      throw new ConvexError("La familia padre ya no existe en esta partida. Actualiza el formulario.");
    }
  }
  return parent;
}

export async function assertRequisicionBudgetItems(ctx: Context, projectId: Id<"desarrollos">, items: readonly { partida_id: Id<"partidas">; familia: string }[]) {
  const families = await ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", q =>
    q.eq("proyecto", projectId).eq("nivel", 2)).collect();
  for (const item of items) {
    const parent = await assertBudgetReference(ctx, item.partida_id, projectId, 1);
    if (!families.some(p => (p.partida_nombre || p.nombre) === parent.nombre && normalizeHierarchyText(p.familia) === normalizeHierarchyText(item.familia))) {
      throw new ConvexError("La familia de la requisición ya no existe en la partida seleccionada. Actualiza el formulario.");
    }
    // sub_partida is intentionally free text in requisiciones. It is not a
    // foreign key; require the actual root/family links, not a budget leaf.
  }
}
