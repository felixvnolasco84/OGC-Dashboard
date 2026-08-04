import type { Doc } from "../../../convex/_generated/dataModel";

export type PlanoListItem = Doc<"planos"> & {
  url: string | null;
  annotation_count: number;
  open_annotation_count: number;
  comment_count: number;
};

export type PlanoFolder = Doc<"plano_carpetas"> & {
  plan_count: number;
};

export type PlanoAnnotation = Doc<"plano_anotaciones"> & {
  comment_count: number;
};

export type PlanoComment = Doc<"plano_comentarios">;

export type MentionableUser = {
  _id: Doc<"users">["_id"];
  clerkId: string;
  name: string;
  email: string;
  role: string;
  identity_incomplete: boolean;
};

export type CommentMentionDraft = {
  user_id: Doc<"users">["_id"];
  start: number;
  end: number;
  label: string;
};

export type PlanoMentionNotification = Doc<"plano_mention_notifications"> & {
  plano_titulo: string;
  proyecto_nombre: string;
  pagina?: number;
  is_unread: boolean;
};

export type PlanoDetail = Doc<"planos"> & {
  url: string | null;
  annotations: PlanoAnnotation[];
  comments: PlanoComment[];
};

export type AnnotationTool = "select" | "cloud" | "freehand";

export type AnnotationDraft = {
  pagina: number;
  tipo: Exclude<AnnotationTool, "select">;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  puntos?: Array<{ x: number; y: number }>;
};
