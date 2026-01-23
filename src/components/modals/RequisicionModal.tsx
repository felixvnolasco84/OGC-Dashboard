import { X, Plus, Trash2, Upload, Loader2, Check, CalendarIcon, FileText, ExternalLink } from "lucide-react";
import { useRequisicionModal, RequisicionItem } from "../../hooks/nueva-requisicion-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Id } from "../../../convex/_generated/dataModel";
import { useUser } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Progress } from "../ui/progress";
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export default function RequisicionModal() {
  const { user } = useUser();
  const {
    isOpen,
    onClose,
    context,
    mode,
    tipo,
    items,
    proveedor_id,
    fecha_entrega,
    descripcion,
    status,
    solicitante_nombre,
    fecha_solicitud,
    setTipo,
    setProveedorId,
    setFechaEntrega,
    setDescripcion,
    setStatus,
    prefillForm,
    addItem,
    removeItem,
    updateItem,
  } = useRequisicionModal();

  const createRequisicion = useMutation(api.requisiciones.create);
  const updateRequisicion = useMutation(api.requisiciones.update);
  const addDocument = useMutation(api.requisiciones.addDocument);
  const deleteDocument = useMutation(api.requisiciones.deleteDocument);
  const generateUploadUrl = useMutation(api.requisiciones.generateUploadUrl);
  const currentUser = useQuery(api.users.getCurrentUser);
  
  // Fetch requisicion data for edit/view modes
  const requisicionData = useQuery(
    api.requisiciones.getById,
    context?.requisicionId ? { id: context.requisicionId } : "skip"
  );
  
  // Fetch partidas (nivel 1) for the project
  const partidas = useQuery(
    api.partida.getByNivel,
    context?.projectId ? { proyecto: context.projectId, nivel: 1 } : "skip"
  );
  
  // Fetch all partidas for cascading selects
  const allPartidas = useQuery(
    api.partida.getByProject,
    context?.projectId ? { projectId: context.projectId } : "skip"
  );
  
  // Fetch proveedores
  const proveedores = useQuery(api.proveedores.getAll);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Id<"requisicion_documentos"> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prefill form when editing/viewing
  useEffect(() => {
    if ((mode === "edit" || mode === "view") && requisicionData && allPartidas) {
      const mappedItems: RequisicionItem[] = requisicionData.items.map((item) => {
        const partida = item.partida;
        return {
          id: item._id,
          partida_id: item.partida_id,
          partida_nombre: partida?.nombre || partida?.partida_nombre || "",
          familia: item.familia,
          sub_partida: item.sub_partida || "",
          cantidad: item.cantidad,
          unidad: item.unidad,
          monto: item.monto,
        };
      });
      
      prefillForm({
        tipo: requisicionData.tipo as "material" | "equipo",
        items: mappedItems.length > 0 ? mappedItems : [{ id: "1", partida_id: "", partida_nombre: "", familia: "", sub_partida: "", cantidad: 0, unidad: "" }],
        proveedor_id: requisicionData.proveedor_id || "",
        fecha_entrega: requisicionData.fecha_entrega || "",
        descripcion: requisicionData.descripcion || "",
        status: requisicionData.status,
        solicitante_nombre: requisicionData.solicitante_nombre,
        fecha_solicitud: requisicionData.fecha_solicitud,
      });
    }
  }, [mode, requisicionData, allPartidas, prefillForm]);

  // Parse date string (DD/MM/YYYY) to Date object
  const parseDate = (dateStr: string): Date | undefined => {
    try {
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

  // Get unique familias for a given partida
  const getFamiliasForPartida = (partidaNombre: string) => {
    if (!allPartidas) return [];
    return allPartidas
      .filter(p => p.nivel === 2 && p.partida_nombre === partidaNombre)
      .map(p => p.familia)
      .filter((v, i, a) => a.indexOf(v) === i);
  };

  // Get sub-partidas for a given partida + familia
  const getSubPartidasForFamilia = (partidaNombre: string, familia: string) => {
    if (!allPartidas) return [];
    return allPartidas.filter(
      p => p.nivel === 3 && p.partida_nombre === partidaNombre && p.familia === familia
    );
  };

  // Get budget info for selection
  const getBudgetInfo = (partidaNombre: string, familia?: string, subPartida?: string) => {
    if (!allPartidas) return null;
    
    let match;
    if (subPartida) {
      match = allPartidas.find(
        p => p.nivel === 3 && p.partida_nombre === partidaNombre && 
             p.familia === familia && p.sub_partida === subPartida
      );
    } else if (familia) {
      match = allPartidas.find(
        p => p.nivel === 2 && p.partida_nombre === partidaNombre && p.familia === familia
      );
    } else {
      match = allPartidas.find(
        p => p.nivel === 1 && p.nombre === partidaNombre
      );
    }
    
    if (!match) return null;
    return {
      presupuesto_aprobado: match.presupuesto_aprobado,
      pagado: match.pagado,
      por_gastar: match.por_gastar ?? (match.presupuesto_aprobado - match.pagado),
      unidad: match.unidad,
      partida_id: match._id,
      precio_unitario: match.precio_unitario, // From partidas schema
    };
  };

  // Handle partida selection change
  const handlePartidaChange = (itemId: string, partidaNombre: string) => {
    const partida = partidas?.find(p => p.nombre === partidaNombre);
    updateItem(itemId, {
      partida_nombre: partidaNombre,
      partida_id: partida?._id || "",
      familia: "",
      sub_partida: "",
      unidad: partida?.unidad || "",
    });
  };

  // Handle familia selection change - detect if it's a custom item (no sub-partidas)
  const handleFamiliaChange = (itemId: string, partidaNombre: string, familia: string) => {
    const budgetInfo = getBudgetInfo(partidaNombre, familia);
    const subPartidas = getSubPartidasForFamilia(partidaNombre, familia);
    const isCustomItem = subPartidas.length === 0;
    
    updateItem(itemId, {
      familia,
      sub_partida: "",
      unidad: budgetInfo?.unidad || "",
      presupuesto_aprobado: budgetInfo?.presupuesto_aprobado,
      pagado: budgetInfo?.pagado,
      por_gastar: budgetInfo?.por_gastar,
      isCustomItem,
      precio_unitario: undefined,
      monto: undefined,
    });
  };

  // Handle sub-partida selection change
  const handleSubPartidaChange = (itemId: string, partidaNombre: string, familia: string, subPartida: string) => {
    const budgetInfo = getBudgetInfo(partidaNombre, familia, subPartida);
    const item = items.find(i => i.id === itemId);
    const cantidad = item?.cantidad || 0;
    
    // Check if precio_unitario exists and is valid (not 0 or undefined)
    const precioUnitario = budgetInfo?.precio_unitario;
    const hasValidPrice = precioUnitario !== undefined && precioUnitario > 0;
    
    // Calculate monto if precio_unitario is valid, otherwise mark as needing manual input
    const calculatedMonto = hasValidPrice && cantidad > 0 ? cantidad * precioUnitario : undefined;
    
    updateItem(itemId, {
      sub_partida: subPartida,
      partida_id: budgetInfo?.partida_id || "",
      unidad: budgetInfo?.unidad || "",
      presupuesto_aprobado: budgetInfo?.presupuesto_aprobado,
      pagado: budgetInfo?.pagado,
      por_gastar: budgetInfo?.por_gastar,
      precio_unitario: precioUnitario,
      monto: calculatedMonto,
      isCustomItem: !hasValidPrice, // Treat as custom if no valid price
    });
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploadedFiles(prev => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);
  };

  // Check if form is valid
  const isFormValid = () => {
    if (items.length === 0) return false;
    return items.every(item => 
      item.partida_id && 
      item.partida_nombre && 
      item.familia && 
      item.cantidad > 0 && 
      item.unidad
    );
  };

  // Handle price per unit change with auto-calculation
  const handlePrecioUnitarioChange = (itemId: string, precio: number) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      const monto = item.cantidad > 0 && precio > 0 ? item.cantidad * precio : undefined;
      updateItem(itemId, { precio_unitario: precio, monto });
    }
  };

  // Handle cantidad change with auto-calculation (both for custom items and existing items with precio_unitario)
  const handleCantidadChange = (itemId: string, cantidad: number) => {
    const item = items.find(i => i.id === itemId);
    if (item && item.precio_unitario && item.precio_unitario > 0) {
      // Auto-calculate monto for any item with valid precio_unitario
      const monto = cantidad > 0 ? cantidad * item.precio_unitario : undefined;
      updateItem(itemId, { cantidad, monto });
    } else {
      updateItem(itemId, { cantidad });
    }
  };

  // Upload a single file
  const uploadFile = async (file: File, requisicionId: Id<"requisiciones">) => {
    const uploadUrl = await generateUploadUrl();
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    
    if (!result.ok) throw new Error("Failed to upload file");
    
    const { storageId } = await result.json();
    
    await addDocument({
      requisicion_id: requisicionId,
      proyecto: context!.projectId,
      storage_id: storageId,
      nombre: file.name,
      type: file.type,
      size: file.size,
      uploaded_by_id: currentUser!._id,
      uploaded_by_name: currentUser!.name,
    });
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!context?.projectId || !currentUser || !isFormValid()) return;

    setIsSubmitting(true);
    try {
      let requisicionId: Id<"requisiciones">;
      
      if (mode === "create") {
        // Format date
        const today = new Date();
        const fechaSolicitud = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

        requisicionId = await createRequisicion({
          proyecto: context.projectId,
          tipo,
          solicitante_id: currentUser._id,
          solicitante_nombre: currentUser.name,
          proveedor_id: proveedor_id || undefined,
          fecha_solicitud: fechaSolicitud,
          fecha_entrega: fecha_entrega || undefined,
          descripcion: descripcion || undefined,
          items: items.map(item => ({
            partida_id: item.partida_id as Id<"partidas">,
            familia: item.familia,
            sub_partida: item.sub_partida || undefined,
            cantidad: item.cantidad,
            unidad: item.unidad,
            monto: item.monto,
          })),
        });
        
        // Upload files if any
        if (uploadedFiles.length > 0) {
          setIsUploadingDocument(true);
          try {
            for (const file of uploadedFiles) {
              await uploadFile(file, requisicionId);
            }
          } catch (docError) {
            console.error("Error uploading documents:", docError);
            toast.error("Error al subir documentos", {
              description: "La requisición se creó pero algunos documentos no se pudieron adjuntar.",
            });
          } finally {
            setIsUploadingDocument(false);
          }
        }
        
        toast.success("Requisición creada", {
          description: "La requisición ha sido enviada exitosamente.",
        });
      } else if (mode === "edit" && context.requisicionId) {
        requisicionId = context.requisicionId;
        
        await updateRequisicion({
          id: context.requisicionId,
          tipo,
          proveedor_id: proveedor_id || undefined,
          fecha_entrega: fecha_entrega || undefined,
          descripcion: descripcion || undefined,
          items: items.map(item => ({
            partida_id: item.partida_id as Id<"partidas">,
            familia: item.familia,
            sub_partida: item.sub_partida || undefined,
            cantidad: item.cantidad,
            unidad: item.unidad,
            monto: item.monto,
          })),
        });
        
        // Upload new files if any
        if (uploadedFiles.length > 0) {
          setIsUploadingDocument(true);
          try {
            for (const file of uploadedFiles) {
              await uploadFile(file, requisicionId);
            }
          } catch (docError) {
            console.error("Error uploading documents:", docError);
            toast.error("Error al subir documentos", {
              description: "Los cambios se guardaron pero algunos documentos no se pudieron adjuntar.",
            });
          } finally {
            setIsUploadingDocument(false);
          }
        }
        
        toast.success("Requisición actualizada", {
          description: "Los cambios han sido guardados exitosamente.",
        });
      }

      handleClose();
    } catch (error) {
      console.error("Error saving requisicion:", error);
      toast.error("Error", {
        description: mode === "create" ? "No se pudo crear la requisición." : "No se pudieron guardar los cambios.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle document deletion
  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;
    
    try {
      await deleteDocument({ id: documentToDelete });
      toast.success("Documento eliminado");
      setShowDeleteDialog(false);
      setDocumentToDelete(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Error al eliminar documento");
    }
  };

  const handleClose = () => {
    setUploadedFiles([]);
    onClose();
  };

  const isViewMode = mode === "view";

  if (!isOpen) return null;

  // Loading state for edit/view
  if ((mode === "edit" || mode === "view") && !requisicionData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white  shadow-xl p-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
          <p className="text-gray-500 mt-4">Cargando requisición...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white  shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-scroll">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <div className="flex items-center justify-end gap-2 text-sm text-gray-500 mb-2">
              <span>Solicita</span>
              <span className="font-medium text-gray-900">
                {mode === "create" ? (user?.fullName || currentUser?.name) : solicitante_nombre}
              </span>
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                {(mode === "create" ? (user?.fullName || currentUser?.name || "U") : solicitante_nombre || "U").charAt(0).toUpperCase()}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === "create" && "Nueva Requisición"}
              {mode === "edit" && "Editar Requisición"}
              {mode === "view" && "Detalle de Requisición"}
            </h2>
            {(mode === "edit" || mode === "view") && fecha_solicitud && (
              <p className="text-sm text-gray-500 mt-1">Solicitada el {fecha_solicitud}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Status Badge */}
            {(mode === "edit" || mode === "view") && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                status === "En proceso" ? "bg-blue-100 text-blue-700" :
                status === "Cancelado" ? "bg-red-100 text-red-700" :
                status === "Pagado" ? "bg-green-100 text-green-700" :
                status === "Recibido" ? "bg-emerald-100 text-emerald-700" :
                status === "Parcial" ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {status}
              </span>
            )}
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100  transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Type Toggle */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => !isViewMode && setTipo("material")}
                disabled={isViewMode}
                className={`flex-1 flex items-center gap-3 px-4 py-3  border-2 transition-all ${
                  tipo === "material"
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${isViewMode ? "cursor-default" : ""}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  tipo === "material" ? "border-green-500 bg-green-500" : "border-gray-300"
                }`}>
                  {tipo === "material" && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="font-medium">Material</span>
              </button>
              <button
                type="button"
                onClick={() => !isViewMode && setTipo("equipo")}
                disabled={isViewMode}
                className={`flex-1 flex items-center gap-3 px-4 py-3  border-2 transition-all ${
                  tipo === "equipo"
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${isViewMode ? "cursor-default" : ""}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  tipo === "equipo" ? "border-green-500 bg-green-500" : "border-gray-300"
                }`}>
                  {tipo === "equipo" && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="font-medium">Equipo</span>
              </button>
            </div>

            {/* Status Select (Edit mode only for admins) */}
            {mode === "edit" && currentUser?.role === "admin" && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="En proceso">En proceso</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                    <SelectItem value="Pagado">Pagado</SelectItem>
                    <SelectItem value="Recibido">Recibido</SelectItem>
                    <SelectItem value="Parcial">Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Line Items */}
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="space-y-3">
                  {/* Partida Select */}
                  {isViewMode ? (
                    <div className="p-3 bg-gray-50 ">
                      <span className="text-sm text-gray-500">Partida:</span>
                      <p className="font-medium">{item.partida_nombre || "-"}</p>
                    </div>
                  ) : (
                    <Select
                      value={item.partida_nombre}
                      onValueChange={(value) => handlePartidaChange(item.id, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona Partida" />
                      </SelectTrigger>
                      <SelectContent>
                        {partidas?.map((partida) => (
                          <SelectItem key={partida._id} value={partida.nombre}>
                            {partida.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Familia Select */}
                  {item.partida_nombre && (
                    isViewMode ? (
                      <div className="p-3 bg-orange-50 ">
                        <span className="text-sm text-gray-500">Familia:</span>
                        <p className="font-medium text-orange-700">{item.familia || "-"}</p>
                      </div>
                    ) : (
                      <Select
                        value={item.familia}
                        onValueChange={(value) => handleFamiliaChange(item.id, item.partida_nombre, value)}
                      >
                        <SelectTrigger className="w-full bg-orange-50 border-orange-200">
                          <SelectValue placeholder="Selecciona Familia" />
                        </SelectTrigger>
                        <SelectContent>
                          {getFamiliasForPartida(item.partida_nombre).map((familia) => (
                            <SelectItem key={familia} value={familia}>
                              {familia}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  )}

                  {/* Sub-partida and Quantity */}
                  {item.familia && (
                    <div className="bg-orange-50 border border-orange-200  p-3 space-y-2">
                      {isViewMode ? (
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <div>
                              <span className="text-sm text-gray-500">Sub-partida:</span>
                              <p className="font-medium">{item.sub_partida || "-"}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-sm text-gray-500">Cantidad:</span>
                              <p className="font-medium">{item.cantidad} {item.unidad}</p>
                            </div>
                          </div>
                          
                          {/* Price and Monto display */}
                          <div className="flex justify-between">
                            {item.precio_unitario !== undefined && item.precio_unitario > 0 && (
                              <div>
                                <span className="text-sm text-gray-500">Precio unitario:</span>
                                <p className="font-medium">{formatCurrency(item.precio_unitario)}</p>
                              </div>
                            )}
                            {item.monto && (
                              <div className="text-right">
                                <span className="text-sm text-gray-500">Monto:</span>
                                <p className="font-medium text-green-700">{formatCurrency(item.monto)}</p>
                              </div>
                            )}
                          </div>
                          
                          {/* Budget headroom with Progress in view mode */}
                          {item.presupuesto_aprobado !== undefined && item.presupuesto_aprobado > 0 && (
                            <div className="space-y-1 pt-2 border-t border-orange-200">
                              <div className="flex justify-between text-xs text-gray-600">
                                <span>Presupuesto: {formatCurrency(item.presupuesto_aprobado)}</span>
                                <span>Disponible: {formatCurrency(item.por_gastar || 0)}</span>
                              </div>
                              <Progress 
                                value={item.presupuesto_aprobado > 0 
                                  ? Math.min(100, ((item.pagado || 0) / item.presupuesto_aprobado) * 100) 
                                  : 0
                                } 
                                className={`h-2 ${
                                  (item.por_gastar || 0) < 0 
                                    ? "[&>div]:bg-red-500" 
                                    : ((item.pagado || 0) / (item.presupuesto_aprobado || 1)) > 0.8 
                                      ? "[&>div]:bg-yellow-500" 
                                      : "[&>div]:bg-green-500"
                                }`}
                              />
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">
                                  Ejercido: {formatCurrency(item.pagado || 0)} 
                                  ({item.presupuesto_aprobado > 0 
                                    ? ((item.pagado || 0) / item.presupuesto_aprobado * 100).toFixed(0) 
                                    : 0}%)
                                </span>
                                {(item.por_gastar || 0) < 0 && (
                                  <span className="text-red-500 font-medium">⚠️ Excede presupuesto</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Sub-partida rows */}
                          {getSubPartidasForFamilia(item.partida_nombre, item.familia).length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Select
                                  value={item.sub_partida}
                                  onValueChange={(value) => handleSubPartidaChange(item.id, item.partida_nombre, item.familia, value)}
                                >
                                  <SelectTrigger className="flex-1 bg-white">
                                    <SelectValue placeholder="Selecciona Sub-partida" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getSubPartidasForFamilia(item.partida_nombre, item.familia).map((sp) => (
                                      <SelectItem key={sp._id} value={sp.sub_partida}>
                                        {sp.sub_partida}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Show quantity/unit/price fields based on whether precio_unitario exists */}
                              {item.sub_partida && (
                                item.precio_unitario && item.precio_unitario > 0 ? (
                                  // Item has valid precio_unitario from partidas - show auto-calculated
                                  <div className="grid grid-cols-4 gap-2">
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">Cantidad</Label>
                                      <Input
                                        type="number"
                                        value={item.cantidad || ""}
                                        onChange={(e) => handleCantidadChange(item.id, parseFloat(e.target.value) || 0)}
                                        className="bg-orange-100 border-orange-300 text-right"
                                        placeholder="0"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">Unidad</Label>
                                      <div className="h-9 px-3 py-2 bg-gray-100 border border-gray-200 text-center text-sm">
                                        {item.unidad || "-"}
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">P. Unit.</Label>
                                      <div className="h-9 px-3 py-2 bg-gray-100 border border-gray-200 text-right text-sm">
                                        {formatCurrency(item.precio_unitario)}
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">Total</Label>
                                      <div className="h-9 px-3 py-2 bg-green-50 border border-green-200 text-right text-sm font-medium text-green-700">
                                        {item.monto ? formatCurrency(item.monto) : "-"}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  // Item has NO valid precio_unitario - need manual input
                                  <div className="space-y-2">
                                    <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                      ⚠️ Este item no tiene precio unitario definido. Por favor ingrese el precio.
                                    </p>
                                    <div className="grid grid-cols-4 gap-2">
                                      <div>
                                        <Label className="text-xs text-gray-500 mb-1 block">Cantidad</Label>
                                        <Input
                                          type="number"
                                          value={item.cantidad || ""}
                                          onChange={(e) => handleCantidadChange(item.id, parseFloat(e.target.value) || 0)}
                                          className="bg-orange-100 border-orange-300 text-right"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-500 mb-1 block">Unidad</Label>
                                        <Input
                                          type="text"
                                          value={item.unidad}
                                          onChange={(e) => updateItem(item.id, { unidad: e.target.value })}
                                          className="bg-white text-center text-sm"
                                          placeholder="pz, ton"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-500 mb-1 block">Precio Unit.</Label>
                                        <Input
                                          type="number"
                                          value={item.precio_unitario || ""}
                                          onChange={(e) => handlePrecioUnitarioChange(item.id, parseFloat(e.target.value) || 0)}
                                          className="bg-white text-right"
                                          placeholder="$0.00"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-500 mb-1 block">Total</Label>
                                        <div className="h-9 px-3 py-2 bg-gray-100 border border-gray-200 text-right text-sm font-medium">
                                          {item.monto ? formatCurrency(item.monto) : "-"}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              )}
                              
                              {/* Simple cantidad/unidad if no sub-partida selected yet */}
                              {!item.sub_partida && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={item.cantidad || ""}
                                    onChange={(e) => updateItem(item.id, { cantidad: parseFloat(e.target.value) || 0 })}
                                    className="w-20 bg-orange-100 border-orange-300 text-right"
                                    placeholder="0"
                                  />
                                  <Input
                                    type="text"
                                    value={item.unidad}
                                    onChange={(e) => updateItem(item.id, { unidad: e.target.value })}
                                    className="w-16 bg-white text-center text-sm"
                                    placeholder="UND"
                                  />
                                </div>
                              )}
                              
                              {/* Budget indicator with Progress */}
                              {item.presupuesto_aprobado !== undefined && item.presupuesto_aprobado > 0 && (
                                <div className="space-y-1 pt-2 border-t border-orange-200">
                                  <div className="flex justify-between text-xs text-gray-600">
                                    <span>Presupuesto: {formatCurrency(item.presupuesto_aprobado)}</span>
                                    <span>Disponible: {formatCurrency(item.por_gastar || 0)}</span>
                                  </div>
                                  <Progress 
                                    value={item.presupuesto_aprobado > 0 
                                      ? Math.min(100, ((item.pagado || 0) / item.presupuesto_aprobado) * 100) 
                                      : 0
                                    } 
                                    className={`h-2 ${
                                      (item.por_gastar || 0) < 0 
                                        ? "[&>div]:bg-red-500" 
                                        : ((item.pagado || 0) / (item.presupuesto_aprobado || 1)) > 0.8 
                                          ? "[&>div]:bg-yellow-500" 
                                          : "[&>div]:bg-green-500"
                                    }`}
                                  />
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">
                                      Ejercido: {formatCurrency(item.pagado || 0)} 
                                      ({item.presupuesto_aprobado > 0 
                                        ? ((item.pagado || 0) / item.presupuesto_aprobado * 100).toFixed(0) 
                                        : 0}%)
                                    </span>
                                    {(item.por_gastar || 0) < 0 && (
                                      <span className="text-red-500 font-medium">⚠️ Excede presupuesto</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            // Custom text input when no sub-partidas exist - request price per unit
                            <div className="space-y-3">
                              <div className="flex gap-2">
                                <Input
                                  type="text"
                                  value={item.sub_partida}
                                  onChange={(e) => updateItem(item.id, { sub_partida: e.target.value })}
                                  className="flex-1 bg-white"
                                  placeholder="Escribe el material..."
                                />
                              </div>
                              
                              {/* Price per unit and quantity for custom items */}
                              <div className="grid grid-cols-4 gap-2">
                                <div>
                                  <Label className="text-xs text-gray-500 mb-1 block">Cantidad</Label>
                                  <Input
                                    type="number"
                                    value={item.cantidad || ""}
                                    onChange={(e) => handleCantidadChange(item.id, parseFloat(e.target.value) || 0)}
                                    className="bg-orange-100 border-orange-300 text-right"
                                    placeholder="0"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500 mb-1 block">Unidad</Label>
                                  <Input
                                    type="text"
                                    value={item.unidad}
                                    onChange={(e) => updateItem(item.id, { unidad: e.target.value })}
                                    className="bg-white text-center text-sm"
                                    placeholder="pz, ton, m³"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500 mb-1 block">Precio Unit.</Label>
                                  <Input
                                    type="number"
                                    value={item.precio_unitario || ""}
                                    onChange={(e) => handlePrecioUnitarioChange(item.id, parseFloat(e.target.value) || 0)}
                                    className="bg-white text-right"
                                    placeholder="$0.00"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500 mb-1 block">Total</Label>
                                  <div className="h-9 px-3 py-2 bg-gray-100 border border-gray-200 text-right text-sm font-medium">
                                    {item.monto ? formatCurrency(item.monto) : "-"}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Auto-calculation notice */}
                              {item.cantidad > 0 && item.precio_unitario && item.precio_unitario > 0 && (
                                <p className="text-xs text-green-600">
                                  Total calculado: {item.cantidad} × {formatCurrency(item.precio_unitario)} = {formatCurrency(item.monto || 0)}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Add more items button */}
                          <button
                            type="button"
                            onClick={addItem}
                            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mt-2"
                          >
                            <span>Agregar Partida</span>
                            <Plus className="h-4 w-4" />
                          </button>

                          {/* Optional Monto */}
                          <div className="flex justify-end">
                            <Input
                              type="number"
                              value={item.monto || ""}
                              onChange={(e) => updateItem(item.id, { monto: parseFloat(e.target.value) || undefined })}
                              className="w-32 bg-white text-right"
                              placeholder="Monto"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Remove item button */}
                  {!isViewMode && items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Proveedor and Fecha de entrega */}
            <div className="grid grid-cols-2 gap-4">
              {isViewMode ? (
                <>
                  <div className="p-3 bg-gray-50 ">
                    <span className="text-sm text-gray-500">Proveedor sugerido:</span>
                    <p className="font-medium">{requisicionData?.proveedor?.razon_social || "-"}</p>
                  </div>
                  <div className="p-3 bg-gray-50 ">
                    <span className="text-sm text-gray-500">Fecha de entrega:</span>
                    <p className="font-medium">{fecha_entrega || "-"}</p>
                  </div>
                </>
              ) : (
                <>
                  <Select
                    value={proveedor_id || ""}
                    onValueChange={(value) => setProveedorId(value as Id<"proveedores"> | "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Proveedor Sugerido" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores?.map((proveedor) => (
                        <SelectItem key={proveedor._id} value={proveedor._id}>
                          {proveedor.razon_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Calendar Date Picker */}
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !fecha_entrega && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fecha_entrega || "Fecha de entrega"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[9999] pointer-events-auto" align="start" sideOffset={4}>
                      <Calendar
                        mode="single"
                        selected={parseDate(fecha_entrega)}
                        onSelect={(date) => {
                          if (date) {
                            setFechaEntrega(formatDateToString(date));
                            setCalendarOpen(false);
                          }
                        }}
                        locale={es}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>

            {/* Descripción */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Descripción</Label>
              {isViewMode ? (
                <div className="p-3 bg-gray-50  min-h-[80px]">
                  <p className="text-gray-700">{descripcion || "Sin comentarios"}</p>
                </div>
              ) : (
                <Textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Comentarios..."
                  rows={3}
                  className="resize-none"
                />
              )}
            </div>

            {/* Soporte - File Upload */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Soporte</Label>
              
              {/* Existing documents (edit/view mode) */}
              {(mode === "edit" || mode === "view") && requisicionData?.documentos && requisicionData.documentos.length > 0 && (
                <div className="mb-3 space-y-2">
                  <p className="text-sm text-gray-500">Documentos existentes:</p>
                  {requisicionData.documentos.map((doc) => (
                    <div key={doc._id} className="flex items-center justify-between bg-gray-50 px-3 py-2 border border-gray-200">
                      <div 
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600 flex-1"
                        onClick={() => doc.url && window.open(doc.url, '_blank')}
                      >
                        <FileText className="w-5 h-5 text-gray-600" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700">{doc.nombre}</p>
                          <p className="text-xs text-gray-500">{doc.type}</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </div>
                      {!isViewMode && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setDocumentToDelete(doc._id);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* File upload area (not for view mode) */}
              {!isViewMode && (
                <>
                  <div
                    className="border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Agregar archivo</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOC, DOCX</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xml"
                    />
                  </div>
                  
                  {/* Pending uploads list */}
                  {uploadedFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-gray-500">Archivos por subir:</p>
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-blue-50 px-3 py-2 border border-blue-200">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-gray-700 truncate">{file.name}</span>
                            <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="p-1 hover:bg-blue-100 rounded"
                          >
                            <X className="h-4 w-4 text-gray-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Upload status */}
                  {isUploadingDocument && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Subiendo documentos...</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Delete Document Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. El documento será eliminado permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={handleDeleteDocument}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <Button            
            onClick={handleClose}
            disabled={isSubmitting}            
            variant={"outline"}
          >
            {isViewMode ? "Cerrar" : "Cancelar"}
          </Button>
          {!isViewMode && (
            <Button              
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid()}
              variant={"default"}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Enviar solicitud" : "Guardar cambios"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
