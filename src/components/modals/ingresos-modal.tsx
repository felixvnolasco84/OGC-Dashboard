import { useEffect, useMemo, useState } from "react";

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
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
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

// Endpoint of the external Excel reader service (same service used for transactions)
const INGRESOS_EXCEL_API = "https://ogc-excel-reader.vercel.app/upload/ingresos";

// A single ingreso row parsed from the Excel file plus its client-side validation result
type BulkIngresoRow = {
  monto: number;
  fecha: string;
  descripcion: string;
  moneda: string;
  rowIndex?: number;
  status: "valid" | "invalid";
  errors: string[];
};

// Shape of the response returned by the external Excel reader service
type IngresosExcelResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  summary?: {
    totalRows: number;
    validRows: number;
    errors: number;
    totalAmount: number;
  };
  ingresos?: Array<{
    monto?: number;
    fecha?: string;
    descripcion?: string;
    moneda?: string;
    rowIndex?: number;
  }>;
};

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

const ALLOWED_MONEDAS = ["MXN", "USD", "EUR"];
const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
const LOOSE_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

// Normalize a date string to padded DD/MM/YYYY when possible; returns null if unrecognized
const normalizeBulkDate = (raw: string): string | null => {
  const trimmed = raw.trim();
  const match = trimmed.match(LOOSE_DATE_REGEX);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3];
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  return `${day}/${month}/${year}`;
};

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
  const [bulkFile, setBulkFile] = useState<globalThis.File | null>(null);
  const [isValidatingBulk, setIsValidatingBulk] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkIngresoRow[] | null>(null);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);

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
  const bulkCreateIngresos = useMutation(api.ingresos.bulkCreate);
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

  const resetDocumentForm = () => {
    setDocumentFile(null);
    setDocumentType("");
    setDocumentName("");
    setDocumentDescription("");
  };

  const resetBulkUpload = () => {
    setShowBulkUpload(false);
    setBulkFile(null);
    setBulkRows(null);
    setBulkResult(null);
    setIsValidatingBulk(false);
    setIsProcessingBulk(false);
  };

  // Step 1: send the selected file to the external Excel reader and validate the rows
  const handleValidateBulk = async () => {
    if (!context || !bulkFile) return;

    setIsValidatingBulk(true);
    setBulkRows(null);
    setBulkResult(null);

    try {
      const formData = new FormData();
      formData.append("file", bulkFile);
      formData.append("proyecto_id", context.projectId);

      const response = await fetch(INGRESOS_EXCEL_API, {
        method: "POST",
        body: formData,
      });

      let data: IngresosExcelResponse;
      try {
        data = await response.json();
      } catch {
        throw new Error("Respuesta inválida del servicio de lectura de Excel.");
      }

      if (!response.ok || data.success === false) {
        toast.error("Error al procesar el archivo", {
          description: data.message || data.error || "No se pudieron leer los ingresos.",
        });
        setIsValidatingBulk(false);
        return;
      }

      const parsed = Array.isArray(data.ingresos) ? data.ingresos : [];

      if (parsed.length === 0) {
        toast.warning("Sin ingresos", {
          description: "No se encontraron filas válidas en el archivo.",
        });
        setBulkRows([]);
        setIsValidatingBulk(false);
        return;
      }

      // Client-side validation on top of the server parsing
      const rows: BulkIngresoRow[] = parsed.map((item) => {
        const errors: string[] = [];

        const monto = typeof item.monto === "number" ? item.monto : Number(item.monto);
        if (!Number.isFinite(monto) || monto <= 0) {
          errors.push("Monto inválido");
        }

        const rawFecha = (item.fecha || "").trim();
        let fecha = rawFecha;
        if (!rawFecha) {
          errors.push("Fecha faltante");
        } else {
          const normalized = normalizeBulkDate(rawFecha);
          if (!normalized || !DATE_REGEX.test(normalized)) {
            errors.push("Fecha con formato inválido (DD/MM/YYYY)");
          } else {
            fecha = normalized;
          }
        }

        let moneda = (item.moneda || "MXN").trim().toUpperCase();
        if (!ALLOWED_MONEDAS.includes(moneda)) {
          moneda = "MXN";
        }

        return {
          monto: Number.isFinite(monto) ? monto : 0,
          fecha,
          descripcion: (item.descripcion || "").trim(),
          moneda,
          rowIndex: item.rowIndex,
          status: errors.length === 0 ? "valid" : "invalid",
          errors,
        };
      });

      setBulkRows(rows);

      const validCount = rows.filter((r) => r.status === "valid").length;
      const invalidCount = rows.length - validCount;

      if (invalidCount > 0) {
        toast.warning("Validación con advertencias", {
          description: `${validCount} válidos, ${invalidCount} con errores.`,
        });
      } else {
        toast.success("Validación exitosa", {
          description: `${validCount} ingresos listos para cargar.`,
        });
      }
    } catch (error) {
      console.error("Error validating ingresos file:", error);
      toast.error("Error al validar el archivo", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setIsValidatingBulk(false);
    }
  };

  // Step 2: confirm and bulk-insert all valid rows
  const handleConfirmBulk = async () => {
    if (!context || !user || !bulkRows) return;

    const validRows = bulkRows.filter((r) => r.status === "valid");
    if (validRows.length === 0) {
      toast.error("No hay ingresos válidos para cargar.");
      return;
    }

    setIsProcessingBulk(true);
    try {
      const result = await bulkCreateIngresos({
        proyecto: context.projectId,
        clerk_id: user.id,
        ingresos: validRows.map((r) => ({
          monto: r.monto,
          fecha: r.fecha,
          descripcion: r.descripcion || undefined,
          moneda: r.moneda,
        })),
      });

      const skipped = validRows.length - result.created;
      setBulkResult({ created: result.created, skipped });

      toast.success("Carga masiva completada", {
        description: `${result.created} ingreso(s) creado(s)${skipped > 0 ? `, ${skipped} omitido(s)` : ""}.`,
      });
    } catch (error) {
      console.error("Error bulk creating ingresos:", error);
      toast.error("Error al cargar ingresos", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkFileSelect = (file: globalThis.File | undefined) => {
    if (!file) return;
    setBulkFile(file);
    setBulkRows(null);
    setBulkResult(null);
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
    if (!context || !user) return;

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

  const handleDelete = async (row: IncomeTableRow) => {
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
        className="max-h-[90vh] max-w-4xl gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle className="text-lg font-medium">Ingresos</DialogTitle>
          <DialogDescription>
            {context?.projectName || "Registro de ingresos del proyecto"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-81px)] overflow-y-auto">
          {showForm && (
            <div>
              <div className="flex items-start justify-between border-b border-border px-6 py-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {isEditingAnyIngreso ? "Editar ingreso" : "Nuevo ingreso"}
                  </h3>
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    {isEditingOgc
                      ? "Este registro proviene de un movimiento OGC."
                      : "Completa los datos del ingreso."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={handleCancelForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="monto" className="text-xs text-subtle-foreground">
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
                    <Label htmlFor="moneda" className="text-xs text-subtle-foreground">
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
                    <Label htmlFor="fecha" className="text-xs text-subtle-foreground">
                      Fecha
                    </Label>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={false}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start px-3 text-left font-normal",
                            !formData.fecha && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                          {formData.fecha || "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent data-square-modal="" className="w-auto p-0 z-[9999] pointer-events-auto" align="start" sideOffset={4}>
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

                <div className="space-y-1.5">
                  <Label htmlFor="descripcion" className="text-xs text-subtle-foreground">
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
                    <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-subtle-foreground">
                      Documento adjunto
                    </h3>

                    {editingIngreso && editingIngresoDocuments && editingIngresoDocuments.length > 0 ? (
                      <div className="space-y-1.5">
                        {(() => {
                          const doc = editingIngresoDocuments[0];
                          return (
                            <div className="flex items-center justify-between gap-3 border border-border bg-muted/40 px-3 py-2.5">
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-foreground"
                                onClick={() => doc.url && window.open(doc.url, "_blank")}
                              >
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{doc.nombre}</p>
                                  <p className="text-xs text-subtle-foreground">{doc.type}</p>
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-disabled-foreground" />
                              </button>
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
                                  size="sm"
                                  className="h-8 w-8 p-0"
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
                                              <span className="text-xs text-subtle-foreground">
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
                                              clerk_id: user.id,
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
                                      size="sm"
                                      className="h-8 w-8 p-0"
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
                        <div className="space-y-1.5">
                          <Label className="text-xs text-subtle-foreground">Tipo de documento</Label>
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
                              <Label className="text-xs text-subtle-foreground">Archivo</Label>
                              {documentFile ? (
                                <div className="flex items-center justify-between gap-3 border border-border bg-muted/40 px-3 py-2.5">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{documentFile.name}</p>
                                      <p className="text-xs text-subtle-foreground">
                                        {(documentFile.size / 1024).toFixed(2)} KB
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0 text-muted-foreground"
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
                              <Label className="text-xs text-subtle-foreground">
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
            <section className="grid grid-cols-2 divide-x divide-border border-b border-border bg-muted/40">
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Total ingresos</p>
                <p className="mt-1 text-lg font-medium tabular-nums tracking-tight">
                  {formatCurrency(totalIngresos, "MXN")}
                </p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Entradas</p>
                <p className="mt-1 text-lg font-medium tabular-nums">{totalIngresosCount}</p>
              </div>
            </section>
          )}

          {!showForm && !showBulkUpload && (
            <div className="flex items-center justify-end gap-1 border-b border-border px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetBulkUpload();
                  setShowBulkUpload(true);
                }}
                className="gap-2 text-muted-foreground"
                title="Carga masiva desde Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Carga masiva
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAddNew}
                className="gap-2 text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                Nuevo
              </Button>
            </div>
          )}

          {!showForm && showBulkUpload && (
            <div>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={resetBulkUpload}
                    title="Volver"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h3 className="text-sm font-medium">Carga masiva</h3>
                    <p className="text-xs text-subtle-foreground">Importar ingresos desde Excel</p>
                  </div>
                </div>
              </div>

              {bulkResult ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <CheckCircle2 className="h-7 w-7 text-green-500" />
                  <p className="mt-3 text-sm font-medium text-foreground">Carga completada</p>
                  <p className="mt-1 text-sm text-subtle-foreground">
                    {bulkResult.created} ingreso(s) creado(s)
                    {bulkResult.skipped > 0 && `, ${bulkResult.skipped} omitido(s)`}.
                  </p>
                  <div className="mt-5 flex gap-2">
                    <Button variant="outline" onClick={resetBulkUpload}>
                      Cerrar
                    </Button>
                    <Button
                      onClick={() => {
                        setBulkFile(null);
                        setBulkRows(null);
                        setBulkResult(null);
                      }}
                    >
                      Cargar otro archivo
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 px-6 py-5">
                  <div className="border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Formato del Excel</p>
                    <p className="mt-1">
                      Primera fila con encabezados, en este orden:{" "}
                      <span className="font-medium text-foreground">MONTO</span>,{" "}
                      <span className="font-medium text-foreground">FECHA</span> (DD/MM/YYYY),{" "}
                      <span className="font-medium text-foreground">DESCRIPCION</span>,{" "}
                      <span className="font-medium text-foreground">MONEDA</span> (MXN/USD/EUR).
                    </p>
                  </div>

                  {bulkFile ? (
                    <div className="flex items-center justify-between gap-3 border border-border bg-muted/40 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{bulkFile.name}</p>
                          <p className="text-xs text-subtle-foreground">
                            {(bulkFile.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground"
                        disabled={isValidatingBulk || isProcessingBulk}
                        onClick={() => {
                          setBulkFile(null);
                          setBulkRows(null);
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 border border-dashed border-border px-3 py-8 text-center hover:bg-muted/30">
                      <Upload className="h-5 w-5 text-disabled-foreground" />
                      <p className="text-sm text-muted-foreground">Seleccionar archivo Excel</p>
                      <p className="text-xs text-subtle-foreground">.xlsx, .xls o .xlsm</p>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.xlsm"
                        className="sr-only"
                        onChange={(e) => {
                          handleBulkFileSelect(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}

                  {bulkFile && !bulkRows && (
                    <div className="flex justify-end">
                      <Button onClick={handleValidateBulk} disabled={isValidatingBulk}>
                        {isValidatingBulk ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Validando...
                          </>
                        ) : (
                          "Validar archivo"
                        )}
                      </Button>
                    </div>
                  )}

                  {bulkRows && (
                    <div className="space-y-3">
                      {(() => {
                        const validCount = bulkRows.filter((r) => r.status === "valid").length;
                        const invalidCount = bulkRows.length - validCount;
                        return (
                          <div className="flex flex-wrap items-center gap-3 text-xs text-subtle-foreground">
                            <span>{bulkRows.length} filas</span>
                            <span>{validCount} válidas</span>
                            {invalidCount > 0 && (
                              <span className="text-muted-foreground">{invalidCount} con errores</span>
                            )}
                          </div>
                        );
                      })()}

                      {bulkRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <AlertCircle className="h-7 w-7 text-disabled-foreground" />
                          <p className="mt-3 text-sm font-medium text-foreground">Sin filas</p>
                          <p className="mt-1 text-sm text-subtle-foreground">
                            No se encontraron filas para cargar.
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-[320px] overflow-auto border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                                <TableHead className="h-10 w-[52px] px-3 text-xs font-medium text-subtle-foreground">#</TableHead>
                                <TableHead className="h-10 w-[110px] px-3 text-xs font-medium text-subtle-foreground">Fecha</TableHead>
                                <TableHead className="h-10 px-3 text-xs font-medium text-subtle-foreground">Descripción</TableHead>
                                <TableHead className="h-10 w-[140px] px-3 text-right text-xs font-medium text-subtle-foreground">Monto</TableHead>
                                <TableHead className="h-10 w-[72px] px-3 text-xs font-medium text-subtle-foreground">Moneda</TableHead>
                                <TableHead className="h-10 w-[180px] px-3 text-xs font-medium text-subtle-foreground">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {bulkRows.map((row, idx) => (
                                <TableRow
                                  key={idx}
                                  className={cn(
                                    "border-b border-border hover:bg-muted/30",
                                    row.status === "invalid" && "bg-red-50"
                                  )}
                                >
                                  <TableCell className="px-3 py-2.5 text-xs tabular-nums text-subtle-foreground">
                                    {row.rowIndex ?? idx + 1}
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 text-sm font-medium">{row.fecha || "—"}</TableCell>
                                  <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">
                                    {row.descripcion || "—"}
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 text-right text-sm font-medium tabular-nums">
                                    {formatCurrency(row.monto, row.moneda)}
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">{row.moneda}</TableCell>
                                  <TableCell className="px-3 py-2.5">
                                    {row.status === "valid" ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs text-green-600">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Válido
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1.5 text-xs text-red-600"
                                        title={row.errors.join(", ")}
                                      >
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        {row.errors.join(", ")}
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={resetBulkUpload} disabled={isProcessingBulk}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleConfirmBulk}
                          disabled={
                            isProcessingBulk ||
                            bulkRows.filter((r) => r.status === "valid").length === 0
                          }
                        >
                          {isProcessingBulk ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Cargando...
                            </>
                          ) : (
                            `Cargar ${bulkRows.filter((r) => r.status === "valid").length} ingreso(s)`
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!showForm && !showBulkUpload && (
            <div>
              {isLoadingList ? (
                <div className="flex min-h-64 items-center justify-center" aria-label="Cargando ingresos">
                  <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
                </div>
              ) : tableRows.length > 0 ? (
                <div className="overflow-x-auto px-6 py-5">
                  <div className="min-w-[720px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                          <TableHead className="h-10 w-[110px] px-3 text-xs font-medium text-subtle-foreground">Fecha</TableHead>
                          <TableHead className="h-10 w-[90px] px-3 text-xs font-medium text-subtle-foreground">Origen</TableHead>
                          <TableHead className="h-10 px-3 text-xs font-medium text-subtle-foreground">Descripción</TableHead>
                          <TableHead className="h-10 px-3 text-right text-xs font-medium text-subtle-foreground">Monto</TableHead>
                          <TableHead className="h-10 w-[120px] px-3 text-xs font-medium text-subtle-foreground">Agregado por</TableHead>
                          <TableHead className="h-10 w-[56px] px-3 text-xs font-medium text-subtle-foreground">Doc</TableHead>
                          <TableHead className="h-10 w-[44px] px-3" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableRows.map((row) => (
                          <TableRow key={`${row.source}-${row.id}`} className="border-b border-border hover:bg-muted/30">
                            <TableCell className="px-3 py-3 text-sm font-medium tabular-nums">
                              {row.fecha}
                            </TableCell>
                            <TableCell className="px-3 py-3">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "border text-[10px] font-normal",
                                  row.source === "ogc"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-border bg-muted text-muted-foreground"
                                )}
                              >
                                {row.source === "ogc" ? "OGC" : "Ingresos"}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate px-3 py-3 text-sm text-muted-foreground">
                              {row.descripcion || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums">
                              {formatCurrency(row.monto, row.moneda)}
                            </TableCell>
                            <TableCell className="px-3 py-3 text-sm text-subtle-foreground">
                              {row.addedBy || "—"}
                            </TableCell>
                            <TableCell className="px-3 py-3">
                              {(() => {
                                if (row.source === "ogc") {
                                  const documents = row.ogcMovement.nota_recepcion_documentos || [];
                                  if (documents.length > 0) {
                                    return (
                                      <span className="text-xs tabular-nums text-muted-foreground">
                                        {documents.length}
                                      </span>
                                    );
                                  }
                                  return <span className="text-disabled-foreground">—</span>;
                                }

                                const ingreso = row.ingreso;
                                const docs = allIngresoDocuments?.filter((d) => d.ingreso_id === ingreso._id) || [];
                                if (docs.length > 0) {
                                  const doc = docs[0];
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => doc.url && window.open(doc.url, "_blank")}
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
                            <TableCell className="px-3 py-3">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
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
                                    className="text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {row.source === "ogc" ? "Anular" : "Eliminar"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                  <p className="mt-1 max-w-sm text-sm text-subtle-foreground">
                    Agrega un ingreso o carga un archivo Excel para comenzar.
                  </p>
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
