import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getCurrentUserOrThrow, hasAdminAccess, canUserAccessDesarrollo } from "./permissions";
import { normalizeHierarchyText as normalize } from "./partidaRules";
import { calculatePresupuestoMetrics } from "./presupuestoRules";

type Context = QueryCtx | MutationCtx;
export const DELETION_LIMITS = { scope: 500, documents: 8000, bytes: 4 * 1024 * 1024, indexRanges: 3500 };
const labels = {
  pagos: "pagos", ponderaciones: "ponderaciones", avances: "avances reales",
  programacion: "registros de programación", hitos: "vínculos de hitos",
  historial: "registros históricos de avance", requisiciones: "conceptos de requisición",
  rfis: "RFIs", bitacoras: "bitácoras", documentos: "documentos", tareas: "tareas",
  subcontratistas: "subcontratistas", facturas: "conceptos de factura",
  memoria: "registros de memoria de clasificación", exclusiones: "configuraciones de exclusión de honorarios",
  proyecciones: "proyecciones financieras",
};
type Category = keyof typeof labels;
type Metrics = ReturnType<typeof calculatePresupuestoMetrics>;
export type DeletionImpact = {
  status: "ready" | "blocked" | "missing";
  canDelete: boolean;
  verified: boolean;
  name: string;
  nivel: number;
  scope: { partidas: number; familias: number; subpartidas: number; total: number; duplicates: number };
  counts: Record<Category, number>;
  blockers: string[];
  expectedScope: string;
  hasEquivalentSibling: boolean;
  budget: { before: Metrics; after: Metrics } | null;
};

class AnalysisLimit extends Error {}

// Count every read, including repeated indexed reads; never treat a truncated
// scan as evidence that a reference does not exist. Leave headroom for writes.
class ReadBudget {
  documents = 0;
  bytes = 0;
  // Authentication, project and target lookup have already consumed ranges.
  indexRanges = 3;
  charge(doc: unknown) {
    if (!doc) return;
    this.documents++;
    this.bytes += new TextEncoder().encode(JSON.stringify(doc)).byteLength;
    if (this.documents > DELETION_LIMITS.documents || this.bytes > DELETION_LIMITS.bytes) {
      throw new AnalysisLimit();
    }
  }
  async collect<T>(query: AsyncIterable<T>): Promise<T[]> {
    // Empty indexed reads also count towards Convex's 4,096 range limit.
    // Reserve capacity for the final rollups instead of failing in the runtime.
    if (++this.indexRanges > DELETION_LIMITS.indexRanges) throw new AnalysisLimit();
    const rows: T[] = [];
    // Stream rather than take/collect: a page containing many large documents
    // could exhaust Convex's byte limit before we get a chance to charge it.
    for await (const row of query) {
      this.charge(row);
      rows.push(row);
    }
    return rows;
  }
}

export const partidaRootName = (p: Pick<Doc<"partidas">, "nivel" | "nombre" | "partida_nombre">) =>
  p.nivel === 1 ? p.nombre : (p.partida_nombre || p.nombre);

function emptyImpact(): DeletionImpact {
  return {
    status: "missing", canDelete: false, verified: true, name: "", nivel: 0,
    scope: { partidas: 0, familias: 0, subpartidas: 0, total: 0, duplicates: 0 },
    counts: Object.fromEntries(Object.keys(labels).map(key => [key, 0])) as Record<Category, number>,
    blockers: [], expectedScope: "", hasEquivalentSibling: false, budget: null,
  };
}

