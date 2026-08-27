export const assistantEvalCases = [
  { id: "executive-current", question: "Dame el estado ejecutivo de @Proyecto.", expectedTools: ["get_project_overview"] },
  { id: "budget-current", question: "¿Cuál es el presupuesto, gasto y saldo disponible de @Proyecto?", expectedTools: ["get_project_overview"] },
  { id: "cost-material", question: "¿Cuánto he gastado en PEGAMARMOL en @Proyecto?", expectedTools: ["query_project_costs"] },
  { id: "cost-family", question: "¿Cuánto he gastado en ACERO en @Proyecto?", expectedTools: ["query_project_costs"] },
  { id: "cost-provider", question: "¿Cuánto he pagado a @Proveedor en @Proyecto?", expectedTools: ["query_project_costs"] },
  { id: "cost-pending", question: "¿Cuánto tengo por pagar de ACERO en @Proyecto?", expectedTools: ["query_project_costs"] },
  { id: "cost-period", question: "¿Cuánto gasté en materiales del 01/07/2026 al 31/07/2026 en @Proyecto?", expectedTools: ["query_project_costs"] },
  { id: "cost-comparison", question: "Compara el gasto en ACERO de @Proyecto A, @Proyecto B y @Proyecto C.", expectedTools: ["query_project_costs"] },
  { id: "invoice-minor-tools", question: "Desglosa las facturas aprobadas de herramienta menor por categoría en @Proyecto.", expectedTools: ["query_invoice_breakdown"] },
  { id: "invoice-issued-period", question: "¿Qué herramienta menor aparece en facturas emitidas del 01/08/2026 al 31/08/2026?", expectedTools: ["query_invoice_breakdown"] },
  { id: "invoice-paid-period", question: "¿Qué conceptos de factura pagamos del 01/08/2026 al 31/08/2026?", expectedTools: ["query_invoice_breakdown"] },
  { id: "invoice-credit-notes", question: "¿Qué notas de crédito ajustaron el gasto de herramienta menor?", expectedTools: ["query_invoice_breakdown"] },
  { id: "invoice-payment-complements", question: "¿Los complementos de pago están aumentando dos veces el gasto?", expectedTools: ["query_invoice_breakdown"] },
  { id: "earned-value", question: "Explícame el CPI, SPI y la proyección al término de @Proyecto.", expectedTools: ["get_project_overview"] },
  { id: "cashflow", question: "¿Cómo va el flujo real contra la proyección de @Proyecto?", expectedTools: ["get_project_overview"] },
  { id: "data-quality", question: "¿Qué tan confiables son los datos de @Proyecto y qué falta capturar?", expectedTools: ["get_project_overview"] },
  { id: "project-comparison", question: "Compara presupuesto, avance y riesgos de @Proyecto A, @Proyecto B y @Proyecto C.", expectedTools: ["get_project_overview"] },
  { id: "attention-week", question: "¿Qué tareas, requisiciones o RFIs requieren atención esta semana?", expectedTools: ["get_project_overview", "list_tasks", "list_requisitions", "list_rfis"] },
  { id: "overdue-tasks", question: "Lista las tareas vencidas y bloqueadas de @Proyecto.", expectedTools: ["get_project_overview", "list_tasks"] },
  { id: "urgent-tasks", question: "¿Cuáles son las tareas urgentes abiertas de @Proyecto?", expectedTools: ["get_project_overview", "list_tasks"] },
  { id: "person-tasks", question: "¿Qué tareas pendientes tiene @Persona en @Proyecto?", expectedTools: ["get_project_overview", "list_tasks"] },
  { id: "person-all", question: "¿Qué pendientes tiene @Persona entre tareas, requisiciones y RFIs de @Proyecto?", expectedTools: ["get_project_overview", "list_tasks", "list_requisitions", "list_rfis"] },
  { id: "requisitions-review", question: "Lista las requisiciones pendientes de revisión de @Proyecto.", expectedTools: ["get_project_overview", "list_requisitions"] },
  { id: "requisitions-delivery", question: "¿Qué requisiciones tienen entregas vencidas en @Proyecto?", expectedTools: ["get_project_overview", "list_requisitions"] },
  { id: "rfi-open", question: "¿Cuáles RFIs siguen abiertas en @Proyecto?", expectedTools: ["get_project_overview", "list_rfis"] },
  { id: "rfi-impact", question: "Lista las RFIs con impacto de costo o programa registrado en @Proyecto.", expectedTools: ["get_project_overview", "list_rfis"] },
  { id: "task-detail", question: "Dame el detalle y vencimiento de @Tarea.", expectedTools: ["get_project_overview", "get_entity_detail"] },
  { id: "requisition-detail", question: "Resume el estado de pago, revisión y entrega de @Requisición.", expectedTools: ["get_project_overview", "get_entity_detail"] },
  { id: "rfi-detail", question: "Resume el estado, responsables e impactos de @RFI.", expectedTools: ["get_project_overview", "get_entity_detail"] },
  { id: "explicit-period", question: "Compara el avance de @Proyecto A y @Proyecto B del 01/07/2026 al 31/07/2026.", expectedTools: ["get_project_overview"] },
  { id: "recommendations", question: "Con los datos actuales de @Proyecto, ¿qué tres acciones conviene priorizar esta semana?", expectedTools: ["get_project_overview"] },
];

export function scoreAssistantEval(results) {
  const casesById = new Map(assistantEvalCases.map((item) => [item.id, item]));
  let toolSelection = 0;
  let evidence = 0;
  let completeness = 0;
  let valid = 0;
  for (const result of results) {
    const testCase = casesById.get(result.id);
    if (!testCase) continue;
    const actualTools = new Set(result.tool_names || []);
    if (testCase.expectedTools.every((tool) => actualTools.has(tool))) toolSelection += 1;
    if (result.evidence_valid === true) evidence += 1;
    if (result.complete === true) completeness += 1;
    if (result.valid_json === true) valid += 1;
  }
  const denominator = assistantEvalCases.length;
  return {
    cases: denominator,
    tool_selection: toolSelection / denominator,
    evidence: evidence / denominator,
    completeness: completeness / denominator,
    valid_json: valid / denominator,
    composite: (toolSelection + evidence + completeness) / (denominator * 3),
  };
}
