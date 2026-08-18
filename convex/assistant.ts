/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assistantAnswerSchema,
  assistantReferenceValidator,
  assistantStructuredOutputJsonSchema,
  combineOverallStatuses,
  conversationTitle,
  extractAssistantResponseText,
  METRIC_REFERENCES,
  normalizeAssistantSearch,
  selectAssistantFunctionCalls,
  validateReferenceRanges,
  type AssistantAnswer,
  type AssistantAnswerStatus,
  type AssistantEvidence,
  type AssistantOverallStatus,
  type AssistantReference,
} from "./assistantTypes";
import {
  canUserAccessDesarrollo,
  getCurrentUserOrThrow,
  hasAdminAccess,
} from "./permissions";
import { buildReportSnapshot, reportMetricCatalog } from "./reportSnapshot";
import { deterministicReportInsights } from "./reportInsights";
import { sanitizeReportText } from "./reportingUtils";
import {
  deterministicAssistantStatus,
  resolveAssistantCutoff,
  resolveAssistantProjectContext,
} from "./assistantRules";
import {
  buildCostItemReferenceId,
  canonicalTransactionStatus,
  compactCostText,
  inferCostGroupBy,
  inferCostPaymentScope,
  isCostIntent,
  mostSpecificCostLabel,
  normalizeCostCurrency,
  normalizeCostText,
  parseCostDate,
  parseCostItemReferenceId,
  resolveCostCandidates,
  resolveCostDateRange,
  type CostCandidate,
  type CostDimensionKind,
} from "./costRules";

const MAX_TOOL_CALLS = 4;
const MAX_PROJECTS = 3;
const MAX_TOOL_RESULTS = 50;
const MODEL = () => process.env.OPENAI_CHAT_MODEL || "gpt-5.6-terra";
const REASONING_EFFORT = () => process.env.OPENAI_CHAT_REASONING_EFFORT === "medium" ? "medium" : "low";

type AdminUser = Doc<"users">;
type ToolResult = {
  data: unknown;
  evidence: AssistantEvidence[];
  statuses?: AssistantOverallStatus[];
  answerStatuses?: AssistantAnswerStatus[];
  limitations?: string[];
  truncated?: boolean;
};

const toolArgsSchema = z.object({
  project_ids: z.array(z.string()).min(1).max(3),
  person_ids: z.array(z.string()).max(5).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.array(z.string()).max(8).optional(),
  priorities: z.array(z.string()).max(5).optional(),
  overdue_only: z.boolean().optional(),
  blocked_only: z.boolean().optional(),
  open_only: z.boolean().optional(),
  impact_only: z.boolean().optional(),
  due_within_range: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_TOOL_RESULTS).optional(),
}).strict();

const detailArgsSchema = z.object({
  entity_type: z.enum(["task", "requisition", "rfi"]),
  ids: z.array(z.string()).min(1).max(10),
}).strict();

const costToolArgsSchema = z.object({
  project_ids: z.array(z.string()).min(1).max(3),
  search: z.string().max(4000).nullable().optional(),
  cost_item_ids: z.array(z.string()).max(10).optional(),
  provider_ids: z.array(z.string()).max(10).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_scope: z.enum(["paid", "pending", "all"]),
  group_by: z.enum(["concept", "family", "partida", "provider", "none"]),
  limit: z.number().int().min(1).max(20),
}).strict();

function todayInMexicoCity() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseProjectDate(value?: string) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

function normalizeState(value?: string) {
  return normalizeAssistantSearch(value || "");
}

function taskIsActive(status: string) {
  const value = normalizeState(status);
  return !["completada", "completado", "cancelada", "cancelado"].includes(value);
}

function requisitionIsActive(requisition: Doc<"requisiciones">) {
  return normalizeState(requisition.status) !== "cancelado" &&
    normalizeState(requisition.status_entrega) !== "completo";
}

function rfiLabel(rfi: Doc<"rfis">) {
  const revision = rfi.revision_number > 0 ? `.R${rfi.revision_number}` : "";
  return `@${rfi.prefix}-${rfi.number}${revision}`;
}

function requisitionLabel(id: Id<"requisiciones">) {
  return `@REQ-${String(id).slice(-6).toUpperCase()}`;
}

function assertAdminUser(user: AdminUser | null): asserts user is AdminUser {
  if (!user || !hasAdminAccess(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
}

async function currentAdmin(ctx: Parameters<typeof getCurrentUserOrThrow>[0]) {
  const user = await getCurrentUserOrThrow(ctx);
  assertAdminUser(user);
  return user;
}

async function getUserBySubject(ctx: { db: any }, subject: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", subject))
    .first() as AdminUser | null;
}

async function assertProjectAccess(
  ctx: { db: any },
  user: AdminUser,
  projectId: Id<"desarrollos">,
) {
  const project = await ctx.db.get(projectId) as Doc<"desarrollos"> | null;
  if (!project || !canUserAccessDesarrollo(user, project)) {
    throw new Error("No tienes acceso al proyecto referenciado");
  }
  return project;
}

function normalizeId<Table extends "desarrollos" | "users" | "tareas" | "requisiciones" | "rfis" | "proveedores">(
  ctx: { db: any },
  table: Table,
  value: string,
) {
  const id = ctx.db.normalizeId(table, value);
  if (!id) throw new Error("La referencia contiene un identificador inválido");
  return id as Id<Table>;
}

function partidaDimensionLabel(
  partida: Doc<"partidas">,
  kind: Exclude<CostDimensionKind, "provider">,
) {
  if (kind === "concept") return String(partida.sub_partida || "").trim();
  if (kind === "family") return String(partida.familia || "").trim();
  return String(partida.nivel === 1 ? partida.nombre : partida.partida_nombre || "").trim();
}

async function validateReferences(
  ctx: { db: any },
  user: AdminUser,
  text: string,
  references: AssistantReference[],
) {
  const sorted = validateReferenceRanges(text, references);
  const projectIds = new Set<string>();
  for (const reference of sorted) {
    if (reference.type === "project") {
      const projectId = normalizeId(ctx, "desarrollos", reference.id);
      const project = await assertProjectAccess(ctx, user, projectId);
      if (reference.project_id !== String(projectId)) {
        throw new Error("La referencia de proyecto fue modificada");
      }
      if (reference.label !== `@${project.nombre}`) {
        throw new Error("La etiqueta de proyecto ya no coincide con el registro");
      }
      projectIds.add(String(projectId));
      continue;
    }

    const projectId = normalizeId(ctx, "desarrollos", reference.project_id);
    await assertProjectAccess(ctx, user, projectId);
    projectIds.add(String(projectId));

    if (reference.type === "person") {
      const personId = normalizeId(ctx, "users", reference.id);
      const person = await ctx.db.get(personId) as Doc<"users"> | null;
      if (!person || !canUserAccessDesarrollo(person, await ctx.db.get(projectId))) {
        throw new Error("La persona referenciada no pertenece al contexto disponible");
      }
      if (reference.label !== `@${person.name.trim()}`) {
        throw new Error("La etiqueta de persona ya no coincide con el registro");
      }
      continue;
    }

    if (reference.type === "metric") {
      const metric = METRIC_REFERENCES.find((item) => item.id === reference.id);
      if (!metric || reference.label !== metric.label) {
        throw new Error("El indicador referenciado no es válido");
      }
      continue;
    }

    if (reference.type === "provider") {
      const providerId = normalizeId(ctx, "proveedores", reference.id);
      const provider = await ctx.db.get(providerId) as Doc<"proveedores"> | null;
      const usedInProject = provider && await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto_proveedor", (q: any) =>
          q.eq("proyecto", projectId).eq("proveedor_id", providerId)
        )
        .first();
      if (!provider || !usedInProject || reference.label !== `@${provider.razon_social.trim()}`) {
        throw new Error("El proveedor referenciado no es válido para este proyecto");
      }
      continue;
    }

    if (reference.type === "cost_item") {
      const parsedCostItem = parseCostItemReferenceId(reference.id);
      if (!parsedCostItem) throw new Error("El concepto de costo referenciado no es válido");
      const partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q: any) => q.eq("proyecto", projectId))
        .collect() as Doc<"partidas">[];
      const labels = partidas
        .map((partida) => partidaDimensionLabel(partida, parsedCostItem.kind))
        .filter((label) => label && normalizeCostText(label) === parsedCostItem.normalized);
      if (parsedCostItem.kind === "concept") {
        const historical = await ctx.db
          .query("pagos")
          .withIndex("by_proyecto_concepto", (q: any) =>
            q.eq("proyecto_id", projectId).eq("concepto_normalizado", parsedCostItem.normalized)
          )
          .take(1);
        if (historical[0]?.concepto) labels.push(historical[0].concepto);
      }
      if (!labels.includes(reference.label.slice(1))) {
        throw new Error("El concepto de costo referenciado ya no coincide con el proyecto");
      }
      continue;
    }

    if (reference.type === "task") {
      const id = normalizeId(ctx, "tareas", reference.id);
      const entity = await ctx.db.get(id) as Doc<"tareas"> | null;
      if (!entity || entity.proyecto !== projectId || reference.label !== `@${entity.titulo}`) {
        throw new Error("La tarea referenciada no es válida para este proyecto");
      }
      continue;
    }

    if (reference.type === "requisition") {
      const id = normalizeId(ctx, "requisiciones", reference.id);
      const entity = await ctx.db.get(id) as Doc<"requisiciones"> | null;
      if (!entity || entity.proyecto !== projectId || reference.label !== requisitionLabel(id)) {
        throw new Error("La requisición referenciada no es válida para este proyecto");
      }
      continue;
    }

    const id = normalizeId(ctx, "rfis", reference.id);
    const entity = await ctx.db.get(id) as Doc<"rfis"> | null;
    if (!entity || entity.proyecto !== projectId || reference.label !== rfiLabel(entity)) {
      throw new Error("La RFI referenciada no es válida para este proyecto");
    }
  }
  if (projectIds.size > MAX_PROJECTS) {
    throw new Error("Puedes consultar hasta tres proyectos por mensaje");
  }
  return { references: sorted, explicitProjectIds: [...projectIds] };
}

