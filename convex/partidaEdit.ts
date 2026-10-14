import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { getCurrentUserOrThrow, canUserAccessDesarrollo } from "./permissions";
import { assertBudgetParent } from "./partidaReferences";
import { cleanHierarchyText, normalizeHierarchyText as normalize, partidaEditSource } from "./partidaRules";
import { budgetTotals, budgetRollupPatch, approvedBudgetPatch } from "./budgetRollupRules";
import { calculateBudgetIndirectos, feeBudgetConvert } from "./indirectosBudget";
import { calculateHonorariosFromRecords } from "./honorariosRules";
import { repairProjectPaymentTotals } from "./budgetMaintenance";
import { calculatePresupuestoMetrics } from "./presupuestoRules";

export const partidaEditFields = {
  presupuesto_aprobado: v.optional(v.number()), sub_partida: v.optional(v.string()),
  unidad: v.optional(v.string()), cantidad: v.optional(v.number()), precio_unitario: v.optional(v.number()),
};
export const partidaEditIdentity = { id: v.id("partidas"), proyecto: v.id("desarrollos"), nivel: v.number() };
export const partidaEditArgs = { ...partidaEditIdentity, changes: v.object(partidaEditFields) };
export type PartidaEditChanges = Partial<Pick<Doc<"partidas">, keyof typeof partidaEditFields>>;
type Identity = { id: Id<"partidas">; proyecto: Id<"desarrollos">; nivel: number };
type ReadCtx = Pick<QueryCtx, "db" | "auth">;
export const PARTIDA_EDIT_CONFLICT = "El presupuesto cambió después de la revisión. Actualiza la revisión antes de guardar; tus cambios se conservan.";
const CAPACITY = "No se pudo revisar el presupuesto completo por su volumen. No se guardaron cambios.";
const sorted = <T extends { _id: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a._id.localeCompare(b._id));
const rootName = (p: Doc<"partidas">) => p.nivel === 1 ? p.nombre : p.partida_nombre || p.nombre;

// Stream complete indexed reads; partial scans must never become a ready preview.
class ReadBudget {
  documents = 0;
  bytes = 0;
  ranges = 4;
  async collect<T>(query: AsyncIterable<T>): Promise<T[]> {
    if (++this.ranges > 2800) throw new ConvexError(CAPACITY);
    const rows: T[] = [];
    for await (const row of query) {
      this.documents++;
      this.bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
      if (this.documents > 5000 || this.bytes > 4 * 1024 * 1024) throw new ConvexError(CAPACITY);
      rows.push(row);
    }
    return rows;
  }
}

export async function loadPartidaEditContext(ctx: ReadCtx, args: Identity) {
  const user = await getCurrentUserOrThrow(ctx as QueryCtx);
  const project = await ctx.db.get(args.proyecto);
  if (["viewer", "almacenista"].includes(user.role) || !project || !canUserAccessDesarrollo(user, project)) {
    throw new ConvexError("No tienes permiso para editar el presupuesto de este proyecto.");
  }
  const target = await ctx.db.get(args.id);
  if (!target || target.proyecto !== project._id || target.nivel !== args.nivel || ![1, 2, 3].includes(target.nivel)) {
    throw new ConvexError("El concepto ya no existe o no pertenece al proyecto y nivel seleccionados.");
  }
  if (target.nivel > 1) {
    await assertBudgetParent(ctx as QueryCtx, project._id, rootName(target), target.nivel === 3 ? target.familia : undefined);
  }
  return { target, project, source: partidaEditSource(target) };
}

function editableChanges(target: Doc<"partidas">, proposed: PartidaEditChanges) {
  const patch: PartidaEditChanges = {};
  for (const key of Object.keys(proposed) as (keyof PartidaEditChanges)[]) {
    const value = proposed[key];
    if (!Object.prototype.hasOwnProperty.call(partidaEditFields, key) || (target.nivel !== 3 && key !== "presupuesto_aprobado")) {
      throw new ConvexError("Ese campo no se puede editar en este nivel del presupuesto.");
    }
    if (value === undefined) continue;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      throw new ConvexError("Los valores editables deben ser números finitos mayores o iguales a cero.");
    }
    const cleaned = key === "sub_partida" ? cleanHierarchyText(value) : value;
    if (key === "sub_partida" && !cleaned) throw new ConvexError("El nombre de la subpartida es obligatorio.");
    if (cleaned !== target[key]) Object.assign(patch, { [key]: cleaned });
  }
  return patch;
}

