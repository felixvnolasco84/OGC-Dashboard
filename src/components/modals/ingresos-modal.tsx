import { useEffect, useMemo, useState } from "react";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { hasIncomeManagementAccess } from "../../../convex/ingresoRules";
import { useIngresosModal } from "@/hooks/ingresos-modal";
import { OgcInvoiceEvidenceDialog } from "@/components/modals/ogc-invoice-evidence-dialog";
import { IncomeBulkUpload } from "@/components/ingresos/IncomeBulkUpload";
import { IncomeImportHistoryDialog, IngresoSourceDialog } from "@/components/ingresos/IncomeImportHistory";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  FileSpreadsheet,
} from "lucide-react";
import { Calendar } from "../ui/calendar";
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
import { es } from "date-fns/locale";

type OgcIncomeMovement = Doc<"ogc_movimientos"> & {
  tipo: "ingreso";
};

type IncomeTableRow =
  | {
      source: "ingresos";
      id: Id<"ingresos">;
      fecha: string;
      descripcion?: string;
      monto: number;
      moneda: string;
      addedBy?: string;
      createdAt?: number;
      ingreso: Doc<"ingresos">;
    }
  | {
      source: "ogc";
      id: Id<"ogc_movimientos">;
      fecha: string;
      descripcion?: string;
      monto: number;
      moneda: string;
      addedBy?: string;
      createdAt?: number;
      ogcMovement: OgcIncomeMovement;
    };

