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

export function canEditBitacora(role: string, clerkId: string, createdBy?: string) {
  return role === "admin" || (canCreateBitacora(role) && Boolean(createdBy) && createdBy === clerkId);
}

interface ProtectedFields {
  categoria: string;
  partida_id: string;
  familias_tags: string[];
  responsable: string;
  fecha: string;
  status?: string;
}

export function bitacoraClassificationEqual(previous: ProtectedFields, next: ProtectedFields) {
  return previous.partida_id === next.partida_id &&
    JSON.stringify([...previous.familias_tags].sort()) === JSON.stringify([...next.familias_tags].sort());
}

interface EditAttachment {
  clientId: string;
  kind: "photo" | "document";
  name: string;
  description?: string;
}

// Shared by the server and the local repository. Names never establish ownership.
export function validateBitacoraEdit(args: {
  role: string; clerkId: string; createdBy?: string;
  previous: ProtectedFields; next: ProtectedFields;
  attachments: EditAttachment[];
  addedAttachments: Array<{ kind: "photo" | "document"; description?: string }>;
  updatedAttachments: Array<{ clientId: string; name?: string; description?: string }>;
  removedAttachmentClientIds: string[];
}) {
  if (!canEditBitacora(args.role, args.clerkId, args.createdBy)) {
    return "Solo el autor o un administrador puede editar este reporte.";
  }
  if (args.role !== "admin") {
    const { previous, next } = args;
    if (previous.categoria !== next.categoria || !bitacoraClassificationEqual(previous, next) ||
      previous.responsable !== next.responsable || previous.fecha !== next.fecha ||
      (previous.status ?? "Sin problemas") !== (next.status ?? "Sin problemas")) {
      return "Solo un administrador puede cambiar fecha, responsable, clasificación o estado.";
    }
    if (args.removedAttachmentClientIds.length) return "Solo un administrador puede eliminar archivos guardados.";
    if (args.addedAttachments.some(file => file.kind === "document")) return "Solo un administrador puede modificar documentos de un reporte guardado.";
  }
  if (args.addedAttachments.some(file => file.kind === "photo" && !file.description?.trim())) {
    return "Agrega una descripción a cada fotografía nueva.";
  }
  const files = new Map(args.attachments.map(file => [file.clientId, file]));
  for (const update of args.updatedAttachments) {
    const file = files.get(update.clientId);
    if (!file) return "El archivo no pertenece a este reporte.";
    const renamed = update.name !== undefined && update.name !== file.name;
    const described = update.description !== undefined && update.description !== (file.description ?? "");
    if (args.role !== "admin" && (renamed || (file.kind === "document" && described))) {
      return "Solo un administrador puede renombrar archivos o modificar documentos.";
    }
    if (file.kind === "photo" && described && !update.description?.trim()) return "La descripción de la fotografía no puede quedar vacía.";
  }
  return null;
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
