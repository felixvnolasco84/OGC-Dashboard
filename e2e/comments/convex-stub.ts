import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";

type Row = Record<string, any>;
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const publish = () => {
  generation++;
  listeners.forEach((listener) => listener());
};
const useFixture = () => useSyncExternalStore(subscribe, () => generation);
const role = new URLSearchParams(location.search).get("role") || "user";
const actor = { _id: "actor", name: "Ana López", role };
let connected = true,
  available = true;
const canWrite = () => actor.role !== "viewer" && actor.role !== "almacenista";
let photoComments: Row[] = [
  {
    _id: "photo-comment",
    photo_id: "photo1",
    user_id: "actor",
    user_name: "Ana López",
    comment: "Revisar el acabado del muro norte antes de retirar el andamio.",
    created_at: Date.UTC(2026, 9, 13, 16),
    revision: 1,
  },
  {
    _id: "other-comment",
    photo_id: "photo1",
    user_id: "other",
    user_name: "Luis Pérez",
    comment: "La inspección está prevista para mañana.",
    created_at: Date.UTC(2026, 9, 13, 17),
    revision: 1,
  },
];
let programComments: Row[] = [
  {
    _id: "program-comment",
    proyecto: "project",
    parent_type: "partida",
    parent_id: "schedule",
    comentario: "Coordinar la inspección de estructura antes del colado.",
    fecha_inicio: "13/10/2026",
    fecha_fin: "16/10/2026",
    created_at: Date.UTC(2026, 9, 13, 16),
    created_by_name: "Luis Pérez",
    revision: 1,
  },
  {
    _id: "family-comment",
    proyecto: "project",
    parent_type: "familia",
    parent_id: "family",
    comentario: "Verificar las instalaciones ocultas.",
    fecha_inicio: "14/10/2026",
    fecha_fin: "15/10/2026",
    created_at: Date.UTC(2026, 9, 13, 17),
    created_by_name: "Ana López",
    revision: 1,
  },
];
const calls: Row[] = [],
  commits: Row[] = [],
  receipts = new Map<string, unknown>();
let sequence = 0,
  fail = false,
  responseLost = false,
  hold = false;
let release: (() => void) | undefined;
Object.assign(window, {
  commentFixture: {
    calls,
    commits,
    setFailure: (value: boolean) => {
      fail = value;
    },
    loseResponse: () => {
      responseLost = true;
    },
    hold: () => {
      hold = true;
    },
    release: () => {
      release?.();
      hold = false;
    },
    connection: (value: boolean) => {
      connected = value;
      publish();
    },
    permission: (value: string) => {
      actor.role = value;
      publish();
    },
    unavailable: () => {
      available = false;
      publish();
    },
    change: (module: string) => {
      const rows = module === "photo" ? photoComments : programComments;
      const row = rows[0];
      row.revision++;
      if (module === "photo") row.comment = "Cambio externo verificado.";
      else {
        row.comentario = "Cambio externo verificado.";
        row.fecha_fin = "18/10/2026";
      }
      publish();
    },
    remove: (module: string) => {
      if (module === "photo") photoComments = photoComments.slice(1);
      else programComments = programComments.slice(1);
      publish();
    },
    programComments: () => programComments,
  },
});

export function useConvexConnectionState() {
  useFixture();
  return { isWebSocketConnected: connected };
}
export function useQuery(
  reference: Parameters<typeof getFunctionName>[0],
  args: any = {},
) {
  useFixture();
  if (args === "skip") return undefined;
  switch (getFunctionName(reference)) {
    case "users:getCurrentUser":
      return actor;
    case "bitacora:getPhotoCommentContext":
      return { available, canCreate: available && canWrite() };
    case "bitacora:getPhotoComments":
      return available
        ? photoComments
            .filter((c) => c.photo_id === args.photoId)
            .map((c) => ({
              ...c,
              can_manage:
                actor.role !== "viewer" &&
                (actor.role === "admin" || actor._id === c.user_id),
            }))
        : [];
    case "programa_obra:getComentarioContext":
      return { available, canWrite: available && canWrite() };
    case "programa_obra:getComentariosByProyecto":
      return available ? programComments : [];
    default:
      return [];
  }
}
export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  return async (args: Row) => {
    calls.push({ name, args: structuredClone(args) });
    if (hold)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (fail)
      throw new ConvexError({
        code: "TEST",
        message: "No se pudo guardar. Tu borrador se conserva.",
      });
    if (!connected || !available || !canWrite())
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "El destino o tu permiso ya no están disponibles.",
      });
    const operation = args.operationId || args.operation_id;
    if (receipts.has(operation)) return receipts.get(operation);
    const photo = name.startsWith("bitacora:");
    const rows = photo ? photoComments : programComments;
    const id = args.commentId || args.comentario_id;
    const row = rows.find((c) => c._id === id);
    const editing =
      name.endsWith("editPhotoComment") || name.endsWith("updateComentario");
    const deleting =
      name.endsWith("deletePhotoComment") || name.endsWith("deleteComentario");
    if (editing || deleting) {
      if (!row)
        throw new ConvexError({
          code: "DELETED",
          message: "El comentario ya fue eliminado.",
        });
      if (row.revision !== (args.expectedRevision || args.expected_revision))
        throw new ConvexError({
          code: "CONFLICT",
          message: "El comentario cambió.",
        });
    }
    let result: unknown = "ok";
    if (deleting) {
      if (photo) photoComments = rows.filter((c) => c._id !== id);
      else programComments = rows.filter((c) => c._id !== id);
    } else if (editing && row) {
      if (photo) row.comment = args.comment;
      else
        Object.assign(row, {
          comentario: args.comentario,
          fecha_inicio: args.fecha_inicio.split("-").reverse().join("/"),
          fecha_fin: args.fecha_fin.split("-").reverse().join("/"),
        });
      row.revision++;
    } else {
      const newId = `new-${++sequence}`;
      if (photo)
        photoComments = [
          ...rows,
          {
            _id: newId,
            photo_id: args.photoId,
            user_id: "actor",
            user_name: actor.name,
            comment: args.comment,
            created_at: Date.now(),
            revision: 1,
          },
        ];
      else
        programComments = [
          ...rows,
          {
            _id: newId,
            proyecto: args.proyecto,
            parent_type: args.parent_type,
            parent_id: args.parent_id,
            comentario: args.comentario,
            fecha_inicio: args.fecha_inicio.split("-").reverse().join("/"),
            fecha_fin: args.fecha_fin.split("-").reverse().join("/"),
            created_by_name: actor.name,
            created_at: Date.now(),
            revision: 1,
          },
        ];
      result = newId;
    }
    receipts.set(operation, result);
    commits.push({ name, args: structuredClone(args) });
    publish();
    if (responseLost) {
      responseLost = false;
      throw new Error("Respuesta perdida después de aplicar");
    }
    return result;
  };
}