export default function IngresosModal() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const canManageIngresos = hasIncomeManagementAccess(currentUser);
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
  const [editingOgcMovement, setEditingOgcMovement] = useState<OgcIncomeMovement | null>(null);

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

  // Bulk Excel upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  // Queries
  const ingresos = useQuery(
    api.ingresos.getByProyecto,
    context ? { proyecto_id: context.projectId } : "skip"
  );

  const ogcIngresos = useQuery(
    api.ogc_movimientos.getIncomeByProyecto,
    context ? { proyecto_id: context.projectId } : "skip"
  ) as OgcIncomeMovement[] | undefined;

  const totals = useQuery(
    api.ingresos.getTotalsByProyecto,
    context ? { proyecto_id: context.projectId } : "skip"
  );

  const ogcTotals = useQuery(
    api.ogc_movimientos.getIncomeTotalsByProyecto,
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
  const updateOgcMovement = useMutation(api.ogc_movimientos.update);
  const voidOgcMovement = useMutation(api.ogc_movimientos.voidMovement);
  const generateUploadUrl = useMutation(api.ingresos_documentos.generateUploadUrl);
  const createIngresoDocument = useMutation(api.ingresos_documentos.create);
  const deleteIngresoDocuments = useMutation(api.ingresos_documentos.removeByIngreso);
  const deleteIngresoDocument = useMutation(api.ingresos_documentos.remove);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowForm(false);
      setEditingOgcMovement(null);
      resetForm();
      resetDocumentForm();
      resetBulkUpload();
    }
  }, [isOpen, resetForm]);

  useEffect(() => {
    if (!canManageIngresos) {
      setShowForm(false);
      setShowBulkUpload(false);
      setEditingOgcMovement(null);
      cancelEditing();
    }
  }, [canManageIngresos, cancelEditing]);

  const resetDocumentForm = () => {
    setDocumentFile(null);
    setDocumentType("");
    setDocumentName("");
    setDocumentDescription("");
  };

  const resetBulkUpload = () => setShowBulkUpload(false);

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

  const tableRows = useMemo<IncomeTableRow[]>(() => {
    const ingresoRows: IncomeTableRow[] = (ingresos || []).map((ingreso) => ({
      source: "ingresos",
      id: ingreso._id,
      fecha: ingreso.fecha,
      descripcion: ingreso.descripcion,
      monto: ingreso.monto,
      moneda: ingreso.moneda,
      addedBy: ingreso.added_by_name,
      createdAt: ingreso.created_at,
      ingreso,
    }));

    const ogcRows: IncomeTableRow[] = (ogcIngresos || []).map((movement) => ({
      source: "ogc",
      id: movement._id,
      fecha: movement.fecha,
      descripcion: movement.descripcion,
      monto: movement.monto,
      moneda: movement.moneda,
      addedBy: movement.created_by_name,
      createdAt: movement.created_at,
      ogcMovement: movement,
    }));

    return [...ingresoRows, ...ogcRows].sort((a, b) => {
      const dateA = parseDate(a.fecha)?.getTime() || a.createdAt || 0;
      const dateB = parseDate(b.fecha)?.getTime() || b.createdAt || 0;
      return dateB - dateA;
    });
  }, [ingresos, ogcIngresos]);

  const isEditingOgc = Boolean(editingOgcMovement);
  const isEditingAnyIngreso = Boolean(editingIngreso || editingOgcMovement);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageIngresos || !context) return;

    setIsSubmitting(true);
    try {
      if (editingOgcMovement) {
        await updateOgcMovement({
          id: editingOgcMovement._id,
          patch: {
            tipo: "ingreso",
            categoria: editingOgcMovement.categoria || "OTROS",
            monto: formData.monto,
            fecha: formData.fecha,
            descripcion: formData.descripcion || undefined,
            moneda: formData.moneda,
            tipo_cambio: editingOgcMovement.tipo_cambio,
            proyecto: context.projectId,
          },
          reason: "Actualizado desde ingresos de presupuesto",
        });

        toast.success("Ingreso OGC actualizado", {
          description: "Se actualizó el movimiento en la tabla OGC.",
        });

        setEditingOgcMovement(null);
        resetForm();
        resetDocumentForm();
        setShowForm(false);
        return;
      }

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

  const handleDelete = async (row: IncomeTableRow) => {
    if (!canManageIngresos) return;
    if (row.source === "ogc") {
      const reason = window.prompt("Motivo para anular este ingreso OGC:", "Eliminado desde presupuesto");
      if (!reason?.trim()) return;

      try {
        await voidOgcMovement({ id: row.id, reason });
        toast.success("Ingreso OGC anulado");
      } catch (error) {
        console.error("Error voiding OGC ingreso:", error);
        toast.error("Error al anular ingreso OGC", {
          description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        });
      }
      return;
    }

    if (!confirm("¿Estás seguro de eliminar este ingreso y sus documentos?")) return;

    try {
      // Delete associated documents first
      await deleteIngresoDocuments({ ingreso_id: row.id });
      // Then delete the ingreso
      await deleteIngreso({ id: row.id });
      toast.success("Ingreso eliminado");
    } catch (error) {
      console.error("Error deleting ingreso:", error);
      toast.error("Error al eliminar ingreso");
    }
  };

  const handleEdit = (row: IncomeTableRow) => {
    if (!canManageIngresos) return;
    resetDocumentForm();

    if (row.source === "ogc") {
      cancelEditing();
      setEditingOgcMovement(row.ogcMovement);
      setFormData({
        monto: row.ogcMovement.monto,
        fecha: row.ogcMovement.fecha,
        descripcion: row.ogcMovement.descripcion || "",
        moneda: row.ogcMovement.moneda || "MXN",
        documento_adjunto: "",
        documento_nombre: "",
      });
      setShowForm(true);
      return;
    }

    setEditingOgcMovement(null);
    startEditing(row.ingreso);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setEditingOgcMovement(null);
    cancelEditing();
    resetDocumentForm();
    setShowForm(false);
  };

  const handleAddNew = () => {
    if (!canManageIngresos) return;
    setEditingOgcMovement(null);
    resetForm();
    setShowForm(true);
  };

  const totalIngresos = (totals?.total_ingresos || 0) + (ogcTotals?.total_ingresos || 0);
  const totalIngresosCount = (totals?.total_count || 0) + (ogcTotals?.total_count || 0);
  const isLoadingList = ingresos === undefined || ogcIngresos === undefined;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-square-modal=""
        variant="ledger"
      >
        <DialogHeader variant="ledger">
          <DialogTitle variant="ledger">Ingresos</DialogTitle>
          <DialogDescription>
            {context?.projectName || "Registro de ingresos del proyecto"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-81px)] overflow-y-auto">
          {canManageIngresos && showForm && (
            <div>
              <div className="flex items-start justify-between border-b border-border px-6 py-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {isEditingAnyIngreso ? "Editar ingreso" : "Nuevo ingreso"}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isEditingOgc
                      ? "Este registro proviene de un movimiento OGC."
                      : "Completa los datos del ingreso."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="quiet"
                  size="iconSm"
                  onClick={handleCancelForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="monto" variant="caption">
                      Monto
                    </Label>
                    <Input
                      id="monto"
                      type="number"
                      step="0.01"
                      value={formData.monto || ""}
                      onChange={(e) => setFormData({ monto: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="moneda" variant="caption">
                      Moneda
                    </Label>
                    <Select
                      value={formData.moneda}
                      onValueChange={(value) => setFormData({ moneda: value })}
                      disabled={isEditingOgc}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar moneda" />
                      </SelectTrigger>
                      <SelectContent data-square-modal="">
                        <SelectItem value="MXN">MXN</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fecha" variant="caption">
                      Fecha
                    </Label>
                    <DropdownMenu open={calendarOpen} onOpenChange={setCalendarOpen} modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="date"
                          size="fullField"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                          {formData.fecha || "Seleccionar fecha"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent data-square-modal="" variant="calendarLayer" align="start" sideOffset={4}>
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="descripcion" variant="caption">
                    Descripción
                  </Label>
                  <Input
                    id="descripcion"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ descripcion: e.target.value })}
                    placeholder="Concepto o referencia del ingreso"
                  />
                </div>

                {!isEditingOgc && (
                  <div className="space-y-3 border-t border-border pt-5">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Documento adjunto
                    </h3>

                    {editingIngreso && editingIngresoDocuments && editingIngresoDocuments.length > 0 ? (
                      <div className="space-y-1.5">
                        {(() => {
                          const doc = editingIngresoDocuments[0];
                          return (
                            <div className="flex items-center justify-between gap-3 border border-border bg-muted/40 px-3 py-2.5">
                              <div className="min-w-0 flex-1"><Button
                                type="button"
                                variant="entry"
                                size="entry"
                                onClick={() => doc.url && window.open(doc.url, "_blank")}
                              >
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{doc.nombre}</p>
                                  <p className="text-xs text-muted-foreground">{doc.type}</p>
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-disabled-foreground" />
                              </Button></div>
                              <div className="flex shrink-0 gap-1">
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
                                  size="iconSm"
                                  title="Reemplazar documento"
                                  disabled={isReplacingDocument}
                                  onClick={() => {
                                    document.getElementById("replace-file-input")?.click();
                                  }}
                                >
                                  {isReplacingDocument ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <AlertDialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
                                  <AlertDialogContent data-square-modal="">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Reemplazar documento?</AlertDialogTitle>
                                      <AlertDialogDescription asChild>
                                        <div className="space-y-2">
                                          <p>Se reemplazará el documento actual por:</p>
                                          {replaceFile && (
                                            <div className="flex items-center gap-2 border border-border bg-muted px-2 py-2">
                                              <File className="h-4 w-4 text-muted-foreground" />
                                              <span className="text-sm font-medium">{replaceFile.name}</span>
                                              <span className="text-xs text-muted-foreground">
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
                                          if (!canManageIngresos || !replaceFile || !editingIngreso || !context) return;

                                          setIsReplacingDocument(true);
                                          try {
                                            const uploadUrl = await generateUploadUrl();
                                            const result = await fetch(uploadUrl, {
                                              method: "POST",
                                              headers: { "Content-Type": replaceFile.type },
                                              body: replaceFile,
                                            });
                                            const { storageId } = await result.json();

                                            await createIngresoDocument({
                                              ingreso_id: editingIngreso._id,
                                              proyecto: context.projectId,
                                              nombre: replaceFile.name,
                                              descripcion: doc.descripcion || "",
                                              storage_id: storageId,
                                              type: doc.type,
                                              size: replaceFile.size,
                                            });

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
                                      size="iconSm"
                                      title="Eliminar documento"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent data-square-modal="">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta acción no se puede deshacer. El documento será eliminado permanentemente.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        variant="destructive"
                                        onClick={async () => {
                                          if (!canManageIngresos) return;
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
                        <div className="space-y-1.5">
                          <Label variant="caption">Tipo de documento</Label>
                          <Select value={documentType} onValueChange={setDocumentType}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
                            <SelectContent data-square-modal="">
                              <SelectItem value="factura">Factura</SelectItem>
                              <SelectItem value="comprobante">Comprobante</SelectItem>
                              <SelectItem value="recibo">Recibo</SelectItem>
                              <SelectItem value="otro">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {documentType && (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label variant="caption">Archivo</Label>
                              {documentFile ? (
                                <div className="flex items-center justify-between gap-3 border border-border bg-muted/40 px-3 py-2.5">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{documentFile.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {(documentFile.size / 1024).toFixed(2)} KB
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="quiet"
                                    size="sm"
                                    onClick={() => setDocumentFile(null)}
                                  >
                                    Cambiar
                                  </Button>
                                </div>
                              ) : (
                                <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-border px-3 py-5 text-sm text-muted-foreground hover:bg-muted/30">
                                  <Upload className="h-4 w-4 text-disabled-foreground" />
                                  Seleccionar archivo
                                  <input
                                    type="file"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setDocumentFile(file);
                                        if (!documentName) {
                                          setDocumentName(file.name);
                                        }
                                      }
                                    }}
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xml"
                                  />
                                </label>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <Label variant="caption">
                                Descripción del documento
                              </Label>
                              <Input
                                placeholder="Opcional"
                                value={documentDescription}
                                onChange={(e) => setDocumentDescription(e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-4">
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isUploadingDocument ? "Subiendo documento..." : "Guardando..."}
                      </>
                    ) : isEditingAnyIngreso ? (
                      "Actualizar"
                    ) : (
                      "Agregar"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {!showForm && !showBulkUpload && (
            <section className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-border border-b border-border bg-muted/40">
              <div className="px-6 py-4">
                <p className="text-xs text-muted-foreground">Total ingresos</p>
                <p className="mt-1 text-lg font-medium tabular-nums tracking-tight">
                  {formatCurrency(totalIngresos, "MXN")}
                </p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs text-muted-foreground">Entradas</p>
                <p className="mt-1 text-lg font-medium tabular-nums">{totalIngresosCount}</p>
              </div>
            </section>
          )}

          {!showForm && !showBulkUpload && context && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-4 py-2">
              <IncomeImportHistoryDialog projectId={context.projectId} />
              {canManageIngresos && <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetBulkUpload();
                  setShowBulkUpload(true);
                }}

                title="Carga masiva desde Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Carga masiva
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddNew}
              >
                <Plus className="h-4 w-4" />
                Nuevo
              </Button>
              </>}
            </div>
          )}

          {canManageIngresos && !showForm && showBulkUpload && context && currentUser && (
            <IncomeBulkUpload key={context.projectId} projectId={context.projectId} userId={currentUser._id} onBack={resetBulkUpload} />
          )}

          {!showForm && !showBulkUpload && (
            <div>
              {isLoadingList ? (
                <div className="flex min-h-64 items-center justify-center" aria-label="Cargando ingresos">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : tableRows.length > 0 ? (
                <div className="overflow-x-auto px-6 py-5">
                  <div className="min-w-[720px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow variant="ledgerHeader">
                          <TableHead variant="ledger" className="w-[110px]">Fecha</TableHead>
                          <TableHead variant="ledger" className="w-[90px]">Origen</TableHead>
                          <TableHead variant="ledger">Descripción</TableHead>
                          <TableHead variant="ledger" className="text-right">Monto</TableHead>
                          <TableHead variant="ledger" className="w-[120px]">Agregado por</TableHead>
                          <TableHead variant="ledger" className="w-[56px]">Doc</TableHead>
                          <TableHead variant="ledger" className="w-[44px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableRows.map((row) => (
                          <TableRow key={`${row.source}-${row.id}`} variant="ledger">
                            <TableCell variant="ledgerEmphasis">
                              {row.fecha}
                            </TableCell>
                            <TableCell variant="ledger">
                              <Badge variant={row.source === "ogc" ? "sourceOgc" : "sourceIngreso"}>
                                {row.source === "ogc" ? "OGC" : "Ingresos"}
                              </Badge>
                            </TableCell>
                            <TableCell variant="ledgerTruncate" className="max-w-[240px]">
                              {row.descripcion || "—"}
                            </TableCell>
                            <TableCell variant="ledgerEmphasis" className="whitespace-nowrap text-right">
                              {formatCurrency(row.monto, row.moneda)}
                            </TableCell>
                            <TableCell variant="ledgerSubtle">
                              {row.addedBy || "—"}
                            </TableCell>
                            <TableCell variant="ledger">
                              {(() => {
                                if (row.source === "ogc") {
                                  const documents = row.ogcMovement.nota_recepcion_documentos || [];
                                  return (
                                    <div className="flex flex-col items-start gap-1">
                                      <OgcInvoiceEvidenceDialog movement={row.ogcMovement} compact />
                                      {documents.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{documents.length} nota{documents.length === 1 ? "" : "s"} de recepción</span>}
                                    </div>
                                  );
                                }

                                const ingreso = row.ingreso;
                                const docs = allIngresoDocuments?.filter((d) => d.ingreso_id === ingreso._id) || [];
                                if (docs.length > 0) {
                                  const doc = docs[0];
                                  return (
                                    <Button
                                      variant="quiet"
                                      size="iconXs"
                                      onClick={() => doc.url && window.open(doc.url, "_blank")}
                                      title={doc.nombre}
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  );
                                }
                                if (ingreso.documento_adjunto) {
                                  return (
                                    <a
                                      href={ingreso.documento_adjunto}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                                      title="Ver documento"
                                    >
                                      <FileText className="h-4 w-4" />
                                    </a>
                                  );
                                }
                                return <span className="text-disabled-foreground">—</span>;
                              })()}
                            </TableCell>
                            <TableCell variant="ledger">
                              {row.source === "ingresos" && <IngresoSourceDialog ingresoId={row.id} />}
                              {canManageIngresos && <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="quiet" size="iconXs">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent data-square-modal="" align="end">
                                  <DropdownMenuItem onClick={() => handleEdit(row)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  {row.source === "ingresos" && row.ingreso.documento_adjunto && (
                                    <DropdownMenuItem
                                      onClick={() => window.open(row.ingreso.documento_adjunto, "_blank")}
                                    >
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      Ver documento
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(row)}
                                    variant="destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {row.source === "ogc" ? "Anular" : "Eliminar"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <FileText className="h-7 w-7 text-disabled-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">No hay ingresos registrados</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {canManageIngresos
                      ? "Agrega un ingreso o carga un archivo Excel para comenzar."
                      : "Aquí aparecerán los ingresos registrados del proyecto."}
                  </p>
                  {canManageIngresos && <div className="mt-4"><Button variant="outline" onClick={handleAddNew}>
                    <Plus className="h-4 w-4" />Agregar primer ingreso
                  </Button></div>}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
