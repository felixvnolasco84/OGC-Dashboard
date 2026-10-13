import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  MessageSquareText,
  WifiOff,
  X,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BitacoraAttachmentView } from "@/lib/bitacora-offline/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import CommentThread, { type CommentExitGuard } from "@/components/comments/CommentThread";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  photos: BitacoraAttachmentView[];
  initialIndex?: number;
  logDate?: string;
  logResponsable?: string;
  logTitle?: string;
  online?: boolean;
  canWriteComments?: boolean;
  onPhotoViewed?: (photo: BitacoraAttachmentView) => Promise<unknown>;
}

function photoSource(photo: BitacoraAttachmentView) {
  return photo.local_url || photo.url || "";
}

function thumbnailSource(photo: BitacoraAttachmentView, online: boolean) {
  return online ? photo.url || photo.local_url || "" : photo.local_url || "";
}

function OnlinePhotoComments({ photoId, destination, online, onClose, readOnly, exitGuard }: { photoId: string; destination: string; online: boolean; onClose: () => void; readOnly: boolean; exitGuard: CommentExitGuard }) {
  const comments = useQuery(api.bitacora.getPhotoComments, { photoId: photoId as Id<"documentos"> });
  const context = useQuery(api.bitacora.getPhotoCommentContext, { photoId: photoId as Id<"documentos"> });
  const addComment = useMutation(api.bitacora.addPhotoComment);
  const editComment = useMutation(api.bitacora.editPhotoComment);
  const deleteComment = useMutation(api.bitacora.deletePhotoComment);
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-on-color/10 bg-overlay text-on-color" data-comment-panel="true">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-on-color/10 px-5">
        <h2 className="font-medium">Comentarios de fotografía</h2>
        <Button type="button" size="sm" variant="secondary" onClick={onClose} aria-label="Cerrar comentarios"><X /></Button>
      </div>
      <CommentThread destination={destination} available={context?.available} online={online} canCreate={!readOnly && Boolean(context?.canCreate)} dark defaultComposer exitGuard={exitGuard}
        comments={comments?.map((item) => ({ id: item._id, text: item.comment, author: item.user_name, createdAt: item.created_at, revision: item.revision ?? 1, canManage: item.can_manage }))}
        onAdd={(draft, operationId) => addComment({ photoId: photoId as Id<"documentos">, comment: draft.text, operationId })}
        onEdit={(original, draft, operationId) => editComment({ commentId: original.id as Id<"photo_comments">, photoId: photoId as Id<"documentos">, comment: draft.text, expectedRevision: original.revision, operationId })}
        onDelete={(original, operationId) => deleteComment({ commentId: original.id as Id<"photo_comments">, photoId: photoId as Id<"documentos">, expectedRevision: original.revision, operationId })}
      />
    </aside>
  );
}