function contextRequiredAnswer(): AssistantAnswer {
  return {
    schema_version: 2,
    answer_status: "insufficient_data",
    overall_status: "insufficient_data",
    summary: "Selecciona un proyecto con @Proyecto o abre el asistente desde la ruta de un proyecto antes de hacer una consulta factual.",
    metrics: [],
    risks: [],
    recommendations: [],
    evidence: [],
    follow_up_prompts: [
      "Dame el estado ejecutivo de @Proyecto",
      "¿Qué tareas, requisiciones o RFIs requieren atención esta semana?",
    ],
    limitations: ["No se estableció un proyecto autorizado para consultar."],
  };
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    "financial.approved_budget": "Presupuesto aprobado",
    "financial.accumulated_cost": "Gasto acumulado",
    "financial.balance": "Saldo presupuestal",
    "financial.exercised_percent": "Presupuesto ejercido",
    "financial.period_net_cashflow": "Flujo neto del periodo",
    "financial.pending_payments": "Pagos pendientes",
    "earned_value.cpi": "CPI",
    "earned_value.spi": "SPI",
    "earned_value.eac": "Estimación al término",
    "projection.actual_vs_projection_percent": "Desviación contra proyección",
    "requisitions.pending_review": "Requisiciones pendientes de revisión",
    "requisitions.overdue_deliveries": "Entregas vencidas",
    "program.delayed_activities": "Actividades atrasadas",
    "program.physical_progress_percent": "Avance físico",
    "program.planned_progress_percent": "Avance planeado",
    "logbook.incidents_in_period": "Incidencias de bitácora",
    "data_quality.score": "Calidad de datos",
  };
  return labels[key] || key;
}

