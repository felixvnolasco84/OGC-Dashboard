import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2, Edit2, Plus } from "lucide-react";
import { useMutation } from "convex/react";
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

export default function BitacoraGalleryModal({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
  logDate,
  logResponsable,
}: BitacoraGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [editingComment, setEditingComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const updatePhotoComment = useMutation(api.bitacora.updatePhotoComment);

  const validPhotos = photos.filter((p) => p.url);
  const currentPhoto = validPhotos[currentIndex];

  // Reset index when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setEditingComment(false);
      setCommentText("");
    }
  }, [isOpen, initialIndex]);

  // Listen for fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : validPhotos.length - 1));
    setEditingComment(false);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < validPhotos.length - 1 ? prev + 1 : 0));
    setEditingComment(false);
  };

  const handleEditComment = () => {
    setEditingComment(true);
    setCommentText(currentPhoto?.comment || "");
  };

  const handleSaveComment = async () => {
    if (!currentPhoto) return;

    setIsSaving(true);
    try {
      await updatePhotoComment({
        photoId: currentPhoto._id as Id<"documentos">,
        comment: commentText,
      });
      setEditingComment(false);
    } catch (error) {
      console.error("Error saving comment:", error);
      alert("Error al guardar el comentario");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingComment(false);
    setCommentText("");
  };

  if (validPhotos.length === 0) {
    return null;
  }


  const handleFullscreen = async () => {
    if (!currentPhoto || !imageContainerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await imageContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  };

  return (
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

        <div className="flex-1 overflow-y-auto">
          {/* Main Image */}
          <div
            ref={imageContainerRef}
            className={`relative bg-gray-100 ${isFullscreen ? "flex items-center justify-center bg-black" : ""}`}
          >
            {currentPhoto?.url && (
              <img
                src={currentPhoto.url}
                alt={currentPhoto.nombre || "Foto de bitácora"}
                className={`w-full object-contain ${isFullscreen ? "h-screen" : "h-[400px]"}`}
              />
            )}


            {/* fullscreen */}
            <button
              onClick={handleFullscreen}
              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>

            {/* Navigation Arrows */}
            {validPhotos.length > 1 && (
              <>
                <button
                  onClick={handlePrevious}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {/* Photo Counter */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
              {currentIndex + 1} / {validPhotos.length}
            </div>
          </div>

          {/* Thumbnails */}
          {validPhotos.length > 1 && (
            <div className="flex gap-2 p-4 overflow-x-auto border-b">
              {validPhotos.map((photo, index) => (
                <button
                  key={photo._id}
                  onClick={() => {
                    setCurrentIndex(index);
                    setEditingComment(false);
                  }}
                  className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${index === currentIndex
                    ? "border-gray-900"
                    : "border-transparent hover:border-gray-300"
                    }`}
                >
                  {photo.url && (
                    <img
                      src={photo.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Comment Section */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-medium">Comentarios</span>
              </div>
              {!editingComment && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEditComment}
                  className="text-base h-7"
                >
                  {currentPhoto?.comment ?
                    <Edit2 className="h-4 w-4" /> :
                    <Plus className="h-4 w-4" />}
                </Button>
              )}
            </div>

            {editingComment ? (
              <div className="space-y-3">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Escribe un comentario para esta foto..."
                  className="w-full resize-none text-base"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSaveComment}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Guardar"

                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-[#f5f5f5] rounded-sm">
                <p className="text-gray-700 text-base">
                  {currentPhoto?.comment || "Sin comentario"}
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