function simulateBudget(partidas: Doc<"partidas">[], target: Doc<"partidas">, ids: Set<string>) {
  const remaining = partidas.filter(p => !ids.has(p._id)).map(p => ({ ...p }));
  const root = partidaRootName(target);
  const sum = (rows: Doc<"partidas">[], field: "presupuesto_original" | "presupuesto_aprobado") =>
    rows.reduce((total, p) => total + p[field], 0);
  if (target.nivel === 3) {
    const leaves = remaining.filter(p => p.nivel === 3 && partidaRootName(p) === root && p.familia === target.familia);
    for (const family of remaining.filter(p => p.nivel === 2 && partidaRootName(p) === root && p.familia === target.familia)) {
      family.presupuesto_original = sum(leaves, "presupuesto_original");
      family.presupuesto_aprobado = sum(leaves, "presupuesto_aprobado");
      family.por_gastar = family.presupuesto_aprobado - family.pagado;
    }
  }
  if (target.nivel > 1) {
    const families = remaining.filter(p => p.nivel === 2 && partidaRootName(p) === root);
    for (const parent of remaining.filter(p => p.nivel === 1 && p.nombre === root)) {
      parent.presupuesto_original = sum(families, "presupuesto_original");
      parent.presupuesto_aprobado = sum(families, "presupuesto_aprobado");
      parent.por_gastar = parent.presupuesto_aprobado - parent.pagado;
    }
  }
  return remaining;
}

