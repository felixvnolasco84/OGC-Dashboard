import { X, Upload, Loader2, Trash2, ChevronLeft, ChevronRight, CalendarIcon, Maximize2, Minimize2 } from "lucide-react";
import { useBitacoraModal } from "../../hooks/use-bitacora-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Id } from "../../../convex/_generated/dataModel";
import { Checkbox } from "../ui/checkbox";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";

// Type for unified photo management
interface ManagedPhoto {
  id: string;
  type: "existing" | "new";
  url: string;
  file?: File;
  isDeleting?: boolean;
}

export default function BitacoraModal() {
  const { isOpen, onClose, mode, proyectoId, logEntry, categoria: storeCategoria, fecha: storeFecha } = useBitacoraModal();
  const createLog = useMutation(api.bitacora.createLogEntry);
  const updateLog = useMutation(api.bitacora.updateLogEntry);
  const deletePhoto = useMutation(api.bitacora.deletePhoto);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const currentUser = useQuery(api.users.getCurrentUser);
  
  // Fetch Level 1 Partidas
  const partidas = useQuery(api.partida.getByNivel, proyectoId ? { proyecto: proyectoId, nivel: 1 } : "skip");
  
  // Fetch Level 2 Familias for the selected partida
  const [categoria, setCategoria] = useState<string>(logEntry?.categoria || "");
  const [selectedPartidaId, setSelectedPartidaId] = useState<string>(logEntry?.partida_id || "");
  const familias = useQuery(
    api.partida.getByNivel, 
    proyectoId && selectedPartidaId 
      ? { proyecto: proyectoId, nivel: 2 } 
      : "skip"
  );

  const [selectedFamiliasTags, setSelectedFamiliasTags] = useState<string[]>(logEntry?.familias_tags || []);
  const [responsable, setResponsable] = useState(logEntry?.responsable || "");
  const [fecha, setFecha] = useState(logEntry?.fecha || new Date().toLocaleDateString("es-MX"));
  const [avanceDia, setAvanceDia] = useState(logEntry?.avance_dia || "");
  const [comentarios, setComentarios] = useState(logEntry?.comentarios || "");
  const [status, setStatus] = useState(logEntry?.status || "Sin problemas");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Unified photo management state
  const [managedPhotos, setManagedPhotos] = useState<ManagedPhoto[]>([]);
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]); // Track existing photos to delete on save
  const [newFiles, setNewFiles] = useState<File[]>([]); // Track new files to upload on save
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Gallery view state (for view mode)
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  
  // Calendar popover state
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Fetch log entry with photos for view/edit mode
  const fullLogEntry = useQuery(
    api.bitacora.getLogEntryById,
    logEntry?._id ? { logId: logEntry._id } : "skip"
  );

  // Update local state when logEntry changes or modal opens
  useEffect(() => {
    if (isOpen) {
        // Use store values for auto-populate, fallback to logEntry values for edit/view
        setCategoria(logEntry?.categoria || storeCategoria || "");
        setSelectedPartidaId(logEntry?.partida_id || "");
        setSelectedFamiliasTags(logEntry?.familias_tags || []);
        // Auto-populate responsable from current user if creating new
        setResponsable(logEntry?.responsable || currentUser?.name || "");
        // Use store fecha for auto-populate from calendar, fallback to logEntry or today
        setFecha(logEntry?.fecha || storeFecha || new Date().toLocaleDateString("es-MX"));
        setAvanceDia(logEntry?.avance_dia || "");
        setComentarios(logEntry?.comentarios || "");
        setStatus(logEntry?.status || "Sin problemas");
        // Reset photo management state
        setPhotosToDelete([]);
        setNewFiles([]);
        setGalleryIndex(0);
        
        // Load existing photos into managed state
        if (fullLogEntry?.fotos) {
          const existingManaged: ManagedPhoto[] = fullLogEntry.fotos
            .filter(f => f.url)
            .map(f => ({
              id: f._id,
              type: "existing" as const,
              url: f.url!,
            }));
          setManagedPhotos(existingManaged);
        } else {
          setManagedPhotos([]);
        }
    }
  }, [isOpen, logEntry, currentUser, fullLogEntry, storeCategoria, storeFecha]);
  
  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Handle file selection - add to managed photos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newManagedPhotos: ManagedPhoto[] = fileArray.map((file, index) => ({
      id: `new-${Date.now()}-${index}`,
      type: "new" as const,
      url: URL.createObjectURL(file),
      file,
    }));
    
    setManagedPhotos(prev => [...prev, ...newManagedPhotos]);
    setNewFiles(prev => [...prev, ...fileArray]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Remove photo from managed list
  const removePhoto = (photo: ManagedPhoto) => {
    if (photo.type === "existing") {
      // Mark for deletion on save
      setPhotosToDelete(prev => [...prev, photo.id]);
    } else {
      // Remove from new files
      setNewFiles(prev => prev.filter(f => f !== photo.file));
      // Revoke object URL to prevent memory leaks
      URL.revokeObjectURL(photo.url);
    }
    setManagedPhotos(prev => prev.filter(p => p.id !== photo.id));
  };
  
  // Gallery navigation for view mode
  const handlePreviousPhoto = () => {
    setGalleryIndex(prev => (prev > 0 ? prev - 1 : managedPhotos.length - 1));
  };
  
  const handleNextPhoto = () => {
    setGalleryIndex(prev => (prev < managedPhotos.length - 1 ? prev + 1 : 0));
  };
  
  const handleFullscreen = async () => {
    if (!imageContainerRef.current) return;
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
  
  // Parse date string to Date object
  const parseDate = (dateStr: string): Date | undefined => {
    try {
      // Try DD/MM/YYYY format
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
      return undefined;
    } catch {
      return undefined;
    }
  };
  
  // Format Date to DD/MM/YYYY string
  const formatDateToString = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proyectoId || !selectedPartidaId || !categoria) return;

    setIsSubmitting(true);
    try {
      // Delete marked photos first (for edit mode)
      if (mode === "edit" && photosToDelete.length > 0) {
        for (const photoId of photosToDelete) {
          await deletePhoto({ photoId: photoId as Id<"documentos"> });
        }
      }
      
      // Upload new images
      const imageStorageIds: Id<"_storage">[] = [];
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          const { storageId } = await result.json();
          imageStorageIds.push(storageId);
        }
      }

      if (mode === "create") {
        await createLog({
          proyecto: proyectoId,
          categoria,
          partida_id: selectedPartidaId as Id<"partidas">,
          familias_tags: selectedFamiliasTags,
          responsable,
          fecha,
          avance_dia: avanceDia,
          comentarios,
          status,
          imagenes: imageStorageIds.length > 0 ? imageStorageIds : undefined,
        });
      } else if (mode === "edit" && logEntry) {
        await updateLog({
          logId: logEntry._id,
          categoria,
          partida_id: selectedPartidaId as Id<"partidas">,
          familias_tags: selectedFamiliasTags,
          responsable,
          fecha,
          avance_dia: avanceDia,
          comentarios,
          status,
          imagenes: imageStorageIds.length > 0 ? imageStorageIds : undefined,
        });
      }
      handleClose();
    } catch (error) {
      console.error("Error saving log:", error);
      alert("Error al guardar la entrada");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategoria("");
    setSelectedPartidaId("");
    setSelectedFamiliasTags([]);
    setResponsable("");
    setFecha(new Date().toLocaleDateString("es-MX"));
    setAvanceDia("");
    setComentarios("");
    setStatus("Sin problemas");
    setManagedPhotos([]);
    setPhotosToDelete([]);
    setNewFiles([]);
    setGalleryIndex(0);
    onClose();
  };

  const handlePartidaChange = (partidaId: string) => {
    setSelectedPartidaId(partidaId);
    // Reset familias when partida changes
    setSelectedFamiliasTags([]);
  };

  const toggleFamiliaTag = (familiaName: string) => {
    setSelectedFamiliasTags(prev => 
      prev.includes(familiaName)
        ? prev.filter(f => f !== familiaName)
        : [...prev, familiaName]
    );
  };

  // Get unique familia names for the selected partida
  const availableFamilias = familias?.filter(f => {
    // For nivel 2, we want to match partida_nombre to the selected partida
    const selectedPartida = partidas?.find(p => p._id === selectedPartidaId);
    return f.partida_nombre === selectedPartida?.nombre;
  }).map(f => f.familia).filter((v, i, a) => a.indexOf(v) === i) || [];

  if (!isOpen) return null;

  const isViewMode = mode === "view";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === "create" && "Nueva Entrada de Bitácora"}
              {mode === "edit" && "Editar Entrada"}
              {mode === "view" && "Detalle de Entrada"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "view" ? "Visualización de registro" : "Registro diario de avance"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="space-y-6">
            {/* Categoria Selection */}
            <div>
              <Label>
                Categoría <span className="text-red-500">*</span>
              </Label>
              <Select
                value={categoria}
                onValueChange={setCategoria}
                disabled={isViewMode}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Estructura">Estructura</SelectItem>
                  <SelectItem value="Instalaciones">Instalaciones</SelectItem>
                  <SelectItem value="Acabados">Acabados</SelectItem>
                  <SelectItem value="Seguridad">Seguridad</SelectItem>
                  <SelectItem value="Generales">Generales</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Partida Selection / Display */}
            <div>
              <Label>
                Partida (Nivel 1) <span className="text-red-500">*</span>
              </Label>
              {isViewMode ? (
                <Input
                  value={partidas?.find(p => p._id === selectedPartidaId)?.nombre || "N/A"}
                  disabled
                />
              ) : (
                <Select
                  value={selectedPartidaId}
                  onValueChange={handlePartidaChange}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una partida" />
                  </SelectTrigger>
                  <SelectContent>
                    {partidas?.map((partida) => (
                      <SelectItem key={partida._id} value={partida._id}>
                        {partida.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Familias Tags Display / Selection */}
            {selectedPartidaId && (isViewMode ? selectedFamiliasTags.length > 0 : availableFamilias.length > 0) && (
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Familias (Tags)
                </Label>
                {isViewMode ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedFamiliasTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {availableFamilias.map((familia) => (
                      <div key={familia} className="flex items-center space-x-2">
                        <Checkbox
                          id={`familia-${familia}`}
                          checked={selectedFamiliasTags.includes(familia)}
                          onCheckedChange={() => toggleFamiliaTag(familia)}
                        />
                        <label
                          htmlFor={`familia-${familia}`}
                          className="text-sm text-gray-700 cursor-pointer"
                        >
                          {familia}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Date and Responsible */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>
                  Fecha <span className="text-red-500">*</span>
                </Label>
                {isViewMode ? (
                  <Input value={fecha} disabled />
                ) : (
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !fecha && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fecha || "Selecciona una fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={parseDate(fecha)}
                        onSelect={(date) => {
                          if (date) {
                            setFecha(formatDateToString(date));
                            setCalendarOpen(false);
                          }
                        }}
                        locale={es}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div>
                <Label>
                  Responsable <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text"
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  // disabled={isViewMode}
                  disabled={true}
                  placeholder="Nombre del responsable"
                  required
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <Label>
                Estado <span className="text-red-500">*</span>
              </Label>
              <Select
                value={status}
                onValueChange={setStatus}
                disabled={isViewMode}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona el estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sin problemas">Sin problemas</SelectItem>
                  <SelectItem value="Con retrasos">Con retrasos</SelectItem>
                  <SelectItem value="Problemas críticos">Problemas críticos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Comentarios / Retos */}
            { status !== "Sin problemas" && (
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Retos / Incidencias
              </Label>
              <Textarea
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                disabled={isViewMode}
                placeholder="Describe los retos o incidencias del día..."
                rows={3}
                className="resize-none"
              />
            </div>
            )}
            {/* Daily Progress */}
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Avance del día <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={avanceDia}
                onChange={(e) => setAvanceDia(e.target.value)}
                disabled={isViewMode}
                placeholder={`TORRE G:\nCIMBRADO DE LOSA 2DO NIVEL 65%\nARMADO DE LOSA 2DO NIVEL 45%\nCIMBRADO DE CASTILLOS 100%, SE VACIA CONCRETO 25 DE SEPTIEMBRE`}
                rows={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none font-mono text-sm disabled:bg-gray-100"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Describe el avance detallado del día. Puedes usar líneas separadas para cada actividad.
              </p>
            </div>

            {/* Photos Section */}
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Fotografías {managedPhotos.length > 0 && `(${managedPhotos.length})`}
              </Label>
              
              {/* View Mode - Gallery */}
              {isViewMode && managedPhotos.length > 0 && (
                <div className="space-y-3">
                  {/* Main Image */}
                  <div 
                    ref={imageContainerRef}
                    className={`relative bg-gray-100 rounded-lg overflow-hidden ${isFullscreen ? "flex items-center justify-center bg-black" : ""}`}
                  >
                    <img
                      src={managedPhotos[galleryIndex]?.url}
                      alt="Foto de bitácora"
                      className={`w-full object-contain ${isFullscreen ? "h-screen" : "h-64"}`}
                    />
                    
                    {/* Fullscreen button */}
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                    
                    {/* Navigation arrows */}
                    {managedPhotos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={handlePreviousPhoto}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNextPhoto}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    
                    {/* Photo counter */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                      {galleryIndex + 1} / {managedPhotos.length}
                    </div>
                  </div>
                  
                  {/* Thumbnails */}
                  {managedPhotos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {managedPhotos.map((photo, index) => (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => setGalleryIndex(index)}
                          className={`flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-colors ${
                            index === galleryIndex ? "border-gray-900" : "border-transparent hover:border-gray-300"
                          }`}
                        >
                          <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {isViewMode && managedPhotos.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin fotografías</p>
              )}
              
              {/* Edit/Create Mode - Unified Photo Management */}
              {!isViewMode && (
                <div className="space-y-4">
                  {/* Upload area */}
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-1">
                      Haz clic para agregar fotos
                    </p>
                    <p className="text-xs text-gray-500">
                      PNG, JPG, JPEG hasta 10MB
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  
                  {/* All photos grid (existing + new) */}
                  {managedPhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                      {managedPhotos.map((photo) => (
                        <div key={photo.id} className="relative group">
                          <img
                            src={photo.url}
                            alt="Foto"
                            className="w-full h-24 object-cover rounded-md border border-gray-200"
                          />
                          {/* Type badge */}
                          {photo.type === "new" && (
                            <div className="absolute bottom-1 left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded">
                              Nueva
                            </div>
                          )}
                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => removePhoto(photo)}
                            className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Summary */}
                  {(managedPhotos.length > 0 || photosToDelete.length > 0) && (
                    <p className="text-xs text-muted-foreground">
                      {managedPhotos.filter(p => p.type === "existing").length} existentes
                      {newFiles.length > 0 && `, ${newFiles.length} nuevas`}
                      {photosToDelete.length > 0 && ` (${photosToDelete.length} se eliminarán al guardar)`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        {!isViewMode && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Crear Entrada" : "Guardar Cambios"}
            </button>
          </div>
        )}

        {isViewMode && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
