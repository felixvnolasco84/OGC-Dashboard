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

function thumbnailSource(photo: BitacoraAttachmentView) {
  return photo.available_offline ? photo.local_url || photo.url || "" : photo.thumbnail_url || "";
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
    <aside className="flex h-full min-h-0 flex-col border-l border-white/10 bg-[#181816] text-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div>
          <h2 className="font-medium">Comentarios</h2>
          <p className="text-xs text-white/55">{comments ? `${comments.length} en esta fotografía` : "Cargando…"}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar comentarios">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!comments && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {comments?.map((item) => (
          <div key={item._id} className="group bg-white/[0.06] p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="inline-flex max-w-full items-center gap-1.5 font-medium">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.user_name}</span>
                </span>
                <p className="mt-0.5 text-[11px] text-white/45">
                  {new Date(item.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!readOnly && editingId !== item._id && (
                <div className="flex items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button type="button" className="p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Editar comentario" onClick={() => { setEditingId(item._id); setEditingText(item.comment); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={busyCommentId === item._id} className="p-1.5 text-red-300 hover:bg-red-500/15 disabled:opacity-50" aria-label="Eliminar comentario" onClick={() => void remove(item._id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            {editingId === item._id ? (
              <div className="mt-2 space-y-2">
                <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} className="min-h-20 border-white/15 bg-white/5 text-white" autoFocus />
                <div className="flex justify-end gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" onClick={() => { setEditingId(null); setEditingText(""); }}><X className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" className="h-8 w-8 bg-white text-black hover:bg-white/85" disabled={!editingText.trim() || busyCommentId === item._id} onClick={() => void saveEdit()}><Check className="h-4 w-4" /></Button>
                </div>
              </div>
            ) : <p className="mt-2 whitespace-pre-wrap leading-relaxed text-white/75">{item.comment}</p>}
          </div>
        ))}
        {comments?.length === 0 && <p className="py-8 text-center text-sm text-white/50">Sin comentarios.</p>}
      </div>

      {!readOnly && <div className="shrink-0 space-y-2 border-t border-white/10 p-4">
        <Textarea value={comment} onChange={(event) => setComment(event.target.value)} className="min-h-24 border-white/15 bg-white/5 text-white placeholder:text-white/40" placeholder="Agregar comentario" />
        <Button type="button" className="w-full bg-white text-black hover:bg-white/85" onClick={() => void save()} disabled={saving || !comment.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Publicar comentario
        </Button>
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
    void onPhotoViewed(current);
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
        className="left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[4rem_minmax(0,1fr)_auto_6.5rem] gap-0 overflow-hidden border-0 bg-inverse p-0 text-on-color shadow-none sm:rounded-none [&>button]:hidden"
      >
        <header className="flex min-w-0 items-center gap-3 border-b border-white/10 px-4 md:px-7">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-white md:text-base">
            {logTitle ? `${logTitle} - Foto` : current?.nombre || "Foto de Bitácora"}
          </DialogTitle>
          <DialogDescription className="sr-only">Visor de fotografías de Bitácora</DialogDescription>
          {canComment ? (
            <button type="button" onClick={() => setCommentsOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 bg-black/25 px-3 text-xs text-white hover:bg-black/40" aria-expanded={commentsOpen}>
              <MessageSquareText className="h-4 w-4" /><span className="hidden sm:inline">Comentarios</span>
            </button>
          ) : !online ? (
            <span className="hidden items-center gap-1.5 text-xs text-white/50 sm:inline-flex"><WifiOff className="h-3.5 w-3.5" />Comentarios al reconectar</span>
          ) : null}
          <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-medium text-white">{current ? index + 1 : 0} / {photos.length}</span>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center bg-black/25 text-white hover:bg-black/45" aria-label="Cerrar galería"><X className="h-6 w-6" /></button>
        </header>

        <div className="relative min-h-0 min-w-0 overflow-hidden bg-inverse">
          {!current ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60"><ImageOff className="h-10 w-10" /><p>No hay imágenes disponibles.</p></div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4 md:p-7">
              <img src={photoSource(current)} alt={current.descripcion || current.nombre} className="h-full w-full object-contain" />
            </div>
          )}
          {photos.length > 1 && (
            <>
              <button type="button" onClick={previous} className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center bg-black/40 text-white hover:bg-black/65 md:left-5" aria-label="Fotografía anterior"><ChevronLeft className="h-7 w-7" /></button>
              <button type="button" onClick={next} className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center bg-black/40 text-white hover:bg-black/65 md:right-5" aria-label="Fotografía siguiente"><ChevronRight className="h-7 w-7" /></button>
            </>
          )}
        </div>

        <div className="min-w-0 bg-[#181816] px-5 py-3 text-center text-white md:px-10">
          {logResponsable && <p className="truncate text-xs font-medium text-white/70">{logResponsable}{logDate ? ` · ${logDate}` : ""}</p>}
          <p className="mx-auto mt-1 line-clamp-3 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed md:text-base">{current?.descripcion || "Sin descripción"}</p>
        </div>

        <div className="min-w-0 overflow-x-auto overflow-y-hidden border-t border-white/10 bg-[#23231f] p-3">
          <div className="flex h-full min-w-max gap-2">
            {photos.map((photo, photoIndex) => {
              const source = thumbnailSource(photo);
              return (
                <button key={photo.client_id} type="button" onClick={() => setIndex(photoIndex)} className={`h-full w-24 shrink-0 overflow-hidden border-2 transition-colors ${photoIndex === index ? "border-white" : "border-transparent opacity-70 hover:opacity-100"}`} aria-label={`Ver fotografía ${photoIndex + 1}`} aria-current={photoIndex === index ? "true" : undefined}>
                  {source ? <img src={source} alt="" className={`h-full w-full object-cover ${!photo.available_offline && photo.thumbnail_url ? "scale-110 blur-sm" : ""}`} /> : <span className="flex h-full items-center justify-center bg-white/10"><ImageOff className="h-5 w-5" /></span>}
                </button>
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
