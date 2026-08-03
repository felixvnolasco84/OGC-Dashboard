import { z } from "zod";
import type {
  ReportInsight,
  ReportInsights,
  ReportSnapshotV1,
} from "./reportTypes";
import { reportMetricCatalog } from "./reportSnapshot";

const evidenceSchema = z.object({
  metric_key: z.string().min(1).max(120),
  observed_value: z.union([z.number(), z.string().max(80)]),
}).strict();

const insightSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.string().min(1).max(80),
  statement: z.string().min(1).max(500),
  evidence: z.array(evidenceSchema).min(1).max(4),
  confidence: z.number().min(0).max(1),
  recommended_action: z.string().min(1).max(400),
}).strict();

const responseSchema = z.object({
  executive_summary: z.string().min(1).max(1200),
  insights: z.array(insightSchema).max(10),
}).strict();

const structuredOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["executive_summary", "insights"],
  properties: {
    executive_summary: { type: "string", minLength: 1, maxLength: 1200 },
    insights: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "severity",
          "category",
          "statement",
          "evidence",
          "confidence",
          "recommended_action",
        ],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          title: { type: "string", minLength: 1, maxLength: 120 },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low", "info"],
          },
          category: { type: "string", minLength: 1, maxLength: 80 },
          statement: { type: "string", minLength: 1, maxLength: 500 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["metric_key", "observed_value"],
              properties: {
                metric_key: { type: "string", minLength: 1, maxLength: 120 },
                observed_value: {
                  anyOf: [
                    { type: "number" },
                    { type: "string", maxLength: 80 },
                  ],
                },
              },
            },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          recommended_action: { type: "string", minLength: 1, maxLength: 400 },
        },
      },
    },
  },
} as const;

export type InsightsProviderResult = {
  insights: ReportInsights;
  provider: string;
  model: string;
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface ReportInsightsProvider {
  generate(snapshot: ReportSnapshotV1): Promise<InsightsProviderResult>;
}

function deterministicSummary(snapshot: ReportSnapshotV1) {
  const parts = [
    `El reporte cubre del ${snapshot.period.start} al ${snapshot.period.end}.`,
  ];
  if (snapshot.financial.approved_budget > 0) {
    parts.push(
      `El gasto acumulado representa ${snapshot.financial.exercised_percent.toFixed(1)}% del presupuesto aprobado.`,
    );
  }
  if (snapshot.program.scheduled_activities > 0) {
    parts.push(
      `El avance físico es ${snapshot.program.physical_progress_percent.toFixed(1)}% frente a ${snapshot.program.planned_progress_percent.toFixed(1)}% planeado.`,
    );
  }
  if (snapshot.requisitions.overdue_deliveries > 0) {
    parts.push(
      `Hay ${snapshot.requisitions.overdue_deliveries} entregas vencidas que requieren seguimiento.`,
    );
  }
  return parts.join(" ");
}

function makeRuleInsight(
  id: string,
  title: string,
  severity: ReportInsight["severity"],
  category: string,
  statement: string,
  metricKey: string,
  observedValue: number | string,
  action: string,
): ReportInsight {
  return {
    id,
    title,
    severity,
    category,
    statement,
    evidence: [{ metric_key: metricKey, observed_value: observedValue }],
    confidence: 1,
    recommended_action: action,
    source: "rule",
  };
}

export function deterministicReportInsights(
  snapshot: ReportSnapshotV1,
): ReportInsights {
  const insights: ReportInsight[] = [];
  const financial = snapshot.financial;
  const ev = snapshot.earned_value;

  if (financial.approved_budget > 0 && financial.balance < 0) {
    insights.push(makeRuleInsight(
      "rule-budget-overrun",
      "Sobrecosto acumulado",
      "critical",
      "presupuesto",
      "El gasto acumulado supera el presupuesto aprobado.",
      "financial.balance",
      financial.balance,
      "Congelar compromisos no críticos y revisar las partidas con mayor desviación.",
    ));
  }
  if (ev.cpi !== null && ev.cpi < 0.9) {
    insights.push(makeRuleInsight(
      "rule-low-cpi",
      "Eficiencia de costo por debajo del umbral",
      ev.cpi < 0.8 ? "critical" : "high",
      "valor ganado",
      "El CPI indica que el valor producido es menor al costo incurrido.",
      "earned_value.cpi",
      ev.cpi,
      "Revisar rendimientos, precios unitarios y alcance de las partidas de mayor gasto.",
    ));
  }
  if (ev.spi !== null && ev.spi < 0.9) {
    insights.push(makeRuleInsight(
      "rule-low-spi",
      "Ritmo de ejecución atrasado",
      ev.spi < 0.8 ? "critical" : "high",
      "programa",
      "El SPI muestra un avance menor al valor planeado para la fecha de corte.",
      "earned_value.spi",
      ev.spi,
      "Actualizar la ruta crítica y asignar responsables a las actividades atrasadas.",
    ));
  }
  const projectionDeviation = snapshot.projection.actual_vs_projection_percent;
  if (projectionDeviation !== null && Math.abs(projectionDeviation) >= 10) {
    insights.push(makeRuleInsight(
      "rule-projection-deviation",
      "Desviación relevante contra la proyección",
      Math.abs(projectionDeviation) >= 20 ? "high" : "medium",
      "flujo",
      "El gasto real acumulado se separa de la proyección semanal.",
      "projection.actual_vs_projection_percent",
      projectionDeviation,
      "Validar el calendario de pagos y actualizar la proyección de flujo.",
    ));
  }
  if (snapshot.requisitions.overdue_deliveries > 0) {
    insights.push(makeRuleInsight(
      "rule-overdue-deliveries",
      "Entregas vencidas",
      snapshot.requisitions.overdue_deliveries >= 5 ? "high" : "medium",
      "requisiciones",
      "Existen requisiciones cuya fecha de entrega venció sin marcarse como completas.",
      "requisitions.overdue_deliveries",
      snapshot.requisitions.overdue_deliveries,
      "Confirmar fecha comprometida con proveedores y priorizar insumos de la ruta crítica.",
    ));
  }
  if (snapshot.data_quality.score < 80) {
    insights.push(makeRuleInsight(
      "rule-data-quality",
      "Calidad de datos insuficiente",
      snapshot.data_quality.score < 60 ? "high" : "medium",
      "datos",
      "Las incidencias de calidad pueden reducir la confiabilidad del análisis.",
      "data_quality.score",
      snapshot.data_quality.score,
      "Corregir fechas, ponderaciones, monedas y proyecciones señaladas en el anexo.",
    ));
  }

  return {
    executive_summary: deterministicSummary(snapshot),
    insights,
  };
}

function extractResponseText(payload: unknown) {
  const response = payload as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    }>;
  };
  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal || "OpenAI refused the request");
      }
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("OpenAI response did not include structured output");
}