async function inspect(ctx: Context, id: Id<"partidas">, projectId: Id<"desarrollos">) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!hasAdminAccess(user)) throw new ConvexError("Solo los administradores pueden eliminar conceptos del presupuesto.");
  const project = await ctx.db.get(projectId);
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new ConvexError("No tienes permisos de administración en este proyecto.");
  }
  const impact = emptyImpact();
  const budget = new ReadBudget();
  budget.charge(user);
  budget.charge(project);
  const target = await ctx.db.get(id);
  budget.charge(target);
  if (!target) return { impact, project, target, selected: [] as Doc<"partidas">[], remaining: [] as Doc<"partidas">[] };
  if (target.proyecto !== projectId) throw new ConvexError("La partida no pertenece al proyecto seleccionado.");
  impact.name = target.nivel === 1 ? target.nombre : target.nivel === 2 ? target.familia : (target.sub_partida || target.nombre);
  impact.nivel = target.nivel;
  impact.status = "blocked";
  let selected: Doc<"partidas">[] = [];
  let remaining: Doc<"partidas">[] = [];
  try {
    const partidas = await budget.collect(ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", projectId)));
    const root = partidaRootName(target);
    if (![1, 2, 3].includes(target.nivel) || !normalize(root) || !normalize(impact.name)) {
      impact.blockers.push("La jerarquía no es válida. Corrige el nivel y los nombres antes de eliminar.");
      return { impact, project, target, selected, remaining };
    }
    selected = partidas.filter(p => target.nivel === 1
      ? partidaRootName(p) === root
      : target.nivel === 2
        ? p.nivel >= 2 && partidaRootName(p) === root && p.familia === target.familia
        : p._id === id);
    const ids = new Set(selected.map(p => String(p._id)));
    impact.scope = {
      partidas: selected.filter(p => p.nivel === 1).length,
      familias: selected.filter(p => p.nivel === 2).length,
      subpartidas: selected.filter(p => p.nivel === 3).length,
      total: selected.length,
      duplicates: selected.filter(p => p.nivel === target.nivel).length - 1,
    };
    if (selected.length > DELETION_LIMITS.scope) throw new AnalysisLimit();
    if (!Number.isFinite(project.honorarios_monto ?? 0) || partidas.some(p => (p.nivel === 1 || partidaRootName(p) === root) &&
      ![p.presupuesto_original, p.presupuesto_aprobado, p.pagado].every(Number.isFinite))) {
      impact.blockers.push("El presupuesto contiene importes no válidos que requieren conciliación.");
      return { impact, project, target, selected, remaining };
    }
    const roots = partidas.filter(p => p.nivel === 1 && p.nombre === root);
    const families = partidas.filter(p => p.nivel === 2 && partidaRootName(p) === root && p.familia === target.familia);
    const branchFamilies = partidas.filter(p => p.nivel === 2 && partidaRootName(p) === root);
    if (selected.some(p => ![1, 2, 3].includes(p.nivel)) ||
      selected.some(p => p.nivel > 1 && (!roots.length || !normalize(p.familia) ||
        p.nivel === 3 && !branchFamilies.some(family => family.familia === p.familia))) ||
      (target.nivel > 1 && !roots.length) || (target.nivel === 3 && !families.length) ||
      partidas.some(p => p.nivel === 1 && p.nombre !== root && normalize(p.nombre) === normalize(root)) ||
      branchFamilies.some(family => (target.nivel === 1 || family.familia === target.familia) &&
        branchFamilies.some(other => other.familia !== family.familia && normalize(other.familia) === normalize(family.familia)))) {
      impact.blockers.push("La jerarquía tiene padres ausentes o nombres ambiguos. Corrígela antes de eliminar.");
    }
    if (normalize(root) === "HONORARIOS") impact.blockers.push("La rama HONORARIOS está protegida porque interviene en los cálculos del proyecto.");
    remaining = simulateBudget(partidas, target, ids);
    impact.hasEquivalentSibling = target.nivel === 3 && remaining.some(p =>
      p.nivel === 3 && partidaRootName(p) === root && p.familia === target.familia && normalize(p.sub_partida || p.nombre) === normalize(target.sub_partida || target.nombre));
    // Include siblings used by rollups and all roots used by project metrics.
    // This is a content snapshot, not a client-authoritative list of deletions.
    impact.expectedScope = JSON.stringify({
      projectId, honorarios: project.honorarios_monto ?? null,
      rows: partidas.filter(p => p.nivel === 1 || partidaRootName(p) === root)
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))
        .map(p => [p._id, p.nivel, p.nombre, p.partida_nombre ?? null, p.familia, p.sub_partida,
          p.presupuesto_original, p.presupuesto_aprobado, p.pagado]),
    });
    // Query results also have a size limit. Do not return an oversized snapshot.
    if (new TextEncoder().encode(impact.expectedScope).byteLength > 512 * 1024) throw new AnalysisLimit();
    impact.budget = { before: calculatePresupuestoMetrics(partidas, project.honorarios_monto), after: calculatePresupuestoMetrics(remaining, project.honorarios_monto) };
    if (![...Object.values(impact.budget.before), ...Object.values(impact.budget.after)].every(Number.isFinite)) {
      impact.budget = null;
      impact.blockers.push("Los importes exceden el rango de cálculo válido. Corrige el presupuesto antes de eliminar.");
      return { impact, project, target, selected, remaining };
    }
    const references = Object.fromEntries(Object.keys(labels).map(key => [key, new Set<string>()])) as Record<Category, Set<string>>;
    const add = <T extends { _id: string }>(category: Category, rows: T[], predicate: (row: T) => boolean = () => true) => {
      for (const row of rows) if (predicate(row)) references[category].add(row._id);
    };
    const directPaymentIds = new Set<string>();
    if (selected.length > 200) {
      // An indexed read per ID would exceed the platform's range limit for
      // large branches. A bounded scan also finds inconsistent project IDs.
      const scan = async <T extends { _id: string }>(category: Category, query: AsyncIterable<T>, field: keyof T, alternate?: keyof T) => {
        const rows = (await budget.collect(query)).filter(row =>
          ids.has(String(row[field])) || alternate !== undefined && ids.has(String(row[alternate])));
        add(category, rows);
        return rows;
      };
      for (const payment of await scan("pagos", ctx.db.query("pagos"), "partida_id")) {
        if (payment.partida_id) directPaymentIds.add(payment.partida_id);
      }
      await scan("ponderaciones", ctx.db.query("programa_obra_ponderacion"), "partida_id");
      await scan("avances", ctx.db.query("avance_real"), "partida_id");
      await scan("programacion", ctx.db.query("programa_obra"), "partida_id");
      await scan("hitos", ctx.db.query("programa_obra_hito_links"), "partida_id");
      await scan("documentos", ctx.db.query("documentos"), "partida_id");
      await scan("bitacoras", ctx.db.query("bitacora"), "partida_id");
      await scan("requisiciones", ctx.db.query("requisicion_items"), "partida_id");
      await scan("rfis", ctx.db.query("rfis"), "partida_id");
      await scan("subcontratistas", ctx.db.query("subcontratistas"), "partida_id");
      await scan("facturas", ctx.db.query("invoice_items"), "partida_id", "proposed_partida_id");
      await scan("memoria", ctx.db.query("invoice_budget_mapping_memory"), "partida_id");
    } else for (const p of selected) {
      const pagos = await budget.collect(ctx.db.query("pagos").withIndex("by_partida_id", q => q.eq("partida_id", p._id)));
      add("pagos", pagos);
      if (pagos.length) directPaymentIds.add(p._id);
      add("ponderaciones", await budget.collect(ctx.db.query("programa_obra_ponderacion").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("avances", await budget.collect(ctx.db.query("avance_real").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("programacion", await budget.collect(ctx.db.query("programa_obra").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("hitos", await budget.collect(ctx.db.query("programa_obra_hito_links").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("documentos", await budget.collect(ctx.db.query("documentos").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("bitacoras", await budget.collect(ctx.db.query("bitacora").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("requisiciones", await budget.collect(ctx.db.query("requisicion_items").withIndex("by_partida", q => q.eq("partida_id", p._id))));
      add("rfis", await budget.collect(ctx.db.query("rfis").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("subcontratistas", await budget.collect(ctx.db.query("subcontratistas").withIndex("by_partida_id", q => q.eq("partida_id", p._id))));
      add("facturas", await budget.collect(ctx.db.query("invoice_items").withIndex("by_partida", q => q.eq("partida_id", p._id))));
      add("facturas", await budget.collect(ctx.db.query("invoice_items").withIndex("by_proposed_partida", q => q.eq("proposed_partida_id", p._id))));
      add("memoria", await budget.collect(ctx.db.query("invoice_budget_mapping_memory").withIndex("by_partida", q => q.eq("partida_id", p._id))));
    }
    for (const p of selected) {
      const hasPaymentSource = selected.some(child => directPaymentIds.has(child._id) &&
        (child._id === p._id || p.nivel === 1 && partidaRootName(child) === p.nombre ||
          p.nivel === 2 && child.nivel === 3 && partidaRootName(child) === partidaRootName(p) && child.familia === p.familia));
      if (p.pagado !== 0 && !hasPaymentSource) impact.blockers.push(`El registro «${p.nivel === 1 ? p.nombre : p.nivel === 2 ? p.familia : p.sub_partida || p.nombre}» tiene un importe pagado sin pagos que lo expliquen; requiere conciliación.`);
    }
    // These arrays cannot be indexed by their elements. Scan with a shared
    // budget, including malformed historical cross-project references.
    add("tareas", await budget.collect(ctx.db.query("tareas")), t => (t.partidas || []).some(id => ids.has(id)));
    add("exclusiones", await budget.collect(ctx.db.query("desarrollos")), p => (p.excluded_partidas_honorarios || []).some(id => ids.has(id)));

    const removesName = (partida: string, familia?: string, sub?: string) => {
      const matches = (p: Doc<"partidas">) => normalize(partidaRootName(p)) === normalize(partida) &&
        (familia === undefined ? p.nivel === 1 : sub === undefined
          ? p.nivel === 2 && normalize(p.familia) === normalize(familia)
          : p.nivel === 3 && normalize(p.familia) === normalize(familia) && normalize(p.sub_partida || p.nombre) === normalize(sub));
      return selected.some(matches) && !remaining.some(matches);
    };
    const details = await budget.collect(ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", q => q.eq("proyecto", projectId)));
    add("programacion", details, d => removesName(d.partida) || removesName(d.partida, d.familia) || (d.nivel === 3 && removesName(d.partida, d.familia, d.subpartida || "")));
    add("historial", await budget.collect(ctx.db.query("programa_obra_avance_historial").withIndex("by_proyecto", q => q.eq("proyecto", projectId))), h => removesName(h.partida) || removesName(h.partida, h.familia));
    // A requisition/RFI references its root by ID and children by name.
    for (const parent of roots.filter(p => !ids.has(p._id))) {
      add("requisiciones", await budget.collect(ctx.db.query("requisicion_items").withIndex("by_partida", q => q.eq("partida_id", parent._id))), i =>
        removesName(root, i.familia) || (Boolean(i.sub_partida) && removesName(root, i.familia, i.sub_partida)));
      add("rfis", await budget.collect(ctx.db.query("rfis").withIndex("by_partida_id", q => q.eq("partida_id", parent._id))), r =>
        (Boolean(r.familia) && removesName(root, r.familia)) || (Boolean(r.sub_partida) && removesName(root, r.familia || "", r.sub_partida)));
      add("bitacoras", await budget.collect(ctx.db.query("bitacora").withIndex("by_partida_id", q => q.eq("partida_id", parent._id))), b => b.familias_tags.some(f => removesName(root, f)));
    }
    add("subcontratistas", await budget.collect(ctx.db.query("subcontratistas").withIndex("by_proyecto", q => q.eq("proyecto", projectId))), s =>
      !s.partida_id && Boolean(s.partida_nombre) && removesName(s.partida_nombre!));
    add("proyecciones", await budget.collect(ctx.db.query("projected_transactions").withIndex("by_proyecto", q => q.eq("proyecto", projectId))), p => removesName(p.partida));
    for (const key of Object.keys(labels) as Category[]) {
      impact.counts[key] = references[key].size;
      if (impact.counts[key]) impact.blockers.push(`${impact.counts[key]} ${labels[key]}`);
    }
    impact.blockers = [...new Set(impact.blockers)];
    impact.canDelete = impact.blockers.length === 0;
    impact.status = impact.canDelete ? "ready" : "blocked";
    if (!impact.canDelete) impact.expectedScope = "";
  } catch (error) {
    if (!(error instanceof AnalysisLimit)) throw error;
    impact.verified = false;
    impact.canDelete = false;
    impact.expectedScope = "";
    impact.blockers.push("El volumen de datos excede el límite de verificación segura. No se eliminará ningún registro; solicita una revisión del presupuesto.");
  }
  return { impact, project, target, selected, remaining };
}

export async function analyzePartidaDeletion(ctx: Context, id: Id<"partidas">, projectId: Id<"desarrollos">) {
  return (await inspect(ctx, id, projectId)).impact;
}

// Call only with the raw mutation context: all derived updates below are
// explicit, atomic and run once, rather than once per deleted document.
export async function executePartidaDeletion(ctx: MutationCtx, id: Id<"partidas">, projectId: Id<"desarrollos">, expectedScope?: string) {
  const { impact, target, selected, remaining } = await inspect(ctx, id, projectId);
  if (impact.status === "missing") return { status: "already_deleted" as const, deletedIds: [] as Id<"partidas">[], removedFilters: { partidas: [] as string[], familias: [] as string[] } };
  if (!impact.canDelete) throw new ConvexError(impact.blockers.join("\n"));
  if (expectedScope !== undefined && impact.expectedScope !== expectedScope) {
    throw new ConvexError("El presupuesto cambió después de la revisión. Revisa el nuevo alcance y vuelve a confirmar.");
  }
  const root = partidaRootName(target!);
  for (const p of selected) await ctx.db.delete(p._id);
  for (const p of remaining.filter(p => target!.nivel > 1 && (p.nivel === 1 && p.nombre === root || target!.nivel === 3 && p.nivel === 2 && partidaRootName(p) === root && p.familia === target!.familia))) {
    await ctx.db.patch(p._id, { presupuesto_original: p.presupuesto_original, presupuesto_aprobado: p.presupuesto_aprobado, por_gastar: p.presupuesto_aprobado - p.pagado });
  }
  const metrics = await ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", q => q.eq("proyecto", projectId)).first();
  if (metrics) await ctx.db.patch(metrics._id, impact.budget!.after);
  else await ctx.db.insert("meticas_presupuesto", { proyecto: projectId, ...impact.budget!.after });
  return {
    status: "deleted" as const, deletedIds: selected.map(p => p._id),
    removedFilters: {
      partidas: [...new Set(selected.flatMap(p => [p.nombre, partidaRootName(p)]))].filter(name => !remaining.some(p => p.nombre === name || partidaRootName(p) === name)),
      familias: [...new Set(selected.map(p => p.familia).filter(Boolean))].filter(name => !remaining.some(p => p.familia === name)),
    },
  };
}
