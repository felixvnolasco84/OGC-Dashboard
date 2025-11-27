import { useState, useEffect, useRef } from "react";
import { Loader2, Maximize2, Minimize2, Plus, Send, Trash2, User, Pencil, Check, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface Photo {
  _id: string;
  url?: string | null;
  comment?: string;
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
  onMaximize: (photoUrl: string) => void;
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
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Image */}
      <div className="relative bg-gray-100">
        {photo.url && (
          <img
            src={photo.url}
            alt={photo.nombre || "Foto de bitácora"}
            className="w-full h-64 object-cover"
          />
        )}
        
        {/* Maximize button */}
        <button
          onClick={() => photo.url && onMaximize(photo.url)}
          className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Comments Section */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">
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
                className="bg-gray-50 rounded-lg p-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="h-3 w-3 text-gray-500" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {comment.user_name}
                    </span>
                    <span className="text-xs text-gray-400">
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
                        className="p-1.5 hover:bg-gray-200 rounded transition-all"
                      >
                        <X className="h-4 w-4 text-gray-500" />
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
                  <p className="text-sm text-gray-700 pl-8">
                    {comment.comment}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">
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

export default function BitacoraGalleryModal({
  isOpen,
  onClose,
  photos,
  logDate,
  logResponsable,
}: BitacoraGalleryModalProps) {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const validPhotos = photos.filter((p) => p.url);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullscreenUrl(null);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleMaximize = async (photoUrl: string) => {
    setFullscreenUrl(photoUrl);
    // Wait for state update and ref to be set
    setTimeout(async () => {
      if (fullscreenRef.current) {
        try {
          await fullscreenRef.current.requestFullscreen();
        } catch (error) {
          console.error("Fullscreen error:", error);
        }
      }
    }, 50);
  };

  const handleExitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      setFullscreenUrl(null);
    } catch (error) {
      console.error("Exit fullscreen error:", error);
    }
  };

  if (validPhotos.length === 0) {
    return null;
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
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
            {validPhotos.map((photo) => (
              <PhotoCard
                key={photo._id}
                photo={photo}
                onMaximize={handleMaximize}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Fullscreen Overlay */}
      {fullscreenUrl && (
        <div
          ref={fullscreenRef}
          className="fixed inset-0 bg-black flex items-center justify-center z-[100]"
          onClick={handleExitFullscreen}
        >
          <img
            src={fullscreenUrl}
            alt="Foto en pantalla completa"
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={handleExitFullscreen}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
