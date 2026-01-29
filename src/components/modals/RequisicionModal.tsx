import { Plus, Trash2, Upload, Loader2, Check, CalendarIcon, FileText, ExternalLink, Package, Clock } from "lucide-react";
import { useRequisicionModal, RequisicionItem } from "../../hooks/nueva-requisicion-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useEffect, Fragment } from "react";
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
import { Separator } from "../ui/separator";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../ui/sheet";

export default function RequisicionModal() {
  const { user } = useUser();
  const {
    isOpen,
    onClose,
    context,
    mode,
    tipo,
    selectedPartida,
    items,
    proveedor_id,
    fecha_entrega,
    descripcion,
    status,
    solicitante_nombre,
    fecha_solicitud,
    setTipo,
    setSelectedPartida,
    // setProveedorId,
    setFechaEntrega,
    setDescripcion,
    setStatus,
    prefillForm,
    addItem,
    removeItem,
    updateItem,
    addSubPartida,
    removeSubPartida,
    updateSubPartida,
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

  // Track the current item being edited for sub-partida query
  const [currentFamiliaForSubPartidas, setCurrentFamiliaForSubPartidas] = useState<{ partida: string; familia: string } | null>(null);

  // Fetch sub-partidas dynamically based on selected partida and familia
  const subPartidasQuery = useQuery(
    api.partida.getDistinctSubPartidasByFamilia,
    currentFamiliaForSubPartidas && context?.projectId
      ? {
        partidaNombre: currentFamiliaForSubPartidas.partida,
        familia: currentFamiliaForSubPartidas.familia,
        projectId: context.projectId,
      }
      : "skip"
  );

  // Fetch proveedores
  // const proveedores = useQuery(api.proveedores.getAll);

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
      // Extract partida from first item (all items share same partida)
      const firstItem = requisicionData.items[0];
      const partida = firstItem?.partida;
      const partidaNombre = partida?.nombre || partida?.partida_nombre || "";
      const partidaRecord = partidas?.find(p => p.nombre === partidaNombre);

      // Group items by familia into nested structure
      const familiaGroups: Record<string, RequisicionItem> = {};

      requisicionData.items.forEach((item) => {
        if (!familiaGroups[item.familia]) {
          familiaGroups[item.familia] = {
            id: `familia-${item.familia}-${Date.now()}`,
            familia: item.familia,
            subPartidas: [],
            partida_id: item.partida_id,
          };
        }
        familiaGroups[item.familia].subPartidas.push({
          id: item._id,
          sub_partida: item.sub_partida || "",
          cantidad: item.cantidad,
          unidad: item.unidad,
          monto: item.monto,
          partida_id: item.partida_id,
        });
      });

      const mappedItems: RequisicionItem[] = Object.values(familiaGroups);
      const defaultItem: RequisicionItem = {
        id: "1",
        familia: "",
        subPartidas: [{ id: "sp-1", sub_partida: "", cantidad: 0, unidad: "" }],
      };

      prefillForm({
        tipo: requisicionData.tipo as "material" | "equipo",
        selectedPartida: { id: partidaRecord?._id || "", nombre: partidaNombre },
        items: mappedItems.length > 0 ? mappedItems : [defaultItem],
        proveedor_id: requisicionData.proveedor_id || "",
        fecha_entrega: requisicionData.fecha_entrega || "",
        descripcion: requisicionData.descripcion || "",
        status: requisicionData.status,
        solicitante_nombre: requisicionData.solicitante_nombre,
        fecha_solicitud: requisicionData.fecha_solicitud,
      });
    }
  }, [mode, requisicionData, allPartidas, partidas, prefillForm]);

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

  // Handle familia selection change - detect if it's a custom item (no sub-partidas)
  const handleFamiliaChange = (itemId: string, familia: string) => {
    const budgetInfo = getBudgetInfo(selectedPartida.nombre, familia);
    const subPartidasList = getSubPartidasForFamilia(selectedPartida.nombre, familia);
    const isCustomItem = subPartidasList.length === 0;

    // Set current familia to trigger sub-partidas query
    setCurrentFamiliaForSubPartidas({
      partida: selectedPartida.nombre,
      familia: familia,
    });

    updateItem(itemId, {
      familia,
      presupuesto_aprobado: budgetInfo?.presupuesto_aprobado,
      pagado: budgetInfo?.pagado,
      por_gastar: budgetInfo?.por_gastar,
      isCustomItem,
      partida_id: budgetInfo?.partida_id,
    });
  };

  // Handle sub-partida selection change (now works with nested structure)
  const handleSubPartidaChange = (itemId: string, subPartidaId: string, familia: string, subPartida: string) => {
    const budgetInfo = getBudgetInfo(selectedPartida.nombre, familia, subPartida);
    const item = items.find(i => i.id === itemId);
    const sp = item?.subPartidas.find(s => s.id === subPartidaId);
    const cantidad = sp?.cantidad || 0;

    // Check if precio_unitario exists and is valid (not 0 or undefined)
    const precioUnitario = budgetInfo?.precio_unitario;
    const hasValidPrice = precioUnitario !== undefined && precioUnitario > 0;

    // Calculate monto if precio_unitario is valid, otherwise mark as needing manual input
    const calculatedMonto = hasValidPrice && cantidad > 0 ? cantidad * precioUnitario : undefined;

    updateSubPartida(itemId, subPartidaId, {
      sub_partida: subPartida,
      partida_id: budgetInfo?.partida_id,
      unidad: budgetInfo?.unidad || "",
      presupuesto_aprobado: budgetInfo?.presupuesto_aprobado,
      pagado: budgetInfo?.pagado,
      por_gastar: budgetInfo?.por_gastar,
      precio_unitario: precioUnitario,
      monto: calculatedMonto,
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
    if (!selectedPartida.nombre) return false;
    if (items.length === 0) return false;
    return items.every(item =>
      item.familia &&
      item.subPartidas.length > 0 &&
      item.subPartidas.every(sp => sp.cantidad > 0 && sp.unidad)
    );
  };

  // Handle price per unit change with auto-calculation (now for sub-partidas)
  const handlePrecioUnitarioChange = (itemId: string, subPartidaId: string, precio: number) => {
    const item = items.find(i => i.id === itemId);
    const sp = item?.subPartidas.find(s => s.id === subPartidaId);
    if (sp) {
      const monto = sp.cantidad > 0 && precio > 0 ? sp.cantidad * precio : undefined;
      updateSubPartida(itemId, subPartidaId, { precio_unitario: precio, monto });
    }
  };

  // Handle cantidad change with auto-calculation (now for sub-partidas)
  const handleCantidadChange = (itemId: string, subPartidaId: string, cantidad: number) => {
    const item = items.find(i => i.id === itemId);
    const sp = item?.subPartidas.find(s => s.id === subPartidaId);
    if (sp && sp.precio_unitario && sp.precio_unitario > 0) {
      // Auto-calculate monto for any sub-partida with valid precio_unitario
      const monto = cantidad > 0 ? cantidad * sp.precio_unitario : undefined;
      updateSubPartida(itemId, subPartidaId, { cantidad, monto });
    } else {
      updateSubPartida(itemId, subPartidaId, { cantidad });
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

        // Flatten nested sub-partidas into individual items
        const flattenedItems = items.flatMap(item =>
          item.subPartidas.map(sp => ({
            partida_id: (sp.partida_id || item.partida_id || selectedPartida.id) as Id<"partidas">,
            familia: item.familia,
            sub_partida: sp.sub_partida || undefined,
            cantidad: sp.cantidad,
            unidad: sp.unidad,
            monto: sp.monto,
          }))
        );

        requisicionId = await createRequisicion({
          proyecto: context.projectId,
          tipo,
          solicitante_id: currentUser._id,
          solicitante_nombre: currentUser.name,
          proveedor_id: proveedor_id || undefined,
          fecha_solicitud: fechaSolicitud,
          fecha_entrega: fecha_entrega || undefined,
          descripcion: descripcion || undefined,
          items: flattenedItems,
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

        // Flatten nested sub-partidas into individual items
        const flattenedItems = items.flatMap(item =>
          item.subPartidas.map(sp => ({
            partida_id: (sp.partida_id || item.partida_id || selectedPartida.id) as Id<"partidas">,
            familia: item.familia,
            sub_partida: sp.sub_partida || undefined,
            cantidad: sp.cantidad,
            unidad: sp.unidad,
            monto: sp.monto,
          }))
        );

        await updateRequisicion({
          id: context.requisicionId,
          tipo,
          proveedor_id: proveedor_id || undefined,
          fecha_entrega: fecha_entrega || undefined,
          descripcion: descripcion || undefined,
          items: flattenedItems,
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

  // Loading state for edit/view inside Sheet
  const loadingContent = (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      <p className="text-gray-500 mt-4">Cargando requisición...</p>
    </div>
  );

  // Calculate totals for view mode
  const totalMonto = items.reduce((acc, item) => 
    acc + item.subPartidas.reduce((sum, sp) => sum + ((sp.monto || 0) * 1.16), 0), 0
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {/* Loading State */}
        {(mode === "edit" || mode === "view") && !requisicionData ? (
          loadingContent
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="p-6 border-b border-gray-200 space-y-4">
              {/* User info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#dddcd8] flex items-center justify-center text-sm  text-gray-700">
                    {(mode === "create" ? (user?.fullName || currentUser?.name || "U") : solicitante_nombre || "U").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm  text-gray-900">
                      {mode === "create" ? (user?.fullName || currentUser?.name) : solicitante_nombre}
                    </p>
                    {(mode === "edit" || mode === "view") && fecha_solicitud && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fecha_solicitud}
                      </p>
                    )}
                  </div>
                </div>
                {(mode === "edit" || mode === "view") && (
                  <span className={`px-3 py-1 rounded-full text-xs  ${
                    status === "En proceso" ? "bg-blue-100  border border-blue-200 text-blue-700" :
                    status === "Cancelado" ? "bg-red-50 text-red-700 border border-red-200 " :
                    status === "Pagado" ? "bg-green-50 text-green-700 border border-green-200" :
                    status === "Recibido" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    status === "Parcial" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" :
                    "bg-gray-50 text-gray-700 border border-gray-200"
                  }`}>
                    {status}
                  </span>
                )}
              </div>

              <div>
                <SheetTitle className="text-xl text-left font-normal">
                  {mode === "create" && "Nueva Requisición"}
                  {mode === "edit" && "Editar Requisición"}
                  {mode === "view" && "Detalle de Requisición"}
                </SheetTitle>
                <SheetDescription className="text-left text-sm">
                  {mode === "create" && "Completa los datos para crear una nueva requisición"}
                  {mode === "edit" && "Modifica los datos de la requisición"}
                  {mode === "view" && `${items.length} familia(s) • ${items.reduce((acc, i) => acc + i.subPartidas.length, 0)} item(s)`}
                </SheetDescription>
              </div>

              {/* Type Toggle - compact for view mode */}
              {isViewMode ? (
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 capitalize">{tipo}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                     variant={"ghost"}
                    size="sm"
                    onClick={() => setTipo("material")}
                    className={cn("flex-1 items-left rounded-none h-10", tipo === "material" ? "bg-[#f3fdf5] border border-green-300 text-gray-900" : "bg-gray-100 text-gray-700")}
                    >
                      <div className={cn("rounded-full p-0.5 border", tipo === "material" ? "bg-green-500 text-white" : "bg-gray-100 h-5 w-5")}>
                        {tipo === "material" && <Check className="h-2 w-2" />}
                      </div>
                    Material
                  </Button>
                  <Button
                    type="button"
                     variant={"ghost"}
                    size="sm"
                    onClick={() => setTipo("equipo")}
                    className={cn("flex-1 items-center rounded-none h-10", tipo === "equipo" ? "bg-[#f3fdf5] border border-green-300 text-gray-900" : "bg-gray-100 text-gray-700")}
                    >
                      <div className={cn("rounded-full p-0.5 border", tipo === "equipo" ? "bg-green-500 text-white" : "bg-gray-100 h-5 w-5")}>
                        {tipo === "equipo" && <Check className="h-2 w-2" />}
                      </div>
                    Equipo
                  </Button>
                </div>
              )}
            </SheetHeader>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">

            {/* Status Select (Edit mode only for admins) */}
            {mode === "edit" && currentUser?.role === "admin" && (
              <div>
                <Label className="text-sm  mb-2 block">Estado</Label>
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
            {/* Partida Select - ONE partida for the entire requisicion */}
            <div className="space-y-2">
              {isViewMode ? (
                <div className="flex items-center gap-2 py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Partida:</span>
                  <span className=" text-gray-900">{selectedPartida.nombre || "-"}</span>
                </div>
              ) : (
                <>
                  <Label className="text-base font-normal">Partida</Label>
                  <Select
                    value={selectedPartida.nombre}
                    onValueChange={(value) => {
                      const partida = partidas?.find(p => p.nombre === value);
                      setSelectedPartida({ id: partida?._id || "", nombre: value });
                    }}
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
                </>
              )}
            </div>

            {/* Familia Items - Multiple familias within the selected partida */}
            {selectedPartida.nombre && (
              <div className="space-y-4">
                {!isViewMode && <Label className="text-base font-normal">Familias</Label>}
                {items.map((item, itemIndex) => (
                  <Fragment key={item.id}>
                    {isViewMode && itemIndex > 0 && <Separator className="my-4" />}
                    <div className={`space-y-3 ${isViewMode ? 'border-l-2 border-gray-200 pl-4' : 'border border-gray-200 p-3 rounded'}`}>
                    {/* Familia Select */}
                    {isViewMode ? (
                      <div className="flex items-center justify-between">
                        <span className=" text-gray-900">{item.familia || "-"}</span>
                        <span className="text-xs text-gray-500">{item.subPartidas.length} item(s)</span>
                      </div>
                    ) : (
                      <Select
                        value={item.familia}
                        onValueChange={(value) => handleFamiliaChange(item.id, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona Familia" />
                        </SelectTrigger>
                        <SelectContent>
                          {getFamiliasForPartida(selectedPartida.nombre).map((familia) => (
                            <SelectItem key={familia} value={familia}>
                              {familia}
                            </SelectItem>
                          ))}
                          <SelectItem value="OTRO">OTRO</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* Sub-partidas - Multiple per familia */}
                    {item.familia && (
                      <div className={`${isViewMode ? 'space-y-2' : 'bg-gray-50 border border-gray-200 p-3 space-y-3'}`}>
                        {!isViewMode && <Label className="text-sm  text-gray-700">Sub-partidas</Label>}

                        {/* Loop through all sub-partidas in this familia */}
                        {item.subPartidas.map((sp, spIndex) => (
                          <div key={sp.id} className={`${isViewMode ? 'py-2 border-b border-gray-100 last:border-0' : 'bg-white border border-gray-200 p-3 rounded space-y-2'}`}>
                            {isViewMode ? (
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900 uppercase">{sp.sub_partida || "-"}</p>
                                  <p className="text-sm text-gray-500">{sp.cantidad} {sp.unidad}</p>
                                </div>
                                <div className="text-right">
                                  {sp.monto && (
                                    <p className="text-sm text-gray-700 whitespace-nowrap">
                                      {formatCurrency(sp.monto)} × {sp.cantidad}
                                    </p>
                                  )}
                                  {sp.monto && (
                                    <p className="text-xs text-gray-400 whitespace-nowrap">
                                      {formatCurrency(sp.monto * sp.cantidad * 1.16)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Sub-partida header with delete button */}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Sub-partida {spIndex + 1}</span>
                                  {item.subPartidas.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeSubPartida(item.id, sp.id)}
                                      className="text-red-400 hover:text-red-600 hover:bg-red-50 h-6 w-6 p-0"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>

                                {/* Sub-partida select or custom input */}
                                {(subPartidasQuery && subPartidasQuery.length > 0) || getSubPartidasForFamilia(selectedPartida.nombre, item.familia).length > 0 ? (
                                  <div className="space-y-2">
                                    <Select
                                      value={sp.sub_partida}
                                      onValueChange={(value) => handleSubPartidaChange(item.id, sp.id, item.familia, value)}
                                      onOpenChange={(open) => {
                                        if (open) {
                                          setCurrentFamiliaForSubPartidas({
                                            partida: selectedPartida.nombre,
                                            familia: item.familia,
                                          });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="w-full bg-white">
                                        <SelectValue placeholder="Selecciona Sub-partida" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(currentFamiliaForSubPartidas?.partida === selectedPartida.nombre &&
                                          currentFamiliaForSubPartidas?.familia === item.familia &&
                                          subPartidasQuery
                                        ) ? (
                                          subPartidasQuery.map((subPartida) => (
                                            <SelectItem key={subPartida} value={subPartida}>
                                              {subPartida}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          getSubPartidasForFamilia(selectedPartida.nombre, item.familia).map((spOption) => (
                                            <SelectItem key={spOption._id} value={spOption.sub_partida}>
                                              {spOption.sub_partida}
                                            </SelectItem>
                                          ))
                                        )}
                                        <SelectItem value="OTRO">OTRO</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {/* Custom description when OTRO selected */}
                                    {sp.sub_partida === "OTRO" && (
                                      <Input
                                        type="text"
                                        value={sp.descripcion_otro || ""}
                                        onChange={(e) => updateSubPartida(item.id, sp.id, { descripcion_otro: e.target.value })}
                                        className="bg-white"
                                        placeholder="Descripción del material..."
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <Input
                                    type="text"
                                    value={sp.sub_partida}
                                    onChange={(e) => updateSubPartida(item.id, sp.id, { sub_partida: e.target.value })}
                                    className="bg-white"
                                    placeholder="Escribe el material..."
                                  />
                                )}

                                {/* Quantity/Unit/Price fields */}
                                {sp.sub_partida && (
                                  <div className="grid grid-cols-4 gap-2">
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">Cantidad</Label>
                                      <Input
                                        type="number"
                                        value={sp.cantidad || ""}
                                        onChange={(e) => handleCantidadChange(item.id, sp.id, parseFloat(e.target.value) || 0)}
                                        className="bg-green-50 border-green-300 text-right"
                                        placeholder="0"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">Unidad</Label>
                                      <Input
                                        type="text"
                                        value={sp.unidad || ""}
                                        onChange={(e) => updateSubPartida(item.id, sp.id, { unidad: e.target.value })}
                                        className="bg-white text-center text-sm"
                                        placeholder="PZA"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">P. Unit.</Label>
                                      <Input
                                        type="number"
                                        value={sp.precio_unitario || ""}
                                        onChange={(e) => handlePrecioUnitarioChange(item.id, sp.id, parseFloat(e.target.value) || 0)}
                                        className="bg-white text-right"
                                        placeholder="$0.00"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500 mb-1 block">Total</Label>
                                      <div className="h-9 px-3 py-2 bg-green-50 border border-green-200 text-right text-sm  text-green-700">
                                        {sp.monto ? formatCurrency(sp.monto * 1.16) : "-"}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Budget indicator */}
                                {sp.presupuesto_aprobado !== undefined && sp.presupuesto_aprobado > 0 && (
                                  <div className="space-y-1 pt-2 border-t border-gray-100">
                                    <div className="flex justify-between text-xs text-gray-600">
                                      <span>Ejercido: {formatCurrency(sp.pagado || 0)}</span>
                                      <span>Disponible: {formatCurrency(sp.por_gastar || 0)}</span>
                                    </div>
                                    <Progress
                                      value={sp.presupuesto_aprobado > 0
                                        ? Math.min(100, ((sp.pagado || 0) / sp.presupuesto_aprobado) * 100)
                                        : 0
                                      }
                                      className={`h-1.5 ${(sp.por_gastar || 0) < 0
                                        ? "[&>div]:bg-red-500"
                                        : "[&>div]:bg-green-500"
                                        }`}
                                    />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}

                        {/* Add more sub-partida button */}
                        {!isViewMode && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addSubPartida(item.id)}                            
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar Sub-partida
                          </Button>
                        )}

                        {/* Familia Total - hide in view mode since we show total in footer */}
                        {!isViewMode && (
                          <div className="flex justify-end pt-2 border-t border-gray-200">
                            <div className="text-right">
                              <span className="text-xs text-gray-500">Total Familia:</span>
                              <div className="text-lg  text-gray-900">
                                {formatCurrency(item.subPartidas.reduce((sum, sp) => sum + ((sp.monto || 0) * 1.16), 0))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remove item button */}
                    {!isViewMode && items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0 h-auto"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Eliminar
                      </Button>
                    )}
                  </div>
                  </Fragment>
                ))}

                {/* Add more familia button - outside the item boxes */}
                {!isViewMode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addItem}
                    className="mt-2"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Familia
                  </Button>
                )}
              </div>
            )}

            {/* Proveedor and Fecha de entrega */}
            <div className="grid grid-cols-1 gap-4">
              {isViewMode ? (
                fecha_entrega && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CalendarIcon className="h-4 w-4" />
                    <span>Entrega: {fecha_entrega}</span>
                  </div>
                )
              ) : (
                <>
                  {/* <Select
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
                  </Select> */}

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
              {isViewMode ? (
                descripcion && (
                  <div className="text-sm">
                    <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Notas</span>
                    <p className="text-gray-700">{descripcion}</p>
                  </div>
                )
              ) : (
                <>
                  <Label className="text-base  mb-2 block font-normal">Descripción</Label>
                  <Textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Comentarios..."
                    rows={3}
                    className="resize-none rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </>
              )}
            </div>

            {/* Soporte - File Upload */}
            <div>
              {!isViewMode && <Label className="text-base  mb-2 block font-normal">Soporte</Label>}

              {/* Existing documents (edit/view mode) */}
              {(mode === "edit" || mode === "view") && requisicionData?.documentos && requisicionData.documentos.length > 0 && (
                <div className="mb-3 space-y-2">
                  {isViewMode && (
                    <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Documentos</span>
                  )}
                  {!isViewMode && <p className="text-sm text-gray-500">Documentos existentes:</p>}
                  {requisicionData.documentos.map((doc) => (
                    <div key={doc._id} className={`flex items-center justify-between ${isViewMode ? 'py-2 border-b border-gray-100' : 'bg-gray-50 px-3 py-2 border border-gray-200'}`}>
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600 flex-1"
                        onClick={() => doc.url && window.open(doc.url, '_blank')}
                      >
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700 truncate">{doc.nombre}</span>
                        <ExternalLink className="w-3 h-3 text-gray-400" />
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="h-6 w-6 p-0 hover:bg-blue-100"
                          >
                            <Trash2 className="h-4 w-4 text-gray-500" />
                          </Button>
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
            <SheetFooter className="p-6 border-t border-gray-200">
              <div className="flex items-center justify-between w-full">
                {isViewMode && totalMonto > 0 && (
                  <div className="text-left">
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-lg  text-gray-900">{formatCurrency(totalMonto)}</p>
                  </div>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  <Button
                    onClick={handleClose}
                    disabled={isSubmitting}
                    variant="outline"
                  >
                    {isViewMode ? "Cerrar" : "Cancelar"}
                  </Button>
                  {!isViewMode && (
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !isFormValid()}
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {mode === "create" ? "Enviar solicitud" : "Guardar cambios"}
                    </Button>
                  )}
                </div>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
