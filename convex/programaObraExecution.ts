import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertCanWrite, canUserAccessDesarrollo, checkDesarrolloAccess, getCurrentUserOrThrow, hasAdminAccess } from "./permissions";
import {
  DEFAULT_PROGRAM_CALENDAR, activityBlockers, activityDelayed, activityReleased, activityStatus,
  aggregateProgramProgress, programDate, programToday, proposeProgramDates,
  requireProgramDate, summarizeProgram, topologicalActivities, validateCalendar, validateProgress, recordedProgressBlockers,
} from "../src/lib/programa-obra-rules";
import { resolveProgressRecord } from "../src/lib/programa-obra-progress";

type Ctx = QueryCtx | MutationCtx;
type Capability = "plan" | "accept" | "exceptions";
export async function executionContext(ctx: Pick<Ctx, "db">, proyecto: Id<"desarrollos">) {
  const [config, activities, fronts, dependencies, requirements, permissions] = await Promise.all([
    ctx.db.query("programa_obra_config").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).unique(),
    ctx.db.query("programa_obra_activities").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ctx.db.query("programa_obra_fronts").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ctx.db.query("programa_obra_dependencies").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ctx.db.query("programa_obra_requirements").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ctx.db.query("programa_obra_permissions").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
  ]);
  return { config, activities, fronts, dependencies, requirements, permissions, calendar: config ? { weekdays: config.weekdays, holidays: config.holidays } : DEFAULT_PROGRAM_CALENDAR };
}
async function access(ctx: Ctx, proyecto: Id<"desarrollos">) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!(await checkDesarrolloAccess(ctx, proyecto))) throw new Error("No tienes acceso a este proyecto.");
  return user;
}
export async function assertProgramCapability(ctx: MutationCtx, proyecto: Id<"desarrollos">, capability: Capability) {
  const user = await assertCanWrite(ctx);
  await access(ctx, proyecto);
  const permission = await ctx.db.query("programa_obra_permissions").withIndex("by_proyecto_user", (q) => q.eq("proyecto", proyecto).eq("user_id", user._id)).unique();
  if (!hasAdminAccess(user) && !permission?.[capability]) throw new Error("No tienes autorización para esta acción en el programa.");
  return user;
}
async function eligibleUser(ctx: Ctx, proyecto: Id<"desarrollos">, id: Id<"users">) {
  const [user, project] = await Promise.all([ctx.db.get(id), ctx.db.get(proyecto)]);
  if (!user || !project || !canUserAccessDesarrollo(user, project) || ["viewer", "almacenista"].includes(user.role) || user.invitation_status === "pending") throw new Error("Selecciona un usuario con acceso de edición a este proyecto.");
  return user;
}
async function assertRequesterCanPlan(ctx: Ctx, proyecto: Id<"desarrollos">, id: Id<"users">) {
  const user = await eligibleUser(ctx, proyecto, id);
  const permission = await ctx.db.query("programa_obra_permissions").withIndex("by_proyecto_user", (q) => q.eq("proyecto", proyecto).eq("user_id", id)).unique();
  if (!hasAdminAccess(user) && !permission?.plan) throw new Error("El solicitante ya no tiene autorización para corregir fechas.");
}
async function activityDoc(ctx: Ctx, id: Id<"programa_obra_activities">) {
  const activity = await ctx.db.get(id);
  if (!activity || activity.archived) throw new Error("La actividad ya no está disponible.");
  await access(ctx, activity.proyecto);
  return activity;
}
export async function bumpProgramVersion(ctx: MutationCtx, proyecto: Id<"desarrollos">) {
  const config = await ctx.db.query("programa_obra_config").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).unique();
  if (!config) return 0;
  await ctx.db.patch(config._id, { version: config.version + 1 });
  return config.version + 1;
}
export async function event(ctx: MutationCtx, proyecto: Id<"desarrollos">, type: string, reason: string, payload: unknown, activity_id?: Id<"programa_obra_activities">, execution_date?: string) {
  const user = await getCurrentUserOrThrow(ctx);
  return ctx.db.insert("programa_obra_events", { proyecto, activity_id, type, reason, payload_json: JSON.stringify(payload), actor_id: user._id, actor_name: user.name, created_at: Date.now(), execution_date });
}
function textValue(value: string, label = "El motivo", max = 2000) {
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${label} es obligatorio y debe tener hasta ${max} caracteres.`);
  return text;
}
async function syncDetail(ctx: MutationCtx, detalle_id: Id<"programa_obra_detalle">, reason: string, execution_date?: string) {
  const detail = await ctx.db.get(detalle_id);
  if (!detail) throw new Error("La familia no está disponible.");
  const activities = await ctx.db.query("programa_obra_activities").withIndex("by_detalle", (q) => q.eq("detalle_id", detalle_id)).collect();
  const aggregate = aggregateProgramProgress(activities.filter((a) => !a.archived).map((a) => ({ progress: a.progress, weight: a.share, released: activityReleased(a), mandatory: a.mandatory })));
  const active = activities.filter((a) => !a.archived);
  const started = active.filter((a) => a.progress > 0 || a.actual_start);
  const actual_start = started.length && started.every((a) => !!a.actual_start) ? started.map((a) => a.actual_start!).sort()[0] : undefined;
  const actual_finish = active.length && active.every((a) => a.progress === 100 && !!a.actual_finish) ? active.map((a) => a.actual_finish!).sort().at(-1) : undefined;
  const progress_as_of = execution_date ?? detail.progress_as_of;
  await ctx.db.patch(detalle_id, { avance_porcentaje: aggregate.progress, actual_start, actual_finish, progress_as_of });
  if (aggregate.progress !== (detail.avance_porcentaje ?? 0) || actual_start !== detail.actual_start || actual_finish !== detail.actual_finish || progress_as_of !== detail.progress_as_of) {
    const user = await getCurrentUserOrThrow(ctx);
    await ctx.db.insert("programa_obra_avance_historial", { proyecto: detail.proyecto, detalle_id, partida: detail.partida, familia: detail.familia, old_value: detail.avance_porcentaje, new_value: aggregate.progress, old_actual_start: detail.actual_start, actual_start, old_actual_finish: detail.actual_finish, actual_finish, old_progress_as_of: detail.progress_as_of, changed_by_id: user._id, changed_by_name: user.name, created_at: Date.now(), execution_date: progress_as_of, reason });
  }
}
async function markCompletedSuccessors(ctx: MutationCtx, source: Doc<"programa_obra_activities">, reason: string) {
  const context = await executionContext(ctx, source.proyecto);
  const affected = new Set<string>([source._id]);
  let changed = true;
  while (changed) { changed = false; for (const d of context.dependencies) if (affected.has(d.predecessor_id) && !affected.has(d.successor_id)) { affected.add(d.successor_id); changed = true; } }
  for (const a of context.activities) if (a._id !== source._id && affected.has(a._id) && !a.archived && a.progress === 100) {
    const message = `Revisar ${a.name}: cambió la liberación de ${source.name}. ${reason}`;
    await ctx.db.patch(a._id, { review_incident: message, accepted_at: undefined, accepted_by: undefined });
    await event(ctx, source.proyecto, "upstream_reopened", reason, { predecessor_id: source._id }, a._id);
  }
}

export const getExecutionProgram = query({
  args: { proyecto: v.id("desarrollos"), refresh_day: v.optional(v.string()) },
  handler: async (ctx, { proyecto }) => {
    const user = await access(ctx, proyecto);
    const [context, schedules, details, exceptions, events, revisions, project, allUsers] = await Promise.all([
      executionContext(ctx, proyecto),
      ctx.db.query("programa_obra").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
      ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
      ctx.db.query("programa_obra_exceptions").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
      ctx.db.query("programa_obra_events").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).order("desc").take(100),
      ctx.db.query("programa_obra_revisions").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).order("desc").take(20),
      ctx.db.get(proyecto), ctx.db.query("users").collect(),
    ]);
    const permission = context.permissions.find((p) => p.user_id === user._id);
    const admin = hasAdminAccess(user), writable = !["viewer", "almacenista"].includes(user.role);
    const capabilities = { admin, write: writable, plan: writable && (admin || !!permission?.plan), accept: writable && (admin || !!permission?.accept), exceptions: writable && (admin || !!permission?.exceptions) };
    const today = programToday();
    const activities = context.activities.filter((a) => !a.archived).map((a) => {
      const blockers = activityBlockers(a, context.activities, context.dependencies, context.requirements, today, context.calendar);
      return { ...a, partida_name: details.find((d) => d._id === a.detalle_id)?.partida ?? "", blockers, status: activityStatus(a, blockers), released: activityReleased(a), delayed: activityDelayed(a, today) };
    });
    const summaries = summarizeProgram(schedules, details, context.activities, today, context.calendar);
    return { ...context, activities, summaries, exceptions, events, revisions, capabilities, today,
      users: allUsers.filter((u) => project && canUserAccessDesarrollo(u, project) && !["viewer", "almacenista"].includes(u.role) && u.invitation_status !== "pending").map((u) => ({ _id: u._id, name: u.name })),
    };
  },
});

export const initializeExecutionProgram = mutation({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, { proyecto }) => {
    await assertProgramCapability(ctx, proyecto, "plan");
    let context = await executionContext(ctx, proyecto);
    if (!context.config) await ctx.db.insert("programa_obra_config", { proyecto, enabled: false, version: 0, ...DEFAULT_PROGRAM_CALENDAR });
    let front = context.fronts.find((f) => f.name === "General" && !f.archived)?._id;
    if (!front) front = await ctx.db.insert("programa_obra_fronts", { proyecto, name: "General", archived: false });
    const details = await ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect();
    let created = 0;
    for (const detail of details.filter((d) => d.nivel === 2 && d.orden != null && !d.archived)) {
      if (context.activities.some((a) => a.detalle_id === detail._id)) continue;
      await ctx.db.insert("programa_obra_activities", { proyecto, detalle_id: detail._id, front_id: front, name: detail.familia, progress: detail.avance_porcentaje ?? 0, actual_start: detail.actual_start, actual_finish: detail.actual_finish, progress_as_of: detail.progress_as_of, share: 100, mandatory: true, archived: false, requires_review: false, current_start: programDate(detail.fecha_inicio), current_finish: programDate(detail.fecha_fin), dates_need_review: (detail.tiempo_extra_cantidad ?? 0) > 0 });
      created++;
    }
    context = await executionContext(ctx, proyecto);
    const version = await bumpProgramVersion(ctx, proyecto);
    await event(ctx, proyecto, "initialized", "Preparación del programa por frentes", { created, version });
    return { created, version };
  },
});

export const configureExecutionProgram = mutation({
  args: { proyecto: v.id("desarrollos"), weekdays: v.array(v.number()), holidays: v.array(v.string()), enabled: v.boolean(), reason: v.string(), version: v.number() },
  handler: async (ctx, args) => {
    const user = await assertProgramCapability(ctx, args.proyecto, "plan");
    const context = await executionContext(ctx, args.proyecto);
    if (!context.config || args.version !== context.config.version) throw new Error("El programa cambió; vuelve a revisar la configuración.");
    const calendar = { weekdays: args.weekdays, holidays: args.holidays.map(requireProgramDate) }; validateCalendar(calendar);
    const reason = textValue(args.reason);
    if (context.config.enabled && !args.enabled && !hasAdminAccess(user)) throw new Error("Solo un administrador puede desactivar las reglas.");
    if (args.enabled) {
      const active = context.activities.filter((a) => !a.archived);
      if (!active.length || active.some((a) => !a.responsible_id)) throw new Error("Asigna un responsable a cada actividad antes de activar.");
      const details = await ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto)).collect();
      if (details.some((d) => d.nivel === 2 && d.orden != null && !d.archived && !active.some((a) => a.detalle_id === d._id))) throw new Error("Incorpora todas las familias visibles antes de activar las reglas.");
      topologicalActivities(active, context.dependencies);
      for (const a of active) await eligibleUser(ctx, args.proyecto, a.responsible_id!);
    }
    if (!context.config.enabled && args.enabled) {
      const details = await ctx.db.query("programa_obra_detalle").withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto)).collect();
      const schedules = await ctx.db.query("programa_obra").withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto)).collect();
      await ctx.db.insert("programa_obra_revisions", { proyecto: args.proyecto, kind: "baseline", actor_id: user._id, created_at: Date.now(), reason, version: args.version, snapshot_json: JSON.stringify({ activities: context.activities, details: details.map((d) => ({ id: d._id, weight: d.peso })), schedules: schedules.map((s) => ({ id: s._id, weight: s.peso })), calendar }) });
    }
    await ctx.db.patch(context.config._id, { ...calendar, enabled: args.enabled, version: args.version + 1 });
    await event(ctx, args.proyecto, "configuration", reason, { calendar, enabled: args.enabled });
  },
});

export const setExecutionPermission = mutation({
  args: { proyecto: v.id("desarrollos"), user_id: v.id("users"), plan: v.boolean(), accept: v.boolean(), exceptions: v.boolean() },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.proyecto);
    if (!hasAdminAccess(user)) throw new Error("Solo un administrador puede asignar autorizaciones.");
    await eligibleUser(ctx, args.proyecto, args.user_id);
    const existing = await ctx.db.query("programa_obra_permissions").withIndex("by_proyecto_user", (q) => q.eq("proyecto", args.proyecto).eq("user_id", args.user_id)).unique();
    if (existing) await ctx.db.patch(existing._id, args); else await ctx.db.insert("programa_obra_permissions", args);
    await bumpProgramVersion(ctx, args.proyecto); await event(ctx, args.proyecto, "permissions", "Autorizaciones del programa actualizadas", args);
  },
});

export const createExecutionFront = mutation({
  args: { proyecto: v.id("desarrollos"), name: v.string() },
  handler: async (ctx, { proyecto, name }) => {
    await assertProgramCapability(ctx, proyecto, "plan"); name = textValue(name, "El nombre", 100);
    const context = await executionContext(ctx, proyecto);
    if (context.fronts.some((f) => !f.archived && f.name.localeCompare(name, "es", { sensitivity: "base" }) === 0)) throw new Error("Ya existe un frente con ese nombre.");
    const id = await ctx.db.insert("programa_obra_fronts", { proyecto, name, archived: false });
    await bumpProgramVersion(ctx, proyecto); await event(ctx, proyecto, "front_created", name, { id }); return id;
  },
});

export const configureExecutionActivity = mutation({
  args: { activity_id: v.id("programa_obra_activities"), name: v.string(), front_id: v.optional(v.id("programa_obra_fronts")), responsible_id: v.id("users"), requires_review: v.boolean(), mandatory: v.boolean(), reason: v.string(), actual_start: v.optional(v.string()), actual_finish: v.optional(v.string()), current_start: v.optional(v.string()), current_finish: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const a = await activityDoc(ctx, args.activity_id); await assertProgramCapability(ctx, a.proyecto, "plan"); await eligibleUser(ctx, a.proyecto, args.responsible_id);
    const context = await executionContext(ctx, a.proyecto), reason = textValue(args.reason);
    const front_id = args.front_id ?? a.front_id;
    if (!context.fronts.some((f) => f._id === front_id && !f.archived) || context.activities.some((row) => row._id !== a._id && !row.archived && row.detalle_id === a.detalle_id && row.front_id === front_id)) throw new Error("Selecciona un frente activo sin otra actividad de esta familia.");
    const actual_start = args.actual_start ? requireProgramDate(args.actual_start) : a.actual_start;
    const actual_finish = args.actual_finish ? requireProgramDate(args.actual_finish) : a.actual_finish;
    if (actual_start && (actual_start > programToday() || a.progress === 0)) throw new Error("El inicio real necesita avance y no puede ser futuro.");
    if (actual_finish && (a.progress !== 100 || actual_finish > programToday() || (actual_start && actual_finish < actual_start))) throw new Error("La terminación real debe corresponder al 100 % y ser posterior al inicio.");
    if (a.progress_as_of && ((actual_start && actual_start > a.progress_as_of) || (actual_finish && actual_finish > a.progress_as_of))) throw new Error("Las fechas reales no pueden ser posteriores a la fecha del avance; corrige el registro de avance.");
    if ((args.current_start || args.current_finish) && context.config?.enabled && !a.dates_need_review) throw new Error("Utiliza una propuesta de reprogramación para cambiar fechas vigentes.");
    const current_start = args.current_start ? requireProgramDate(args.current_start) : a.current_start;
    const current_finish = args.current_finish ? requireProgramDate(args.current_finish) : a.current_finish;
    if (current_start && current_finish && current_finish < current_start) throw new Error("El fin debe ser posterior al inicio.");
    await ctx.db.patch(a._id, { name: textValue(args.name, "El nombre", 200), front_id, responsible_id: args.responsible_id, requires_review: args.requires_review, mandatory: args.mandatory, actual_start, actual_finish, current_start, current_finish, dates_need_review: (args.current_start && args.current_finish) ? false : a.dates_need_review,
      ...(a.requires_review !== args.requires_review ? { accepted_at: undefined, accepted_by: undefined } : {}) });
    if (activityReleased(a) && (a.requires_review !== args.requires_review || actual_finish !== a.actual_finish || front_id !== a.front_id)) await markCompletedSuccessors(ctx, a, reason);
    if (actual_start !== a.actual_start || actual_finish !== a.actual_finish) await syncDetail(ctx, a.detalle_id, reason);
    await bumpProgramVersion(ctx, a.proyecto); await event(ctx, a.proyecto, "activity_configured", reason, args, a._id);
  },
});

export const splitExecutionActivity = mutation({
  args: { activity_id: v.id("programa_obra_activities"), reason: v.string(), fronts: v.array(v.object({ front_id: v.id("programa_obra_fronts"), share: v.number(), progress: v.number(), responsible_id: v.id("users") })) },
  handler: async (ctx, args) => {
    const a = await activityDoc(ctx, args.activity_id); await assertProgramCapability(ctx, a.proyecto, "plan"); const reason = textValue(args.reason);
    const context = await executionContext(ctx, a.proyecto);
    if (context.dependencies.some((d) => d.predecessor_id === a._id || d.successor_id === a._id) || context.requirements.some((r) => r.activity_id === a._id) || a.requires_review || a.review_incident) throw new Error("Resuelve las relaciones, requisitos y revisión antes de dividir esta actividad.");
    if (args.fronts.length < 2 || new Set(args.fronts.map((f) => f.front_id)).size !== args.fronts.length) throw new Error("Selecciona al menos dos frentes diferentes.");
    if (Math.abs(args.fronts.reduce((n, f) => n + f.share, 0) - 100) > 0.000001) throw new Error("La distribución de frentes debe sumar 100 %.");
    for (const f of args.fronts) { validateProgress(f.progress); if (!Number.isFinite(f.share) || f.share <= 0 || f.share > 100) throw new Error("Cada frente necesita una participación positiva."); await eligibleUser(ctx, a.proyecto, f.responsible_id); if (!context.fronts.some((front) => front._id === f.front_id && !front.archived)) throw new Error("El frente no pertenece al proyecto."); }
    const progress = aggregateProgramProgress(args.fronts.map((f) => ({ progress: f.progress, weight: f.share }))).progress;
    if (Math.abs(progress - a.progress) > 0.000001) throw new Error("El avance distribuido debe conservar el avance de la actividad original.");
    const siblingFronts = context.activities.filter((row) => !row.archived && row.detalle_id === a.detalle_id && row._id !== a._id).map((row) => row.front_id);
    if (args.fronts.some((f) => siblingFronts.includes(f.front_id))) throw new Error("La familia ya tiene una actividad en uno de esos frentes.");
    for (const f of args.fronts) await ctx.db.insert("programa_obra_activities", { proyecto: a.proyecto, detalle_id: a.detalle_id, front_id: f.front_id, name: a.name, progress: f.progress, share: a.share * f.share / 100, mandatory: a.mandatory, archived: false, requires_review: false, responsible_id: f.responsible_id, current_start: a.current_start, current_finish: a.current_finish, dates_need_review: a.dates_need_review });
    await ctx.db.patch(a._id, { archived: true }); await syncDetail(ctx, a.detalle_id, reason);
    await bumpProgramVersion(ctx, a.proyecto); await event(ctx, a.proyecto, "activity_split", reason, args.fronts, a._id);
  },
});

export const upsertExecutionDependency = mutation({
  args: { dependency_id: v.optional(v.id("programa_obra_dependencies")), predecessor_id: v.id("programa_obra_activities"), successor_id: v.id("programa_obra_activities"), kind: v.union(v.literal("FS"), v.literal("SS"), v.literal("FF")), lag_days: v.number(), lag_unit: v.union(v.literal("working"), v.literal("natural")), reason: v.string() },
  handler: async (ctx, args) => {
    const successor = await activityDoc(ctx, args.successor_id), predecessor = await activityDoc(ctx, args.predecessor_id);
    await assertProgramCapability(ctx, successor.proyecto, "plan");
    if (predecessor.proyecto !== successor.proyecto) throw new Error("Las actividades pertenecen a proyectos diferentes.");
    const context = await executionContext(ctx, successor.proyecto);
    if (args.dependency_id && !context.dependencies.some((d) => d._id === args.dependency_id)) throw new Error("La dependencia no pertenece al proyecto.");
    const data = { proyecto: successor.proyecto, predecessor_id: args.predecessor_id, successor_id: args.successor_id, kind: args.kind, lag_days: args.lag_days, lag_unit: args.lag_unit };
    topologicalActivities(context.activities, [...context.dependencies.filter((d) => d._id !== args.dependency_id), { ...data, _id: args.dependency_id ?? "new" }]);
    const reason = textValue(args.reason);
    const id = args.dependency_id ?? await ctx.db.insert("programa_obra_dependencies", data);
    if (args.dependency_id) await ctx.db.patch(id, data);
    if (successor.progress === 100) { await ctx.db.patch(successor._id, { review_incident: "Se modificaron las dependencias después del cierre; revisa la liberación.", accepted_at: undefined, accepted_by: undefined }); await markCompletedSuccessors(ctx, successor, reason); }
    await bumpProgramVersion(ctx, successor.proyecto); await event(ctx, successor.proyecto, "dependency_saved", reason, data, successor._id); return id;
  },
});
export const removeExecutionDependency = mutation({
  args: { dependency_id: v.id("programa_obra_dependencies"), reason: v.string() },
  handler: async (ctx, args) => {
    const dependency = await ctx.db.get(args.dependency_id); if (!dependency) throw new Error("La dependencia ya no existe.");
    await assertProgramCapability(ctx, dependency.proyecto, "plan");
    await ctx.db.delete(dependency._id); await bumpProgramVersion(ctx, dependency.proyecto); await event(ctx, dependency.proyecto, "dependency_removed", textValue(args.reason), dependency, dependency.successor_id);
  },
});

async function validateRequirementSource(ctx: MutationCtx, proyecto: Id<"desarrollos">, source_type?: "requisicion" | "rfi" | "plano" | "documento", source_id?: string) {
  if (!source_type && !source_id) return;
  if (!source_type || !source_id) throw new Error("Selecciona el tipo y el identificador del registro vinculado.");
  const table = { requisicion: "requisiciones", rfi: "rfis", plano: "planos", documento: "documentos" } as const;
  const id = ctx.db.normalizeId(table[source_type], source_id);
  if (!id) throw new Error("El identificador del registro no es válido.");
  const source = await ctx.db.get(id);
  if (!source || source.proyecto !== proyecto) throw new Error("El registro vinculado no pertenece al proyecto.");
  if (source_type === "rfi") {
    const rfi = source as Doc<"rfis">, user = await getCurrentUserOrThrow(ctx);
    if (rfi.is_private && !hasAdminAccess(user) && rfi.creator_id !== user._id && rfi.rfi_manager_id !== user._id && !rfi.assignee_ids.includes(user._id) && !rfi.distribution_user_ids.includes(user._id)) throw new Error("No tienes acceso al RFI seleccionado.");
  }
}
export const upsertExecutionRequirement = mutation({
  args: { requirement_id: v.optional(v.id("programa_obra_requirements")), activity_id: v.id("programa_obra_activities"), description: v.string(), category: v.union(v.literal("materials"), v.literal("plans"), v.literal("permits"), v.literal("equipment"), v.literal("crew"), v.literal("technical")), stage: v.union(v.literal("start"), v.literal("finish")), blocking: v.boolean(), responsible_id: v.id("users"), due_date: v.string(), source_type: v.optional(v.union(v.literal("requisicion"), v.literal("rfi"), v.literal("plano"), v.literal("documento"))), source_id: v.optional(v.string()), reason: v.string() },
  handler: async (ctx, args) => {
    const activity = await activityDoc(ctx, args.activity_id); await assertProgramCapability(ctx, activity.proyecto, "plan"); await eligibleUser(ctx, activity.proyecto, args.responsible_id);
    await validateRequirementSource(ctx, activity.proyecto, args.source_type, args.source_id);
    const existing = args.requirement_id ? await ctx.db.get(args.requirement_id) : null;
    if (args.requirement_id && (!existing || existing.activity_id !== activity._id)) throw new Error("El requisito no corresponde a esta actividad.");
    const data = { proyecto: activity.proyecto, activity_id: activity._id, description: textValue(args.description, "La descripción", 500), category: args.category, stage: args.stage, blocking: args.blocking, responsible_id: args.responsible_id, due_date: requireProgramDate(args.due_date), source_type: args.source_type, source_id: args.source_id, resolved: false, resolved_at: undefined, resolved_by: undefined };
    const reason = textValue(args.reason);
    if (existing) await ctx.db.patch(existing._id, data); else await ctx.db.insert("programa_obra_requirements", data);
    if (activity.progress === 100 && data.blocking) { await ctx.db.patch(activity._id, { review_incident: "Hay un nuevo requisito después del cierre; revisa la liberación.", accepted_at: undefined, accepted_by: undefined }); await markCompletedSuccessors(ctx, activity, reason); }
    await bumpProgramVersion(ctx, activity.proyecto); await event(ctx, activity.proyecto, "requirement_saved", reason, data, activity._id);
  },
});
export const resolveExecutionRequirement = mutation({
  args: { requirement_id: v.id("programa_obra_requirements"), resolved: v.boolean(), evidence: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requirement_id); if (!req) throw new Error("El requisito ya no existe.");
    const user = await assertCanWrite(ctx); await access(ctx, req.proyecto);
    if (req.responsible_id !== user._id) await assertProgramCapability(ctx, req.proyecto, "accept");
    const reason = textValue(args.reason), evidence = args.evidence.trim(); if (evidence.length > 2000) throw new Error("La evidencia supera 2000 caracteres.");
    await ctx.db.patch(req._id, { resolved: args.resolved, evidence, resolved_by: args.resolved ? user._id : undefined, resolved_at: args.resolved ? Date.now() : undefined });
    const activity = await activityDoc(ctx, req.activity_id);
    if (!args.resolved && req.blocking && activity.progress === 100) { await ctx.db.patch(activity._id, { review_incident: `Se reabrió el requisito: ${req.description}`, accepted_at: undefined, accepted_by: undefined }); await markCompletedSuccessors(ctx, activity, reason); }
    await bumpProgramVersion(ctx, req.proyecto); await event(ctx, req.proyecto, "requirement_resolved", reason, { requirement_id: req._id, resolved: args.resolved, evidence }, req.activity_id);
  },
});

export const removeExecutionRequirement = mutation({
  args: { requirement_id: v.id("programa_obra_requirements"), reason: v.string() },
  handler: async (ctx, args) => {
    const requirement = await ctx.db.get(args.requirement_id);
    if (!requirement) throw new Error("El requisito ya no existe.");
    await assertProgramCapability(ctx, requirement.proyecto, "plan");
    const reason = textValue(args.reason);
    await ctx.db.delete(requirement._id);
    await bumpProgramVersion(ctx, requirement.proyecto);
    await event(ctx, requirement.proyecto, "requirement_removed", reason, requirement, requirement.activity_id);
  },
});

export const getExecutionSources = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, { proyecto }) => {
    const user = await access(ctx, proyecto);
    const [requisitions, rfis, drawings, documents] = await Promise.all([
      ctx.db.query("requisiciones").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
      ctx.db.query("rfis").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
      ctx.db.query("planos").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
      ctx.db.query("documentos").withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto)).collect(),
    ]);
    return [
      ...requisitions.map((r) => ({ id: String(r._id), type: "requisicion" as const, name: `${r.fecha_solicitud} · ${r.descripcion || r.tipo} · ${r.status_entrega || "Pendiente"}` })),
      ...rfis.filter((r) => (!r.is_private || hasAdminAccess(user) || r.creator_id === user._id || r.rfi_manager_id === user._id || r.assignee_ids.includes(user._id) || r.distribution_user_ids.includes(user._id)) && (r.status !== "draft" || hasAdminAccess(user) || r.creator_id === user._id)).map((r) => ({ id: String(r._id), type: "rfi" as const, name: `${r.prefix}-${r.number} · ${r.subject}` })),
      ...drawings.filter((d) => !d.deleting_at).map((d) => ({ id: String(d._id), type: "plano" as const, name: `${d.numero || "Plano"} · ${d.titulo || d.nombre_archivo}` })),
      ...documents.filter((d) => !d.deleted_at).map((d) => ({ id: String(d._id), type: "documento" as const, name: d.nombre })),
    ];
  },
});

export const getExecutionHistory = query({
  args: { activity_id: v.id("programa_obra_activities") },
  handler: async (ctx, args) => {
    const activity = await activityDoc(ctx, args.activity_id);
    const [events, legacy] = await Promise.all([
      ctx.db.query("programa_obra_events").withIndex("by_activity", (q) => q.eq("activity_id", activity._id)).order("desc").take(200),
      ctx.db.query("programa_obra_avance_historial").withIndex("by_detalle", (q) => q.eq("detalle_id", activity.detalle_id)).order("desc").take(200),
    ]);
    return { events, legacy };
  },
});

export async function recordExecutionProgress(ctx: MutationCtx, args: { activity_id: Id<"programa_obra_activities">; progress: number; execution_date: string; actual_start?: string; actual_finish?: string; reason?: string }, exceptionId?: Id<"programa_obra_exceptions">) {
  await assertCanWrite(ctx); const activity = await activityDoc(ctx, args.activity_id);
  const { actual_start, actual_finish, progress_as_of: date, correctsKnownDates, changed } = resolveProgressRecord(activity, args);
  if (correctsKnownDates && !exceptionId) await assertProgramCapability(ctx, activity.proyecto, "plan");
  const context = await executionContext(ctx, activity.proyecto);
  if (context.config?.enabled && !activity.responsible_id) throw new Error("Asigna un responsable a la actividad antes de registrar ejecución.");
  const blockers = recordedProgressBlockers(activity, args.progress, { actual_start, actual_finish, progress_as_of: date }, context.activities, context.dependencies, context.requirements, context.calendar);
  if (context.config?.enabled && blockers.length && !exceptionId) throw new Error(`Avance bloqueado: ${blockers.map((b) => b.message).join(" ")} Solicita una excepción para este registro.`);
  if (args.progress < activity.progress && !args.reason?.trim()) throw new Error("Explica el motivo de la reducción o reapertura.");
  if (!changed) return { success: true };
  const reason = args.reason?.trim() || "Registro de avance físico";
  const patch = { progress: args.progress,
    actual_start, actual_finish, progress_as_of: date,
    ...(args.progress < activity.progress ? { accepted_at: undefined, accepted_by: undefined, review_incident: undefined } : {}),
    ...(exceptionId && args.progress === 100 && blockers.length ? { review_incident: "Terminación física registrada por excepción. Revisa los pendientes antes de liberar el cierre.", accepted_at: undefined, accepted_by: undefined } : {}),
  };
  await ctx.db.patch(activity._id, patch);
  if ((activity.progress === 100 && args.progress < 100)
    || (activity.progress > 0 && actual_start !== activity.actual_start)
    || (activityReleased(activity) && actual_finish !== activity.actual_finish)) await markCompletedSuccessors(ctx, activity, reason);
  await syncDetail(ctx, activity.detalle_id, reason, date);
  await bumpProgramVersion(ctx, activity.proyecto);
  await event(ctx, activity.proyecto, "progress", reason, { old_progress: activity.progress, progress: args.progress, old_actual_start: activity.actual_start, actual_start, old_actual_finish: activity.actual_finish, actual_finish, old_progress_as_of: activity.progress_as_of, progress_as_of: date, exception_id: exceptionId ?? null }, activity._id, date);
  return { success: true };
}
export const updateExecutionProgress = mutation({
  args: { activity_id: v.id("programa_obra_activities"), progress: v.number(), execution_date: v.string(), actual_start: v.optional(v.string()), actual_finish: v.optional(v.string()), reason: v.optional(v.string()) },
  handler: recordExecutionProgress,
});

export const requestExecutionException = mutation({
  args: { activity_id: v.id("programa_obra_activities"), progress: v.number(), execution_date: v.string(), actual_start: v.optional(v.string()), actual_finish: v.optional(v.string()), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx), activity = await activityDoc(ctx, args.activity_id); validateProgress(args.progress);
    const context = await executionContext(ctx, activity.proyecto);
    const { actual_start, actual_finish, progress_as_of: date, correctsKnownDates } = resolveProgressRecord(activity, args);
    const reason = textValue(args.reason);
    if (correctsKnownDates) await assertProgramCapability(ctx, activity.proyecto, "plan");
    if (!context.config?.enabled || args.progress <= activity.progress) throw new Error("La solicitud debe corresponder a un incremento válido en el programa activo.");
    const blockers = recordedProgressBlockers(activity, args.progress, { actual_start, actual_finish, progress_as_of: date }, context.activities, context.dependencies, context.requirements, context.calendar);
    if (!blockers.length) throw new Error("Este avance no necesita excepción.");
    const pending = await ctx.db.query("programa_obra_exceptions").withIndex("by_proyecto", (q) => q.eq("proyecto", activity.proyecto)).collect();
    if (pending.some((e) => e.activity_id === activity._id && e.status === "pending" && e.version === context.config!.version)) throw new Error("Ya existe una solicitud pendiente para esta actividad.");
    const id = await ctx.db.insert("programa_obra_exceptions", { proyecto: activity.proyecto, activity_id: activity._id, old_progress: activity.progress, progress: args.progress, execution_date: date, actual_start, actual_finish, reason, blockers_json: JSON.stringify(blockers), version: context.config.version, status: "pending", requested_by: user._id, requested_at: Date.now() });
    await event(ctx, activity.proyecto, "exception_requested", reason, { exception_id: id, blockers }, activity._id); return id;
  },
});
export const decideExecutionException = mutation({
  args: { exception_id: v.id("programa_obra_exceptions"), approve: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.exception_id); if (!request || request.status !== "pending") throw new Error("La solicitud ya fue atendida.");
    const user = await assertProgramCapability(ctx, request.proyecto, "exceptions"), reason = textValue(args.reason);
    if (args.approve) {
      await eligibleUser(ctx, request.proyecto, request.requested_by);
      const context = await executionContext(ctx, request.proyecto), activity = await activityDoc(ctx, request.activity_id);
      if (!context.config?.enabled || context.config.version !== request.version || activity.progress !== request.old_progress) throw new Error("El programa cambió; rechaza esta solicitud y pide un registro actualizado.");
      const dates = resolveProgressRecord(activity, request);
      const blockers = recordedProgressBlockers(activity, request.progress, dates, context.activities, context.dependencies, context.requirements, context.calendar);
      if (JSON.stringify(blockers) !== request.blockers_json) throw new Error("Los requisitos cambiaron; revisa una nueva solicitud.");
      if (dates.correctsKnownDates) await assertRequesterCanPlan(ctx, activity.proyecto, request.requested_by);
      await recordExecutionProgress(ctx, { activity_id: activity._id, progress: request.progress, execution_date: request.execution_date, actual_start: request.actual_start, actual_finish: request.actual_finish, reason: `Excepción autorizada: ${reason}. Solicitud: ${request.reason}` }, request._id);
    }
    await ctx.db.patch(request._id, { status: args.approve ? "approved" : "rejected", decided_by: user._id, decided_at: Date.now(), decision_reason: reason });
    await event(ctx, request.proyecto, "exception_decided", reason, { exception_id: request._id, approved: args.approve }, request.activity_id);
  },
});
export const acceptExecutionActivity = mutation({
  args: { activity_id: v.id("programa_obra_activities"), accept: v.boolean(), reason: v.string(), evidence: v.string() },
  handler: async (ctx, args) => {
    const activity = await activityDoc(ctx, args.activity_id), user = await assertProgramCapability(ctx, activity.proyecto, "accept"), reason = textValue(args.reason);
    if (activity.progress !== 100) throw new Error("La revisión técnica requiere 100 % de avance físico.");
    if (args.evidence.length > 2000) throw new Error("La evidencia supera 2000 caracteres.");
    if (args.accept && activity.review_incident) {
      const context = await executionContext(ctx, activity.proyecto);
      const blockers = activityBlockers({ ...activity, review_incident: undefined }, context.activities, context.dependencies, context.requirements, programToday(), context.calendar);
      if (blockers.length) throw new Error("Resuelve los requisitos y dependencias antes de volver a liberar.");
    }
    await ctx.db.patch(activity._id, { accepted_at: args.accept ? Date.now() : undefined, accepted_by: args.accept ? user._id : undefined, review_incident: args.accept ? undefined : "Revisión técnica rechazada; se requiere corregir o justificar el trabajo." });
    if (!args.accept) await markCompletedSuccessors(ctx, activity, reason);
    await bumpProgramVersion(ctx, activity.proyecto); await event(ctx, activity.proyecto, "technical_review", reason, { accepted: args.accept, evidence: args.evidence.trim() }, activity._id);
  },
});

const dateEdits = v.array(v.object({ activity_id: v.id("programa_obra_activities"), start: v.optional(v.string()), finish: v.optional(v.string()), forecast_finish: v.optional(v.string()) }));
export const previewExecutionReschedule = query({
  args: { proyecto: v.id("desarrollos"), edits: dateEdits },
  handler: async (ctx, args) => {
    await access(ctx, args.proyecto); const context = await executionContext(ctx, args.proyecto);
    if (!context.config) throw new Error("Prepara primero el programa por frentes.");
    try {
      return { ...proposeProgramDates(context.activities, context.dependencies, args.edits, context.calendar), version: context.config.version };
    } catch (error) {
      return { changes: [], problems: [{ activity_id: args.edits[0]?.activity_id ?? "", message: error instanceof Error ? error.message : "La propuesta no es válida." }], oldFinish: undefined, newFinish: undefined, version: context.config.version };
    }
  },
});
export const applyExecutionReschedule = mutation({
  args: { proyecto: v.id("desarrollos"), edits: dateEdits, version: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await assertProgramCapability(ctx, args.proyecto, "plan"), reason = textValue(args.reason), context = await executionContext(ctx, args.proyecto);
    if (!context.config || context.config.version !== args.version) throw new Error("La propuesta está desactualizada; vuelve a calcularla.");
    const proposal = proposeProgramDates(context.activities, context.dependencies, args.edits, context.calendar);
    if (proposal.problems.length || !proposal.changes.length) throw new Error("La propuesta tiene pendientes o no contiene cambios.");
    for (const change of proposal.changes) {
      const id = ctx.db.normalizeId("programa_obra_activities", change.activity_id); if (!id) throw new Error("La actividad no está disponible.");
      await ctx.db.patch(id, { current_start: change.start, current_finish: change.finish, forecast_finish: change.forecast_finish });
    }
    await ctx.db.insert("programa_obra_revisions", { proyecto: args.proyecto, kind: "reschedule", actor_id: user._id, created_at: Date.now(), reason, version: args.version, snapshot_json: JSON.stringify(proposal) });
    await bumpProgramVersion(ctx, args.proyecto); await event(ctx, args.proyecto, "rescheduled", reason, proposal);
    return proposal;
  },
});
export const archiveExecutionActivity = mutation({
  args: { activity_id: v.id("programa_obra_activities"), reason: v.string() },
  handler: async (ctx, args) => {
    const a = await activityDoc(ctx, args.activity_id); await assertProgramCapability(ctx, a.proyecto, "plan"); const context = await executionContext(ctx, a.proyecto), reason = textValue(args.reason);
    if (context.dependencies.some((d) => d.predecessor_id === a._id || d.successor_id === a._id) || context.requirements.some((r) => r.activity_id === a._id && r.blocking && !r.resolved)) throw new Error("Resuelve las dependencias y requisitos pendientes antes de archivar.");
    await ctx.db.patch(a._id, { archived: true });
    if (!context.activities.some((row) => row._id !== a._id && row.detalle_id === a.detalle_id && !row.archived)) await ctx.db.patch(a.detalle_id, { archived: true });
    await syncDetail(ctx, a.detalle_id, reason); await bumpProgramVersion(ctx, a.proyecto); await event(ctx, a.proyecto, "archived", reason, {}, a._id);
  },
});

/** Legacy routes never choose a front or bypass active execution rules. */
export async function updateLegacyExecutionProgress(ctx: MutationCtx, detalle: Doc<"programa_obra_detalle">, progress: number, date?: string, reason?: string, actual_start?: string, actual_finish?: string) {
  const activities = (await ctx.db.query("programa_obra_activities").withIndex("by_detalle", (q) => q.eq("detalle_id", detalle._id)).collect()).filter((a) => !a.archived);
  if (!activities.length) {
    const config = await ctx.db.query("programa_obra_config").withIndex("by_proyecto", (q) => q.eq("proyecto", detalle.proyecto)).unique();
    if (config?.enabled) throw new Error("Incorpora esta familia al programa por frentes antes de registrar avance.");
    return false;
  }
  if (activities.length !== 1) throw new Error("Selecciona el frente concreto en Actividades para registrar avance.");
  if (!date) throw new Error("Registra la fecha de ejecución en el detalle de la actividad.");
  await recordExecutionProgress(ctx, { activity_id: activities[0]._id, progress, execution_date: date, reason, actual_start, actual_finish }); return true;
}
