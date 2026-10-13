export const RFI_FORM_FIELDS: Record<string, string> = {
  subject: "Asunto", background: "Antecedentes", question: "Pregunta", received_from_id: "Solicitado por",
  rfi_manager_id: "Responsable", assignee_ids: "Asignados", required_assignee_ids: "Respuestas requeridas",
  distribution_user_ids: "Distribución", due_date: "Fecha límite", location: "Ubicación", drawing_number: "Plano",
  spec_section: "Especificación", partida_id: "Partida", familia: "Familia", sub_partida: "Subpartida",
  project_stage: "Etapa", cost_impact: "Impacto en costo", cost_impact_amount: "Monto estimado",
  schedule_impact: "Impacto en programa", schedule_impact_days: "Días estimados", is_private: "Privacidad",
};

export function rfiFormChanges(before: object, after: object) {
  const old = before as Record<string, unknown>, next = after as Record<string, unknown>;
  const normalize = (value: unknown) => Array.isArray(value) ? [...value].sort() : value === "" || value == null ? null : value;
  return Object.entries(RFI_FORM_FIELDS).filter(([key]) => JSON.stringify(normalize(old[key])) !== JSON.stringify(normalize(next[key])))
    .map(([key, label]) => ({ key, label, before: old[key], after: next[key] }));
}
