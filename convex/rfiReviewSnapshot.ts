// One deterministic snapshot for the information a person reviews. Enriched
// names/URLs and read receipts are deliberately excluded from the comparison.
const RFI_FIELDS = [
  "_id", "proyecto", "prefix", "number", "revision_number", "previous_revision_id",
  "subject", "background", "question", "status", "creator_id", "received_from_id",
  "rfi_manager_id", "assignee_ids", "required_assignee_ids", "distribution_user_ids",
  "due_date", "location", "drawing_number", "spec_section", "partida_id", "familia",
  "sub_partida", "project_stage", "cost_impact", "cost_impact_amount", "schedule_impact",
  "schedule_impact_days", "is_private", "created_at", "updated_at", "opened_at", "closed_at",
] as const;
const RESPONSE_FIELDS = ["_id", "author_id", "author_name", "body", "is_official", "created_at", "updated_at"] as const;
const ATTACHMENT_FIELDS = ["_id", "response_id", "storage_id", "nombre", "type", "size", "uploaded_by_id", "uploaded_at"] as const;
const USER_SETS = new Set(["assignee_ids", "required_assignee_ids", "distribution_user_ids"]);

function pick(source: object, fields: readonly string[]) {
  const record = source as Record<string, unknown>;
  return fields.map((field) => {
    const value = record[field];
    return [field, USER_SETS.has(field) && Array.isArray(value) ? [...value].sort() : value ?? null];
  });
}

function ordered(records: readonly object[], fields: readonly string[]) {
  return [...records]
    .sort((a, b) => String((a as { _id: string })._id).localeCompare(String((b as { _id: string })._id)))
    .map((record) => pick(record, fields));
}

export function rfiReviewSnapshot(rfi: object, responses: readonly object[], attachments: readonly object[]) {
  return JSON.stringify([pick(rfi, RFI_FIELDS), ordered(responses, RESPONSE_FIELDS), ordered(attachments, ATTACHMENT_FIELDS)]);
}

export const RFI_REVIEW_CONFLICT = "La RFI cambió mientras la revisabas. Actualiza la revisión antes de continuar.";
