import { useRef } from "react";
import { useQuery, useMutation, useConvexConnectionState } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import CommentThread from "@/components/comments/CommentThread";
import { type ProgramaItem } from "./programa-obra-types";

type Props = {
  item: ProgramaItem;
  proyectoId: Id<"desarrollos">;
  onClose: () => void;
};

export default function ProgramaObraComentarios({
  item,
  proyectoId,
  onClose,
}: Props) {
  const parentType = item.level === 0 ? "partida" : "familia";
  const parentId =
    item.level === 0
      ? (item.schedule?._id ?? "")
      : (item.detalleSchedule?._id ?? "");
  const destination = {
    proyecto: proyectoId,
    parent_type: parentType,
    parent_id: parentId,
  };
  const context = useQuery(api.programa_obra.getComentarioContext, destination);
  const comments = useQuery(api.programa_obra.getComentariosByProyecto, {
    proyecto_id: proyectoId,
  });
  const online = useConvexConnectionState().isWebSocketConnected;
  const add = useMutation(api.programa_obra.addComentario);
  const edit = useMutation(api.programa_obra.updateComentario);
  const remove = useMutation(api.programa_obra.deleteComentario);
  const exitGuard = useRef<((action: () => void) => void) | null>(null);
  const close = () =>
    exitGuard.current ? exitGuard.current(onClose) : onClose();
  const schedule = item.level === 0 ? item.schedule : item.detalleSchedule;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        data-comment-panel="true"
        className="w-full sm:max-w-[480px]"
      >
        <SheetHeader>
          <SheetTitle>Comentarios de Programa</SheetTitle>
          <SheetDescription className="break-words">
            {item.partida} · {parentType === "partida" ? "Partida" : "Familia"}
            {item.parentPartidaNombre ? ` · ${item.parentPartidaNombre}` : ""}
          </SheetDescription>
        </SheetHeader>
        <CommentThread
          destination={`${parentType === "partida" ? "Partida" : "Familia"} ${item.partida}${item.parentPartidaNombre ? ` · ${item.parentPartidaNombre}` : ""}`}
          available={context?.available}
          online={online}
          canCreate={Boolean(context?.canWrite)}
          dated
          exitGuard={exitGuard}
          programStart={schedule?.fecha_inicio}
          programFinish={schedule?.fecha_fin}
          comments={comments
            ?.filter(
              (c) => c.parent_type === parentType && c.parent_id === parentId,
            )
            .sort((a, b) => b.created_at - a.created_at)
            .map((c) => ({
              id: c._id,
              text: c.comentario,
              author: c.created_by_name,
              createdAt: c.created_at,
              revision: c.revision ?? 1,
              start: c.fecha_inicio,
              finish: c.fecha_fin,
              canManage: Boolean(context?.canWrite),
            }))}
          onAdd={(draft, operationId) =>
            add({
              ...destination,
              comentario: draft.text,
              fecha_inicio: draft.start,
              fecha_fin: draft.finish,
              operation_id: operationId,
            })
          }
          onEdit={(original, draft, operationId) =>
            edit({
              ...destination,
              comentario_id: original.id as Id<"programa_obra_comentarios">,
              comentario: draft.text,
              fecha_inicio: draft.start,
              fecha_fin: draft.finish,
              expected_revision: original.revision,
              operation_id: operationId,
            })
          }
          onDelete={(original, operationId) =>
            remove({
              ...destination,
              comentario_id: original.id as Id<"programa_obra_comentarios">,
              expected_revision: original.revision,
              operation_id: operationId,
            })
          }
        />
      </SheetContent>
    </Sheet>
  );
}
