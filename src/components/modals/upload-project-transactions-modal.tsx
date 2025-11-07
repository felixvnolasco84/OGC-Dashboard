import { useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
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
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";
import {
  extractFolderIdFromUrl,
  searchFilesInFolder,
  isValidDriveFolderUrl,
} from "@/lib/google-drive";

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
      proyecto: string;
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

export default function UploadProjectTransactionsModal() {
  const { isOpen, proyectoId, proyectoNombre, onClose } = useUploadProjectTransactionsModal();
  const [file, setFile] = useState<File | null>(null);
  const [googleDriveFolder, setGoogleDriveFolder] = useState("");
  const [googleAccessToken, setGoogleAccessToken] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  // Queries and mutations
  const createTransaction = useMutation(api.transacciones.createTransaction);
  const createDocumento = useMutation(api.documentos.create);
  const partidasForProject = useQuery(
    api.partida.getByProject,
    proyectoId ? { projectId: proyectoId } : "skip"
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
    document.getElementById("project-transaction-file-upload")?.click();
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
    if (!proyectoId) throw new Error("No project selected");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("proyecto_id", proyectoId as string);

    const response = await fetch("https://ogc-excel-reader.vercel.app/upload/transactions", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!proyectoId) {
      toast.error("Error", {
        description: "No se ha seleccionado un proyecto.",
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

      if (!response.success || !response.transactions) {
        toast.error("Error al procesar el archivo", {
          description: response.message || "No se pudieron procesar las transacciones.",
        });
        setIsUploading(false);
        return;
      }

      setIsProcessing(true);
      let successCount = 0;
      let errorCount = 0;
      let documentsCreated = 0;
      const errors: string[] = [];
      const createdTransactionIds: Array<{ id: Id<"transacciones">; factura: string }> = [];

      // Create lookup map for fast partida resolution
      const partidasMap = new Map<string, Id<"partidas">>();

      if (partidasForProject) {
        for (const p of partidasForProject) {
          const key = `${p.nombre}_${p.familia}_${p.sub_partida}`;
          partidasMap.set(key, p._id);
        }
      }

      // Process each transaction
      for (const txn of response.transactions) {
        try {
          // Prepare line items with partida lookup
          const lineItems: Array<{
            partida_id: Id<"partidas">;
            partida: string;
            familia: string;
            sub_partida: string;
            monto: number;
          }> = [];

          for (const item of txn.lineitems) {
            const key = `${item.partida_identifier.partida}_${item.partida_identifier.familia}_${item.partida_identifier.subpartida}`;
            const partidaId = partidasMap.get(key);

            if (!partidaId) {
              console.warn(`Partida not found: ${key}`);
              errors.push(`Partida no encontrada: ${item.codigo}`);
              continue;
            }

            lineItems.push({
              partida_id: partidaId,
              partida: item.partida_identifier.partida,
              familia: item.partida_identifier.familia,
              sub_partida: item.partida_identifier.subpartida,
              monto: item.monto,
            });
          }

          // Only create transaction if we have line items
          if (lineItems.length === 0) {
            console.warn(`No line items found for transaction ${txn.factura}`);
            errorCount++;
            continue;
          }

          // Create transaction with line items
          const result = await createTransaction({
            proyecto: proyectoId,
            monto_total: txn.transaction.monto_total,
            fecha: excelSerialToDate(txn.transaction.fecha),
            tipo_pago: txn.transaction.tipo_pago,
            moneda: txn.transaction.moneda,
            tipo_cambio: txn.transaction.tipo_cambio,
            status: txn.transaction.status,
            codigo_referencia: txn.transaction.categoria || "",
            banco: "",
            tarjeta: "",
            numero_cuenta: "",
            numero_transferencia: "",
            factura: txn.factura || "",
            comprobante: "",
            presupuesto_archivo: "",
            lineItems: lineItems,
          });

          // Store transaction ID and documents for later processing
          createdTransactionIds.push({
            id: result.transaccionId,
            factura: txn.factura,
          });

          successCount++;
        } catch (error) {
          console.error("Error creating transaction:", error);
          errors.push(error instanceof Error ? error.message : "Error desconocido");
          errorCount++;
        }
      }

      // Process Google Drive documents if folder URL is provided
      if (googleDriveFolder && isValidDriveFolderUrl(googleDriveFolder)) {
        try {
          console.log("Processing Google Drive documents...");

          // Collect all unique document names from all transactions
          const documentNames = new Set<string>();
          const documentsByTransaction = new Map<string, Array<{
            nombre: string;
            tipo: string;
            descripcion: string;
          }>>();

          response.transactions.forEach((txn: typeof response.transactions[0], txnIndex: number) => {
            const txnDocs: Array<{ nombre: string; tipo: string; descripcion: string }> = [];

            txn.lineitems.forEach((item: typeof txn.lineitems[0]) => {
              if (item.nombre_documento) {
                documentNames.add(item.nombre_documento);
                txnDocs.push({
                  nombre: item.nombre_documento,
                  tipo: item.tipo_documento || "Documento",
                  descripcion: item.descripcion_documento || "",
                });
              }
            });

            if (txnDocs.length > 0 && createdTransactionIds[txnIndex]) {
              documentsByTransaction.set(
                createdTransactionIds[txnIndex].id,
                txnDocs
              );
            }
          });

          // Only proceed if we have an access token
          if (googleAccessToken) {
            const folderId = extractFolderIdFromUrl(googleDriveFolder);

            if (folderId) {
              // Search for files in Google Drive
              const driveFiles = await searchFilesInFolder(
                folderId,
                Array.from(documentNames),
                googleAccessToken
              );

              // Create documento records for matched files
              for (const [transactionId, docs] of documentsByTransaction.entries()) {
                // Group documents by name to avoid duplicates
                const uniqueDocs = new Map<string, typeof docs[0]>();
                docs.forEach((doc) => {
                  if (!uniqueDocs.has(doc.nombre)) {
                    uniqueDocs.set(doc.nombre, doc);
                  }
                });

                for (const doc of uniqueDocs.values()) {
                  const driveFile = driveFiles.get(doc.nombre);

                  if (driveFile) {
                    try {
                      await createDocumento({
                        nombre: doc.nombre,
                        descripcion: doc.descripcion,
                        image: driveFile.id, // Store Google Drive file ID
                        type: doc.tipo,
                        proyecto: proyectoId,
                        transaccion_id: transactionId as Id<"transacciones">,
                      });

                      documentsCreated++;
                    } catch (docError) {
                      console.error(`Error creating document ${doc.nombre}:`, docError);
                      errors.push(`Documento ${doc.nombre}: ${docError instanceof Error ? docError.message : "Error"}`);
                    }
                  } else {
                    console.warn(`Document not found in Google Drive: ${doc.nombre}`);
                    errors.push(`Documento no encontrado: ${doc.nombre}`);
                  }
                }
              }

              console.log(`Created ${documentsCreated} documents from Google Drive`);
            } else {
              errors.push("URL de carpeta de Google Drive inválida");
            }
          } else {
            console.log("No access token provided, skipping Google Drive integration");
            toast.info("Documentos omitidos", {
              description: "Proporciona un token de acceso de Google para vincular documentos automáticamente.",
            });
          }
        } catch (driveError) {
          console.error("Error processing Google Drive documents:", driveError);
          errors.push(`Error de Google Drive: ${driveError instanceof Error ? driveError.message : "Error desconocido"}`);
        }
      }

      setIsProcessing(false);
      setIsUploading(false);

      if (successCount > 0) {
        const description = documentsCreated > 0
          ? `Se crearon ${successCount} transacciones y ${documentsCreated} documentos${errorCount > 0 || errors.length > 0 ? ` con algunos errores` : ""}.`
          : `Se crearon ${successCount} transacciones exitosamente${errorCount > 0 ? ` (${errorCount} errores)` : ""}.`;

        toast.success("Proceso completado", { description });

        if (errors.length > 0 && errors.length <= 5) {
          errors.forEach((error) => {
            toast.warning(error, { duration: 3000 });
          });
        }

        handleClose();
      } else {
        toast.error("Error al crear transacciones", {
          description: "No se pudo crear ninguna transacción.",
        });
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Error al subir el archivo", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isUploading || isProcessing) return;
    setFile(null);
    setGoogleDriveFolder("");
    setGoogleAccessToken("");
    setResult(null);
    onClose();
  };

  const isFormValid = file !== null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">
            Subir Transacciones desde Excel
          </DialogTitle>
          <DialogDescription>
            {proyectoNombre && (
              <span className="font-medium text-gray-700">
                Proyecto: {proyectoNombre}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Google Drive Integration (Optional) */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Integración con Google Drive (Opcional)</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="googleDrive" className="text-xs font-medium text-gray-600">
                URL de Carpeta de Google Drive
              </Label>
              <Input
                id="googleDrive"
                value={googleDriveFolder}
                onChange={(e) => setGoogleDriveFolder(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="rounded-none"
                disabled={isUploading || isProcessing}
              />
              <p className="text-xs text-gray-500">
                Carpeta donde se encuentran los documentos referenciados en el Excel
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessToken" className="text-xs font-medium text-gray-600">
                Token de Acceso de Google (Requerido para vincular automáticamente)
              </Label>
              <Input
                id="accessToken"
                type="password"
                value={googleAccessToken}
                onChange={(e) => setGoogleAccessToken(e.target.value)}
                placeholder="Pega tu token de acceso aquí..."
                className="rounded-none"
                disabled={isUploading || isProcessing}
              />
              <p className="text-xs text-gray-500">
                Token OAuth2 para acceder a Google Drive.{" "}
                <a
                  href="https://developers.google.com/oauthplayground/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Obtener token
                </a>
              </p>
            </div>

            {googleDriveFolder && !isValidDriveFolderUrl(googleDriveFolder) && (
              <p className="text-xs text-red-600">
                ⚠️ URL de carpeta inválida. Debe ser una URL de carpeta de Google Drive.
              </p>
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Archivo Excel *</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
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
                      disabled={isUploading || isProcessing}
                    >
                      Cambiar Archivo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveFile}
                      disabled={isUploading || isProcessing}
                    >
                      Eliminar
                    </Button>
                  </div>
                  <input
                    id="project-transaction-file-upload"
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
                      disabled={isUploading || isProcessing}
                    >
                      Explorar Archivos
                    </Button>
                    <input
                      id="project-transaction-file-upload"
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading || isProcessing}
              className="rounded-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isUploading || isProcessing}
              className="rounded-none"
            >
              {isUploading || isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isProcessing ? "Procesando..." : "Subiendo..."}
                </>
              ) : (
                "Subir y Procesar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