export default function BitacoraGalleryModal({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
  logDate,
  logResponsable,
  logTitle,
  online = false,
  canWriteComments = true,
  onPhotoViewed,
}: Props) {
  const [selectedPhoto, setSelectedPhoto] = useState(photos[initialIndex]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const requestedDownloads = useRef(new Set<string>());
  const initialSelection = useRef({ photos, initialIndex });
  initialSelection.current = { photos, initialIndex };
  const current = photos.find((photo) => photo.client_id === selectedPhoto?.client_id) ?? selectedPhoto;
  const index = Math.max(0, photos.findIndex((photo) => photo.client_id === current?.client_id));
  const commentExitGuard = useRef<((action: () => void) => void) | null>(null);
  const requestExit = (action: () => void) => commentExitGuard.current ? commentExitGuard.current(action) : action();

  useEffect(() => {
    if (!isOpen) return;
    requestedDownloads.current.clear();
    setCommentsOpen(false);
    const selection = initialSelection.current;
    setSelectedPhoto(selection.photos[Math.min(selection.initialIndex, Math.max(selection.photos.length - 1, 0))]);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !online || !current || current.available_offline || !onPhotoViewed) return;
    if (requestedDownloads.current.has(current.client_id)) return;
    requestedDownloads.current.add(current.client_id);
    void onPhotoViewed(current).catch(() => undefined);
  }, [current, isOpen, onPhotoViewed, online]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (commentsOpen || (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"], [role="alertdialog"]'))) return;
      if (event.key === "ArrowLeft" && photos.length > 1) setSelectedPhoto(photos[(index - 1 + photos.length) % photos.length]);
      if (event.key === "ArrowRight" && photos.length > 1) setSelectedPhoto(photos[(index + 1) % photos.length]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, photos, commentsOpen, index]);

  const previous = () => requestExit(() => setSelectedPhoto(photos[(index - 1 + photos.length) % photos.length]));
  const next = () => requestExit(() => setSelectedPhoto(photos[(index + 1) % photos.length]));
  const canComment = Boolean(online && current?.server_id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && requestExit(onClose)}>
      <DialogContent
        data-bitacora-surface="true"
        variant="gallery"
      >
        <header className="flex min-w-0 items-center gap-3 border-b border-on-color/10 px-4 md:px-7">
          <DialogTitle variant="gallery">
            {logTitle ? `${logTitle} - Foto` : current?.nombre || "Foto de Bitácora"}
          </DialogTitle>
          <DialogDescription className="sr-only">Visor de fotografías de Bitácora</DialogDescription>
          {canComment ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => requestExit(() => setCommentsOpen((value) => !value))} aria-expanded={commentsOpen} aria-label="Comentarios">
              <MessageSquareText /><span className="hidden sm:inline">Comentarios</span>
            </Button>
          ) : !online ? (
            <span className="hidden items-center gap-1.5 text-xs text-on-color/60 sm:inline-flex"><WifiOff className="h-3.5 w-3.5" />Comentarios al reconectar</span>
          ) : null}
          <span className="bg-on-color/10 px-3 py-1 text-xs font-medium text-on-color">{current ? index + 1 : 0} / {photos.length}</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => requestExit(onClose)} aria-label="Cerrar galería"><X /></Button>
        </header>

        <div className="relative min-h-0 min-w-0 overflow-hidden bg-overlay">
          {!current ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-on-color/60"><ImageOff className="h-10 w-10" /><p>No hay imágenes disponibles.</p></div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4 md:p-7">
              <img src={photoSource(current)} alt={current.descripcion || current.nombre} className="h-full w-full object-contain" />
            </div>
          )}
          {photos.length > 1 && (
            <>
              <span className="absolute left-3 top-1/2 -translate-y-1/2 md:left-5"><Button type="button" onClick={previous} variant="overlay" size="iconLg" aria-label="Fotografía anterior"><ChevronLeft /></Button></span>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 md:right-5"><Button type="button" onClick={next} variant="overlay" size="iconLg" aria-label="Fotografía siguiente"><ChevronRight /></Button></span>
            </>
          )}
        </div>

        <div className="min-w-0 bg-overlay px-5 py-3 text-center text-on-color md:px-10">
          {logResponsable && <p className="truncate text-xs font-medium text-on-color/70">{logResponsable}{logDate ? ` · ${logDate}` : ""}</p>}
          <p className="mx-auto mt-1 line-clamp-3 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed md:text-base">{current?.descripcion || "Sin descripción"}</p>
        </div>

        <div className="min-w-0 overflow-x-auto overflow-y-hidden border-t border-on-color/10 bg-overlay p-3">
          <div className="flex h-full min-w-max gap-2">
            {photos.map((photo, photoIndex) => {
              const source = thumbnailSource(photo, online);
              return (
                <Button key={photo.client_id} type="button" onClick={() => photo.client_id !== current?.client_id && requestExit(() => setSelectedPhoto(photo))} variant={photo.client_id === current?.client_id ? "mediaSelected" : "mediaUnselected"} size="filmstrip" aria-label={`Ver fotografía ${photoIndex + 1}`} aria-current={photo.client_id === current?.client_id ? "true" : undefined}>
                  {source ? <img src={source} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-on-color/10"><ImageOff className="h-5 w-5" /></span>}
                </Button>
              );
            })}
          </div>
        </div>

        {commentsOpen && current?.server_id && (
          <div className="absolute inset-y-0 right-0 z-30 w-full max-w-sm shadow-2xl">
            <OnlinePhotoComments key={current.server_id} photoId={current.server_id} destination={`${current.nombre} · ${logTitle || "Bitácora"}${logDate ? ` · ${logDate}` : ""}`} online={online} readOnly={!canWriteComments} exitGuard={commentExitGuard} onClose={() => requestExit(() => setCommentsOpen(false))} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
