export type BitacoraRole = "admin" | "user" | "finance" | "contratista" | "viewer" | string;

export type SyncState = "synced" | "pending" | "syncing" | "error" | "conflict";

export interface OfflineProfile {
  clerkId: string;
  userId: string;
  name: string;
  email: string;
  role: BitacoraRole;
  organizationId?: string;
  projectIds: string[];
  verifiedAt: number;
  expiresAt: number;
}

export interface LocalProject {
  key: string;
  userId: string;
  projectId: string;
  name: string;
  raw: Record<string, unknown>;
}

export interface LocalPartida {
  key: string;
  userId: string;
  projectId: string;
  partidaId: string;
  name: string;
  nivel: number;
  parentId?: string;
  raw: Record<string, unknown>;
}

export interface BitacoraFields {
  categoria: string;
  partidaId: string;
  familiasTags: string[];
  responsable: string;
  fecha: string;
  avanceDia: string;
  comentarios?: string;
  status: string;
}

export interface LocalEntry extends BitacoraFields {
  key: string;
  userId: string;
  projectId: string;
  clientId: string;
  serverId?: string;
  revision: number;
  baseRevision: number;
  syncVersion: number;
  uploadedAt: number;
  updatedAt: number;
  deleted: boolean;
  syncState: SyncState;
  syncError?: string;
  serverSnapshot?: RemoteEntry;
}

export interface LocalAttachment {
  key: string;
  userId: string;
  projectId: string;
  entryClientId: string;
  clientId: string;
  serverId?: string;
  storageId?: string;
  kind: "photo" | "document";
  name: string;
  description?: string;
  mimeType?: string;
  size: number;
  url?: string;
  blob?: Blob;
  thumbnail?: Blob;
  downloadRequested?: boolean;
  deleted: boolean;
  syncState: "synced" | "pending" | "uploaded";
}

export interface OutboxOperation {
  operationId: string;
  userId: string;
  projectId: string;
  entryClientId: string;
  operation: "create" | "update" | "delete";
  baseRevision: number;
  removedAttachmentClientIds: string[];
  status: "pending" | "syncing" | "paused";
  attempts: number;
  error?: string;
  nextRetryAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SyncMetadata {
  key: string;
  userId: string;
  projectId: string;
  version: number;
  prepared: boolean;
  lastSyncAt?: number;
  status: "idle" | "syncing" | "error" | "conflict";
  error?: string;
}

export interface CachedAssignableUser {
  key: string;
  userId: string;
  projectId: string;
  targetUserId: string;
  name: string;
  role: string;
}

export interface RemoteAttachment {
  _id: string;
  client_id?: string;
  clientId?: string;
  kind?: "photo" | "document";
  storage_id?: string;
  tipo_documento?: string;
  nombre?: string;
  descripcion?: string;
  url?: string | null;
  deleted_at?: number;
}

export interface RemoteEntry {
  _id: string;
  proyecto: string;
  client_id: string;
  revision: number;
  sync_version: number;
  updated_at: number;
  deleted_at?: number;
  categoria: string;
  partida_id: string;
  familias_tags: string[];
  responsable: string;
  fecha: string;
  avance_dia: string;
  comentarios?: string;
  status: string;
  uploaded_at: number;
  departamento?: string;
  fotos?: RemoteAttachment[];
  documentos?: RemoteAttachment[];
}

export interface PreparedAttachment {
  clientId?: string;
  file: File;
  kind: "photo" | "document";
  description?: string;
}

export interface BitacoraEntryView {
  _id: string;
  client_id: string;
  server_id?: string;
  revision: number;
  sync_state: SyncState;
  sync_error?: string;
  locally_deleted?: boolean;
  server_deleted?: boolean;
  server_version?: {
    fecha: string;
    responsable: string;
    avance_dia: string;
    comentarios?: string;
    status: string;
  };
  departamento?: string;
  categoria: string;
  partida_id: string;
  familias_tags: string[];
  responsable: string;
  fecha: string;
  avance_dia: string;
  comentarios?: string;
  status: string;
  uploaded_at: number;
  fotos: BitacoraAttachmentView[];
  documentos: BitacoraAttachmentView[];
}

export interface BitacoraAttachmentView {
  _id: string;
  client_id: string;
  server_id?: string;
  storage_id?: string;
  nombre: string;
  descripcion?: string;
  url?: string | null;
  local_url?: string;
  thumbnail_url?: string;
  available_offline: boolean;
  download_requested?: boolean;
  pending: boolean;
}

export interface StorageCapacity {
  usage: number;
  quota: number;
  projectedRatio: number;
  warning: boolean;
  blocked: boolean;
}
