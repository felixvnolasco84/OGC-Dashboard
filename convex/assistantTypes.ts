import { v } from "convex/values";
import { z } from "zod";

export const ASSISTANT_REFERENCE_TYPES = [
  "project",
  "person",
  "metric",
  "task",
  "requisition",
  "rfi",
] as const;

export type AssistantReferenceType = (typeof ASSISTANT_REFERENCE_TYPES)[number];

export type AssistantReference = {
  type: AssistantReferenceType;
  id: string;
  project_id: string;
  label: string;
  start: number;
  end: number;
};

export const assistantReferenceValidator = v.object({
  type: v.union(
    v.literal("project"),
    v.literal("person"),
    v.literal("metric"),
    v.literal("task"),
    v.literal("requisition"),
    v.literal("rfi"),
  ),
  id: v.string(),
  project_id: v.string(),
  label: v.string(),
  start: v.number(),
  end: v.number(),
});

export type AssistantOverallStatus =
  | "on_track"
  | "attention"
  | "critical"
  | "insufficient_data";

export type AssistantEvidence = {
  id: string;
  type: "metric" | "task" | "requisition" | "rfi";
  label: string;
  project_id: string;
  observed_value?: string;
  as_of: string;
  url: string;
};

export type AssistantAnswer = {
  overall_status: AssistantOverallStatus;
  summary: string;
  metrics: Array<{ label: string; value: string; evidence_ids: string[] }>;
  risks: Array<{
    severity: "critical" | "high" | "medium" | "low" | "info";
    title: string;
    detail: string;
    evidence_ids: string[];
  }>;
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    evidence_ids: string[];
  }>;
  evidence: AssistantEvidence[];
  follow_up_prompts: string[];
  limitations: string[];
};

export const assistantEvidenceValidator = v.object({
  id: v.string(),
  type: v.union(
    v.literal("metric"),
    v.literal("task"),
    v.literal("requisition"),
    v.literal("rfi"),
  ),
  label: v.string(),
  project_id: v.string(),
  observed_value: v.optional(v.string()),
  as_of: v.string(),
  url: v.string(),
});

export const assistantAnswerValidator = v.object({
  overall_status: v.union(
    v.literal("on_track"),
    v.literal("attention"),
    v.literal("critical"),
    v.literal("insufficient_data"),
  ),
  summary: v.string(),
  metrics: v.array(v.object({
    label: v.string(),
    value: v.string(),
    evidence_ids: v.array(v.string()),
  })),
  risks: v.array(v.object({
    severity: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
      v.literal("info"),
    ),
    title: v.string(),
    detail: v.string(),
    evidence_ids: v.array(v.string()),
  })),
  recommendations: v.array(v.object({
    priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    action: v.string(),
    evidence_ids: v.array(v.string()),
  })),
  evidence: v.array(assistantEvidenceValidator),
  follow_up_prompts: v.array(v.string()),
  limitations: v.array(v.string()),
});

const evidenceSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.enum(["metric", "task", "requisition", "rfi"]),
  label: z.string().min(1).max(180),
  project_id: z.string().min(1).max(80),
  observed_value: z.string().max(220).optional(),
  as_of: z.string().min(1).max(40),
  url: z.string().min(1).max(500),
}).strict();

export const assistantAnswerSchema = z.object({
  overall_status: z.enum(["on_track", "attention", "critical", "insufficient_data"]),
  summary: z.string().min(1).max(1400),
  metrics: z.array(z.object({
    label: z.string().min(1).max(120),
    value: z.string().min(1).max(160),
    evidence_ids: z.array(z.string().min(1).max(160)).min(1).max(5),
  }).strict()).max(8),
  risks: z.array(z.object({
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    title: z.string().min(1).max(140),
    detail: z.string().min(1).max(500),
    evidence_ids: z.array(z.string().min(1).max(160)).min(1).max(5),
  }).strict()).max(8),
  recommendations: z.array(z.object({
    priority: z.enum(["high", "medium", "low"]),
    action: z.string().min(1).max(400),
    evidence_ids: z.array(z.string().min(1).max(160)).min(1).max(5),
  }).strict()).max(5),
  evidence: z.array(evidenceSchema).max(30),
  follow_up_prompts: z.array(z.string().min(1).max(220)).max(3),
  limitations: z.array(z.string().min(1).max(320)).max(5),
}).strict();