export function planPartidaEdit(partidas: readonly Doc<"partidas">[], target: Doc<"partidas">, proposed: PartidaEditChanges) {
  const changes = editableChanges(target, proposed);
  const root = rootName(target);
  const siblings = partidas.filter(p => p.nivel === 3 && p.partida_nombre === root && p.familia === target.familia);
  const name = changes.sub_partida ?? target.sub_partida;
  if (target.nivel === 3 && !cleanHierarchyText(name)) throw new ConvexError("El nombre de la subpartida es obligatorio.");
  // Match the existing update's duplicate rule, including unchanged names.
  if (target.nivel === 3 && siblings.some(p => p._id !== target._id && normalize(p.sub_partida || p.nombre) === normalize(name))) {
    throw new ConvexError(`Ya existe una subpartida equivalente a "${name}" dentro de esta familia.`);
  }
  const oldNameStillExists = target.nivel === 3 && siblings.some(p => p._id !== target._id && normalize(p.sub_partida || p.nombre) === normalize(target.sub_partida || target.nombre));
  const renameProgram = changes.sub_partida !== undefined && cleanHierarchyText(target.sub_partida) !== name && !oldNameStillExists;
  const after = partidas.map(p => ({ ...p }));
  const edited = after.find(p => p._id === target._id)!;
  const hasChanges = Object.keys(changes).length > 0;
  if (hasChanges) Object.assign(edited, changes, approvedBudgetPatch(changes.presupuesto_aprobado ?? target.presupuesto_aprobado, target.pagado));
  const affected = new Set([target._id]);
  if (hasChanges && target.nivel === 3 && target.familia) {
    const children = after.filter(p => p.nivel === 3 && p.partida_nombre === root && p.familia === target.familia);
    if (children.length) for (const parent of after.filter(p => p.nivel === 2 && p.partida_nombre === root && p.familia === target.familia)) {
      Object.assign(parent, budgetRollupPatch(parent, budgetTotals(children)));
      affected.add(parent._id);
    }
  }
  if (hasChanges && target.nivel > 1) {
    const families = after.filter(p => p.nivel === 2 && p.partida_nombre === root);
    if (families.length) for (const parent of after.filter(p => p.nivel === 1 && p.nombre === root)) {
      Object.assign(parent, budgetRollupPatch(parent, budgetTotals(families)));
      affected.add(parent._id);
    }
  }
  const patches = after.filter(p => affected.has(p._id)).map(p => {
    const before = partidas.find(old => old._id === p._id)!;
    const patch: Partial<Doc<"partidas">> = {};
    for (const key of ["sub_partida", "unidad", "cantidad", "precio_unitario", "presupuesto_original", "presupuesto_aprobado", "por_gastar"] as const) {
      if (p[key] !== before[key]) Object.assign(patch, { [key]: p[key] });
    }
    return { id: p._id, patch };
  }).filter(p => Object.keys(p.patch).length);
  const hasChildren = target.nivel < 3 && partidas.some(p => target.nivel === 1
    ? p.nivel === 2 && p.partida_nombre === root
    : p.nivel === 3 && p.partida_nombre === root && p.familia === target.familia);
  return { changes, after, patches, affected, renameProgram, oldNameStillExists, hasChildren };
}

const amountFields = (p: Doc<"partidas">) => ({ presupuesto_original: p.presupuesto_original, presupuesto_aprobado: p.presupuesto_aprobado,
  pagado: p.pagado, por_gastar: p.por_gastar ?? p.presupuesto_aprobado - p.pagado });

