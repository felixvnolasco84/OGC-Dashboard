import { useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUploadSalesProjectTransactionsModal } from "@/hooks/upload-sales-project-transactions-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertTriangle, Download, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

type UploadResult = {
  success: boolean;
  message?: string;
  fileName?: string;
  sheetName?: string;
  summary?: {
    totalRows: number;
    validRows: number;
    errors: number;
    transactionsCreated: number;
    totalAmount: number;
  };
  transactions?: Array<{
    transaction: {
      sales_proyecto: string;
      monto_total: number;
      fecha: number;
      tipo_pago: string;
      moneda: string;
      tipo_cambio: string;
      status: string;
      categoria: string;
      factura: string;
    };
    lineitems: Array<{
      partida_identifier: {
        partida: string;
        familia: string;
        subpartida: string;
      };
      monto: number;
      administracion: string;
      codigo: string;
      tipo_documento: string;
      nombre_documento: string;
      descripcion_documento: string;
    }>;
    factura: string;
    itemCount: number;
  }>;
};

// Upload report types
interface TransactionReport {
  factura: string;
  status: "success" | "error" | "partial";
  monto: number;
  fecha: string;
  lineItemsTotal: number;
  lineItemsProcessed: number;
  errors: string[];
  partidasNotFound: string[];
}

interface UploadReport {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  partialTransactions: number;
  totalAmount: number;
  successfulAmount: number;
  totalPartidasNotFound: number;
  transactions: TransactionReport[];
}

// Validation report types (before upload)
interface ValidationReport {
  totalTransactions: number;
  validTransactions: number;
  invalidTransactions: number;
  partialTransactions: number;
  totalAmount: number;
  validAmount: number;
  totalPartidasNotFound: number;
  transactions: Array<{
    factura: string;
    status: "valid" | "invalid" | "partial";
    monto: number;
    fecha: string;
    lineItemsTotal: number;
    lineItemsValid: number;
    errors: string[];
    partidasNotFound: string[];
    // Store prepared data for upload
    preparedData?: {
      transaction: {
        sales_proyecto: string;
        monto_total: number;
        fecha: number;
        tipo_pago: string;
        moneda: string;
        tipo_cambio: string;
        status: string;
        categoria: string;
        factura: string;
      };
      lineItems: Array<{
        sales_partida_id: Id<"sales_partidas">;
        monto: number;
      }>;
      nombre_cliente: string;
      codigo_referencia: string;
    };
  }>;
}

type ModalStep = "upload" | "preview" | "result";

