const CREATOR_ROLES = new Set(["admin", "user", "finance", "contratista"]);
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const BITACORA_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function canCreateBitacora(role: string) {
  return CREATOR_ROLES.has(role);
}

export function classifyBitacoraRevision(
  baseRevision: number,
  currentRevision: number,
  deleted: boolean,
): "match" | "changed" | "deleted" {
  if (deleted) return "deleted";
  return baseRevision === currentRevision ? "match" : "changed";
}

export function validateBitacoraAttachmentMetadata(
  kind: "photo" | "document",
  size: number,
  contentType: string,
) {
  if (size > BITACORA_MAX_ATTACHMENT_BYTES) return "Cada archivo debe pesar como máximo 10 MiB.";
  const allowed = kind === "photo" ? PHOTO_MIME_TYPES.has(contentType) : DOCUMENT_MIME_TYPES.has(contentType);
  return allowed ? null : `Tipo de archivo no permitido: ${contentType || "desconocido"}.`;
}
