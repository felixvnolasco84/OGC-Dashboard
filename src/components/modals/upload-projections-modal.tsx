import { useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUploadProjectionsModal } from "@/hooks/upload-projections-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type UploadResult = {
  success: boolean;
  fileName?: string;
  sheetName?: string;
  message?: string;
  summary?: {
    totalPartidas: number;
    totalWeeks: number;
    grandTotal: number;
    startDate: number;
    endDate: number;
  };
  projections?: Array<{
    partida: string;
    total: number;
    weeklyProjections: Array<{
      week: number;
      amount: number;
      position: number;
    }>;
  }>;
};

export default function UploadProjectionsModal() {
  const { isOpen, onClose, proyectoId } = useUploadProjectionsModal();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  // Mutations and queries
  const uploadProjections = useMutation(api.projected_transactions.uploadProjections);
  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId } : "skip"
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
    document.getElementById("projection-file-upload")?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Helper to convert Excel serial date to readable format
  const excelSerialToDate = (serial: number): string => {
    const date = new Date((serial - 25569) * 86400 * 1000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleExcelUpload = async (file: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("https://ogc-excel-reader.vercel.app/upload/projections", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!proyectoId) {
      toast.error("Proyecto no seleccionado", {
        description: "No se pudo identificar el proyecto.",
      });
      return;
    }

    if (!file) {
      toast.error("Selecciona un archivo", {
        description: "Debes seleccionar un archivo Excel para continuar.",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload file to API
      const response = await handleExcelUpload(file);
      setResult(response);

      if (!response.success || !response.projections) {
        toast.error("Error al procesar el archivo", {
          description: response.message || "No se pudieron procesar las proyecciones.",
        });
        setIsUploading(false);
        return;
      }

      // Upload to Convex database
      const uploadResult = await uploadProjections({
        proyecto: proyectoId,
        fileName: response.fileName || file.name,
        sheetName: response.sheetName || "Hoja 1",
        projections: response.projections,
      });

      setIsUploading(false);

      if (uploadResult.success) {
        toast.success("Proyecciones cargadas exitosamente", {
          description: `Se cargaron ${uploadResult.totalInserted} proyecciones semanales para ${response.summary?.totalPartidas} partidas.`,
        });
        handleClose();
      } else {
        toast.error("Error al guardar las proyecciones", {
          description: uploadResult.message,
        });
      }
    } catch (error) {
      console.error("Error uploading projections:", error);
      toast.error("Error al subir el archivo", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setFile(null);
    setResult(null);
    onClose();
  };

  const isFormValid = file !== null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Subir Proyecciones de Gasto
          </DialogTitle>
          <DialogDescription>
            {proyecto ? (
              <>Sube el archivo Excel con las proyecciones semanales para <span className="font-semibold">{proyecto.nombre}</span></>
            ) : (
              "Sube el archivo Excel con las proyecciones semanales del proyecto"
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* File Upload */}
          <div className="space-y-2">
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
                      disabled={isUploading}
                    >
                      Cambiar Archivo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveFile}
                      disabled={isUploading}
                    >
                      Eliminar
                    </Button>
                  </div>
                  <input
                    id="projection-file-upload"
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
                      disabled={isUploading}
                    >
                      Explorar Archivos
                    </Button>
                    <input
                      id="projection-file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Archivos soportados: .xlsx, .xls (máx. 10MB)
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    El archivo debe contener las proyecciones semanales de gasto por partida
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Result Summary */}
          {result && result.success && result.summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium text-blue-900">Archivo procesado correctamente</h4>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-800">
                <div>
                  <p className="font-medium">Total de Partidas:</p>
                  <p className="text-lg font-bold">{result.summary.totalPartidas}</p>
                </div>
                <div>
                  <p className="font-medium">Total de Semanas:</p>
                  <p className="text-lg font-bold">{result.summary.totalWeeks}</p>
                </div>
                <div>
                  <p className="font-medium">Monto Total Proyectado:</p>
                  <p className="text-lg font-bold">{formatCurrency(result.summary.grandTotal)}</p>
                </div>
                <div>
                  <p className="font-medium">Período:</p>
                  <p className="text-sm">
                    {excelSerialToDate(result.summary.startDate)} - {excelSerialToDate(result.summary.endDate)}
                  </p>
                </div>
              </div>
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

          {/* Info Message */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Nota:</strong> Las proyecciones existentes de este proyecto serán reemplazadas por las nuevas proyecciones del archivo.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              className="rounded-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isUploading}
              className="rounded-none"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Proyecciones
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
