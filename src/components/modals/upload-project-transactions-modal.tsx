import { useCallback, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { hashFile, normalizeProviderName } from "@/lib/transactionImport";
import {
  LABOR_IMPORT_MAX_FILE_SIZE,
  LaborPaymentImportValidationError,
  parseLaborPaymentWorkbook,
  type LaborPaymentParseResult,
} from "@/lib/laborPaymentImport";

type ModalStep = "upload" | "preview" | "result";

type PreviewTransaction = {
  sourceKey: string;
  factura: string;
  fecha: string;
  monto: number;
  itemCount: number;
  providerName: string;
  providerStatus: "matched" | "new" | "archived" | "conflict";
  providerType?: "regular" | "generico";
  providerId?: Id<"proveedores">;
  errors: string[];
};

type ValidationReport = {
  parsed: LaborPaymentParseResult;
  fileHash: string;
  transactions: PreviewTransaction[];
  replacedDates: string[];
  unchanged: boolean;
};

type UploadReport = {
  status: "created" | "replaced" | "unchanged";
  dates: string[];
  transactionCount: number;
  rowCount: number;
  amountTotal: number;
  totalPeople: number;
  replacedDates: number;
};

function formatCurrency(value: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function UploadProjectTransactionsModal() {
  const convex = useConvex();
  const { isOpen, proyectoId, proyectoNombre, onClose } = useUploadProjectTransactionsModal();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<ModalStep>("upload");
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  const project = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId } : "skip",
  );
  const partidasForProject = useQuery(
    api.partida.getByProject,
    proyectoId ? { projectId: proyectoId } : "skip",
  );
  const activeImports = useQuery(
    api.laborPaymentImports.getActiveLaborImports,
    proyectoId ? { proyecto: proyectoId } : "skip",
  );
  const replaceLaborPaymentImport = useMutation(
    api.laborPaymentImports.replaceLaborPaymentImport,
  );

  const resetSelectedFile = (selectedFile: File | null) => {
    setFile(selectedFile);
    setFileErrors([]);
    setValidationReport(null);
    setUploadReport(null);
    setCurrentStep("upload");
  };

  const validateFile = (selectedFile: File) => {
    const extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    if (![".xlsx", ".xls"].includes(extension)) {
      toast.error("Archivo inválido", {
        description: "Solo se permiten archivos Excel .xlsx o .xls.",
      });
      return false;
    }
    if (selectedFile.size > LABOR_IMPORT_MAX_FILE_SIZE) {
      toast.error("Archivo demasiado grande", {
        description: "El límite de carga es 10 MB.",
      });
      return false;
    }
    return true;
  };

  const handleDrag = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === "dragenter" || event.type === "dragover");
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const selectedFile = event.dataTransfer.files?.[0];
    if (selectedFile && validateFile(selectedFile)) resetSelectedFile(selectedFile);
  }, []);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) resetSelectedFile(selectedFile);
    event.target.value = "";
  };

  const handleClose = () => {
    if (isProcessing || isValidating) return;
    resetSelectedFile(null);
    onClose();
  };

  const handleValidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!proyectoId || !file) return;
    if (!project || !partidasForProject) {
      toast.error("El proyecto todavía se está cargando.");
      return;
    }
    setIsValidating(true);
    setFileErrors([]);
    try {
      const parsed = await parseLaborPaymentWorkbook(file, {
        projectName: project.nombre,
        projectCurrency: project.moneda_principal,
        partidas: partidasForProject.map((partida) => ({
          _id: String(partida._id),
          nivel: partida.nivel,
          nombre: partida.nombre,
          familia: partida.familia,
          sub_partida: partida.sub_partida,
        })),
      });
      const fileHash = await hashFile(file);
      const providerNames = [...new Set(
        parsed.weeks.flatMap((week) => week.transactions.map((transaction) => transaction.proveedor)),
      )];
      const providerMatches = await convex.query(api.proveedores.matchByNames, {
        names: providerNames,
      });
      const matchesByName = new Map(
        providerMatches.map((match) => [normalizeProviderName(match.name), match]),
      );
      const transactions: PreviewTransaction[] = parsed.weeks.flatMap((week) =>
        week.transactions.map((transaction) => {
          const match = matchesByName.get(normalizeProviderName(transaction.proveedor));
          const status: PreviewTransaction["providerStatus"] =
            match?.status === "matched" || match?.status === "archived" || match?.status === "conflict"
              ? match.status
              : "new";
          const errors: string[] = [];
          if (status === "archived") {
            errors.push("El proveedor está archivado y debe reactivarse antes de importar.");
          }
          if (status === "conflict") {
            errors.push("Hay varios proveedores equivalentes; deben fusionarse antes de importar.");
          }
          return {
            sourceKey: transaction.source_key,
            factura: transaction.factura,
            fecha: week.date,
            monto: transaction.monto_total,
            itemCount: transaction.line_items.length,
            providerName: transaction.proveedor,
            providerStatus: status,
            providerType: match?.tipo,
            providerId: match?.status === "matched" ? match.provider_id : undefined,
            errors,
          };
        }),
      );
      const currentImports = activeImports || await convex.query(
        api.laborPaymentImports.getActiveLaborImports,
        { proyecto: proyectoId },
      );
      const dates = new Set(parsed.weeks.map((week) => week.date));
      const identicalDates = new Set(
        currentImports
          .filter((item) => item.source_file_hash === fileHash)
          .map((item) => item.capture_date),
      );
      const unchanged = identicalDates.size === dates.size &&
        [...dates].every((date) => identicalDates.has(date));
      const replacedDates = [...new Set(
        currentImports
          .filter((item) => dates.has(item.capture_date))
          .map((item) => item.capture_date),
      )].sort();

      setValidationReport({ parsed, fileHash, transactions, replacedDates, unchanged });
      setCurrentStep("preview");
      if (transactions.some((transaction) => transaction.errors.length)) {
        toast.error("La carga está bloqueada", {
          description: "Corrige los conflictos de proveedor antes de continuar.",
        });
      } else if (unchanged) {
        toast.info("Este archivo ya está activo y no producirá cambios.");
      } else {
        toast.success("Archivo validado", {
          description: `${transactions.length} pagos y ${parsed.weeks.length} cortes listos.`,
        });
      }
    } catch (error) {
      const issues = error instanceof LaborPaymentImportValidationError
        ? error.issues
        : [error instanceof Error ? error.message : "No fue posible leer el archivo."];
      setFileErrors(issues);
      toast.error("El archivo no pasó la validación", { description: issues[0] });
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!proyectoId || !file || !validationReport) return;
    if (validationReport.transactions.some((transaction) => transaction.errors.length)) return;
    setIsProcessing(true);
    try {
      const providerBySourceKey = new Map(
        validationReport.transactions.map((transaction) => [transaction.sourceKey, transaction.providerId]),
      );
      const response = await replaceLaborPaymentImport({
        proyecto: proyectoId,
        source: {
          file_name: file.name,
          file_hash: validationReport.fileHash,
          sheet_name: validationReport.parsed.sheetName,
          administration: validationReport.parsed.administration,
          currency: validationReport.parsed.currency,
          row_count: validationReport.parsed.rowCount,
        },
        weeks: validationReport.parsed.weeks.map((week) => ({
          date: week.date,
          total_people: week.total_people,
          roles: week.roles,
          row_count: week.row_count,
          amount_total: week.amount_total,
          warnings: week.warnings,
          transactions: week.transactions.map((transaction) => ({
            source_key: transaction.source_key,
            monto_total: transaction.monto_total,
            tipo_pago: transaction.tipo_pago,
            moneda: transaction.moneda,
            categoria: transaction.categoria,
            factura: transaction.factura,
            proveedor: transaction.proveedor,
            proveedor_id: providerBySourceKey.get(transaction.source_key),
            line_items: transaction.line_items.map((item) => ({
              ...item,
              partida_id: item.partida_id as Id<"partidas">,
            })),
          })),
        })),
      });
      setUploadReport({
        status: response.status,
        dates: response.dates,
        transactionCount: response.transaction_count,
        rowCount: response.row_count,
        amountTotal: response.amount_total,
        totalPeople: response.total_people,
        replacedDates: "replaced_dates" in response && typeof response.replaced_dates === "number"
          ? response.replaced_dates
          : 0,
      });
      setCurrentStep("result");
      if (response.status === "unchanged") {
        toast.info("El archivo ya estaba activo; no se realizaron escrituras.");
      } else {
        toast.success(response.status === "replaced" ? "Carga reemplazada" : "Carga completada", {
          description: `${response.transaction_count} pagos procesados de forma atómica.`,
        });
      }
    } catch (error) {
      toast.error("No se realizó ningún cambio", {
        description: error instanceof Error ? error.message : "La importación falló.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const hasBlockingErrors = validationReport?.transactions.some(
    (transaction) => transaction.errors.length > 0,
  ) || false;
  const lastWeek = validationReport?.parsed.weeks.at(-1);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Subir pagos y fuerza laboral</DialogTitle>
          <DialogDescription>
            {proyectoNombre ? `Proyecto: ${proyectoNombre}. ` : ""}
            El archivo se procesa localmente y la carga completa se confirma en una sola operación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleValidate} className="space-y-6 mt-4">
          {currentStep === "upload" && (
            <>
              <div className="space-y-2">
                <Label>Archivo Excel *</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive ? "border-blue-500 bg-blue-50" :
                    file ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-gray-400"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {file ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-3">
                        <FileSpreadsheet className="h-9 w-9 text-green-600" />
                        <div className="text-left">
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <div className="flex justify-center gap-2">
                        <Button type="button" variant="outline" onClick={() => document.getElementById("labor-payment-file")?.click()}>
                          Cambiar archivo
                        </Button>
                        <Button type="button" variant="outline" onClick={() => resetSelectedFile(null)}>
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Upload className="h-12 w-12 mx-auto text-gray-400" />
                      <p className="font-medium">Arrastra aquí la hoja CARGA</p>
                      <Button type="button" variant="outline" onClick={() => document.getElementById("labor-payment-file")?.click()}>
                        Explorar archivos
                      </Button>
                      <p className="text-xs text-gray-500">.xlsx o .xls · máximo 10 MB y 1,000 filas</p>
                    </div>
                  )}
                  <input
                    id="labor-payment-file"
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>
              </div>

              {fileErrors.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                    <XCircle className="h-5 w-5" /> Errores de validación
                  </div>
                  <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                    {fileErrors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}

          {currentStep === "preview" && validationReport && (
            <div className="space-y-5">
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                hasBlockingErrors ? "text-red-700 bg-red-50" : "text-blue-700 bg-blue-50"
              }`}>
                {hasBlockingErrors ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                <span className="text-sm font-medium">
                  {hasBlockingErrors ? "La carga está bloqueada" : "Vista previa validada"}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold">{validationReport.parsed.weeks.length}</p>
                  <p className="text-xs text-gray-500">Cortes</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold">{validationReport.transactions.length}</p>
                  <p className="text-xs text-gray-500">Pagos</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold">{lastWeek?.total_people || 0}</p>
                  <p className="text-xs text-gray-500">Personas último corte</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-semibold">{formatCurrency(validationReport.parsed.amountTotal, validationReport.parsed.currency)}</p>
                  <p className="text-xs text-gray-500">Monto total</p>
                </div>
              </div>

              {(validationReport.unchanged || validationReport.replacedDates.length > 0) && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                  <AlertTriangle className="inline h-4 w-4 mr-2" />
                  {validationReport.unchanged
                    ? "El mismo archivo ya está activo; confirmar devolverá ‘sin cambios’."
                    : `Se reemplazarán únicamente las cargas del importador para: ${validationReport.replacedDates.map(formatDate).join(", ")}.`}
                </div>
              )}

              {validationReport.parsed.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <p className="font-medium text-amber-800 mb-1">Advertencias</p>
                  <ul className="list-disc pl-5 text-sm text-amber-800">
                    {validationReport.parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-medium">Cortes y puestos</h4>
                {validationReport.parsed.weeks.map((week) => (
                  <div key={week.date} className="border rounded-lg p-3 text-sm">
                    <div className="flex justify-between font-medium mb-2">
                      <span>{formatDate(week.date)}</span>
                      <span>{week.total_people} personas · {formatCurrency(week.amount_total, validationReport.parsed.currency)}</span>
                    </div>
                    <p className="text-gray-600">
                      {week.roles.map((role) => `${role.label}: ${role.count}`).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">Factura</th>
                      <th className="text-left p-2">Proveedor</th>
                      <th className="text-left p-2">Corte</th>
                      <th className="text-right p-2">Monto</th>
                      <th className="text-center p-2">Conceptos</th>
                      <th className="text-left p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {validationReport.transactions.map((transaction) => (
                      <tr key={transaction.sourceKey}>
                        <td className="p-2 font-mono text-xs">{transaction.factura}</td>
                        <td className="p-2">
                          <span className="block">{transaction.providerName}</span>
                          <span className="text-xs text-gray-500">
                            {transaction.providerType === "generico" ? "Genérico" :
                              transaction.providerStatus === "matched" ? "Existente" :
                              transaction.providerStatus === "new" ? "Nuevo" :
                              transaction.providerStatus === "archived" ? "Archivado" : "Conflicto"}
                          </span>
                        </td>
                        <td className="p-2">{formatDate(transaction.fecha)}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(transaction.monto, validationReport.parsed.currency)}</td>
                        <td className="p-2 text-center">{transaction.itemCount}</td>
                        <td className="p-2">
                          {transaction.errors.length ? (
                            <span className="text-red-700 text-xs">{transaction.errors.join(" ")}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> Válida</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentStep === "result" && uploadReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 p-4 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {uploadReport.status === "unchanged" ? "Archivo sin cambios" :
                    uploadReport.status === "replaced" ? "Carga reemplazada correctamente" : "Carga completada correctamente"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 p-3 rounded-lg text-center"><strong className="text-xl">{uploadReport.transactionCount}</strong><p className="text-xs text-gray-500">Pagos</p></div>
                <div className="bg-gray-50 p-3 rounded-lg text-center"><strong className="text-xl">{uploadReport.rowCount}</strong><p className="text-xs text-gray-500">Conceptos</p></div>
                <div className="bg-gray-50 p-3 rounded-lg text-center"><strong className="text-xl">{uploadReport.totalPeople}</strong><p className="text-xs text-gray-500">Personas</p></div>
                <div className="bg-gray-50 p-3 rounded-lg text-center"><strong className="text-lg">{formatCurrency(uploadReport.amountTotal, validationReport?.parsed.currency)}</strong><p className="text-xs text-gray-500">Monto</p></div>
              </div>
              <p className="text-sm text-gray-600">
                Cortes: {uploadReport.dates.map(formatDate).join(", ")}. Lotes reemplazados: {uploadReport.replacedDates}.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            {currentStep === "upload" && (
              <>
                <Button type="button" variant="outline" onClick={handleClose} disabled={isValidating}>Cancelar</Button>
                <Button type="submit" disabled={!file || !project || !partidasForProject || isValidating}>
                  {isValidating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isValidating ? "Validando…" : "Validar datos"}
                </Button>
              </>
            )}
            {currentStep === "preview" && (
              <>
                <Button type="button" variant="outline" onClick={() => setCurrentStep("upload")} disabled={isProcessing}>Volver</Button>
                <Button type="button" onClick={handleConfirmUpload} disabled={hasBlockingErrors || isProcessing}>
                  {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isProcessing ? "Procesando…" : `Confirmar carga (${validationReport?.transactions.length || 0})`}
                </Button>
              </>
            )}
            {currentStep === "result" && <Button type="button" onClick={handleClose}>Cerrar</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
