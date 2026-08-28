import { useState, useEffect, useCallback } from "react";
import { Loader2, Maximize2, Plus, Send, Trash2, User, Pencil, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface Photo {
  _id: string;
  url?: string | null;
  comment?: string;
  descripcion?: string;
  nombre?: string;
}

interface BitacoraGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: Photo[];
  initialIndex?: number;
  logDate?: string;
  logResponsable?: string;
}

// Individual photo card with comments
function PhotoCard({ 
  photo, 
  onMaximize 
}: { 
  photo: Photo; 
  onMaximize: () => void;
}) {
  const [newComment, setNewComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddComment, setShowAddComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<Id<"photo_comments"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const addPhotoComment = useMutation(api.bitacora.addPhotoComment);
  const deletePhotoComment = useMutation(api.bitacora.deletePhotoComment);
  const editPhotoComment = useMutation(api.bitacora.editPhotoComment);
  const comments = useQuery(api.bitacora.getPhotoComments, { 
    photoId: photo._id as Id<"documentos"> 
  });

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsSaving(true);
    try {
      await addPhotoComment({
        photoId: photo._id as Id<"documentos">,
        comment: newComment.trim(),
      });
      setNewComment("");
      setShowAddComment(false);
    } catch (error) {
      console.error("Error adding comment:", error);
      alert("Error al agregar el comentario");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteComment = async (commentId: Id<"photo_comments">) => {
    try {
      await deletePhotoComment({ commentId });
    } catch (error) {
      console.error("Error deleting comment:", error);
      alert("Error al eliminar el comentario");
    }
  };

  const handleStartEdit = (commentId: Id<"photo_comments">, currentText: string) => {
    setEditingCommentId(commentId);
    setEditingText(currentText);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingText("");
  };

  const handleSaveEdit = async () => {
    if (!editingCommentId || !editingText.trim()) return;

    setIsEditing(true);
    try {
      await editPhotoComment({
        commentId: editingCommentId,
        comment: editingText.trim(),
      });
      setEditingCommentId(null);
      setEditingText("");
    } catch (error) {
      console.error("Error editing comment:", error);
      alert("Error al editar el comentario");
    } finally {
      setIsEditing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      id={`bitacora-gallery-photo-${photo._id}`}
      className="bg-card rounded-lg border border-border overflow-hidden"
    >
      {/* Image */}
      <div
        className="relative bg-muted cursor-pointer"
        onClick={onMaximize}
      >
        {photo.url && (
          <img
            src={photo.url}
            alt={photo.nombre || "Foto de bitácora"}
            className="w-full h-64 object-cover"
          />
        )}
        
        {/* Maximize button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMaximize();
          }}
          className="absolute top-2 right-2 p-2 bg-overlay/50 hover:bg-overlay/70 text-on-color rounded-full transition-colors"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Comments Section */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">
            Comentarios {comments && comments.length > 0 && `(${comments.length})`}
          </span>
          {!showAddComment && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddComment(true)}
              className="h-7 px-2"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Comments List */}
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {comments && comments.length > 0 ? (
            comments.map((comment) => (
              <div 
                key={comment._id} 
                className="bg-background rounded-lg p-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-disabled flex items-center justify-center">
                      <User className="h-3 w-3 text-subtle-foreground" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {comment.user_name}
                    </span>
                    <span className="text-xs text-disabled-foreground">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  {editingCommentId !== comment._id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => handleStartEdit(comment._id, comment.comment)}
                        className="p-1 hover:bg-blue-100 rounded transition-all"
                      >
                        <Pencil className="h-3 w-3 text-blue-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteComment(comment._id)}
                        className="p-1 hover:bg-red-100 rounded transition-all"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Edit mode or display mode */}
                {editingCommentId === comment._id ? (
                  <div className="pl-8 space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="resize-none text-sm"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={handleCancelEdit}
                        disabled={isEditing}
                        className="p-1.5 hover:bg-disabled rounded transition-all"
                      >
                        <X className="h-4 w-4 text-subtle-foreground" />
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={isEditing || !editingText.trim()}
                        className="p-1.5 hover:bg-green-100 rounded transition-all disabled:opacity-50"
                      >
                        {isEditing ? (
                          <Loader2 className="h-4 w-4 animate-spin text-green-500" />
                        ) : (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground pl-8">
                    {comment.comment}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-disabled-foreground text-center py-2">
              Sin comentarios
            </p>
          )}
        </div>

        {/* Add Comment Form */}
        {showAddComment && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe un comentario..."
              className="resize-none text-sm"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddComment(false);
                  setNewComment("");
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={isSaving || !newComment.trim()}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LightboxCaption({
  photoId,
  fallback,
}: {
  photoId: string;
  fallback?: string;
}) {
  const comments = useQuery(api.bitacora.getPhotoComments, {
    photoId: photoId as Id<"documentos">,
  });

  const entries =
    comments && comments.length > 0
      ? comments.map((item) => ({
          id: item._id,
          text: item.comment,
          author: item.user_name,
        }))
      : fallback
        ? [{ id: "fallback", text: fallback, author: "" }]
        : [];

  if (entries.length === 0) return null;

  return (
    <div className="px-5 py-3 bg-overlay/60 space-y-2 max-h-32 overflow-y-auto text-center">
      {entries.map((entry) => (
        <div key={entry.id}>
          {entry.author ? (
            <p className="text-xs text-on-color mb-1">{entry.author}</p>
          ) : null}
          <p className="text-sm text-on-color whitespace-pre-wrap">{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function BitacoraGalleryModal({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
  logDate,
  logResponsable,
}: BitacoraGalleryModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const validPhotos = photos.filter((p) => p.url);
  const currentPhoto =
    lightboxIndex !== null ? validPhotos[lightboxIndex] : undefined;

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const showPrevious = useCallback(() => {
    setLightboxIndex((current) => {
      if (current === null || validPhotos.length === 0) return current;
      return current === 0 ? validPhotos.length - 1 : current - 1;
    });
  }, [validPhotos.length]);

  const showNext = useCallback(() => {
    setLightboxIndex((current) => {
      if (current === null || validPhotos.length === 0) return current;
      return current === validPhotos.length - 1 ? 0 : current + 1;
    });
  }, [validPhotos.length]);

  useEffect(() => {
    if (!isOpen) {
      setLightboxIndex(null);
      return;
    }

    const target = photos.filter((photo) => photo.url)[initialIndex];
    if (!target) return;

    const timeout = window.setTimeout(() => {
      document
        .getElementById(`bitacora-gallery-photo-${target._id}`)
        ?.scrollIntoView({ block: "nearest" });
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [isOpen, initialIndex, photos]);

  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeLightbox();
      }
    };

    const previousPointerEvents = document.body.style.pointerEvents;
    document.body.style.pointerEvents = "auto";
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.pointerEvents = previousPointerEvents;
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [lightboxIndex, showNext, showPrevious, closeLightbox]);

  if (validPhotos.length === 0) {
    return null;
  }

  const currentLabel =
    currentPhoto?.nombre ||
    currentPhoto?.comment ||
    (lightboxIndex !== null ? `Foto ${lightboxIndex + 1}` : "Foto");

  return (
      <Sheet
        open={isOpen}
        modal={lightboxIndex === null}
        onOpenChange={(open) => {
          if (!open && lightboxIndex === null) onClose();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl p-0 flex flex-col"
        >
          <SheetHeader className="p-6 pb-4 border-b">
            <SheetTitle>Galería de Fotos</SheetTitle>
            {logDate && (
              <SheetDescription>
                {logDate} {logResponsable && `• ${logResponsable}`}
              </SheetDescription>
            )}
          </SheetHeader>

          {/* Scrollable Photos List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {validPhotos.map((photo, index) => (
              <PhotoCard
                key={photo._id}
                photo={photo}
                onMaximize={() => setLightboxIndex(index)}
              />
            ))}
          </div>
        </SheetContent>

        {currentPhoto && lightboxIndex !== null && (
          <SheetPortal>
            <div
              className="fixed inset-0 z-[100] grid h-[100dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto_auto] bg-inverse overflow-hidden pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-label="Visor de imágenes"
            >
              <div className="flex min-h-14 items-center gap-3 px-5">
                <p className="min-w-0 flex-1 truncate text-sm text-on-color">
                  {currentLabel}
                </p>
                <span className="text-xs px-3 py-1 rounded-full bg-overlay/60 text-on-color">
                  {lightboxIndex + 1} / {validPhotos.length}
                </span>
                <button
                  type="button"
                  onClick={closeLightbox}
                  className="p-2 bg-overlay/50 hover:bg-overlay/70 text-on-color rounded-full transition-colors"
                  aria-label="Cerrar visor"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden">
                {validPhotos.length > 1 ? (
                  <button
                    type="button"
                    onClick={showPrevious}
                    className="relative z-20 ml-3 p-2 bg-overlay/50 hover:bg-overlay/70 text-on-color rounded-full transition-colors"
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                ) : (
                  <span />
                )}

                <div className="h-full min-h-0 min-w-0 overflow-hidden p-4">
                  <img
                    src={currentPhoto.url || undefined}
                    alt={currentLabel}
                    className="h-full w-full object-contain"
                  />
                </div>

                {validPhotos.length > 1 ? (
                  <button
                    type="button"
                    onClick={showNext}
                    className="relative z-20 mr-3 p-2 bg-overlay/50 hover:bg-overlay/70 text-on-color rounded-full transition-colors"
                    aria-label="Imagen siguiente"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                ) : (
                  <span />
                )}
              </div>

              <LightboxCaption
                photoId={currentPhoto._id}
                fallback={currentPhoto.comment || currentPhoto.descripcion}
              />

              {validPhotos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto p-3">
                  {validPhotos.map((photo, index) => (
                    <button
                      key={photo._id}
                      type="button"
                      onClick={() => setLightboxIndex(index)}
                      className={`flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-colors ${
                        index === lightboxIndex
                          ? "border-foreground"
                          : "border-transparent hover:border-border-strong"
                      }`}
                      aria-label={`Ver ${photo.nombre || `foto ${index + 1}`}`}
                      aria-current={index === lightboxIndex ? "true" : undefined}
                    >
                      <img
                        src={photo.url || undefined}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SheetPortal>
        )}
      </Sheet>
  );
}
