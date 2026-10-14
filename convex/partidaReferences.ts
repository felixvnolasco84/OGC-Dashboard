import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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

export async function assertRequisicionBudgetItems<T extends { partida_id: Id<"partidas">; familia: string }>(ctx: Context, projectId: Id<"desarrollos">, items: readonly T[]): Promise<T[]> {
  const families = await ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", q =>
    q.eq("proyecto", projectId).eq("nivel", 2)).collect();
  let roots: Doc<"partidas">[] | undefined;
  const normalizedItems: T[] = [];
  for (const item of items) {
    const reference = await assertBudgetReference(ctx, item.partida_id, projectId);
    let parent = reference;
    if (reference.nivel !== 1) {
      // Older clients send the budget family/leaf used to prefill the form.
      // Resolve it in this transaction and persist the canonical root ID.
      if (![2, 3].includes(reference.nivel) || normalizeHierarchyText(reference.familia) !== normalizeHierarchyText(item.familia)) {
        throw new ConvexError("El concepto presupuestario no corresponde a la familia seleccionada. Actualiza el formulario.");
      }
      roots ??= await ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", q =>
        q.eq("proyecto", projectId).eq("nivel", 1)).collect();
      const candidates = roots.filter(root => root.nombre === (reference.partida_nombre || reference.nombre));
      if (candidates.length !== 1) {
        throw new ConvexError("No se pudo identificar la partida padre del material. Actualiza el formulario.");
      }
      parent = candidates[0];
    }
    // OTRO is the form's explicit option for manually requested materials;
    // it has no budget family row, but still requires a valid project/root.
    const isCustomFamily = item.familia.trim().toUpperCase() === "OTRO";
    if (!isCustomFamily && !families.some(p => (p.partida_nombre || p.nombre) === parent.nombre && normalizeHierarchyText(p.familia) === normalizeHierarchyText(item.familia))) {
      throw new ConvexError("La familia de la requisición ya no existe en la partida seleccionada. Actualiza el formulario.");
    }
    normalizedItems.push({ ...item, partida_id: parent._id });
    // sub_partida is intentionally free text in requisiciones. It is not a
    // foreign key; require the actual root/family links, not a budget leaf.
  }
  return normalizedItems;
}