export const assistantStructuredOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overall_status",
    "summary",
    "metrics",
    "risks",
    "recommendations",
    "evidence",
    "follow_up_prompts",
    "limitations",
  ],
  properties: {
    overall_status: {
      type: "string",
      enum: ["on_track", "attention", "critical", "insufficient_data"],
    },
    summary: { type: "string", minLength: 1, maxLength: 1400 },
    metrics: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value", "evidence_ids"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 120 },
          value: { type: "string", minLength: 1, maxLength: 160 },
          evidence_ids: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    risks: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "title", "detail", "evidence_ids"],
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low", "info"],
          },
          title: { type: "string", minLength: 1, maxLength: 140 },
          detail: { type: "string", minLength: 1, maxLength: 500 },
          evidence_ids: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    recommendations: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "action", "evidence_ids"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          action: { type: "string", minLength: 1, maxLength: 400 },
          evidence_ids: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    evidence: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "label", "project_id", "observed_value", "as_of", "url"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 160 },
          type: { type: "string", enum: ["metric", "task", "requisition", "rfi"] },
          label: { type: "string", minLength: 1, maxLength: 180 },
          project_id: { type: "string", minLength: 1, maxLength: 80 },
          observed_value: { type: "string", maxLength: 220 },
          as_of: { type: "string", minLength: 1, maxLength: 40 },
          url: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
    follow_up_prompts: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 220 },
    },
    limitations: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 320 },
    },
  },
} as const;

export const METRIC_REFERENCES = [
  { id: "financial", label: "@Estado financiero", subtitle: "Presupuesto, gasto y saldo" },
  { id: "earned_value", label: "@Valor ganado", subtitle: "CPI, SPI, EAC y ETC" },
  { id: "program", label: "@Programa", subtitle: "Avance físico, planeado y atrasos" },
  { id: "cashflow", label: "@Flujo", subtitle: "Gasto real contra proyección" },
  { id: "logbook", label: "@Bitácora", subtitle: "Actividad e incidencias recientes" },
  { id: "data_quality", label: "@Calidad de datos", subtitle: "Confiabilidad de las fuentes" },
] as const;

export function normalizeAssistantSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

export function conversationTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 60).trimEnd();
}

export function validateReferenceRanges(text: string, references: AssistantReference[]) {
  if (text.length > 4000) throw new Error("El mensaje no puede exceder 4,000 caracteres");
  if (references.length > 10) throw new Error("Puedes agregar hasta 10 referencias por mensaje");

  const sorted = [...references].sort((a, b) => a.start - b.start);
  let previousEnd = -1;
  const identities = new Set<string>();
  for (const reference of sorted) {
    if (
      !Number.isInteger(reference.start) ||
      !Number.isInteger(reference.end) ||
      reference.start < 0 ||
      reference.end <= reference.start ||
      reference.end > text.length
    ) {
      throw new Error("La posición de una referencia no es válida");
    }
    if (reference.start < previousEnd) {
      throw new Error("Las referencias no pueden superponerse");
    }
    if (text.slice(reference.start, reference.end) !== reference.label) {
      throw new Error("El texto de una referencia fue modificado");
    }
    const identity = `${reference.type}:${reference.id}:${reference.project_id || ""}`;
    if (identities.has(identity)) throw new Error("No puedes repetir la misma referencia");
    identities.add(identity);
    previousEnd = reference.end;
  }
  return sorted;
}

export function combineOverallStatuses(statuses: AssistantOverallStatus[]): AssistantOverallStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("attention")) return "attention";
  if (statuses.includes("insufficient_data")) return "insufficient_data";
  return "on_track";
}

export type AssistantFunctionCall = {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
};

export function extractAssistantResponseText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    }>;
  };
  if (response.output_text) return response.output_text;
  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if (content.type === "refusal") {
        throw Object.assign(
          new Error(content.refusal || "OpenAI rechazó la solicitud"),
          { code: "refusal" },
        );
      }
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw Object.assign(
    new Error("OpenAI no devolvió una respuesta estructurada"),
    { code: "missing_output" },
  );
}

export function selectAssistantFunctionCalls(payload: unknown, maximum: number) {
  const output = (payload as { output?: unknown[] }).output || [];
  const calls = output.filter((item): item is AssistantFunctionCall => {
    const candidate = item as Partial<AssistantFunctionCall>;
    return candidate.type === "function_call" &&
      typeof candidate.name === "string" &&
      typeof candidate.arguments === "string" &&
      typeof candidate.call_id === "string";
  });
  return {
    accepted: calls.slice(0, maximum),
    rejected: calls.slice(maximum),
  };
}