export async function analyzePartidaEdit(ctx: ReadCtx, args: Identity & { changes: PartidaEditChanges }) {
  const context = await loadPartidaEditContext(ctx, args);
  const { target, project } = context;
  const budget = new ReadBudget();
  const partidas = await budget.collect(ctx.db.query("partidas").withIndex("by_proyecto", q => q.eq("proyecto", project._id)));
  const plan = planPartidaEdit(partidas, target, args.changes);
  const transactions: Doc<"transacciones">[] = project.indirectos_porcentaje === undefined && !project.fee_concepts?.length ? []
    : await budget.collect(ctx.db.query("transacciones").withIndex("by_proyecto", q => q.eq("proyecto", project._id)));
  const pagos: Doc<"pagos">[] = [];
  for (const tx of transactions) pagos.push(...await budget.collect(ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", tx._id))));
  const beforeIndirectos = calculateBudgetIndirectos(project, partidas, transactions, pagos);
  const afterIndirectos = calculateBudgetIndirectos(project, plan.after, transactions, pagos);
  const before = calculatePresupuestoMetrics(partidas, project.honorarios_monto, beforeIndirectos);
  const afterHonorarios = project.fee_concepts?.length ? calculateHonorariosFromRecords({
    proyectoId: project._id, modo: project.honorarios_modo, porcentaje: project.honorarios_porcentaje,
    feeConcepts: project.fee_concepts, convert: feeBudgetConvert(project), excludedPartidas: project.excluded_partidas_honorarios,
    partidas: plan.after, transactions, pagos,
  }) : project.honorarios_monto;
  const after = calculatePresupuestoMetrics(plan.after, afterHonorarios, afterIndirectos);
  const details = plan.renameProgram ? await budget.collect(ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", q => q.eq("proyecto", project._id))) : [];
  const program = details.filter(d => d.nivel === 3 && normalize(d.partida) === normalize(rootName(target)) &&
    normalize(d.familia) === normalize(target.familia) && normalize(d.subpartida) === normalize(target.sub_partida || target.nombre));
  if (![before, after].every(metrics => Object.values(metrics).every(Number.isFinite))) {
    throw new ConvexError("Los totales del presupuesto no son válidos; no se puede verificar el impacto.");
  }
  const rows = sorted(partidas.filter(p => plan.affected.has(p._id))).sort((a, b) => b.nivel - a.nivel).map(p => ({
    id: p._id, nivel: p.nivel, name: p.nivel === 1 ? p.nombre : p.nivel === 2 ? p.familia : p.sub_partida,
    before: amountFields(p), after: amountFields(plan.after.find(next => next._id === p._id)!),
  }));
  if (!rows.every(row => [row.before, row.after].every(amounts => Object.values(amounts).every(Number.isFinite)))) {
    throw new ConvexError("Los importes de la jerarquía no son válidos; no se puede verificar el impacto.");
  }
  const changedFields = (Object.keys(plan.changes) as (keyof PartidaEditChanges)[]).map(field => ({ field, before: target[field], after: plan.changes[field]! }));
  const impact = {
    base: target, source: context.source, currency: project.moneda_principal || "MXN",
    path: [rootName(target), target.nivel > 1 ? target.familia : "", target.nivel === 3 ? target.sub_partida : ""].filter(Boolean),
    projectName: project.nombre, hasChanges: Object.keys(plan.changes).length > 0, changedFields, rows, hasChildren: plan.hasChildren,
    project: { before, after, indirectosBefore: beforeIndirectos, indirectosAfter: afterIndirectos, honorarios: project.honorarios_monto ?? 0 },
    programming: { count: program.length, oldNameStillExists: plan.oldNameStillExists, renamed: plan.changes.sub_partida !== undefined },
    expectedReview: JSON.stringify([
      context.source, project.nombre, project.moneda_principal, project.honorarios_monto, project.indirectos_porcentaje,
      project.indirectos_fecha_inicio, [...(project.excluded_partidas_honorarios || [])].sort(), project.fee_concepts || [],
      sorted(partidas).map(partidaEditSource), plan.changes, before, after, beforeIndirectos, afterIndirectos,
      sorted(program).map(d => [d._id, d.partida, d.familia, d.subpartida]),
    ]),
  };
  return { impact, plan, program };
}

export async function executePartidaEdit(ctx: MutationCtx, args: Identity & { changes: PartidaEditChanges; expectedReview: string }) {
  const { impact, plan, program } = await analyzePartidaEdit(ctx, args);
  if (impact.expectedReview !== args.expectedReview) throw new ConvexError(PARTIDA_EDIT_CONFLICT);
  if (!impact.hasChanges) return impact.base;
  // Leaf first, then family/root. Triggers use the same rollup rules; these
  // final patches additionally include original-budget rollups from the old update.
  const byLevel = new Map(plan.after.map(p => [p._id, p.nivel]));
  for (const change of plan.patches.sort((a, b) => byLevel.get(b.id)! - byLevel.get(a.id)!)) await ctx.db.patch(change.id, change.patch);
  for (const detail of program) await ctx.db.patch(detail._id, { subpartida: plan.changes.sub_partida! });
  const project = await ctx.db.get(args.proyecto);
  if (project?.fee_concepts?.length) {
    await repairProjectPaymentTotals(ctx, args.proyecto);
    return await ctx.db.get(args.id);
  }
  // Persist the reviewed global composition, including indirectos exactly once.
  const metrics = await ctx.db.query("meticas_presupuesto").withIndex("by_proyecto", q => q.eq("proyecto", args.proyecto)).first();
  if (metrics) await ctx.db.patch(metrics._id, impact.project.after);
  else await ctx.db.insert("meticas_presupuesto", { proyecto: args.proyecto, ...impact.project.after });
  return await ctx.db.get(args.id);
}

export type PartidaEditImpact = Awaited<ReturnType<typeof analyzePartidaEdit>>["impact"];
