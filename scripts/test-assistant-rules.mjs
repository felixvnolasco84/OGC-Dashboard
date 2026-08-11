import assert from "node:assert/strict";
import {
  assistantAnswerSchema,
  combineOverallStatuses,
  conversationTitle,
  extractAssistantResponseText,
  selectAssistantFunctionCalls,
  validateReferenceRanges,
} from "../convex/assistantTypes.ts";
import {
  assistantDefaultCutoff,
  deterministicAssistantStatus,
  isOperationallyOverdue,
  resolveAssistantCutoff,
  resolveAssistantProjectContext,
} from "../convex/assistantRules.ts";
import {
  getActiveMention,
  rebaseMentionRanges,
} from "../src/lib/mentionRanges.ts";
import { assistantEvalCases, scoreAssistantEval } from "./assistant-eval-cases.mjs";
import {
  buildCostItemReferenceId,
  canonicalTransactionStatus,
  compactCostText,
  inferCostGroupBy,
  inferCostPaymentScope,
  isCostIntent,
  normalizeCostCurrency,
  normalizeCostText,
  parseCostItemReferenceId,
  resolveCostCandidates,
  resolveCostDateRange,
} from "../convex/costRules.ts";

assert.deepEqual(getActiveMention("Compara @Proy", 13), {
  start: 8,
  end: 13,
  query: "Proy",
});
assert.equal(getActiveMention("correo@dominio", 14), undefined);

const originalMention = { type: "project", id: "p1", project_id: "p1", label: "@Obra Uno", start: 7, end: 16 };
assert.deepEqual(
  rebaseMentionRanges("Estado @Obra Uno", "Dame Estado @Obra Uno", [originalMention]),
  [{ ...originalMention, start: 12, end: 21 }],
);
assert.deepEqual(
  rebaseMentionRanges("Estado @Obra Uno", "Estado @Obra XUno", [originalMention]),
  [],
);

const text = "Compara @Obra Uno y @Obra Dos";
const references = [
  { type: "project", id: "p1", project_id: "p1", label: "@Obra Uno", start: 8, end: 17 },
  { type: "project", id: "p2", project_id: "p2", label: "@Obra Dos", start: 20, end: 29 },
];
assert.deepEqual(validateReferenceRanges(text, references), references);
assert.throws(
  () => validateReferenceRanges(text, [{ ...references[0], label: "@Falsificada" }]),
  /modificado/,
);
assert.throws(
  () => validateReferenceRanges(text, [references[0], { ...references[1], start: 16 }]),
  /superponerse|modificado/,
);
assert.throws(
  () => validateReferenceRanges("x".repeat(4001), []),
  /4,000/,
);

assert.deepEqual(resolveAssistantProjectContext([], "route-project"), ["route-project"]);
assert.deepEqual(resolveAssistantProjectContext(references, "route-project"), ["p1", "p2"]);
assert.deepEqual(resolveAssistantProjectContext([
  { type: "person", id: "u1", project_id: "p3", label: "@Ana", start: 0, end: 4 },
], "route-project"), ["p3"]);
assert.deepEqual(resolveAssistantProjectContext([], undefined), []);

assert.deepEqual(assistantDefaultCutoff("2024-03-01"), {
  accumulated_through: "2024-03-01",
  activity_from: "2024-02-01",
  activity_through: "2024-03-01",
});
assert.deepEqual(resolveAssistantCutoff("Compara del 01/07/2026 al 31/07/2026", "2026-08-06"), {
  accumulated_through: "2026-07-31",
  activity_from: "2026-07-01",
  activity_through: "2026-07-31",
});
assert.deepEqual(resolveAssistantCutoff("Estatus al 2026-07-15", "2026-08-06"), {
  accumulated_through: "2026-07-15",
  activity_from: "2026-06-16",
  activity_through: "2026-07-15",
});
assert.equal(isOperationallyOverdue({ active: true, dueDate: "2026-07-01", asOf: "2026-08-06" }), true);
assert.equal(isOperationallyOverdue({ active: false, dueDate: "2026-07-01", asOf: "2026-08-06" }), false);

assert.equal(normalizeCostText("  PEGA-MÁRMOL  "), "pega marmol");
assert.equal(compactCostText("PEGA MÁRMOL"), "pegamarmol");
assert.equal(normalizeCostCurrency(" mxn "), "MXN");
assert.equal(normalizeCostCurrency("pesos"), "SIN_MONEDA");
assert.equal(normalizeCostCurrency(undefined), "SIN_MONEDA");
assert.equal(isCostIntent("¿Cuánto he gastado en acero?"), true);
assert.equal(inferCostPaymentScope("¿Cuánto tengo por pagar?"), "pending");
assert.equal(inferCostPaymentScope("Compara lo pagado y por pagar"), "all");
assert.equal(inferCostGroupBy("Desglosa el gasto por proveedor"), "provider");
assert.deepEqual(resolveCostDateRange("Gasto al 2026-07-15", "2026-08-06"), {
  date_from: undefined,
  date_to: "2026-07-15",
  explicit: true,
});
assert.deepEqual(resolveCostDateRange("Gasto del 01/07/2026 al 31/07/2026", "2026-08-06"), {
  date_from: "2026-07-01",
  date_to: "2026-07-31",
  explicit: true,
});
const aceroId = buildCostItemReferenceId("family", "ACERO");
assert.deepEqual(parseCostItemReferenceId(aceroId), { kind: "family", normalized: "acero" });
assert.deepEqual(
  resolveCostCandidates("¿Cuánto he gastado en ACERO?", [
    { id: aceroId, kind: "family", label: "ACERO" },
    { id: aceroId, kind: "family", label: "ACERO" },
  ]).status,
  "exact",
);
assert.equal(resolveCostCandidates("PEGAMARMOL", [
  { id: buildCostItemReferenceId("concept", "PEGAMARMOL"), kind: "concept", label: "PEGAMARMOL" },
  { id: "provider:p1", kind: "provider", label: "PEGAMARMOL" },
]).status, "ambiguous");
assert.equal(canonicalTransactionStatus("Pagado"), "paid");
assert.equal(canonicalTransactionStatus("Pendiente"), "pending");
assert.equal(canonicalTransactionStatus("Cancelado"), "other");

