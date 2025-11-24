import { X, Upload, Loader2, Trash2 } from "lucide-react";
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

export default function BitacoraModal() {
  const { isOpen, onClose, mode, proyectoId, logEntry } = useBitacoraModal();
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
  const [previewImages, setPreviewImages] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<Array<{_id: string; url?: string | null}>>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch log entry with photos for view/edit mode
  const fullLogEntry = useQuery(
    api.bitacora.getLogEntryById,
    logEntry?._id ? { logId: logEntry._id } : "skip"
  );

  // Update local state when logEntry changes or modal opens
  useEffect(() => {
    if (isOpen) {
        setCategoria(logEntry?.categoria || "");
        setSelectedPartidaId(logEntry?.partida_id || "");
        setSelectedFamiliasTags(logEntry?.familias_tags || []);
        // Auto-populate responsable from current user if creating new
        setResponsable(logEntry?.responsable || currentUser?.name || "");
        setFecha(logEntry?.fecha || new Date().toLocaleDateString("es-MX"));
        setAvanceDia(logEntry?.avance_dia || "");
        setComentarios(logEntry?.comentarios || "");
        setStatus(logEntry?.status || "Sin problemas");
        setPreviewImages([]);
        // Load existing photos for view/edit mode
        if (fullLogEntry?.fotos) {
          setExistingPhotos(fullLogEntry.fotos);
        } else {
          setExistingPhotos([]);
        }
    }
  }, [isOpen, logEntry, currentUser, fullLogEntry]);

  // Handle file selection for preview (don't upload yet)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setPreviewImages([...previewImages, ...fileArray]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Remove image from preview
  const removeImage = (index: number) => {
    setPreviewImages(previewImages.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proyectoId || !selectedPartidaId || !categoria) return;

    setIsSubmitting(true);
    try {
      // Upload images if any
      const imageStorageIds: Id<"_storage">[] = [];
      if (previewImages.length > 0) {
        for (const file of previewImages) {
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
    setPreviewImages([]);
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
                <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                  {partidas?.find(p => p._id === selectedPartidaId)?.nombre || "N/A"}
                </div>
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
                <Input
                  type="text"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={isViewMode}
                  placeholder="DD/MM/YYYY"
                  required
                />
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

            {/* Existing Photos Display (view and edit mode) */}
            {(isViewMode || mode === "edit") && existingPhotos.length > 0 && (
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Fotografías Existentes {mode === "edit" && `(${existingPhotos.length})`}
                </Label>
                <div className="grid grid-cols-4 gap-3">
                  {existingPhotos.map((foto) => (
                    <div key={foto._id} className="relative group">
                      {foto.url && (
                        <>
                          <img
                            src={foto.url}
                            alt="Evidencia"
                            className={`w-full h-24 object-cover rounded-sm border border-gray-300 transition-opacity ${
                              deletingPhotoId === foto._id ? "opacity-50" : ""
                            }`}
                          />
                          {/* Delete button (edit mode only) */}
                          {mode === "edit" && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm("¿Estás seguro de eliminar esta foto?")) {
                                  try {
                                    setDeletingPhotoId(foto._id);
                                    await deletePhoto({ photoId: foto._id as Id<"documentos"> });
                                    // Remove from local state
                                    setExistingPhotos(prev => prev.filter(p => p._id !== foto._id));
                                  } catch (error) {
                                    console.error("Error deleting photo:", error);
                                    alert("Error al eliminar la foto");
                                  } finally {
                                    setDeletingPhotoId(null);
                                  }
                                }
                              }}
                              disabled={deletingPhotoId === foto._id}
                              className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingPhotoId === foto._id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo Upload Section (create and edit mode) */}
            {mode !== "view" && (
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Fotografías
                </Label>
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">
                    Arrastra y suelta fotos aquí, o haz clic para seleccionar
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
                
                {/* Image Preview Grid */}
                {previewImages.length > 0 && (
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    {previewImages.map((file, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-24 object-cover rounded-sm border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                          {file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