function formatMetric(key: string, value: number | string, currency: string) {
  if (value === "N/D") return value;
  if (typeof value !== "number") return String(value);
  if (key.endsWith("_percent") || key === "data_quality.score") {
    return `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
  }
  if (key.startsWith("financial.") || key === "earned_value.eac" || key.startsWith("projection.actual_vs_projection")) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function assistantInstructions(asOf: string) {
  return `Eres el asistente de control de proyectos de OGC. Responde en español y sólo con datos de las herramientas y del contexto verificado. Fecha de corte: ${asOf}. Conserva el periodo predeterminado salvo que el usuario haya escrito fechas inequívocas; no elijas otro periodo por tu cuenta. La consulta es estrictamente de lectura. Para gasto realizado usa exclusivamente query_project_costs con payment_scope=paid; las requisiciones representan solicitudes o compromisos y nunca prueban un gasto. No sumes monedas distintas ni apliques tipo de cambio por tu cuenta. No evalúes el desempeño de personas; sólo enumera pendientes asociados. No inventes cifras, riesgos ni hechos. Cada indicador, riesgo y recomendación debe citar uno o más evidence_ids exactos disponibles. Si una cifra no existe, declárala como limitación. answer_status describe si la pregunta fue respondida; overall_status describe únicamente la salud determinista del proyecto cuando exista ese contexto. Prioriza una conclusión breve, indicadores, riesgos y próximos pasos. Genera como máximo tres preguntas de seguimiento editables. No uses conocimiento externo ni sugieras haber modificado registros.`;
}

const toolDefinitions = [
  {
    type: "function",
    name: "get_project_overview",
    description: "Obtiene estado ejecutivo determinista, finanzas, avance, valor ganado, flujo, bitácora, calidad y pendientes agregados de hasta tres proyectos.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["project_ids"],
      properties: {
        project_ids: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
        person_ids: { type: "array", maxItems: 5, items: { type: "string" } },
        date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        status: { type: "array", maxItems: 8, items: { type: "string" } },
        priorities: { type: "array", maxItems: 5, items: { type: "string" } },
        overdue_only: { type: "boolean" },
        blocked_only: { type: "boolean" },
        open_only: { type: "boolean" },
        impact_only: { type: "boolean" },
        due_within_range: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    type: "function",
    name: "query_project_costs",
    description: "Consulta gasto pagado, compromisos pendientes o ambos por concepto, familia, partida o proveedor. Devuelve agregados por moneda y nunca expone transacciones ni datos bancarios individuales.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "project_ids",
        "search",
        "cost_item_ids",
        "provider_ids",
        "date_from",
        "date_to",
        "payment_scope",
        "group_by",
        "limit",
      ],
      properties: {
        project_ids: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
        search: { type: ["string", "null"], maxLength: 4000 },
        cost_item_ids: { type: "array", maxItems: 10, items: { type: "string" } },
        provider_ids: { type: "array", maxItems: 10, items: { type: "string" } },
        date_from: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        payment_scope: { type: "string", enum: ["paid", "pending", "all"] },
        group_by: { type: "string", enum: ["concept", "family", "partida", "provider", "none"] },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  },
  ...(["list_tasks", "list_requisitions", "list_rfis"] as const).map((name) => ({
    type: "function",
    name,
    description: name === "list_tasks"
      ? "Lista tareas acotadas, incluidas activas, bloqueadas, urgentes, vencidas o asociadas a personas."
      : name === "list_requisitions"
        ? "Lista requisiciones acotadas, incluidas pendientes de revisión, pago, entrega o vencidas."
        : "Lista RFIs acotadas, incluidas abiertas, vencidas y con impactos registrados.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["project_ids"],
      properties: {
        project_ids: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
        person_ids: { type: "array", maxItems: 5, items: { type: "string" } },
        date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        status: { type: "array", maxItems: 8, items: { type: "string" } },
        priorities: { type: "array", maxItems: 5, items: { type: "string" } },
        overdue_only: { type: "boolean" },
        blocked_only: { type: "boolean" },
        open_only: { type: "boolean" },
        impact_only: { type: "boolean" },
        due_within_range: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  })),
  {
    type: "function",
    name: "get_entity_detail",
    description: "Obtiene el detalle verificable y acotado de tareas, requisiciones o RFIs referenciadas.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["entity_type", "ids"],
      properties: {
        entity_type: { type: "string", enum: ["task", "requisition", "rfi"] },
        ids: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
      },
    },
  },
] as const;

function sanitizeAnswer(
  answer: AssistantAnswer,
  evidence: AssistantEvidence[],
  statuses: AssistantOverallStatus[],
  answerStatuses: AssistantAnswerStatus[],
) {
  const canonical = new Map(evidence.map((item) => [item.id, item]));
  const keepIds = (ids: string[]) => [...new Set(ids.filter((id) => canonical.has(id)))].slice(0, 5);
  const canonicalMetricValue = (ids: string[], fallback: string) => {
    const entries = ids
      .map((id) => canonical.get(id))
      .filter((item): item is AssistantEvidence & { observed_value: string } => Boolean(item?.observed_value));
    const values = entries.map((item) => `${item.label}: ${item.observed_value}`);
    if (entries.length === 1) return entries[0].observed_value.slice(0, 160);
    return values.length ? values.join(" · ").slice(0, 160) : fallback;
  };
  const metrics = answer.metrics
    .map((item) => ({ ...item, evidence_ids: keepIds(item.evidence_ids) }))
    .filter((item) => item.evidence_ids.length > 0)
    .map((item) => ({
      ...item,
      value: canonicalMetricValue(item.evidence_ids, item.value),
    }));
  const sanitized: AssistantAnswer = {
    ...answer,
    schema_version: 2,
    answer_status: answerStatuses.includes("insufficient_data")
      ? "insufficient_data"
      : answerStatuses.includes("ambiguous")
        ? "ambiguous"
        : answerStatuses.includes("partial")
          ? "partial"
          : answerStatuses.includes("answered")
            ? "answered"
            : canonical.size
              ? answer.answer_status
              : "insufficient_data",
    // Project health is deterministic and separate from answerability. Cost
    // tools intentionally return no project-health status.
    overall_status: statuses.length ? combineOverallStatuses(statuses) : "on_track",
    metrics,
    risks: answer.risks.map((item) => ({ ...item, evidence_ids: keepIds(item.evidence_ids) }))
      .filter((item) => item.evidence_ids.length > 0),
    recommendations: answer.recommendations.map((item) => ({ ...item, evidence_ids: keepIds(item.evidence_ids) }))
      .filter((item) => item.evidence_ids.length > 0),
    evidence: [...canonical.values()].slice(0, 30),
    follow_up_prompts: answer.follow_up_prompts.slice(0, 3),
    limitations: answer.limitations.slice(0, 5),
  };
  return assistantAnswerSchema.parse(sanitized);
}

async function stableSafetyIdentifier(subject: string) {
  const bytes = new TextEncoder().encode(`ogc-project-assistant:${subject}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function callOpenAI(body: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Falta configurar OPENAI_API_KEY"), { code: "missing_api_key" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = (payload as any)?.error?.message || `OpenAI respondió ${response.status}`;
      throw Object.assign(new Error(message), { code: `openai_${response.status}` });
    }
    return payload as any;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw Object.assign(new Error("La consulta a OpenAI excedió el tiempo límite"), { code: "timeout" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const listConversations = query({
  args: { include_archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await currentAdmin(ctx);
    const rows = await ctx.db.query("assistant_conversations")
      .withIndex("by_owner_updated", (q) => q.eq("owner_user_id", user._id))
      .order("desc")
      .take(100);
    return args.include_archived ? rows : rows.filter((row) => row.archived_at === undefined);
  },
});

export const getMessages = query({
  args: { conversation_id: v.id("assistant_conversations") },
  handler: async (ctx, args) => {
    const user = await currentAdmin(ctx);
    const conversation = await ctx.db.get(args.conversation_id);
    if (!conversation || conversation.owner_user_id !== user._id) throw new Error("Conversación no encontrada");
    return await ctx.db.query("assistant_messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversation_id", args.conversation_id))
      .order("asc")
      .collect();
  },
});

export const archiveConversation = mutation({
  args: { conversation_id: v.id("assistant_conversations"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await currentAdmin(ctx);
    const conversation = await ctx.db.get(args.conversation_id);
    if (!conversation || conversation.owner_user_id !== user._id) throw new Error("Conversación no encontrada");
    await ctx.db.patch(args.conversation_id, {
      archived_at: args.archived ? Date.now() : undefined,
      updated_at: Date.now(),
    });
  },
});

export const searchReferences = query({
  args: {
    query: v.string(),
    project_ids: v.optional(v.array(v.id("desarrollos"))),
  },
  handler: async (ctx, args) => {
    const user = await currentAdmin(ctx);
    const search = normalizeAssistantSearch(args.query);
    const allProjects = await ctx.db.query("desarrollos").collect();
    const accessible = allProjects.filter((project) => canUserAccessDesarrollo(user, project));
    const requested = args.project_ids?.slice(0, MAX_PROJECTS) || [];
    const contextProjects = requested.length
      ? accessible.filter((project) => requested.includes(project._id))
      : [];
    if (requested.length !== contextProjects.length) throw new Error("Proyecto no autorizado");

    const results: Array<{
      type: AssistantReference["type"];
      id: string;
      project_id: string;
      label: string;
      subtitle: string;
      url: string;
    }> = [];
    for (const project of accessible) {
      if (!search || normalizeAssistantSearch(project.nombre).includes(search)) {
        results.push({
          type: "project",
          id: String(project._id),
          project_id: String(project._id),
          label: `@${project.nombre}`,
          subtitle: "Proyecto",
          url: `/proyecto/${project._id}/control`,
        });
      }
    }

    if (contextProjects.length) {
      const people = await ctx.db.query("users").collect();
      for (const project of contextProjects) {
        for (const person of people) {
          if (!person.name.trim() || !canUserAccessDesarrollo(person, project)) continue;
          if (!search || normalizeAssistantSearch(person.name).includes(search)) {
            results.push({
              type: "person",
              id: String(person._id),
              project_id: String(project._id),
              label: `@${person.name.trim()}`,
              subtitle: `Persona · ${project.nombre}`,
              url: `/tareas?proyecto=${project._id}`,
            });
          }
        }
        for (const metric of METRIC_REFERENCES) {
          if (!search || normalizeAssistantSearch(`${metric.label} ${metric.subtitle}`).includes(search)) {
            results.push({
              type: "metric",
              id: metric.id,
              project_id: String(project._id),
              label: metric.label,
              subtitle: `${metric.subtitle} · ${project.nombre}`,
              url: `/proyecto/${project._id}/reportes`,
            });
          }
        }

        const [partidas, transactions, tracedPayments] = await Promise.all([
          ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", project._id)).collect(),
          ctx.db.query("transacciones").withIndex("by_proyecto", (q) => q.eq("proyecto", project._id)).collect(),
          ctx.db.query("pagos").withIndex("by_proyecto", (q) => q.eq("proyecto_id", project._id)).take(500),
        ]);
        const costIdentities = new Set<string>();
        const addCostSuggestion = (
          kind: Exclude<CostDimensionKind, "provider">,
          labelValue: string,
          subtitle: string,
        ) => {
          const label = labelValue.trim();
          if (!label || (search && !normalizeAssistantSearch(label).includes(search))) return;
          const id = buildCostItemReferenceId(kind, label);
          if (costIdentities.has(id)) return;
          costIdentities.add(id);
          results.push({
            type: "cost_item",
            id,
            project_id: String(project._id),
            label: `@${label}`,
            subtitle: `${subtitle} · ${project.nombre}`,
            url: `/proyecto/${project._id}/transacciones?concepto=${encodeURIComponent(label)}`,
          });
        };
        for (const partida of partidas) {
          if (partida.nivel === 3 && partida.sub_partida) {
            addCostSuggestion("concept", partida.sub_partida, "Concepto");
          } else if (partida.nivel === 2 && partida.familia) {
            addCostSuggestion("family", partida.familia, "Familia de costo");
          } else if (partida.nivel === 1 && partida.nombre) {
            addCostSuggestion("partida", partida.nombre, "Partida");
          }
        }
        for (const payment of tracedPayments) {
          if (payment.concepto) addCostSuggestion("concept", payment.concepto, "Concepto histórico");
        }

        const providerIds = [...new Set(
          transactions.flatMap((transaction) => transaction.proveedor_id ? [transaction.proveedor_id] : []),
        )];
        const providers = await Promise.all(providerIds.map((id) => ctx.db.get(id)));
        for (const provider of providers) {
          if (!provider || (search && !normalizeAssistantSearch(provider.razon_social).includes(search))) continue;
          results.push({
            type: "provider",
            id: String(provider._id),
            project_id: String(project._id),
            label: `@${provider.razon_social.trim()}`,
            subtitle: `Proveedor${provider.archived_at ? " archivado" : ""} · ${project.nombre}`,
            url: `/proyecto/${project._id}/transacciones?proveedor=${provider._id}`,
          });
        }
      }
    }

    const entityProjects = contextProjects.length
      ? contextProjects
      : search.length >= 2 ? accessible.slice(0, 20) : [];
    for (const project of entityProjects) {
      const [tasks, requisitions, rfis] = await Promise.all([
        ctx.db.query("tareas").withIndex("by_proyecto", (q) => q.eq("proyecto", project._id)).collect(),
        ctx.db.query("requisiciones").withIndex("by_proyecto", (q) => q.eq("proyecto", project._id)).collect(),
        ctx.db.query("rfis").withIndex("by_proyecto", (q) => q.eq("proyecto", project._id)).collect(),
      ]);
      for (const task of tasks) {
        if (!search || normalizeAssistantSearch(task.titulo).includes(search)) results.push({
          type: "task", id: String(task._id), project_id: String(project._id), label: `@${task.titulo}`,
          subtitle: `Tarea · ${project.nombre}`, url: `/tareas?proyecto=${project._id}&tarea=${task._id}`,
        });
      }
      for (const requisition of requisitions) {
        const searchable = `${requisitionLabel(requisition._id)} ${requisition.descripcion || ""}`;
        if (!search || normalizeAssistantSearch(searchable).includes(search)) results.push({
          type: "requisition", id: String(requisition._id), project_id: String(project._id), label: requisitionLabel(requisition._id),
          subtitle: `Requisición · ${project.nombre}`, url: `/proyecto/${project._id}/requisiciones?requisicion=${requisition._id}`,
        });
      }
      for (const rfi of rfis) {
        if (!search || normalizeAssistantSearch(`${rfiLabel(rfi)} ${rfi.subject}`).includes(search)) results.push({
          type: "rfi", id: String(rfi._id), project_id: String(project._id), label: rfiLabel(rfi),
          subtitle: `RFI · ${project.nombre} · ${rfi.subject}`, url: `/proyecto/${project._id}/rfis/${rfi._id}`,
        });
      }
    }

    const groupOrder = ["project", "cost_item", "provider", "person", "metric", "task", "requisition", "rfi"];
    const queues = new Map(groupOrder.map((type) => [type, results.filter((item) => item.type === type)]));
    const selected: typeof results = [];
    while (selected.length < 8 && [...queues.values()].some((items) => items.length > 0)) {
      for (const type of groupOrder) {
        const item = queues.get(type)?.shift();
        if (item) selected.push(item);
        if (selected.length === 8) break;
      }
    }
    return selected.sort((a, b) => groupOrder.indexOf(a.type) - groupOrder.indexOf(b.type));
  },
});

export const resolveActor = internalQuery({
  args: { clerk_subject: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserBySubject(ctx, args.clerk_subject);
    assertAdminUser(user);
    return { user_id: user._id };
  },
});

export const prepareMessage = internalMutation({
  args: {
    owner_user_id: v.id("users"),
    conversation_id: v.optional(v.id("assistant_conversations")),
    text: v.string(),
    references: v.array(assistantReferenceValidator),
    route_project_id: v.optional(v.id("desarrollos")),
    client_request_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.owner_user_id);
    assertAdminUser(user);
    const text = args.text;
    if (!text.trim()) throw new Error("Escribe una pregunta antes de enviarla");
    if (!args.client_request_id.trim() || args.client_request_id.length > 120) throw new Error("client_request_id no es válido");

    const duplicate = await ctx.db.query("assistant_messages")
      .withIndex("by_owner_request", (q) => q.eq("owner_user_id", user._id).eq("client_request_id", args.client_request_id))
      .first();
    if (duplicate) {
      const reply = await ctx.db.query("assistant_messages")
        .withIndex("by_reply", (q) => q.eq("reply_to_message_id", duplicate._id))
        .first();
      return {
        duplicate: true,
        conversation_id: duplicate.conversation_id,
        user_message_id: duplicate._id,
        assistant_message_id: reply?._id,
        context_project_ids: [] as Id<"desarrollos">[],
      };
    }

    const validated = await validateReferences(ctx, user, text, args.references);
    const contextIds = resolveAssistantProjectContext(
      validated.references,
      args.route_project_id ? String(args.route_project_id) : undefined,
    ).map((id) => normalizeId(ctx, "desarrollos", id));
    for (const projectId of contextIds) await assertProjectAccess(ctx, user, projectId);
    if (contextIds.length > MAX_PROJECTS) throw new Error("Puedes consultar hasta tres proyectos por mensaje");

    const now = Date.now();
    let conversationId = args.conversation_id;
    if (conversationId) {
      const existing = await ctx.db.get(conversationId);
      if (!existing || existing.owner_user_id !== user._id) throw new Error("Conversación no encontrada");
      if (existing.archived_at !== undefined) throw new Error("La conversación está archivada");
      await ctx.db.patch(conversationId, { project_ids: contextIds, updated_at: now });
    } else {
      conversationId = await ctx.db.insert("assistant_conversations", {
        owner_user_id: user._id,
        title: conversationTitle(text),
        project_ids: contextIds,
        created_at: now,
        updated_at: now,
      });
    }
    const userMessageId = await ctx.db.insert("assistant_messages", {
      conversation_id: conversationId,
      owner_user_id: user._id,
      role: "user",
      content: text,
      references: validated.references,
      status: "complete",
      client_request_id: args.client_request_id,
      created_at: now,
    });
    const assistantMessageId = await ctx.db.insert("assistant_messages", {
      conversation_id: conversationId,
      owner_user_id: user._id,
      role: "assistant",
      content: "",
      references: [],
      status: "pending",
      reply_to_message_id: userMessageId,
      created_at: now + 1,
    });
    return {
      duplicate: false,
      conversation_id: conversationId,
      user_message_id: userMessageId,
      assistant_message_id: assistantMessageId,
      context_project_ids: contextIds,
    };
  },
});

export const recentHistory = internalQuery({
  args: { owner_user_id: v.id("users"), conversation_id: v.id("assistant_conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversation_id);
    if (!conversation || conversation.owner_user_id !== args.owner_user_id) throw new Error("Conversación no encontrada");
    const rows = await ctx.db.query("assistant_messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversation_id", args.conversation_id))
      .order("desc")
      .take(30);
    return rows.filter((row) => row.status === "complete").slice(0, 12).reverse();
  },
});

export const completeMessage = internalMutation({
  args: {
    assistant_message_id: v.id("assistant_messages"),
    answer: v.any(),
    model: v.optional(v.string()),
    response_id: v.optional(v.string()),
    input_tokens: v.optional(v.number()),
    output_tokens: v.optional(v.number()),
    tool_names: v.array(v.string()),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.assistant_message_id);
    if (!message || message.role !== "assistant") throw new Error("Mensaje no encontrado");
    const answer = assistantAnswerSchema.parse(args.answer);
    await ctx.db.patch(args.assistant_message_id, {
      answer,
      content: answer.summary,
      status: "complete",
      model: args.model,
      response_id: args.response_id,
      input_tokens: args.input_tokens,
      output_tokens: args.output_tokens,
      tool_names: args.tool_names,
      duration_ms: args.duration_ms,
      error: undefined,
      error_code: undefined,
    });
    await ctx.db.patch(message.conversation_id, { updated_at: Date.now() });
    return answer;
  },
});

export const failMessage = internalMutation({
  args: {
    assistant_message_id: v.id("assistant_messages"),
    error: v.string(),
    error_code: v.string(),
    model: v.optional(v.string()),
    duration_ms: v.number(),
    tool_names: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.assistant_message_id);
    if (!message || message.role !== "assistant") return;
    await ctx.db.patch(args.assistant_message_id, {
      status: "failed",
      error: args.error.slice(0, 500),
      error_code: args.error_code.slice(0, 80),
      model: args.model,
      duration_ms: args.duration_ms,
      tool_names: args.tool_names,
    });
    await ctx.db.patch(message.conversation_id, { updated_at: Date.now() });
  },
});

const MAX_COST_TRANSACTIONS = 1_000;
const MAX_COST_LINE_ITEMS = 10_000;

type SafeCostLine = {
  transaction_id: string;
  amount: number;
  currency: string;
  payment_status: "paid" | "pending";
  date: string;
  provider_key: string;
  provider_label: string;
  concept: string;
  family: string;
  partida: string;
  concept_id?: string;
  family_id?: string;
  partida_id?: string;
  classification_status: "mapped" | "custom" | "unresolved";
};

function costCandidateId(kind: CostDimensionKind, label: string, providerKey?: string) {
  return kind === "provider"
    ? `provider:${providerKey || encodeURIComponent(normalizeCostText(label))}`
    : buildCostItemReferenceId(kind, label);
}

function formatCostAmount(amount: number, currency: string) {
  if (currency === "SIN_MONEDA") {
    return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(amount)} (moneda no registrada)`;
  }
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function costEvidenceUrl(args: {
  projectId: string;
  label?: string;
  providerId?: string;
  scope: "paid" | "pending" | "all";
  currency?: string;
  dateFrom?: string | null;
  dateTo: string;
}) {
  const params = new URLSearchParams();
  if (args.label) params.set("concepto", args.label);
  if (args.providerId) params.set("proveedor", args.providerId);
  if (args.scope !== "all") params.set("status", args.scope === "paid" ? "Pagado" : "Por pagar");
  if (args.currency && args.currency !== "SIN_MONEDA") params.set("moneda", args.currency);
  if (args.dateFrom) params.set("desde", args.dateFrom);
  params.set("hasta", args.dateTo);
  return `/proyecto/${args.projectId}/transacciones?${params.toString()}`;
}

async function executeCostTool(args: {
  ctx: any;
  user: AdminUser;
  parsed: z.infer<typeof costToolArgsSchema>;
  allowedProjectIds: Set<string>;
  allowedCostItemIds: Set<string>;
  allowedProviderIds: Set<string>;
}): Promise<ToolResult> {
  const { ctx, user, parsed, allowedProjectIds, allowedCostItemIds, allowedProviderIds } = args;
  const projectIds = parsed.project_ids.map((id) => normalizeId(ctx, "desarrollos", id));
  if (projectIds.some((id) => !allowedProjectIds.has(String(id)))) {
    throw new Error("La herramienta intentó consultar un proyecto fuera del contexto");
  }
  if ((parsed.cost_item_ids || []).some((id) => !allowedCostItemIds.has(id))) {
    throw new Error("La herramienta intentó usar un concepto que no fue referenciado");
  }
  if ((parsed.provider_ids || []).some((id) => !allowedProviderIds.has(id))) {
    throw new Error("La herramienta intentó usar un proveedor que no fue referenciado");
  }
  if (parsed.date_from && parsed.date_from > parsed.date_to) throw new Error("El rango de fechas no es válido");

  const projects: unknown[] = [];
  const evidence: AssistantEvidence[] = [];
  const limitations: string[] = [];
  const answerStatuses: AssistantAnswerStatus[] = [];

  for (const projectId of projectIds) {
    const project = await assertProjectAccess(ctx, user, projectId);
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", projectId))
      .take(MAX_COST_TRANSACTIONS + 1) as Doc<"transacciones">[];
    if (transactions.length > MAX_COST_TRANSACTIONS) {
      projects.push({
        project_id: String(projectId),
        project_name: project.nombre,
        resolution: { status: "capacity_exceeded", matches: [], suggestions: [] },
        totals: [],
        breakdown: [],
        quality: { capacity_exceeded: true },
      });
      limitations.push(`${project.nombre}: la consulta supera ${MAX_COST_TRANSACTIONS.toLocaleString("es-MX")} transacciones; no se calculó un total parcial.`);
      answerStatuses.push("insufficient_data");
      continue;
    }

    const paymentGroups = await Promise.all(transactions.map((transaction) =>
      ctx.db.query("pagos")
        .withIndex("by_transaccion", (q: any) => q.eq("transaccion_id", transaction._id))
        .collect() as Promise<Doc<"pagos">[]>
    ));
    const payments = paymentGroups.flat();
    if (payments.length > MAX_COST_LINE_ITEMS) {
      projects.push({
        project_id: String(projectId),
        project_name: project.nombre,
        resolution: { status: "capacity_exceeded", matches: [], suggestions: [] },
        totals: [],
        breakdown: [],
        quality: { capacity_exceeded: true },
      });
      limitations.push(`${project.nombre}: la consulta supera ${MAX_COST_LINE_ITEMS.toLocaleString("es-MX")} conceptos; no se calculó un total parcial.`);
      answerStatuses.push("insufficient_data");
      continue;
    }

    const [projectPartidas, providerDocs, referencedPartidas] = await Promise.all([
      ctx.db.query("partidas").withIndex("by_proyecto", (q: any) => q.eq("proyecto", projectId)).collect() as Promise<Doc<"partidas">[]>,
      Promise.all([...new Set(transactions.flatMap((transaction) => transaction.proveedor_id ? [transaction.proveedor_id] : []))]
        .map((id) => ctx.db.get(id))) as Promise<Array<Doc<"proveedores"> | null>>,
      Promise.all([...new Set(payments.flatMap((payment) => payment.partida_id ? [payment.partida_id] : []))]
        .map((id) => ctx.db.get(id))) as Promise<Array<Doc<"partidas"> | null>>,
    ]);
    const providerById = new Map(
      providerDocs.filter((provider): provider is Doc<"proveedores"> => Boolean(provider))
        .map((provider) => [String(provider._id), provider]),
    );
    const partidaById = new Map(
      referencedPartidas.filter((partida): partida is Doc<"partidas"> => Boolean(partida))
        .map((partida) => [String(partida._id), partida]),
    );
    const transactionById = new Map(transactions.map((transaction) => [String(transaction._id), transaction]));
    const paymentSumByTransaction = new Map<string, number>();
    const lines: SafeCostLine[] = [];
    const quality = {
      invalid_dates: 0,
      noncanonical_statuses: 0,
      transactions_without_payments: 0,
      total_mismatches: 0,
      cross_project_partidas: 0,
      missing_partidas: 0,
      unresolved_line_items: 0,
      negative_adjustments: 0,
      unclassified_amount_by_currency: {} as Record<string, number>,
      reconciliation_delta_by_currency: {} as Record<string, number>,
    };

    for (const [index, transaction] of transactions.entries()) {
      const transactionPayments = paymentGroups[index];
      if (!transactionPayments.length) quality.transactions_without_payments += 1;
      const lineTotal = transactionPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
      paymentSumByTransaction.set(String(transaction._id), lineTotal);
      const delta = Math.round((Number(transaction.monto_total || 0) - lineTotal) * 100) / 100;
      const currency = normalizeCostCurrency(transaction.moneda);
      if (Math.abs(delta) > 0.01) {
        quality.total_mismatches += 1;
        quality.reconciliation_delta_by_currency[currency] =
          (quality.reconciliation_delta_by_currency[currency] || 0) + delta;
      }
      if (!parseCostDate(transaction.fecha)) quality.invalid_dates += 1;
      if (canonicalTransactionStatus(transaction.status) === "other") quality.noncanonical_statuses += 1;
    }

    for (const payment of payments) {
      const transaction = transactionById.get(String(payment.transaccion_id));
      if (!transaction) continue;
      const paymentStatus = canonicalTransactionStatus(transaction.status);
      const date = parseCostDate(transaction.fecha);
      if (paymentStatus === "other" || !date) continue;
      const partida = payment.partida_id ? partidaById.get(String(payment.partida_id)) : undefined;
      if (payment.partida_id && !partida) quality.missing_partidas += 1;
      if (partida && partida.proyecto !== projectId) quality.cross_project_partidas += 1;
      const partidaLabel = String(
        payment.partida_nombre_snapshot ||
        (partida ? (partida.nivel === 1 ? partida.nombre : partida.partida_nombre || partida.nombre) : "") ||
        "Sin partida",
      ).trim();
      const family = String(payment.familia_snapshot || partida?.familia || "Sin familia").trim();
      const subPartida = String(payment.sub_partida_snapshot || partida?.sub_partida || "").trim();
      const concept = String(payment.concepto || mostSpecificCostLabel({
        sub_partida: subPartida,
        familia: family,
        partida: partidaLabel,
      })).trim();
      const provider = transaction.proveedor_id
        ? providerById.get(String(transaction.proveedor_id))
        : undefined;
      const providerLabel = String(provider?.razon_social || transaction.proveedor || "Sin proveedor").trim();
      const providerKey = transaction.proveedor_id
        ? String(transaction.proveedor_id)
        : `legacy:${encodeURIComponent(normalizeCostText(providerLabel))}`;
      const classification = payment.classification_status ||
        (partida && partida.proyecto === projectId ? "mapped" : concept && concept !== "Concepto sin clasificar" ? "custom" : "unresolved");
      const hasSpecificConcept = Boolean(subPartida) || classification === "custom" ||
        (Boolean(payment.concepto) && normalizeCostText(concept) !== normalizeCostText(family));
      if (classification === "unresolved") quality.unresolved_line_items += 1;
      if (payment.monto < 0) quality.negative_adjustments += 1;
      lines.push({
        transaction_id: String(transaction._id),
        amount: Number(payment.monto || 0),
        currency: normalizeCostCurrency(transaction.moneda),
        payment_status: paymentStatus,
        date,
        provider_key: providerKey,
        provider_label: providerLabel,
        concept,
        family,
        partida: partidaLabel,
        concept_id: hasSpecificConcept ? buildCostItemReferenceId("concept", concept) : undefined,
        family_id: buildCostItemReferenceId("family", family),
        partida_id: buildCostItemReferenceId("partida", partidaLabel),
        classification_status: classification,
      });
    }

    const candidateMap = new Map<string, CostCandidate>();
    const addCandidate = (candidate: CostCandidate) => {
      if (candidate.label.trim()) candidateMap.set(candidate.id, candidate);
    };
    for (const partida of projectPartidas) {
      if (partida.sub_partida) addCandidate({ id: buildCostItemReferenceId("concept", partida.sub_partida), kind: "concept", label: partida.sub_partida });
      if (partida.familia) addCandidate({ id: buildCostItemReferenceId("family", partida.familia), kind: "family", label: partida.familia });
      const parent = String(partida.nivel === 1 ? partida.nombre : partida.partida_nombre || "").trim();
      if (parent) addCandidate({ id: buildCostItemReferenceId("partida", parent), kind: "partida", label: parent });
    }
    for (const line of lines) {
      if (line.concept_id) addCandidate({ id: line.concept_id, kind: "concept", label: line.concept });
      addCandidate({ id: line.family_id!, kind: "family", label: line.family });
      addCandidate({ id: line.partida_id!, kind: "partida", label: line.partida });
      addCandidate({ id: costCandidateId("provider", line.provider_label, line.provider_key), kind: "provider", label: line.provider_label });
    }

    const explicitCostIds = new Set(parsed.cost_item_ids || []);
    const explicitProviderIds = new Set(parsed.provider_ids || []);
    let resolvedCostIds = new Set(explicitCostIds);
    let resolvedProviderKeys = new Set([...explicitProviderIds]);
    let resolution: {
      status: "exact" | "ambiguous" | "not_found" | "all";
      matches: Array<{ id: string; kind: CostDimensionKind; label: string }>;
      suggestions: Array<{ id: string; kind: CostDimensionKind; label: string }>;
    } = { status: "all", matches: [], suggestions: [] };

    if (!explicitCostIds.size && !explicitProviderIds.size && parsed.search?.trim()) {
      const preferredKind = parsed.group_by === "none" ? undefined : parsed.group_by;
      const candidates = [...candidateMap.values()].filter((candidate) =>
        !preferredKind || candidate.kind === preferredKind
      );
      const resolved = resolveCostCandidates(parsed.search, candidates);
      resolution = {
        status: resolved.status,
        matches: resolved.matches.map(({ id, kind, label }) => ({ id, kind, label })),
        suggestions: resolved.suggestions.map(({ id, kind, label }) => ({ id, kind, label })),
      };
      if (resolved.status === "exact") {
        resolvedCostIds = new Set(resolved.matches.filter((item) => item.kind !== "provider").map((item) => item.id));
        resolvedProviderKeys = new Set(resolved.matches
          .filter((item) => item.kind === "provider")
          .map((item) => item.id.slice("provider:".length)));
      }
    } else if (explicitCostIds.size || explicitProviderIds.size) {
      const matches = [
        ...[...explicitCostIds].flatMap((id) => candidateMap.has(id) ? [candidateMap.get(id)!] : []),
        ...[...explicitProviderIds].flatMap((id) => {
          const candidate = candidateMap.get(`provider:${id}`);
          return candidate ? [candidate] : [];
        }),
      ];
      resolution = {
        status: matches.length === explicitCostIds.size + explicitProviderIds.size ? "exact" : "not_found",
        matches: matches.map(({ id, kind, label }) => ({ id, kind, label })),
        suggestions: [],
      };
    }

    if (resolution.status === "ambiguous" || resolution.status === "not_found") {
      projects.push({
        project_id: String(projectId),
        project_name: project.nombre,
        resolution,
        period: { date_from: parsed.date_from || null, date_to: parsed.date_to },
        payment_scope: parsed.payment_scope,
        totals: [],
        breakdown: [],
        quality,
      });
      answerStatuses.push(resolution.status === "ambiguous" ? "ambiguous" : "insufficient_data");
      limitations.push(resolution.status === "ambiguous"
        ? `${project.nombre}: el término coincide con más de una dimensión; selecciona una referencia @ específica.`
        : `${project.nombre}: no se encontró un concepto o proveedor verificable para la consulta.`);
      continue;
    }

    const statusAllowed = (status: "paid" | "pending") =>
      parsed.payment_scope === "all" || parsed.payment_scope === status;
    const dateAllowed = (date: string) =>
      date <= parsed.date_to && (!parsed.date_from || date >= parsed.date_from);
    const lineMatchesCost = (line: SafeCostLine) => !resolvedCostIds.size ||
      [line.concept_id, line.family_id, line.partida_id].some((id) => id && resolvedCostIds.has(id));
    const lineMatchesProvider = (line: SafeCostLine) => !resolvedProviderKeys.size ||
      resolvedProviderKeys.has(line.provider_key);
    const selectedLines = lines.filter((line) =>
      statusAllowed(line.payment_status) && dateAllowed(line.date) &&
      lineMatchesCost(line) && lineMatchesProvider(line)
    );

    const providerOnly = resolvedProviderKeys.size > 0 && resolvedCostIds.size === 0;
    const effectiveGroupBy = parsed.group_by === "none"
      ? resolution.matches[0]?.kind === "family"
        ? "partida"
        : resolution.matches[0]?.kind === "provider"
          ? "provider"
          : "concept"
      : parsed.group_by;
    const useParentTotals = providerOnly || (
      resolvedCostIds.size === 0 && resolvedProviderKeys.size === 0 &&
      ["none", "provider"].includes(parsed.group_by)
    );
    const totalsMap = new Map<string, { status: "paid" | "pending"; currency: string; amount: number; transactionIds: Set<string>; lineCount: number }>();
    const breakdownMap = new Map<string, { label: string; currency: string; status: "paid" | "pending"; amount: number; transactionIds: Set<string>; lineCount: number }>();

    if (useParentTotals) {
      for (const transaction of transactions) {
        const status = canonicalTransactionStatus(transaction.status);
        const date = parseCostDate(transaction.fecha);
        if (status === "other" || !date || !statusAllowed(status) || !dateAllowed(date)) continue;
        const provider = transaction.proveedor_id ? providerById.get(String(transaction.proveedor_id)) : undefined;
        const providerLabel = String(provider?.razon_social || transaction.proveedor || "Sin proveedor").trim();
        const providerKey = transaction.proveedor_id ? String(transaction.proveedor_id) : `legacy:${encodeURIComponent(normalizeCostText(providerLabel))}`;
        if (resolvedProviderKeys.size && !resolvedProviderKeys.has(providerKey)) continue;
        const currency = normalizeCostCurrency(transaction.moneda);
        const key = `${status}|${currency}`;
        const total = totalsMap.get(key) || { status, currency, amount: 0, transactionIds: new Set<string>(), lineCount: 0 };
        total.amount += Number(transaction.monto_total || 0);
        total.transactionIds.add(String(transaction._id));
        total.lineCount += paymentGroups[transactions.indexOf(transaction)]?.length || 0;
        totalsMap.set(key, total);
        if (effectiveGroupBy === "provider") {
          const breakdownKey = `${providerKey}|${status}|${currency}`;
          const row = breakdownMap.get(breakdownKey) || { label: providerLabel, currency, status, amount: 0, transactionIds: new Set<string>(), lineCount: 0 };
          row.amount += Number(transaction.monto_total || 0);
          row.transactionIds.add(String(transaction._id));
          row.lineCount += paymentGroups[transactions.indexOf(transaction)]?.length || 0;
          breakdownMap.set(breakdownKey, row);
        }
        const delta = Number(transaction.monto_total || 0) - (paymentSumByTransaction.get(String(transaction._id)) || 0);
        if (Math.abs(delta) > 0.01) {
          quality.unclassified_amount_by_currency[currency] =
            (quality.unclassified_amount_by_currency[currency] || 0) + delta;
        }
      }
    } else {
      for (const line of selectedLines) {
        const key = `${line.payment_status}|${line.currency}`;
        const total = totalsMap.get(key) || { status: line.payment_status, currency: line.currency, amount: 0, transactionIds: new Set<string>(), lineCount: 0 };
        total.amount += line.amount;
        total.transactionIds.add(line.transaction_id);
        total.lineCount += 1;
        totalsMap.set(key, total);
        const label = effectiveGroupBy === "partida"
          ? line.partida
          : effectiveGroupBy === "family"
            ? line.family
            : effectiveGroupBy === "provider"
              ? line.provider_label
              : line.concept;
        const breakdownKey = `${normalizeCostText(label)}|${line.payment_status}|${line.currency}`;
        const row = breakdownMap.get(breakdownKey) || { label, currency: line.currency, status: line.payment_status, amount: 0, transactionIds: new Set<string>(), lineCount: 0 };
        row.amount += line.amount;
        row.transactionIds.add(line.transaction_id);
        row.lineCount += 1;
        breakdownMap.set(breakdownKey, row);
      }
    }

    const totals = [...totalsMap.values()].map((total) => ({
      status: total.status,
      currency: total.currency,
      amount: Math.round(total.amount * 100) / 100,
      transaction_count: total.transactionIds.size,
      line_item_count: total.lineCount,
    })).sort((left, right) => left.currency.localeCompare(right.currency) || left.status.localeCompare(right.status));
    const breakdownRows = [...breakdownMap.values()]
      .map((row) => ({
        label: row.label,
        status: row.status,
        currency: row.currency,
        amount: Math.round(row.amount * 100) / 100,
        transaction_count: row.transactionIds.size,
        line_item_count: row.lineCount,
      }))
      .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));
    const truncated = breakdownRows.length > parsed.limit;
    const selectedBreakdown = breakdownRows.slice(0, parsed.limit);
    const primaryMatch = resolution.matches[0];
    const providerIdForUrl = primaryMatch?.kind === "provider" && !primaryMatch.id.includes("legacy:")
      ? primaryMatch.id.slice("provider:".length)
      : undefined;
    const evidenceLabel = primaryMatch?.label || (parsed.group_by === "provider" ? "Gasto por proveedor" : "Gasto acumulado");

    if (totals.length) {
      for (const total of totals) {
        const evidenceId = `cost:${projectId}:${compactCostText(evidenceLabel).slice(0, 45) || "all"}:${total.status}:${total.currency}`;
        evidence.push({
          id: evidenceId,
          type: "cost",
          label: `${project.nombre} · ${evidenceLabel} · ${total.status === "paid" ? "Pagado" : "Por pagar"}`,
          project_id: String(projectId),
          observed_value: `${formatCostAmount(total.amount, total.currency)} · ${total.transaction_count} transacciones · ${total.line_item_count} conceptos`,
          as_of: parsed.date_to,
          url: costEvidenceUrl({
            projectId: String(projectId),
            label: primaryMatch?.kind !== "provider" ? primaryMatch?.label : undefined,
            providerId: providerIdForUrl,
            scope: parsed.payment_scope,
            currency: total.currency,
            dateFrom: parsed.date_from,
            dateTo: parsed.date_to,
          }),
        });
      }
    } else {
      evidence.push({
        id: `cost:${projectId}:${compactCostText(evidenceLabel).slice(0, 45) || "all"}:empty`,
        type: "cost",
        label: `${project.nombre} · ${evidenceLabel}`,
        project_id: String(projectId),
        observed_value: "Sin pagos coincidentes en el periodo y estado consultados",
        as_of: parsed.date_to,
        url: costEvidenceUrl({
          projectId: String(projectId),
          label: primaryMatch?.kind !== "provider" ? primaryMatch?.label : undefined,
          providerId: providerIdForUrl,
          scope: parsed.payment_scope,
          dateFrom: parsed.date_from,
          dateTo: parsed.date_to,
        }),
      });
    }

    const hasQualityLimitations = quality.invalid_dates > 0 || quality.noncanonical_statuses > 0 ||
      quality.total_mismatches > 0 || quality.cross_project_partidas > 0 ||
      quality.missing_partidas > 0 || quality.unresolved_line_items > 0;
    answerStatuses.push(hasQualityLimitations || truncated ? "partial" : "answered");
    if (quality.invalid_dates) limitations.push(`${project.nombre}: ${quality.invalid_dates} transacciones con fecha inválida fueron excluidas.`);
    if (quality.noncanonical_statuses) limitations.push(`${project.nombre}: ${quality.noncanonical_statuses} transacciones tienen un estado de pago no reconocido.`);
    if (quality.total_mismatches) limitations.push(`${project.nombre}: ${quality.total_mismatches} transacciones no concilian con la suma de sus conceptos.`);
    if (quality.cross_project_partidas || quality.missing_partidas || quality.unresolved_line_items) {
      limitations.push(`${project.nombre}: existen conceptos sin clasificación confiable; ejecuta la auditoría de trazabilidad de costos.`);
    }

    projects.push({
      project_id: String(projectId),
      project_name: project.nombre,
      resolution,
      period: { date_from: parsed.date_from || null, date_to: parsed.date_to },
      payment_scope: parsed.payment_scope,
      totals,
      breakdown: selectedBreakdown,
      quality,
      truncated,
    });
  }

  return {
    data: { projects },
    evidence: evidence.slice(0, 30),
    statuses: [],
    answerStatuses,
    limitations: [...new Set(limitations)].slice(0, 8),
    truncated: projects.some((project: any) => project.truncated),
  };
}

export const executeTool = internalQuery({
  args: {
    owner_user_id: v.id("users"),
    allowed_project_ids: v.array(v.id("desarrollos")),
    allowed_person_ids: v.array(v.id("users")),
    allowed_cost_item_ids: v.array(v.string()),
    allowed_provider_ids: v.array(v.id("proveedores")),
    name: v.string(),
    arguments_json: v.string(),
    as_of: v.string(),
    default_start: v.string(),
  },
  handler: async (ctx, args): Promise<ToolResult> => {
    const user = await ctx.db.get(args.owner_user_id);
    assertAdminUser(user);
    const allowed = new Set(args.allowed_project_ids.map(String));
    const allowedPeople = new Set(args.allowed_person_ids.map(String));
    const allowedCostItems = new Set(args.allowed_cost_item_ids);
    const allowedProviders = new Set(args.allowed_provider_ids.map(String));

    if (args.name === "query_project_costs") {
      const parsed = costToolArgsSchema.parse(JSON.parse(args.arguments_json));
      return await executeCostTool({
        ctx,
        user,
        parsed,
        allowedProjectIds: allowed,
        allowedCostItemIds: allowedCostItems,
        allowedProviderIds: allowedProviders,
      });
    }

    if (args.name === "get_entity_detail") {
      const parsed = detailArgsSchema.parse(JSON.parse(args.arguments_json));
      const evidence: AssistantEvidence[] = [];
      const details: unknown[] = [];
      for (const rawId of parsed.ids) {
        if (parsed.entity_type === "task") {
          const id = normalizeId(ctx, "tareas", rawId);
          const item = await ctx.db.get(id) as Doc<"tareas"> | null;
          if (!item || !item.proyecto || !allowed.has(String(item.proyecto))) continue;
          await assertProjectAccess(ctx, user, item.proyecto);
          const project = await ctx.db.get(item.proyecto);
          const due = parseProjectDate(item.fecha_limite);
          details.push({ id, project_id: item.proyecto, project: project?.nombre, title: item.titulo, description: item.descripcion, status: item.status, priority: item.prioridad, due_date: due, assignee_ids: item.asignados.map(String) });
          evidence.push({ id: `task:${id}`, type: "task", label: item.titulo, project_id: String(item.proyecto), observed_value: `${item.status} · ${item.prioridad}${due ? ` · vence ${due}` : ""}`, as_of: args.as_of, url: `/tareas?proyecto=${item.proyecto}&tarea=${id}` });
        } else if (parsed.entity_type === "requisition") {
          const id = normalizeId(ctx, "requisiciones", rawId);
          const item = await ctx.db.get(id) as Doc<"requisiciones"> | null;
          if (!item || !allowed.has(String(item.proyecto))) continue;
          await assertProjectAccess(ctx, user, item.proyecto);
          const project = await ctx.db.get(item.proyecto);
          details.push({ id, project_id: item.proyecto, project: project?.nombre, type: item.tipo, description: item.descripcion, payment_status: item.status, delivery_status: item.status_entrega, review_status: item.status_revision, requested_date: parseProjectDate(item.fecha_solicitud), due_date: parseProjectDate(item.fecha_entrega), requester_id: String(item.solicitante_id), reviewer_id: item.revisado_por_id ? String(item.revisado_por_id) : undefined });
          evidence.push({ id: `requisition:${id}`, type: "requisition", label: requisitionLabel(id).slice(1), project_id: String(item.proyecto), observed_value: `${item.status} · entrega ${item.status_entrega || "N/D"} · revisión ${item.status_revision || "N/D"}`, as_of: args.as_of, url: `/proyecto/${item.proyecto}/requisiciones?requisicion=${id}` });
        } else {
          const id = normalizeId(ctx, "rfis", rawId);
          const item = await ctx.db.get(id) as Doc<"rfis"> | null;
          if (!item || !allowed.has(String(item.proyecto))) continue;
          await assertProjectAccess(ctx, user, item.proyecto);
          const project = await ctx.db.get(item.proyecto);
          details.push({ id, project_id: item.proyecto, project: project?.nombre, code: rfiLabel(item).slice(1), subject: item.subject, question: item.question, status: item.status, due_date: item.due_date, cost_impact: item.cost_impact, cost_impact_amount: item.cost_impact_amount, schedule_impact: item.schedule_impact, schedule_impact_days: item.schedule_impact_days, assignee_ids: item.assignee_ids.map(String), manager_id: item.rfi_manager_id ? String(item.rfi_manager_id) : undefined });
          evidence.push({ id: `rfi:${id}`, type: "rfi", label: `${rfiLabel(item).slice(1)} · ${item.subject}`, project_id: String(item.proyecto), observed_value: `${item.status}${item.due_date ? ` · vence ${item.due_date}` : ""}`, as_of: args.as_of, url: `/proyecto/${item.proyecto}/rfis/${id}` });
        }
      }
      return {
        data: { items: details, total: details.length, truncated: false },
        evidence,
        statuses: [],
        answerStatuses: [details.length ? "answered" : "insufficient_data"],
      };
    }

    const parsed = toolArgsSchema.parse(JSON.parse(args.arguments_json));
    const projectIds = parsed.project_ids.map((id) => normalizeId(ctx, "desarrollos", id));
    if (projectIds.some((id) => !allowed.has(String(id)))) throw new Error("La herramienta intentó consultar un proyecto fuera del contexto");
    for (const id of projectIds) await assertProjectAccess(ctx, user, id);
    const from = parsed.date_from || args.default_start;
    const to = parsed.date_to || args.as_of;
    if (from > to) throw new Error("El rango de fechas no es válido");
    const personIds = new Set((parsed.person_ids || []).map(String));
    if ([...personIds].some((id) => !allowedPeople.has(id))) {
      throw new Error("La herramienta intentó consultar una persona fuera de las referencias validadas");
    }
    const limit = parsed.limit || 20;

    if (args.name === "get_project_overview") {
      const projects: unknown[] = [];
      const allEvidence: AssistantEvidence[] = [];
      const statuses: AssistantOverallStatus[] = [];
      const limitations: string[] = [];
      for (const projectId of projectIds) {
        const snapshot = await buildReportSnapshot(ctx, { proyecto: String(projectId), periodStart: from, periodEnd: to, periodKey: `${from}:${to}`, profile: "full" });
        const insights = deterministicReportInsights(snapshot);
        const [tasks, rfis] = await Promise.all([
          ctx.db.query("tareas").withIndex("by_proyecto", (q) => q.eq("proyecto", projectId)).collect(),
          ctx.db.query("rfis").withIndex("by_proyecto", (q) => q.eq("proyecto", projectId)).collect(),
        ]);
        const relevantTasks = personIds.size ? tasks.filter((item) => item.asignados.some((id) => personIds.has(String(id)))) : tasks;
        const relevantRfis = personIds.size ? rfis.filter((item) => item.assignee_ids.some((id) => personIds.has(String(id))) || (item.rfi_manager_id && personIds.has(String(item.rfi_manager_id)))) : rfis;
        const activeTasks = relevantTasks.filter((item) => taskIsActive(item.status));
        const blockedTasks = activeTasks.filter((item) => normalizeState(item.status).includes("bloquead"));
        const overdueTasks = activeTasks.filter((item) => Boolean(item.fecha_limite && item.fecha_limite < to));
        const urgentTasks = activeTasks.filter((item) => normalizeState(item.prioridad) === "urgente");
        const openRfis = relevantRfis.filter((item) => !["closed", "draft"].includes(item.status));
        const overdueRfis = openRfis.filter((item) => Boolean(item.due_date && item.due_date < to));
        const impactedRfis = relevantRfis.filter((item) => item.cost_impact === "yes" || item.schedule_impact === "yes");
        const hasCritical = insights.insights.some((item) => item.severity === "critical");
        const hasAnyData = snapshot.financial.approved_budget !== 0 || snapshot.financial.accumulated_cost !== 0 || snapshot.program.scheduled_activities > 0 || snapshot.requisitions.total > 0 || tasks.length > 0 || rfis.length > 0;
        const hasSufficientData = hasAnyData && snapshot.data_quality.score >= 40;
        const overall = deterministicAssistantStatus({
          hasData: hasSufficientData,
          hasCriticalInsight: hasCritical,
          hasAttentionInsight: insights.insights.some((item) => ["high", "medium"].includes(item.severity)),
          hasBlockedOrOverdueWork: blockedTasks.length > 0 || overdueTasks.length > 0 || overdueRfis.length > 0,
        });
        statuses.push(overall);

        const catalog = reportMetricCatalog(snapshot);
        const preferredKeys = [
          ...insights.insights.flatMap((item) => item.evidence.map((entry) => entry.metric_key)),
          "financial.approved_budget", "financial.accumulated_cost", "financial.balance", "financial.exercised_percent",
          "earned_value.cpi", "earned_value.spi", "projection.actual_vs_projection_percent",
          "requisitions.overdue_deliveries", "program.physical_progress_percent", "program.planned_progress_percent", "data_quality.score",
        ];
        const perProjectEvidenceLimit = Math.max(1, Math.floor(30 / projectIds.length));
        const operationalEvidence = [
          { key: "operational.blocked_tasks", label: "Tareas bloqueadas", value: blockedTasks.length, url: `/tareas?proyecto=${projectId}` },
          { key: "operational.overdue_tasks", label: "Tareas vencidas", value: overdueTasks.length, url: `/tareas?proyecto=${projectId}` },
          { key: "operational.urgent_tasks", label: "Tareas urgentes activas", value: urgentTasks.length, url: `/tareas?proyecto=${projectId}` },
          { key: "operational.overdue_rfis", label: "RFIs vencidas", value: overdueRfis.length, url: `/proyecto/${projectId}/rfis` },
          { key: "operational.impacted_rfis", label: "RFIs con impacto registrado", value: impactedRfis.length, url: `/proyecto/${projectId}/rfis` },
        ]
          .filter((item) => item.value > 0)
          .slice(0, Math.min(4, perProjectEvidenceLimit));
        const metricKeys = [...new Set(preferredKeys)]
          .filter((key) => Object.prototype.hasOwnProperty.call(catalog, key))
          .slice(0, Math.max(1, perProjectEvidenceLimit - operationalEvidence.length));
        const projectEvidence = metricKeys.map((key): AssistantEvidence => ({
          id: `metric:${projectId}:${key}`,
          type: "metric",
          label: `${snapshot.project.name} · ${metricLabel(key)}`,
          project_id: String(projectId),
          observed_value: formatMetric(key, catalog[key as keyof typeof catalog], snapshot.project.currency),
          as_of: to,
          url: `/proyecto/${projectId}/reportes`,
        }));
        const projectOperationalEvidence = operationalEvidence.map((item): AssistantEvidence => ({
          id: `metric:${projectId}:${item.key}`,
          type: "metric",
          label: `${snapshot.project.name} · ${item.label}`,
          project_id: String(projectId),
          observed_value: String(item.value),
          as_of: to,
          url: item.url,
        }));
        allEvidence.push(...projectEvidence, ...projectOperationalEvidence);
        const missingSources = !hasSufficientData
          ? [
            ...Object.entries(snapshot.source_counts).filter(([, count]) => count === 0).map(([name]) => name),
            ...(snapshot.data_quality.score < 40 ? ["data_quality.score_below_40"] : []),
          ]
          : [];
        if (missingSources.length) {
          limitations.push(`${snapshot.project.name}: faltan o son insuficientes las fuentes ${missingSources.join(", ")}.`);
        }
        projects.push({
          project_id: projectId,
          project_name: snapshot.project.name,
          overall_status: overall,
          period: { financial_through: to, activity_from: from, activity_through: to },
          metrics: Object.fromEntries(metricKeys.map((key) => [key, catalog[key as keyof typeof catalog]])),
          deterministic_insights: insights.insights.map((item) => ({ ...item, evidence_ids: item.evidence.map((entry) => `metric:${projectId}:${entry.metric_key}`) })),
          operational: {
            active_tasks: activeTasks.length,
            blocked_tasks: blockedTasks.length,
            overdue_tasks: overdueTasks.length,
            urgent_tasks: urgentTasks.length,
            open_rfis: openRfis.length,
            overdue_rfis: overdueRfis.length,
            rfis_with_recorded_impact: impactedRfis.length,
          },
          data_quality: snapshot.data_quality,
          missing_sources: missingSources,
        });
      }
      return {
        data: { projects, as_of: to },
        evidence: allEvidence.slice(0, 30),
        statuses,
        answerStatuses: [statuses.includes("insufficient_data") ? "partial" : "answered"],
        limitations,
      };
    }

    const evidence: AssistantEvidence[] = [];
    const items: any[] = [];
    if (args.name === "list_tasks") {
      for (const projectId of projectIds) {
        const project = await ctx.db.get(projectId);
        const rows = await ctx.db.query("tareas").withIndex("by_proyecto", (q) => q.eq("proyecto", projectId)).collect();
        for (const item of rows) {
          if (personIds.size && !item.asignados.some((id) => personIds.has(String(id)))) continue;
          if (parsed.status?.length && !parsed.status.some((status) => normalizeState(status) === normalizeState(item.status))) continue;
          if (parsed.priorities?.length && !parsed.priorities.some((priority) => normalizeState(priority) === normalizeState(item.prioridad))) continue;
          const due = parseProjectDate(item.fecha_limite);
          const active = taskIsActive(item.status);
          const blocked = normalizeState(item.status).includes("bloquead");
          const overdue = Boolean(active && due && due < to);
          if (parsed.overdue_only && !overdue) continue;
          if (parsed.blocked_only && !blocked) continue;
          if (parsed.open_only && !active) continue;
          if (parsed.due_within_range && (!due || due < from || due > to)) continue;
          items.push({ id: item._id, project_id: projectId, project: project?.nombre, title: item.titulo, status: item.status, priority: item.prioridad, due_date: due, active, blocked, overdue, assignee_ids: item.asignados.map(String), updated_at: item.updated_at || item.created_at });
          evidence.push({ id: `task:${item._id}`, type: "task", label: `${project?.nombre} · ${item.titulo}`, project_id: String(projectId), observed_value: `${item.status} · ${item.prioridad}${due ? ` · vence ${due}` : ""}`, as_of: to, url: `/tareas?proyecto=${projectId}&tarea=${item._id}` });
        }
      }
    } else if (args.name === "list_requisitions") {
      for (const projectId of projectIds) {
        const project = await ctx.db.get(projectId);
        const rows = await ctx.db.query("requisiciones").withIndex("by_proyecto", (q) => q.eq("proyecto", projectId)).collect();
        for (const item of rows) {
          if (personIds.size && !personIds.has(String(item.solicitante_id)) && (!item.revisado_por_id || !personIds.has(String(item.revisado_por_id)))) continue;
          if (parsed.status?.length && !parsed.status.some((status) => [item.status, item.status_entrega, item.status_revision].some((value) => normalizeState(status) === normalizeState(value)))) continue;
          const due = parseProjectDate(item.fecha_entrega);
          const active = requisitionIsActive(item);
          const overdue = Boolean(active && due && due < to);
          if (parsed.overdue_only && !overdue) continue;
          if (parsed.open_only && !active) continue;
          if (parsed.due_within_range && (!due || due < from || due > to)) continue;
          items.push({ id: item._id, project_id: projectId, project: project?.nombre, type: item.tipo, description: item.descripcion, payment_status: item.status, delivery_status: item.status_entrega, review_status: item.status_revision, requested_date: parseProjectDate(item.fecha_solicitud), due_date: due, active, overdue, requester_id: String(item.solicitante_id), reviewer_id: item.revisado_por_id ? String(item.revisado_por_id) : undefined });
          evidence.push({ id: `requisition:${item._id}`, type: "requisition", label: `${project?.nombre} · ${requisitionLabel(item._id).slice(1)}`, project_id: String(projectId), observed_value: `${item.status} · entrega ${item.status_entrega || "N/D"}${due ? ` · vence ${due}` : ""}`, as_of: to, url: `/proyecto/${projectId}/requisiciones?requisicion=${item._id}` });
        }
      }
    } else if (args.name === "list_rfis") {
      for (const projectId of projectIds) {
        const project = await ctx.db.get(projectId);
        const rows = await ctx.db.query("rfis").withIndex("by_proyecto", (q) => q.eq("proyecto", projectId)).collect();
        for (const item of rows) {
          if (personIds.size && !item.assignee_ids.some((id) => personIds.has(String(id))) && (!item.rfi_manager_id || !personIds.has(String(item.rfi_manager_id))) && !personIds.has(String(item.creator_id))) continue;
          if (parsed.status?.length && !parsed.status.some((status) => normalizeState(status) === normalizeState(item.status))) continue;
          const open = !["closed", "draft"].includes(item.status);
          const overdue = Boolean(open && item.due_date && item.due_date < to);
          const hasImpact = item.cost_impact === "yes" || item.schedule_impact === "yes";
          if (parsed.overdue_only && !overdue) continue;
          if (parsed.open_only && !open) continue;
          if (parsed.impact_only && !hasImpact) continue;
          if (parsed.due_within_range && (!item.due_date || item.due_date < from || item.due_date > to)) continue;
          items.push({ id: item._id, project_id: projectId, project: project?.nombre, code: rfiLabel(item).slice(1), subject: item.subject, status: item.status, due_date: item.due_date, open, overdue, cost_impact: item.cost_impact, cost_impact_amount: item.cost_impact_amount, schedule_impact: item.schedule_impact, schedule_impact_days: item.schedule_impact_days, assignee_ids: item.assignee_ids.map(String), manager_id: item.rfi_manager_id ? String(item.rfi_manager_id) : undefined });
          evidence.push({ id: `rfi:${item._id}`, type: "rfi", label: `${project?.nombre} · ${rfiLabel(item).slice(1)} · ${item.subject}`, project_id: String(projectId), observed_value: `${item.status}${item.due_date ? ` · vence ${item.due_date}` : ""}`, as_of: to, url: `/proyecto/${projectId}/rfis/${item._id}` });
        }
      }
    } else {
      throw new Error("Herramienta no permitida");
    }
    items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
    const selected = items.slice(0, limit);
    const selectedIds = new Set(selected.map((item) => String(item.id)));
    return {
      data: { items: selected, total: items.length, truncated: items.length > limit },
      evidence: evidence.filter((item) => selectedIds.has(item.id.split(":")[1])).slice(0, limit),
      statuses: items.some((item) => item.overdue || item.blocked) ? ["attention"] : [],
      answerStatuses: ["answered"],
      truncated: items.length > limit,
    };
  },
});

export const sendMessage = action({
  args: {
    conversation_id: v.optional(v.id("assistant_conversations")),
    text: v.string(),
    references: v.array(assistantReferenceValidator),
    route_project_id: v.optional(v.id("desarrollos")),
    client_request_id: v.string(),
  },
  handler: async (ctx, args): Promise<{ conversation_id: Id<"assistant_conversations">; assistant_message_id?: Id<"assistant_messages">; answer?: AssistantAnswer; duplicate: boolean }> => {
    const startedAt = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const actor = await ctx.runQuery((internal as any).assistant.resolveActor, { clerk_subject: identity.subject });
    const prepared = await ctx.runMutation((internal as any).assistant.prepareMessage, { owner_user_id: actor.user_id, ...args });
    if (prepared.duplicate) return { conversation_id: prepared.conversation_id, assistant_message_id: prepared.assistant_message_id, duplicate: true };

    const toolNames: string[] = [];
    const model = MODEL();
    try {
      if (!prepared.context_project_ids.length) {
        const answer = contextRequiredAnswer();
        await ctx.runMutation((internal as any).assistant.completeMessage, { assistant_message_id: prepared.assistant_message_id, answer, tool_names: [], duration_ms: Date.now() - startedAt });
        return { conversation_id: prepared.conversation_id, assistant_message_id: prepared.assistant_message_id, answer, duplicate: false };
      }

      const currentDate = todayInMexicoCity();
      const cutoff = resolveAssistantCutoff(args.text, currentDate);
      const costDates = resolveCostDateRange(args.text, currentDate);
      const costReferences = args.references.filter((reference) => reference.type === "cost_item");
      const providerReferences = args.references.filter((reference) => reference.type === "provider");
      const costQuery = isCostIntent(args.text) || costReferences.length > 0 || providerReferences.length > 0;
      const asOf = costQuery ? costDates.date_to : cutoff.activity_through;
      const defaultStart = cutoff.activity_from;
      const allowedPersonIds = args.references
        .filter((reference) => reference.type === "person")
        .map((reference) => reference.id as Id<"users">);
      const allowedCostItemIds = costReferences.map((reference) => reference.id);
      const allowedProviderIds = providerReferences.map((reference) => reference.id as Id<"proveedores">);
      const referencedCostKind = costReferences[0]
        ? parseCostItemReferenceId(costReferences[0].id)?.kind
        : undefined;
      const initialToolName = costQuery ? "query_project_costs" : "get_project_overview";
      const initialArguments = costQuery
        ? JSON.stringify({
            project_ids: prepared.context_project_ids.map(String),
            search: args.text.trim(),
            cost_item_ids: allowedCostItemIds,
            provider_ids: allowedProviderIds.map(String),
            date_from: costDates.date_from || null,
            date_to: costDates.date_to,
            payment_scope: inferCostPaymentScope(args.text),
            group_by: providerReferences.length
              ? "provider"
              : referencedCostKind === "family"
                ? "partida"
                : inferCostGroupBy(args.text),
            limit: 20,
          })
        : JSON.stringify({
            project_ids: prepared.context_project_ids.map(String),
            date_from: defaultStart,
            date_to: asOf,
          });
      const initialContext = await ctx.runQuery((internal as any).assistant.executeTool, {
        owner_user_id: actor.user_id,
        allowed_project_ids: prepared.context_project_ids,
        allowed_person_ids: allowedPersonIds,
        allowed_cost_item_ids: allowedCostItemIds,
        allowed_provider_ids: allowedProviderIds,
        name: initialToolName,
        arguments_json: initialArguments,
        as_of: asOf,
        default_start: defaultStart,
      }) as ToolResult;
      toolNames.push(initialToolName);
      const evidence = [...initialContext.evidence];
      const statuses = [...(initialContext.statuses || [])];
      const answerStatuses = [...(initialContext.answerStatuses || [])];
      const canonicalLimitations = [...(initialContext.limitations || [])];
      let anyToolResultTruncated = Boolean(initialContext.truncated);
      const history = await ctx.runQuery((internal as any).assistant.recentHistory, { owner_user_id: actor.user_id, conversation_id: prepared.conversation_id });
      const historyInput = history
        .filter((message: any) => message._id !== prepared.user_message_id)
        .map((message: any) => ({
          role: message.role,
          content: [{ type: message.role === "assistant" ? "output_text" : "input_text", text: message.role === "assistant" && message.answer ? JSON.stringify({ summary: message.answer.summary, answer_status: message.answer.answer_status, overall_status: message.answer.overall_status, follow_up_prompts: message.answer.follow_up_prompts }) : sanitizeReportText(message.content) }],
        }));
      const input: any[] = [
        ...historyInput,
        { role: "developer", content: [{ type: "input_text", text: `CONTEXTO VERIFICADO INICIAL (${initialToolName}):\n${JSON.stringify({ data: initialContext.data, evidence: initialContext.evidence })}` }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify({ question: sanitizeReportText(args.text.trim()), references: args.references, default_period: { accumulated_through: asOf, activity_from: defaultStart, activity_through: asOf } }) }] },
      ];
      const safetyIdentifier = await stableSafetyIdentifier(identity.subject);
      const responseBody = {
        model,
        store: false,
        reasoning: { effort: REASONING_EFFORT(), context: "current_turn" },
        safety_identifier: safetyIdentifier,
        instructions: assistantInstructions(asOf),
        input,
        tools: toolDefinitions,
        parallel_tool_calls: true,
        text: { format: { type: "json_schema", name: "project_assistant_answer", strict: true, schema: assistantStructuredOutputJsonSchema } },
      };
      let response = await callOpenAI(responseBody);
      const selectedCalls = selectAssistantFunctionCalls(response, MAX_TOOL_CALLS - 1);
      if (selectedCalls.accepted.length || selectedCalls.rejected.length) {
        const outputs: any[] = [];
        const acceptedCalls = selectedCalls.accepted;
        const toolResults = await Promise.all(acceptedCalls.map((call: any) =>
          ctx.runQuery((internal as any).assistant.executeTool, {
            owner_user_id: actor.user_id,
            allowed_project_ids: prepared.context_project_ids,
            allowed_person_ids: allowedPersonIds,
            allowed_cost_item_ids: allowedCostItemIds,
            allowed_provider_ids: allowedProviderIds,
            name: call.name,
            arguments_json: call.arguments,
            as_of: asOf,
            default_start: defaultStart,
          }) as Promise<ToolResult>,
        ));
        for (let index = 0; index < acceptedCalls.length; index += 1) {
          const call = acceptedCalls[index];
          const result = toolResults[index];
          toolNames.push(call.name);
          evidence.push(...result.evidence);
          statuses.push(...(result.statuses || []));
          answerStatuses.push(...(result.answerStatuses || []));
          canonicalLimitations.push(...(result.limitations || []));
          anyToolResultTruncated = anyToolResultTruncated || Boolean(result.truncated);
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ...result.data as object, truncated: result.truncated || false, evidence: result.evidence }) });
        }
        for (const call of selectedCalls.rejected) {
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "Límite de cuatro llamadas de herramienta alcanzado" }) });
        }
        response = await callOpenAI({ ...responseBody, input: [...input, ...(response.output || []), ...outputs], tools: toolDefinitions, tool_choice: "none" });
      }

      const parsed = assistantAnswerSchema.parse(JSON.parse(extractAssistantResponseText(response)));
      const answer = sanitizeAnswer(parsed, evidence, statuses, answerStatuses);
      answer.limitations = [...new Set([...canonicalLimitations, ...answer.limitations])].slice(0, 5);
      if (anyToolResultTruncated) {
        answer.limitations = [
          ...answer.limitations.slice(0, 4),
          "Al menos un listado alcanzó el límite de resultados; abre la evidencia o acota la consulta para revisar el resto.",
        ];
      }
      const usage = response.usage || {};
      await ctx.runMutation((internal as any).assistant.completeMessage, {
        assistant_message_id: prepared.assistant_message_id,
        answer,
        model,
        response_id: response.id,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        tool_names: toolNames,
        duration_ms: Date.now() - startedAt,
      });
      return { conversation_id: prepared.conversation_id, assistant_message_id: prepared.assistant_message_id, answer, duplicate: false };
    } catch (error) {
      const raw = error as Error & { code?: string };
      const code = raw.code || (raw instanceof z.ZodError ? "invalid_json" : "assistant_error");
      await ctx.runMutation((internal as any).assistant.failMessage, { assistant_message_id: prepared.assistant_message_id, error: raw.message || "No fue posible generar la respuesta", error_code: code, model, duration_ms: Date.now() - startedAt, tool_names: toolNames });
      throw error;
    }
  },
});