function validateAiInsights(
  parsed: z.infer<typeof responseSchema>,
  snapshot: ReportSnapshotV1,
) {
  const catalog = reportMetricCatalog(snapshot);
  const insights: ReportInsight[] = [];
  for (const insight of parsed.insights) {
    const verifiedEvidence = insight.evidence
      .filter((evidence) =>
        Object.prototype.hasOwnProperty.call(catalog, evidence.metric_key))
      .map((evidence) => ({
        metric_key: evidence.metric_key,
        observed_value: catalog[evidence.metric_key as keyof typeof catalog],
      }));
    if (!verifiedEvidence.length) continue;
    insights.push({
      ...insight,
      evidence: verifiedEvidence,
      source: "ai",
    });
  }
  return insights;
}

export class OpenAIReportInsightsProvider implements ReportInsightsProvider {
  async generate(snapshot: ReportSnapshotV1): Promise<InsightsProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_REPORT_MODEL || "gpt-5.6-terra";
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const metrics = reportMetricCatalog(snapshot);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "medium" },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Eres un analista de control financiero de obra. Explica tendencias y prioriza riesgos usando exclusivamente las métricas entregadas. No recalcules cantidades, no inventes hechos, no identifiques personas y no uses conocimiento externo. Cada insight debe citar al menos una metric_key exacta.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  period: snapshot.period,
                  visibility_profile: snapshot.visibility_profile,
                  metrics,
                  top_variances: snapshot.variances.slice(0, 8),
                  data_quality: snapshot.data_quality,
                  methodology: snapshot.methodology,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "financial_report_insights",
            strict: true,
            schema: structuredOutputJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const payload = await response.json();
    if (!response.ok) {
      const errorPayload = payload as { error?: { message?: string } };
      throw new Error(errorPayload.error?.message || `OpenAI HTTP ${response.status}`);
    }
    const raw = extractResponseText(payload);
    const parsedJson = JSON.parse(raw);
    const parsed = responseSchema.parse(parsedJson);
    const apiResponse = payload as {
      id?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      provider: "openai",
      model,
      responseId: apiResponse.id,
      inputTokens: apiResponse.usage?.input_tokens,
      outputTokens: apiResponse.usage?.output_tokens,
      insights: {
        executive_summary: parsed.executive_summary,
        insights: validateAiInsights(parsed, snapshot),
      },
    };
  }
}

export async function generateReportInsights(
  snapshot: ReportSnapshotV1,
): Promise<InsightsProviderResult> {
  const deterministic = deterministicReportInsights(snapshot);
  try {
    const ai = await new OpenAIReportInsightsProvider().generate(snapshot);
    const knownIds = new Set(deterministic.insights.map((item) => item.id));
    return {
      ...ai,
      insights: {
        executive_summary: ai.insights.executive_summary,
        insights: [
          ...deterministic.insights,
          ...ai.insights.insights.filter((item) => !knownIds.has(item.id)),
        ],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI error";
    return {
      provider: "openai",
      model: process.env.OPENAI_REPORT_MODEL || "gpt-5.6-terra",
      insights: {
        ...deterministic,
        warning: `Insights de IA no disponibles: ${message}`,
      },
    } satisfies InsightsProviderResult;
  }
}
