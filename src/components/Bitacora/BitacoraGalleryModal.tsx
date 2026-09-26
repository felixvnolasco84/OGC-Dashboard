import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  MessageSquareText,
  Pencil,
  Send,
  Trash2,
  User,
  WifiOff,
  X,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";

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

function OnlinePhotoComments({ photoId, onClose, readOnly }: { photoId: string; onClose: () => void; readOnly: boolean }) {
  const comments = useQuery(api.bitacora.getPhotoComments, { photoId: photoId as Id<"documentos"> });
  const addComment = useMutation(api.bitacora.addPhotoComment);
  const editComment = useMutation(api.bitacora.editPhotoComment);
  const deleteComment = useMutation(api.bitacora.deletePhotoComment);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<Id<"photo_comments"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);

  const save = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await addComment({ photoId: photoId as Id<"documentos">, comment: comment.trim() });
      setComment("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo agregar el comentario.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    setBusyCommentId(editingId);
    try {
      await editComment({ commentId: editingId, comment: editingText.trim() });
      setEditingId(null);
      setEditingText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo editar el comentario.");
    } finally {
      setBusyCommentId(null);
    }
  };

  const remove = async (commentId: Id<"photo_comments">) => {
    setBusyCommentId(commentId);
    try {
      await deleteComment({ commentId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el comentario.");
    } finally {
      setBusyCommentId(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-on-color/10 bg-overlay text-on-color">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-on-color/10 px-5">
        <div>
          <h2 className="font-medium">Comentarios</h2>
          <p className="text-xs text-on-color/60">{comments ? `${comments.length} en esta fotografía` : "Cargando…"}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onClose} aria-label="Cerrar comentarios"><X /></Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!comments && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {comments?.map((item) => (
          <div key={item._id} className="group bg-on-color/5 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="inline-flex max-w-full items-center gap-1.5 font-medium">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.user_name}</span>
                </span>
                <p className="mt-0.5 text-xs text-on-color/50">
                  {new Date(item.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!readOnly && editingId !== item._id && (
                <div className="flex items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <Button type="button" size="sm" variant="secondary" aria-label="Editar comentario" onClick={() => { setEditingId(item._id); setEditingText(item.comment); }}><Pencil /></Button>
                  <Button type="button" size="sm" variant="destructive" disabled={busyCommentId === item._id} aria-label="Eliminar comentario" onClick={() => void remove(item._id)}><Trash2 /></Button>
                </div>
              )}
            </div>
            {editingId === item._id ? (
              <div className="mt-2 space-y-2">
                <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} variant="darkEdit" autoFocus />
                <div className="flex justify-end gap-1">
                  <Button type="button" size="sm" variant="secondary" aria-label="Cancelar edición" onClick={() => { setEditingId(null); setEditingText(""); }}><X /></Button>
                  <Button type="button" size="sm" variant="secondary" aria-label="Guardar comentario" disabled={!editingText.trim() || busyCommentId === item._id} onClick={() => void saveEdit()}><Check /></Button>
                </div>
              </div>
            ) : <p className="mt-2 whitespace-pre-wrap leading-relaxed text-on-color/80">{item.comment}</p>}
          </div>
        ))}
        {comments?.length === 0 && <p className="py-8 text-center text-sm text-on-color/60">Sin comentarios.</p>}
      </div>

      {!readOnly && <div className="shrink-0 space-y-2 border-t border-on-color/10 p-4">
        <Textarea value={comment} onChange={(event) => setComment(event.target.value)} variant="darkComment" placeholder="Agregar comentario" />
        <div className="grid">
          <Button type="button" size="sm" variant="secondary" onClick={() => void save()} disabled={saving || !comment.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : <Send />}
            Publicar comentario
          </Button>
        </div>
      </div>}
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
  const [index, setIndex] = useState(initialIndex);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const requestedDownloads = useRef(new Set<string>());
  const current = photos[index];

  useEffect(() => {
    if (!isOpen) return;
    requestedDownloads.current.clear();
    setCommentsOpen(false);
    setIndex(Math.min(initialIndex, Math.max(photos.length - 1, 0)));
  }, [initialIndex, isOpen, photos.length]);

  useEffect(() => {
    if (!isOpen || !online || !current || current.available_offline || !onPhotoViewed) return;
    if (requestedDownloads.current.has(current.client_id)) return;
    requestedDownloads.current.add(current.client_id);
    void onPhotoViewed(current).catch(() => undefined);
  }, [current, isOpen, onPhotoViewed, online]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && photos.length > 1) setIndex((value) => (value - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight" && photos.length > 1) setIndex((value) => (value + 1) % photos.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, photos.length]);

  const previous = () => setIndex((value) => (value - 1 + photos.length) % photos.length);
  const next = () => setIndex((value) => (value + 1) % photos.length);
  const canComment = Boolean(online && current?.server_id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
            <Button type="button" size="sm" variant="secondary" onClick={() => setCommentsOpen((value) => !value)} aria-expanded={commentsOpen} aria-label="Comentarios">
              <MessageSquareText /><span className="hidden sm:inline">Comentarios</span>
            </Button>
          ) : !online ? (
            <span className="hidden items-center gap-1.5 text-xs text-on-color/60 sm:inline-flex"><WifiOff className="h-3.5 w-3.5" />Comentarios al reconectar</span>
          ) : null}
          <span className="bg-on-color/10 px-3 py-1 text-xs font-medium text-on-color">{current ? index + 1 : 0} / {photos.length}</span>
          <Button type="button" size="sm" variant="secondary" onClick={onClose} aria-label="Cerrar galería"><X /></Button>
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
                <Button key={photo.client_id} type="button" onClick={() => setIndex(photoIndex)} variant={photoIndex === index ? "mediaSelected" : "mediaUnselected"} size="filmstrip" aria-label={`Ver fotografía ${photoIndex + 1}`} aria-current={photoIndex === index ? "true" : undefined}>
                  {source ? <img src={source} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-on-color/10"><ImageOff className="h-5 w-5" /></span>}
                </Button>
              );
            })}
          </div>
        </div>

        {commentsOpen && canComment && current?.server_id && (
          <div className="absolute inset-y-0 right-0 z-30 w-full max-w-sm shadow-2xl">
            <OnlinePhotoComments key={current.server_id} photoId={current.server_id} readOnly={!canWriteComments} onClose={() => setCommentsOpen(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
