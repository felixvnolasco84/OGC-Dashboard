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

  // Calculate "Neto" (Total Ingresos - Gasto Total from metrics)
  // For now, just showing total ingresos since gasto_total comes from a different query
  const totalIngresos = (totals?.total_ingresos || 0) + (ogcTotals?.total_ingresos || 0);
  const totalIngresosCount = (totals?.total_count || 0) + (ogcTotals?.total_count || 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-square-modal="" className="max-w-4xl max-h-[85vh] overflow-y-scroll flex flex-col">
        <DialogHeader className="border-b pb-4 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-medium">
                Ingresos
              </DialogTitle>
              <p className="text-sm text-subtle-foreground mt-1">
                {context?.projectName}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-subtle-foreground">Total Ingresos</p>
                <p className="text-2xl font-medium">
                  {formatCurrency(totalIngresos, "MXN")}
                </p>
                <Badge variant="secondary" className="mt-1 text-muted-foreground">
                  {totalIngresosCount} entradas
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
                  {isEditingAnyIngreso ? "Editar Ingreso" : "Nuevo Ingreso"}
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
                      disabled={isEditingOgc}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Seleccionar moneda" />
                      </SelectTrigger>
                      <SelectContent data-square-modal="">
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
                {!isEditingOgc && <div className="space-y-3 pt-4 border-t">
                  <h3 className="text-sm font-medium text-foreground">Documento adjunto</h3>

                  {/* Show existing document when editing (1:1 relationship) */}
                  {editingIngreso && editingIngresoDocuments && editingIngresoDocuments.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm text-foreground">Documento actual</Label>
                      {(() => {
                        const doc = editingIngresoDocuments[0];
                        return (
                          <div className="flex items-center justify-between gap-2 p-3 border border-border">
                            <div 
                              className="flex items-center gap-2 cursor-pointer hover:text-blue-600 flex-1"
                              onClick={() => doc.url && window.open(doc.url, '_blank')}
                            >
                              <FileText className="w-5 h-5 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">{doc.nombre}</p>
                                <p className="text-xs text-subtle-foreground">{doc.type}</p>
                              </div>
                              <ExternalLink className="w-4 h-4 text-disabled-foreground" />
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
                                <AlertDialogContent data-square-modal="">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Reemplazar documento?</AlertDialogTitle>
                                    <AlertDialogDescription asChild>
                                      <div className="space-y-2">
                                        <p>Se reemplazará el documento actual por:</p>
                                        {replaceFile && (
                                          <div className="flex items-center gap-2 p-2 bg-muted rounded-none">
                                            <File className="w-4 h-4 text-muted-foreground" />
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
                      <div className="space-y-2">
                        <Label className="text-sm text-foreground">Tipo de documento</Label>
                        <Select value={documentType} onValueChange={setDocumentType}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Seleccionar tipo de documento" />
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
                          <div className="space-y-2">
                            <Label className="text-sm text-foreground">Archivo</Label>
                            <div className="border-2 border-dashed p-4 text-center">
                              {documentFile ? (
                                <div className="space-y-2">
                                  <File className="h-8 w-8 mx-auto text-green-600" />
                                  <p className="text-sm font-medium">{documentFile.name}</p>
                                  <p className="text-xs text-subtle-foreground">
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
                                  <Upload className="h-8 w-8 mx-auto text-disabled-foreground" />
                                  <p className="text-sm text-muted-foreground">Arrastra un archivo o haz clic</p>
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
                            <Label className="text-sm text-foreground">Descripción del documento (opcional)</Label>
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
                </div>}

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

          {/* Action Bar */}
          {!showForm && !showBulkUpload && (
            <div className="flex justify-end gap-1 items-center">
              <Button
                variant={"ghost"}
                onClick={() => {
                  resetBulkUpload();
                  setShowBulkUpload(true);
                }}
                className="gap-2"
                title="Carga masiva desde Excel"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Carga masiva
              </Button>
              <Button size={"icon"} variant={"ghost"} onClick={handleAddNew}>
                <Plus className="h-4 w-4" />                
              </Button>
            </div>
          )}

          {/* Bulk Excel Upload Panel */}
          {!showForm && showBulkUpload && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={resetBulkUpload}
                    title="Volver"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="font-medium">Carga masiva de ingresos</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={resetBulkUpload}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Result view */}
              {bulkResult ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="text-lg font-medium">Carga completada</p>
                  <p className="text-sm text-muted-foreground">
                    {bulkResult.created} ingreso(s) creado(s)
                    {bulkResult.skipped > 0 && `, ${bulkResult.skipped} omitido(s)`}.
                  </p>
                  <div className="flex gap-2 pt-2">
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
                <>
                  {/* Format hint */}
                  <div className="rounded-none bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                    <p className="font-medium mb-1">Formato esperado del Excel</p>
                    <p>
                      Primera fila con encabezados y columnas en este orden:{" "}
                      <span className="font-mono">MONTO</span>,{" "}
                      <span className="font-mono">FECHA (DD/MM/YYYY)</span>,{" "}
                      <span className="font-mono">DESCRIPCION</span>,{" "}
                      <span className="font-mono">MONEDA</span> (MXN/USD/EUR).
                    </p>
                  </div>

                  {/* File picker */}
                  <div className="border-2 border-dashed p-4 text-center">
                    {bulkFile ? (
                      <div className="space-y-2">
                        <File className="h-8 w-8 mx-auto text-green-600" />
                        <p className="text-sm font-medium">{bulkFile.name}</p>
                        <p className="text-xs text-subtle-foreground">
                          {(bulkFile.size / 1024).toFixed(2)} KB
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isValidatingBulk || isProcessingBulk}
                          onClick={() => {
                            setBulkFile(null);
                            setBulkRows(null);
                          }}
                        >
                          Cambiar archivo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-disabled-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Selecciona un archivo Excel (.xlsx, .xls)
                        </p>
                        <Input
                          type="file"
                          accept=".xlsx,.xls,.xlsm"
                          className="max-w-xs mx-auto"
                          onChange={(e) => {
                            handleBulkFileSelect(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Validate button */}
                  {bulkFile && !bulkRows && (
                    <div className="flex justify-end">
                      <Button onClick={handleValidateBulk} disabled={isValidatingBulk}>
                        {isValidatingBulk ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Validando...
                          </>
                        ) : (
                          "Validar archivo"
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Preview table */}
                  {bulkRows && (
                    <div className="space-y-3">
                      {(() => {
                        const validCount = bulkRows.filter((r) => r.status === "valid").length;
                        const invalidCount = bulkRows.length - validCount;
                        return (
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="secondary">{bulkRows.length} filas</Badge>
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                              {validCount} válidas
                            </Badge>
                            {invalidCount > 0 && (
                              <Badge variant="destructive">{invalidCount} con errores</Badge>
                            )}
                          </div>
                        );
                      })()}

                      {bulkRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-subtle-foreground">
                          <AlertCircle className="h-8 w-8 mb-2 text-disabled-foreground" />
                          <p className="text-sm">No se encontraron filas para cargar.</p>
                        </div>
                      ) : (
                        <div className="max-h-[320px] overflow-auto border rounded-none">
                          <Table>
                            <TableHeader className="sticky top-0 bg-card">
                              <TableRow>
                                <TableHead className="w-[60px]">#</TableHead>
                                <TableHead className="w-[110px]">Fecha</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-right w-[140px]">Monto</TableHead>
                                <TableHead className="w-[80px]">Moneda</TableHead>
                                <TableHead className="w-[160px]">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {bulkRows.map((row, idx) => (
                                <TableRow
                                  key={idx}
                                  className={cn(row.status === "invalid" && "bg-red-50")}
                                >
                                  <TableCell className="text-xs text-subtle-foreground">
                                    {row.rowIndex ?? idx + 1}
                                  </TableCell>
                                  <TableCell className="font-medium">{row.fecha || "-"}</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {row.descripcion || "-"}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(row.monto, row.moneda)}
                                  </TableCell>
                                  <TableCell>{row.moneda}</TableCell>
                                  <TableCell>
                                    {row.status === "valid" ? (
                                      <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Válido
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 text-red-600 text-xs"
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
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Cargando...
                            </>
                          ) : (
                            `Cargar ${bulkRows.filter((r) => r.status === "valid").length} ingreso(s)`
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Table */}
          {
            !showForm && !showBulkUpload && <div className="flex-1 overflow-auto">
            {tableRows.length > 0  ? (
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-[120px]">Fecha</TableHead>
                    <TableHead className="w-[90px]">Origen</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-[100px]">Agregado por</TableHead>
                    <TableHead className="w-[80px]">Doc</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow key={`${row.source}-${row.id}`}>
                      <TableCell className="font-medium">
                        {row.fecha}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-normal",
                            row.source === "ogc"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {row.source === "ogc" ? "OGC" : "Ingresos"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.descripcion || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.monto, row.moneda)}
                      </TableCell>
                      <TableCell className="text-sm text-subtle-foreground">
                        {row.addedBy || "-"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (row.source === "ogc") {
                            const documents = row.ogcMovement.nota_recepcion_documentos || [];
                            if (documents.length > 0) {
                              return (
                                <Badge variant="secondary" className="text-[10px] font-normal">
                                  {documents.length} doc{documents.length === 1 ? "" : "s"}
                                </Badge>
                              );
                            }
                            return <span className="text-disabled-foreground">-</span>;
                          }

                          const ingreso = row.ingreso;
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
                                    className="p-1 h-auto hover:bg-disabled"
                                    title={doc.nombre}
                                  >
                                    <FileText className="h-4 w-4 text-muted-foreground" />
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
                          return <span className="text-disabled-foreground">-</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent data-square-modal="" align="end">
                            <DropdownMenuItem onClick={() => handleEdit(row)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {row.source === "ingresos" && row.ingreso.documento_adjunto && (
                              <DropdownMenuItem
                                onClick={() => window.open(row.ingreso.documento_adjunto, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Ver documento
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDelete(row)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {row.source === "ogc" ? "Anular" : "Eliminar"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-subtle-foreground">
                <FileText className="h-12 w-12 mb-4 text-disabled-foreground" />
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