assert.equal(deterministicAssistantStatus({ hasData: false, hasCriticalInsight: true, hasAttentionInsight: true, hasBlockedOrOverdueWork: true }), "insufficient_data");
assert.equal(deterministicAssistantStatus({ hasData: true, hasCriticalInsight: true, hasAttentionInsight: false, hasBlockedOrOverdueWork: false }), "critical");
assert.equal(deterministicAssistantStatus({ hasData: true, hasCriticalInsight: false, hasAttentionInsight: true, hasBlockedOrOverdueWork: false }), "attention");
assert.equal(deterministicAssistantStatus({ hasData: true, hasCriticalInsight: false, hasAttentionInsight: false, hasBlockedOrOverdueWork: true }), "attention");
assert.equal(deterministicAssistantStatus({ hasData: true, hasCriticalInsight: false, hasAttentionInsight: false, hasBlockedOrOverdueWork: false }), "on_track");
assert.equal(combineOverallStatuses(["on_track", "attention", "critical"]), "critical");
assert.equal(combineOverallStatuses(["on_track", "insufficient_data"]), "insufficient_data");

assert.equal(conversationTitle("  Estado   ejecutivo del proyecto  "), "Estado ejecutivo del proyecto");
assert.equal(conversationTitle("a".repeat(80)).length, 60);

const validAnswer = {
  schema_version: 2,
  answer_status: "answered",
  overall_status: "attention",
  summary: "Hay una entrega vencida.",
  metrics: [{ label: "Entregas vencidas", value: "1", evidence_ids: ["metric:p1:overdue"] }],
  risks: [{ severity: "medium", title: "Entrega vencida", detail: "La entrega requiere seguimiento.", evidence_ids: ["metric:p1:overdue"] }],
  recommendations: [{ priority: "high", action: "Confirmar fecha comprometida.", evidence_ids: ["metric:p1:overdue"] }],
  evidence: [{ id: "metric:p1:overdue", type: "metric", label: "Entregas vencidas", project_id: "p1", observed_value: "1", as_of: "2026-08-06", url: "/proyecto/p1/reportes" }],
  follow_up_prompts: ["¿Cuáles son las requisiciones vencidas?"],
  limitations: [],
};
assert.equal(assistantAnswerSchema.parse(validAnswer).overall_status, "attention");
assert.throws(() => assistantAnswerSchema.parse({ ...validAnswer, metrics: [{ label: "Sin evidencia", value: "1", evidence_ids: [] }] }));
assert.throws(() => assistantAnswerSchema.parse({ ...validAnswer, follow_up_prompts: ["1", "2", "3", "4"] }));

const parallelToolResponse = {
  output: [
    { type: "reasoning", id: "reasoning-1" },
    { type: "function_call", name: "list_tasks", arguments: '{"project_ids":["p1"]}', call_id: "call-1" },
    { type: "function_call", name: "list_requisitions", arguments: '{"project_ids":["p1"]}', call_id: "call-2" },
    { type: "function_call", name: "list_rfis", arguments: '{"project_ids":["p1"]}', call_id: "call-3" },
    { type: "function_call", name: "get_entity_detail", arguments: '{"entity_type":"task","ids":["t1"]}', call_id: "call-4" },
  ],
};
const selectedCalls = selectAssistantFunctionCalls(parallelToolResponse, 3);
assert.deepEqual(selectedCalls.accepted.map((call) => call.call_id), ["call-1", "call-2", "call-3"]);
assert.deepEqual(selectedCalls.rejected.map((call) => call.call_id), ["call-4"]);
assert.equal(extractAssistantResponseText({ output_text: JSON.stringify(validAnswer) }), JSON.stringify(validAnswer));
assert.throws(
  () => extractAssistantResponseText({ output: [{ content: [{ type: "refusal", refusal: "No puedo responder" }] }] }),
  (error) => error.code === "refusal",
);
assert.throws(
  () => JSON.parse(extractAssistantResponseText({ output_text: "json inválido" })),
  SyntaxError,
);
assert.ok(assistantEvalCases.length >= 20);
const perfectEval = scoreAssistantEval(assistantEvalCases.map((testCase) => ({
  id: testCase.id,
  tool_names: testCase.expectedTools,
  evidence_valid: true,
  complete: true,
  valid_json: true,
})));
assert.equal(perfectEval.composite, 1);

console.log("Assistant rules passed: mentions, context precedence, cutoffs, deterministic status, strict responses, refusals, and parallel tool limits.");