export default function UploadSalesProjectTransactionsModal() {
  const { isOpen, salesProyectoId, salesProyectoNombre, onClose } = useUploadSalesProjectTransactionsModal();
  const [file, setFile] = useState<File | null>(null);  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState<ModalStep>("upload");

  // Queries and mutations
  const createSalesTransaction = useMutation(api.sales_transacciones.createSalesTransaction);  
  const partidasForProject = useQuery(
    api.sales_partidas.getBySalesProject,
    salesProyectoId ? { salesProjectId: salesProyectoId } : "skip"
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        setResult(null);
      }
    }
  }, []);

  const validateFile = (file: File): boolean => {
    if (!file) return false;

    const validExtensions = [".xlsx", ".xls"];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));

    if (!validExtensions.includes(fileExtension)) {
      toast.error("Archivo inválido", {
        description: "Solo se permiten archivos Excel (.xlsx, .xls).",
      });
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Archivo demasiado grande", {
        description: "El archivo excede el tamaño máximo permitido (10MB).",
      });
      return false;
    }

    return true;
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      setResult(null);
    }
    e.target.value = "";
  };

  const handleRemoveFile = () => {
    setFile(null);
    setResult(null);
  };

  const handleBrowseClick = () => {
    document.getElementById("sales-project-transaction-file-upload")?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Helper function to convert Excel serial date to JavaScript Date
  const excelSerialToDate = (serial: number): string => {
    const date = new Date((serial - 25569) * 86400 * 1000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleExcelUpload = async (file: File) => {
    if (!salesProyectoId) throw new Error("No project selected");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("proyecto_id", salesProyectoId as string);

    // Using the same API endpoint - it should handle both types
    const response = await fetch("https://ogc-excel-reader.vercel.app/upload/transactions", {
      method: "POST",
      body: formData,
    });

    console.log(response);

    const data = await response.json();
    return data;
  };

  // Step 1: Validate file and show preview
  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!salesProyectoId) {
      toast.error("Error", {
        description: "No se ha seleccionado un proyecto de ventas.",
      });
      return;
    }

    if (!file) {
      toast.error("Selecciona un archivo", {
        description: "Debes seleccionar un archivo Excel para continuar.",
      });
      return;
    }

    setIsValidating(true);

    try {
      // Upload file to API for parsing
      const response = await handleExcelUpload(file);
      setResult(response);

      if (!response.success || !response.transactions) {
        toast.error("Error al procesar el archivo", {
          description: response.message || "No se pudieron procesar las transacciones.",
        });
        setIsValidating(false);
        return;
      }

      // Create lookup map for fast partida resolution
      const partidasMap = new Map<string, Id<"sales_partidas">>();
      if (partidasForProject) {
        for (const p of partidasForProject) {
          const key = `${p.nombre}_${p.familia}_${p.sub_partida}`;
          partidasMap.set(key, p._id);
        }
      }

      // Validate each transaction without uploading
      let validCount = 0;
      let invalidCount = 0;
      let partialCount = 0;
      let validAmount = 0;
      const validationTransactions: ValidationReport["transactions"] = [];

      for (const txn of response.transactions) {
        const report: ValidationReport["transactions"][0] = {
          factura: txn.factura || "Sin factura",
          status: "valid",
          monto: txn.transaction.monto_total,
          fecha: excelSerialToDate(txn.transaction.fecha),
          lineItemsTotal: txn.lineitems.length,
          lineItemsValid: 0,
          errors: [],
          partidasNotFound: [],
        };

        // Prepare line items with partida lookup
        const lineItems: Array<{
          sales_partida_id: Id<"sales_partidas">;
          monto: number;
        }> = [];

        for (const item of txn.lineitems) {
          const key = `${item.partida_identifier.partida}_${item.partida_identifier.familia}_${item.partida_identifier.subpartida}`;
          const partidaId = partidasMap.get(key);

          if (!partidaId) {
            report.partidasNotFound.push(`${item.partida_identifier.partida} > ${item.partida_identifier.familia} > ${item.partida_identifier.subpartida}`);
            continue;
          }

          lineItems.push({
            sales_partida_id: partidaId,
            monto: item.monto,
          });
        }

        report.lineItemsValid = lineItems.length;

        // Determine status
        if (lineItems.length === 0) {
          report.status = "invalid";
          report.errors.push("No se encontraron partidas válidas para esta transacción");
          invalidCount++;
        } else if (lineItems.length < txn.lineitems.length) {
          report.status = "partial";
          partialCount++;
          validAmount += txn.transaction.monto_total;
          // Store prepared data for upload
          report.preparedData = {
            transaction: txn.transaction,
            lineItems,
            nombre_cliente: txn.lineitems[0]?.partida_identifier.subpartida || "",
            codigo_referencia: txn.lineitems[0]?.partida_identifier.familia || "",
          };
        } else {
          report.status = "valid";
          validCount++;
          validAmount += txn.transaction.monto_total;
          // Store prepared data for upload
          report.preparedData = {
            transaction: txn.transaction,
            lineItems,
            nombre_cliente: txn.lineitems[0]?.partida_identifier.subpartida || "",
            codigo_referencia: txn.lineitems[0]?.partida_identifier.familia || "",
          };
        }

        validationTransactions.push(report);
      }

      // Build validation report
      const report: ValidationReport = {
        totalTransactions: response.transactions.length,
        validTransactions: validCount,
        invalidTransactions: invalidCount,
        partialTransactions: partialCount,
        totalAmount: response.summary?.totalAmount || 0,
        validAmount,
        totalPartidasNotFound: validationTransactions.reduce((sum, r) => sum + r.partidasNotFound.length, 0),
        transactions: validationTransactions,
      };

      setValidationReport(report);
      setCurrentStep("preview");
      setIsValidating(false);

      if (invalidCount > 0 || partialCount > 0) {
        toast.warning("Validación completada con advertencias", {
          description: `${validCount} válidas, ${partialCount} parciales, ${invalidCount} inválidas`,
        });
      } else {
        toast.success("Validación exitosa", {
          description: `${validCount} transacciones listas para cargar`,
        });
      }
    } catch (error) {
      console.error("Error validating file:", error);
      toast.error("Error al validar el archivo", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
      setIsValidating(false);
    }
  };

  // Step 2: Confirm and upload validated transactions
  const handleConfirmUpload = async () => {
    if (!salesProyectoId || !validationReport) return;

    setIsProcessing(true);

    try {
      let successCount = 0;
      let errorCount = 0;
      let partialCount = 0;
      let successfulAmount = 0;
      const transactionReports: TransactionReport[] = [];

      // Process only valid/partial transactions
      for (const txn of validationReport.transactions) {
        if (txn.status === "invalid" || !txn.preparedData) {
          // Skip invalid transactions, but add to report
          transactionReports.push({
            factura: txn.factura,
            status: "error",
            monto: txn.monto,
            fecha: txn.fecha,
            lineItemsTotal: txn.lineItemsTotal,
            lineItemsProcessed: 0,
            errors: txn.errors,
            partidasNotFound: txn.partidasNotFound,
          });
          errorCount++;
          continue;
        }

        const report: TransactionReport = {
          factura: txn.factura,
          status: txn.status === "partial" ? "partial" : "success",
          monto: txn.monto,
          fecha: txn.fecha,
          lineItemsTotal: txn.lineItemsTotal,
          lineItemsProcessed: txn.lineItemsValid,
          errors: [],
          partidasNotFound: txn.partidasNotFound,
        };

        try {
          // Create sales transaction with prepared line items
          await createSalesTransaction({
            sales_proyecto: salesProyectoId,
            nombre_cliente: txn.preparedData.nombre_cliente,
            monto_total: txn.preparedData.transaction.monto_total,
            fecha: excelSerialToDate(txn.preparedData.transaction.fecha),
            tipo_pago: txn.preparedData.transaction.tipo_pago,
            moneda: txn.preparedData.transaction.moneda,
            tipo_cambio: txn.preparedData.transaction.tipo_cambio,
            status: txn.preparedData.transaction.status,
            categoria: txn.preparedData.transaction.categoria,
            codigo_referencia: txn.preparedData.codigo_referencia,
            banco: "",
            tarjeta: "",
            numero_cuenta: "",
            numero_transferencia: "",
            factura: txn.factura || "",
            comprobante: "",
            presupuesto_archivo: "",
            lineItems: txn.preparedData.lineItems,
          });

          if (txn.status === "partial") {
            partialCount++;
          }
          successCount++;
          successfulAmount += txn.monto;
        } catch (error) {
          console.error("Error creating sales transaction:", error);
          report.status = "error";
          report.errors.push(error instanceof Error ? error.message : "Error desconocido");
          errorCount++;
        }

        transactionReports.push(report);
      }

      // Build final report
      const finalReport: UploadReport = {
        totalTransactions: validationReport.totalTransactions,
        successfulTransactions: successCount,
        failedTransactions: errorCount,
        partialTransactions: partialCount,
        totalAmount: validationReport.totalAmount,
        successfulAmount,
        totalPartidasNotFound: transactionReports.reduce((sum, r) => sum + r.partidasNotFound.length, 0),
        transactions: transactionReports,
      };

      setUploadReport(finalReport);
      setCurrentStep("result");
      setIsProcessing(false);

      if (successCount > 0) {
        const description = errorCount > 0 || partialCount > 0
          ? `${successCount} exitosas, ${partialCount} parciales, ${errorCount} fallidas`
          : `${successCount} transacciones creadas exitosamente`;

        toast.success("Carga completada", { description });
      } else {
        toast.error("Error al crear transacciones", {
          description: "No se pudo crear ninguna transacción.",
        });
      }
    } catch (error) {
      console.error("Error uploading transactions:", error);
      toast.error("Error al cargar las transacciones", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
      setIsProcessing(false);
    }
  };

  // Legacy submit handler (kept for compatibility)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Now just calls validate
    await handleValidate(e);
  };

  const handleClose = () => {
    if (isProcessing || isValidating) return;
    setFile(null);    
    setResult(null);
    setUploadReport(null);
    setValidationReport(null);
    setShowFailedOnly(false);
    setExpandedRows(new Set());
    setCurrentStep("upload");
    onClose();
  };

  const toggleRowExpanded = (factura: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(factura)) {
        newSet.delete(factura);
      } else {
        newSet.add(factura);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: TransactionReport["status"]) => {
    switch (status) {
      case "success": return "text-green-600 bg-green-50";
      case "error": return "text-red-600 bg-red-50";
      case "partial": return "text-yellow-600 bg-yellow-50";
    }
  };

  const getStatusIcon = (status: TransactionReport["status"]) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-4 w-4" />;
      case "error": return <XCircle className="h-4 w-4" />;
      case "partial": return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getStatusLabel = (status: TransactionReport["status"]) => {
    switch (status) {
      case "success": return "Exitosa";
      case "error": return "Fallida";
      case "partial": return "Parcial";
    }
  };

  const filteredReportTransactions = uploadReport?.transactions.filter(t => 
    !showFailedOnly || t.status !== "success"
  ) || [];

  const exportReportToCSV = () => {
    if (!uploadReport) return;
    
    const headers = ["Factura", "Estado", "Monto", "Fecha", "Items Total", "Items Procesados", "Errores", "Partidas No Encontradas"];
    const rows = uploadReport.transactions.map(t => [
      t.factura,
      getStatusLabel(t.status),
      t.monto.toFixed(2),
      t.fecha,
      t.lineItemsTotal,
      t.lineItemsProcessed,
      t.errors.join("; "),
      t.partidasNotFound.join("; ")
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_carga_ventas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isFormValid = file !== null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">
            Subir Transacciones de Ventas desde Excel
          </DialogTitle>
          <DialogDescription>
            {salesProyectoNombre && (
              <span className="font-medium text-gray-700">
                Proyecto: {salesProyectoNombre}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Archivo Excel *</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : file
                    ? "border-green-500 bg-green-50"
                    : "border-gray-300 hover:border-gray-400"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBrowseClick}
                      disabled={isValidating || isProcessing}
                    >
                      Cambiar Archivo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveFile}
                      disabled={isValidating || isProcessing}
                    >
                      Eliminar
                    </Button>
                  </div>
                  <input
                    id="sales-project-transaction-file-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Upload className="h-12 w-12 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Arrastra y suelta un archivo Excel aquí
                    </p>
                    <p className="text-sm text-gray-500 mt-1">o</p>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBrowseClick}
                      disabled={isValidating || isProcessing}
                    >
                      Explorar Archivos
                    </Button>
                    <input
                      id="sales-project-transaction-file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Archivos soportados: .xlsx, .xls (máx. 10MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Result Summary */}
          {result && result.success && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium text-blue-900">Archivo procesado correctamente</h4>
              </div>
              {result.summary && (
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• Total de filas: {result.summary.totalRows}</p>
                  <p>• Filas válidas: {result.summary.validRows}</p>
                  <p>• Transacciones encontradas: {result.summary.transactionsCreated}</p>
                  <p>
                    • Monto total: $
                    {result.summary.totalAmount.toLocaleString("es-MX", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          {result && !result.success && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-red-900">Error al procesar el archivo</h4>
              </div>
              <p className="text-sm text-red-800">{result.message}</p>
            </div>
          )}

          {/* Validation Preview (Step 2) */}
          {currentStep === "preview" && validationReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-700 bg-blue-50 p-3 rounded-lg">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium">Vista previa - Revisa los datos antes de confirmar la carga</span>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-gray-900">{validationReport.totalTransactions}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-green-600">{validationReport.validTransactions}</p>
                  <p className="text-xs text-green-600">Válidas</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-yellow-600">{validationReport.partialTransactions}</p>
                  <p className="text-xs text-yellow-600">Parciales</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-red-600">{validationReport.invalidTransactions}</p>
                  <p className="text-xs text-red-600">Inválidas</p>
                </div>
              </div>

              {/* Amount Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-blue-800">Monto a procesar:</span>
                  <span className="font-semibold text-blue-900">
                    ${validationReport.validAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {validationReport.totalPartidasNotFound > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200">
                    <span className="text-sm text-orange-700">Partidas no encontradas:</span>
                    <span className="font-semibold text-orange-700">{validationReport.totalPartidasNotFound}</span>
                  </div>
                )}
              </div>

              {/* Report Header */}
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Detalle de Validación</h4>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFailedOnly}
                    onChange={(e) => setShowFailedOnly(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Solo con errores
                </label>
              </div>

              {/* Validation Table */}
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium text-gray-600">Factura</th>
                      <th className="text-left p-2 font-medium text-gray-600">Estado</th>
                      <th className="text-right p-2 font-medium text-gray-600">Monto</th>
                      <th className="text-center p-2 font-medium text-gray-600">Items</th>
                      <th className="text-left p-2 font-medium text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {validationReport.transactions
                      .filter(t => !showFailedOnly || t.status !== "valid")
                      .map((txn) => (
                      <>
                        <tr 
                          key={txn.factura} 
                          className={`hover:bg-gray-50 cursor-pointer ${expandedRows.has(txn.factura) ? "bg-gray-50" : ""}`}
                          onClick={() => (txn.errors.length > 0 || txn.partidasNotFound.length > 0) && toggleRowExpanded(txn.factura)}
                        >
                          <td className="p-2 font-mono text-xs">{txn.factura}</td>
                          <td className="p-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                              txn.status === "valid" ? "text-green-600 bg-green-50" :
                              txn.status === "partial" ? "text-yellow-600 bg-yellow-50" :
                              "text-red-600 bg-red-50"
                            }`}>
                              {txn.status === "valid" ? <CheckCircle2 className="h-4 w-4" /> :
                               txn.status === "partial" ? <AlertTriangle className="h-4 w-4" /> :
                               <XCircle className="h-4 w-4" />}
                              {txn.status === "valid" ? "Válida" : txn.status === "partial" ? "Parcial" : "Inválida"}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono">
                            ${txn.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-center">
                            <span className={txn.lineItemsValid < txn.lineItemsTotal ? "text-yellow-600" : ""}>
                              {txn.lineItemsValid}/{txn.lineItemsTotal}
                            </span>
                          </td>
                          <td className="p-2">
                            {(txn.errors.length > 0 || txn.partidasNotFound.length > 0) && (
                              expandedRows.has(txn.factura) 
                                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                : <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {expandedRows.has(txn.factura) && (txn.errors.length > 0 || txn.partidasNotFound.length > 0) && (
                          <tr key={`${txn.factura}-details`}>
                            <td colSpan={5} className="p-3 bg-gray-50">
                              {txn.errors.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-xs font-medium text-red-700 mb-1">Errores:</p>
                                  <ul className="text-xs text-red-600 list-disc list-inside">
                                    {txn.errors.map((err, i) => <li key={i}>{err}</li>)}
                                  </ul>
                                </div>
                              )}
                              {txn.partidasNotFound.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-orange-700 mb-1">Partidas no encontradas:</p>
                                  <ul className="text-xs text-orange-600 list-disc list-inside">
                                    {txn.partidasNotFound.map((p, i) => <li key={i}>{p}</li>)}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Report (Step 3 - Result) */}
          {currentStep === "result" && uploadReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Carga completada</span>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-gray-900">{uploadReport.totalTransactions}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-green-600">{uploadReport.successfulTransactions}</p>
                  <p className="text-xs text-green-600">Exitosas</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-yellow-600">{uploadReport.partialTransactions}</p>
                  <p className="text-xs text-yellow-600">Parciales</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-red-600">{uploadReport.failedTransactions}</p>
                  <p className="text-xs text-red-600">Fallidas</p>
                </div>
              </div>

              {/* Amount Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-blue-800">Monto procesado exitosamente:</span>
                  <span className="font-semibold text-blue-900">
                    ${uploadReport.successfulAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {uploadReport.totalPartidasNotFound > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200">
                    <span className="text-sm text-orange-700">Partidas no encontradas:</span>
                    <span className="font-semibold text-orange-700">{uploadReport.totalPartidasNotFound}</span>
                  </div>
                )}
              </div>

              {/* Report Header */}
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Detalle de Transacciones</h4>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showFailedOnly}
                      onChange={(e) => setShowFailedOnly(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Solo con errores
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportReportToCSV}
                    className="h-8"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    CSV
                  </Button>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium text-gray-600">Factura</th>
                      <th className="text-left p-2 font-medium text-gray-600">Estado</th>
                      <th className="text-right p-2 font-medium text-gray-600">Monto</th>
                      <th className="text-center p-2 font-medium text-gray-600">Items</th>
                      <th className="text-left p-2 font-medium text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReportTransactions.map((txn) => (
                      <>
                        <tr 
                          key={txn.factura} 
                          className={`hover:bg-gray-50 cursor-pointer ${expandedRows.has(txn.factura) ? "bg-gray-50" : ""}`}
                          onClick={() => (txn.errors.length > 0 || txn.partidasNotFound.length > 0) && toggleRowExpanded(txn.factura)}
                        >
                          <td className="p-2 font-mono text-xs">{txn.factura}</td>
                          <td className="p-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getStatusColor(txn.status)}`}>
                              {getStatusIcon(txn.status)}
                              {getStatusLabel(txn.status)}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono">
                            ${txn.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-center">
                            <span className={txn.lineItemsProcessed < txn.lineItemsTotal ? "text-yellow-600" : ""}>
                              {txn.lineItemsProcessed}/{txn.lineItemsTotal}
                            </span>
                          </td>
                          <td className="p-2">
                            {(txn.errors.length > 0 || txn.partidasNotFound.length > 0) && (
                              expandedRows.has(txn.factura) 
                                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                : <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </td>
                        </tr>
                        {expandedRows.has(txn.factura) && (txn.errors.length > 0 || txn.partidasNotFound.length > 0) && (
                          <tr key={`${txn.factura}-details`}>
                            <td colSpan={5} className="p-3 bg-gray-50">
                              {txn.errors.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-xs font-medium text-red-700 mb-1">Errores:</p>
                                  <ul className="text-xs text-red-600 list-disc list-inside">
                                    {txn.errors.map((err, i) => <li key={i}>{err}</li>)}
                                  </ul>
                                </div>
                              )}
                              {txn.partidasNotFound.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-orange-700 mb-1">Partidas no encontradas:</p>
                                  <ul className="text-xs text-orange-600 list-disc list-inside">
                                    {txn.partidasNotFound.map((p, i) => <li key={i}>{p}</li>)}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions - Step based */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            {currentStep === "upload" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isValidating}
                  className="rounded-none"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid || isValidating}
                  className="rounded-none"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    "Validar Datos"
                  )}
                </Button>
              </>
            )}

            {currentStep === "preview" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCurrentStep("upload");
                    setValidationReport(null);
                    setResult(null);
                  }}
                  disabled={isProcessing}
                  className="rounded-none"
                >
                  Volver
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmUpload}
                  disabled={isProcessing || (validationReport?.validTransactions === 0 && validationReport?.partialTransactions === 0)}
                  className="rounded-none"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    `Confirmar Carga (${(validationReport?.validTransactions || 0) + (validationReport?.partialTransactions || 0)} transacciones)`
                  )}
                </Button>
              </>
            )}

            {currentStep === "result" && (
              <Button
                type="button"
                onClick={handleClose}
                className="rounded-none"
              >
                Cerrar
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
