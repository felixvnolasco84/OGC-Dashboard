import { useEffect, useState } from "react";

import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { useIngresosModal } from "@/hooks/ingresos-modal";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  X,
  ExternalLink,
  Upload,
  File,
  Loader2,
  CalendarIcon,
  RefreshCw,
} from "lucide-react";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";

export default function IngresosModal() {
  const { user } = useUser();
  const {
    isOpen,
    context,
    editingIngreso,
    formData,
    onClose,
    setFormData,
    resetForm,
    startEditing,
    cancelEditing,
  } = useIngresosModal();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Document attachment state
  const [documentFile, setDocumentFile] = useState<globalThis.File | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  
  // Calendar popover state
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Replace document state
  const [replaceFile, setReplaceFile] = useState<globalThis.File | null>(null);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [isReplacingDocument, setIsReplacingDocument] = useState(false);

  // Queries
  const ingresos = useQuery(
    api.ingresos.getByProyecto,
    context ? { proyecto_id: context.projectId } : "skip"
  );

  const totals = useQuery(
    api.ingresos.getTotalsByProyecto,
    context ? { proyecto_id: context.projectId } : "skip"
  );

  // Query documents for the project (to show in table)
  const allIngresoDocuments = useQuery(
    api.ingresos_documentos.getByProyecto,
    context ? { proyecto_id: context.projectId } : "skip"
  );

  // Query documents for the currently editing ingreso
  const editingIngresoDocuments = useQuery(
    api.ingresos_documentos.getByIngreso,
    editingIngreso ? { ingreso_id: editingIngreso._id } : "skip"
  );

  // Mutations
  const createIngreso = useMutation(api.ingresos.create);
  const updateIngreso = useMutation(api.ingresos.update);
  const deleteIngreso = useMutation(api.ingresos.remove);
  const generateUploadUrl = useMutation(api.ingresos_documentos.generateUploadUrl);
  const createIngresoDocument = useMutation(api.ingresos_documentos.create);
  const deleteIngresoDocuments = useMutation(api.ingresos_documentos.removeByIngreso);
  const deleteIngresoDocument = useMutation(api.ingresos_documentos.remove);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowForm(false);
      resetForm();
      resetDocumentForm();
    }
  }, [isOpen, resetForm]);

  const resetDocumentForm = () => {
    setDocumentFile(null);
    setDocumentType("");
    setDocumentName("");
    setDocumentDescription("");
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context || !user) return;

    setIsSubmitting(true);
    try {
      let ingresoId: Id<"ingresos">;
      
      if (editingIngreso) {
        // Update existing ingreso
        await updateIngreso({
          id: editingIngreso._id,
          monto: formData.monto,
          fecha: formData.fecha,
          descripcion: formData.descripcion || undefined,
          moneda: formData.moneda,
          documento_adjunto: formData.documento_adjunto || undefined,
          documento_nombre: formData.documento_nombre || undefined,
        });
        ingresoId = editingIngreso._id;
      } else {
        // Create new ingreso
        ingresoId = await createIngreso({
          proyecto: context.projectId,
          monto: formData.monto,
          fecha: formData.fecha,
          descripcion: formData.descripcion || undefined,
          moneda: formData.moneda,
          documento_adjunto: formData.documento_adjunto || undefined,
          documento_nombre: formData.documento_nombre || undefined,
          clerk_id: user.id,
        });
      }

      // Upload document if provided
      let documentUploaded = false;
      if (documentFile && documentType && documentName) {
        try {
          setIsUploadingDocument(true);
          
          // Step 1: Generate upload URL
          const uploadUrl = await generateUploadUrl();
          
          // Step 2: Upload file to Convex storage
          const uploadResult = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": documentFile.type },
            body: documentFile,
          });
          
          if (!uploadResult.ok) {
            throw new Error("Failed to upload file");
          }
          
          const { storageId } = await uploadResult.json();
          
          // Step 3: Create document record linked to the ingreso
          await createIngresoDocument({
            ingreso_id: ingresoId,
            proyecto: context.projectId,
            nombre: documentName,
            descripcion: documentDescription || undefined,
            storage_id: storageId,
            type: documentType,
            size: documentFile.size,
            clerk_id: user.id,
          });
          
          documentUploaded = true;
        } catch (docError) {
          console.error("Error uploading document:", docError);
          toast.error("Error al subir documento", {
            description: "El ingreso se creó pero el documento no se pudo adjuntar.",
          });
        } finally {
          setIsUploadingDocument(false);
        }
      }

      // Show success toast
      const documentText = documentUploaded ? " con documento adjunto" : "";
      toast.success(editingIngreso ? "Ingreso actualizado" : "Ingreso creado", {
        description: `Se ${editingIngreso ? "actualizó" : "registró"} el ingreso${documentText}.`,
      });

      resetForm();
      resetDocumentForm();
      setShowForm(false);
    } catch (error) {
      console.error("Error saving ingreso:", error);
      toast.error("Error al guardar ingreso");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: Id<"ingresos">) => {
    if (!confirm("¿Estás seguro de eliminar este ingreso y sus documentos?")) return;
    
    try {
      // Delete associated documents first
      await deleteIngresoDocuments({ ingreso_id: id });
      // Then delete the ingreso
      await deleteIngreso({ id });
      toast.success("Ingreso eliminado");
    } catch (error) {
      console.error("Error deleting ingreso:", error);
      toast.error("Error al eliminar ingreso");
    }
  };

  const handleEdit = (ingreso: Doc<"ingresos">) => {
    startEditing(ingreso);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    cancelEditing();
    resetDocumentForm();
    setShowForm(false);
  };

  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  // Calculate "Neto" (Total Ingresos - Gasto Total from metrics)
  // For now, just showing total ingresos since gasto_total comes from a different query
  const totalIngresos = totals?.total_ingresos || 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-scroll flex flex-col">
        <DialogHeader className="border-b pb-4 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-medium">
                Ingresos
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {context?.projectName}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Total Ingresos</p>
                <p className="text-2xl font-medium">
                  {formatCurrency(totalIngresos, "MXN")}
                </p>
                <Badge variant="secondary" className="mt-1 text-gray-600">
                  {totals?.total_count || 0} entradas
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-scroll flex flex-col">
          {/* Add/Edit Form */}
          {showForm && (
            <div className="border-b">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">
                  {editingIngreso ? "Editar Ingreso" : "Nuevo Ingreso"}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {/* Monto */}
                  <div className="space-y-2">
                    <Label htmlFor="monto">Monto *</Label>
                    <Input
                      className="h-12"
                      id="monto"
                      type="number"
                      step="0.01"
                      value={formData.monto || ""}
                      onChange={(e) => setFormData({ monto: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  {/* Moneda */}
                  <div className="space-y-2">
                    <Label htmlFor="moneda">Moneda *</Label>
                    <Select
                      value={formData.moneda}
                      onValueChange={(value) => setFormData({ moneda: value })}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Seleccionar moneda" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                        <SelectItem value="USD">USD - Dólar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fecha */}
                  <div className="space-y-2">
                    <Label htmlFor="fecha">Fecha *</Label>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={false}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !formData.fecha && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.fecha || "Selecciona una fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[9999] pointer-events-auto" align="start" sideOffset={4}>
                        <Calendar
                          mode="single"
                          selected={parseDate(formData.fecha)}
                          onSelect={(date) => {
                            if (date) {
                              setFormData({ fecha: formatDateToString(date) });
                              setCalendarOpen(false);
                            }
                          }}
                          locale={es}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Descripción */}
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Input
                  className="h-12"
                    id="descripcion"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ descripcion: e.target.value })}
                    placeholder="Descripción del ingreso"
                  />
                </div>

                {/* Document Attachment - 1:1 relationship */}
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="text-sm font-medium text-gray-900">Documento adjunto</h3>

                  {/* Show existing document when editing (1:1 relationship) */}
                  {editingIngreso && editingIngresoDocuments && editingIngresoDocuments.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm text-gray-700">Documento actual</Label>
                      {(() => {
                        const doc = editingIngresoDocuments[0];
                        return (
                          <div className="flex items-center justify-between gap-2 p-3 border border-gray-200">
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
                            <div className="flex gap-1">
                              {/* Hidden file input for replace */}
                              <input
                                type="file"
                                id="replace-file-input"
                                className="hidden"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xml"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setReplaceFile(file);
                                    setShowReplaceDialog(true);
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                title="Reemplazar documento"
                                disabled={isReplacingDocument}
                                onClick={() => {
                                  document.getElementById("replace-file-input")?.click();
                                }}
                              >
                                {isReplacingDocument ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </Button>
                              <AlertDialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Reemplazar documento?</AlertDialogTitle>
                                    <AlertDialogDescription asChild>
                                      <div className="space-y-2">
                                        <p>Se reemplazará el documento actual por:</p>
                                        {replaceFile && (
                                          <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                                            <File className="w-4 h-4 text-gray-600" />
                                            <span className="text-sm font-medium">{replaceFile.name}</span>
                                            <span className="text-xs text-gray-500">
                                              ({(replaceFile.size / 1024).toFixed(2)} KB)
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setReplaceFile(null)}>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={async () => {
                                        if (!replaceFile || !editingIngreso || !context || !user) return;
                                        
                                        setIsReplacingDocument(true);
                                        try {
                                          // 1. Upload new file
                                          const uploadUrl = await generateUploadUrl();
                                          const result = await fetch(uploadUrl, {
                                            method: "POST",
                                            headers: { "Content-Type": replaceFile.type },
                                            body: replaceFile,
                                          });
                                          const { storageId } = await result.json();
                                          
                                          // 2. Create new document record
                                          await createIngresoDocument({
                                            ingreso_id: editingIngreso._id,
                                            proyecto: context.projectId,
                                            nombre: replaceFile.name,
                                            descripcion: doc.descripcion || "",
                                            storage_id: storageId,
                                            type: doc.type,
                                            size: replaceFile.size,
                                            clerk_id: user.id,
                                          });
                                          
                                          // 3. Delete old document
                                          await deleteIngresoDocument({ id: doc._id });
                                          
                                          toast.success("Documento reemplazado exitosamente");
                                          setReplaceFile(null);
                                        } catch (error) {
                                          console.error("Error replacing document:", error);
                                          toast.error("Error al reemplazar documento");
                                        } finally {
                                          setIsReplacingDocument(false);
                                        }
                                      }}
                                    >
                                      Confirmar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    title="Eliminar documento"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. El documento será eliminado permanentemente.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={async () => {
                                        try {
                                          await deleteIngresoDocument({ id: doc._id });
                                          toast.success("Documento eliminado");
                                        } catch (error) {
                                          console.error("Error deleting document:", error);
                                          toast.error("Error al eliminar documento");
                                        }
                                      }}
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-sm text-gray-700">Tipo de documento</Label>
                        <Select value={documentType} onValueChange={setDocumentType}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Seleccionar tipo de documento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="factura">Factura</SelectItem>
                            <SelectItem value="comprobante">Comprobante</SelectItem>
                            <SelectItem value="recibo">Recibo</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {documentType && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label className="text-sm text-gray-700">Archivo</Label>
                            <div className="border-2 border-dashed p-4 text-center">
                              {documentFile ? (
                                <div className="space-y-2">
                                  <File className="h-8 w-8 mx-auto text-green-600" />
                                  <p className="text-sm font-medium">{documentFile.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {(documentFile.size / 1024).toFixed(2)} KB
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setDocumentFile(null)}
                                  >
                                    Cambiar archivo
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Upload className="h-8 w-8 mx-auto text-gray-400" />
                                  <p className="text-sm text-gray-600">Arrastra un archivo o haz clic</p>
                                  <Input
                                    type="file"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setDocumentFile(file);
                                        if (!documentName) {
                                          setDocumentName(file.name);
                                        }
                                      }
                                    }}
                                    className="max-w-xs mx-auto"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xml"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm text-gray-700">Descripción del documento (opcional)</Label>
                            <Input
                              placeholder="Descripción del documento"
                              value={documentDescription}
                              onChange={(e) => setDocumentDescription(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelForm}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || isUploadingDocument || !formData.monto}
                  >
                    {isSubmitting || isUploadingDocument ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {isUploadingDocument ? "Subiendo documento..." : "Guardando..."}
                      </>
                    ) : editingIngreso ? (
                      "Actualizar"
                    ) : (
                      "Agregar"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Action Bar */}
          {!showForm && (
            <div className="flex justify-end">
              <Button size={"icon"} variant={"ghost"} onClick={handleAddNew}>
                <Plus className="h-4 w-4" />                
              </Button>
            </div>
          )}

          {/* Table */}
          {
            !showForm && <div className="flex-1 overflow-auto">
            {ingresos && ingresos.length > 0  ? (
              <Table>
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow>
                    <TableHead className="w-[120px]">Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-[100px]">Agregado por</TableHead>
                    <TableHead className="w-[80px]">Doc</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingresos.map((ingreso) => (
                    <TableRow key={ingreso._id}>
                      <TableCell className="font-medium">
                        {ingreso.fecha}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {ingreso.descripcion || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(ingreso.monto, ingreso.moneda)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {ingreso.added_by_name}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // Check for documents in ingresos_documentos table
                          const docs = allIngresoDocuments?.filter(d => d.ingreso_id === ingreso._id) || [];
                          if (docs.length > 0) {
                            return (
                              <div className="flex gap-1">
                                {docs.map((doc) => (
                                  <Button
                                    key={doc._id}
                                    variant="ghost"
                                    size="lg"
                                    onClick={() => doc.url && window.open(doc.url, '_blank')}
                                    className="p-1 h-auto hover:bg-slate-300"
                                    title={doc.nombre}
                                  >
                                    <FileText className="h-4 w-4 text-gray-600" />
                                    {doc.nombre}
                                  </Button>
                                ))}
                              </div>
                            );
                          }
                          // Fallback to legacy documento_adjunto field
                          if (ingreso.documento_adjunto) {
                            return (
                              <a
                                href={ingreso.documento_adjunto}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <FileText className="h-4 w-4" />
                              </a>
                            );
                          }
                          return <span className="text-gray-300">-</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(ingreso)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {ingreso.documento_adjunto && (
                              <DropdownMenuItem
                                onClick={() => window.open(ingreso.documento_adjunto, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Ver documento
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDelete(ingreso._id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <FileText className="h-12 w-12 mb-4 text-gray-300" />
                <p>No hay ingresos registrados</p>
                <Button
                  variant="outline"
                  onClick={handleAddNew}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Agregar primer ingreso
                </Button>
              </div>
            )}
          </div>
          }
          
        </div>
      </DialogContent>
    </Dialog>
  );
}
