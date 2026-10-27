import { validateBitacoraEdit } from "../../../convex/bitacoraRules";
import type { BitacoraEntryView, BitacoraFields, BitacoraSaveArgs } from "./types";

export function protectedBitacoraFields(fields: BitacoraFields) {
  return { categoria: fields.categoria, partida_id: fields.partidaId, familias_tags: fields.familiasTags,
    responsable: fields.responsable, fecha: fields.fecha, status: fields.status };
}

export function assertEntryEdit(role: string, clerkId: string, entry: BitacoraEntryView, args: BitacoraSaveArgs) {
  if (entry.locally_deleted || entry.server_deleted) throw new Error("El reporte fue eliminado. No se puede editar.");
  if (entry.sync_state === "conflict") throw new Error("Resuelve el conflicto con el servidor antes de editar este reporte.");
  if (entry.sync_state === "syncing") throw new Error("El reporte se está sincronizando. Espera a que termine y vuelve a guardar; tus cambios siguen en el formulario.");
  if (args.expectedRevision !== undefined && args.expectedRevision !== entry.revision) {
    throw new Error("El reporte cambió desde que abriste la edición. Tus cambios siguen en el formulario; vuelve a abrir el reporte para revisar la versión actual.");
  }
  const kept = args.keptAttachmentClientIds && new Set(args.keptAttachmentClientIds);
  const files = [...entry.fotos.map(file => ({ ...file, kind: "photo" as const })),
    ...entry.documentos.map(file => ({ ...file, kind: "document" as const }))];
  const error = validateBitacoraEdit({ role, clerkId, createdBy: entry.created_by, previous: entry,
    next: protectedBitacoraFields(args.fields),
    attachments: files.map(file => ({ clientId: file.client_id, kind: file.kind, name: file.nombre, description: file.descripcion })),
    addedAttachments: args.newAttachments, updatedAttachments: args.attachmentUpdates ?? [],
    removedAttachmentClientIds: kept ? files.filter(file => !kept.has(file.client_id)).map(file => file.client_id) : [],
  });
  if (error) throw new Error(error);
}
