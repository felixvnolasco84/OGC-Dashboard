import { useCallback, useEffect, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROVIDER_BACKFILL_MAX_FILE_SIZE,
  PROVIDER_BACKFILL_MAX_ROWS,
  PROVIDER_BACKFILL_PREVIEW_BATCH_SIZE,
  PROVIDER_BACKFILL_PREVIEW_ROW_LIMIT,
  PROVIDER_BACKFILL_SYNC_BATCH_SIZE,
  ProviderBackfillImportValidationError,
  chunkProviderBackfillCandidates,
  parseProviderBackfillWorkbook,
  type ProviderBackfillCandidate,
  type ProviderBackfillParseResult,
} from "@/lib/providerBackfillImport";
import { normalizeProviderName } from "@/lib/transactionImport";

type ExcelSyncStatus =
  | "ready_existing_provider"
  | "ready_new_provider"
  | "already_assigned"
  | "transaction_not_found"
  | "transaction_conflict"
  | "project_not_found"
  | "project_conflict"
  | "project_mismatch"
  | "provider_archived"
  | "provider_conflict";

type ExcelSyncCounts = {
  scanned: number;
  ready_existing_provider: number;
  ready_new_provider: number;
  already_assigned: number;
  transaction_not_found: number;
  transaction_conflict: number;
  project_not_found: number;
  project_conflict: number;
  project_mismatch: number;
  provider_archived: number;
  provider_conflict: number;
  updated: number;
  providers_created: number;
};

type ExcelSyncRow = ProviderBackfillCandidate & {
  status: ExcelSyncStatus;
  transaction_id?: Id<"transacciones">;
  transaction_ids?: Id<"transacciones">[];
  matched_provider_name?: string;
  matched_project_name?: string;
  candidate_count?: number;
  matched_transaction_count?: number;
  match_mode?: "exact" | "historical_tolerance";
  project_match_mode?: "exact" | "normalized" | "alias";
  matched_transaction_date?: string;
  matched_transaction_amount?: number;
};

type ExcelSyncReport = {
  counts: ExcelSyncCounts;
  rows: ExcelSyncRow[];
};

type ProjectOption = {
  _id: Id<"desarrollos">;
  nombre: string;
};

function emptyCounts(): ExcelSyncCounts {
  return {
    scanned: 0,
    ready_existing_provider: 0,
    ready_new_provider: 0,
    already_assigned: 0,
    transaction_not_found: 0,
    transaction_conflict: 0,
    project_not_found: 0,
    project_conflict: 0,
    project_mismatch: 0,
    provider_archived: 0,
    provider_conflict: 0,
    updated: 0,
    providers_created: 0,
  };
}

function addCounts(target: ExcelSyncCounts, source: ExcelSyncCounts) {
  for (const key of Object.keys(target) as Array<keyof ExcelSyncCounts>) {
    target[key] += source[key];
  }
}

function readyCount(counts: ExcelSyncCounts) {
  return counts.ready_existing_provider + counts.ready_new_provider;
}

function readyTransactionCount(report: ExcelSyncReport) {
  return report.rows
    .filter((row) =>
      row.status === "ready_existing_provider" || row.status === "ready_new_provider"
    )
    .reduce((sum, row) => sum + (row.matched_transaction_count || 1), 0);
}

function pendingCount(counts: ExcelSyncCounts) {
  return counts.scanned - readyCount(counts) - counts.already_assigned;
}

function statusLabel(status: ExcelSyncStatus) {
  switch (status) {
    case "ready_existing_provider": return "Proveedor existente";
    case "ready_new_provider": return "Creará proveedor";
    case "already_assigned": return "Ya asignada";
    case "transaction_not_found": return "Transacción no encontrada";
    case "transaction_conflict": return "Transacción ambigua";
    case "project_not_found": return "Proyecto no encontrado";
    case "project_conflict": return "Proyecto ambiguo";
    case "project_mismatch": return "Fuera del proyecto";
    case "provider_archived": return "Proveedor archivado";
    case "provider_conflict": return "Proveedor ambiguo";
  }
}

function statusClassName(status: ExcelSyncStatus) {
  if (status === "ready_existing_provider") return "border-green-200 bg-green-50 text-green-700";
  if (status === "ready_new_provider") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "already_assigned") return "border-border bg-background text-muted-foreground";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatSourceRows(sourceRows: readonly number[]) {
  const visible = sourceRows.slice(0, 10).join(", ");
  return sourceRows.length > 10
    ? `${visible} y ${sourceRows.length - 10} más`
    : visible;
}

function toSyncCandidate(row: ExcelSyncRow) {
  return {
    source_key: row.source_key,
    project_name: row.project_name,
    amount_total: row.amount_total,
    date: row.date,
    provider_name: row.provider_name,
    invoice: row.invoice,
    payment_type: row.payment_type,
    currency: row.currency,
    source_rows: row.source_rows,
    ...(row.transaction_ids?.length ? { transaction_ids: row.transaction_ids } : {}),
  };
}

export default function ProviderExcelBackfillDialog({
  open,
  onOpenChange,
  projects,
  initialProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  initialProjectId?: Id<"desarrollos">;
}) {
  const convex = useConvex();
  const syncFromExcel = useMutation(api.transacciones.syncProvidersFromExcel);
  const [scope, setScope] = useState<Id<"desarrollos"> | "all">("all");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsed, setParsed] = useState<ProviderBackfillParseResult | null>(null);
  const [preview, setPreview] = useState<ExcelSyncReport | null>(null);
  const [result, setResult] = useState<ExcelSyncReport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [analyzed, setAnalyzed] = useState(0);
  const [processed, setProcessed] = useState(0);

  const resetFile = useCallback((nextFile: File | null) => {
    setFile(nextFile);
    setParsed(null);
    setPreview(null);
    setResult(null);
    setErrors([]);
    setAnalyzed(0);
    setProcessed(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    setScope(initialProjectId || "all");
    resetFile(null);
  }, [initialProjectId, open, resetFile]);

  const validateFile = (selectedFile: File) => {
    const extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    if (![".xlsx", ".xls"].includes(extension)) {
      toast.error("Archivo inválido", { description: "Solo se permiten archivos Excel .xlsx o .xls." });
      return false;
    }
    if (selectedFile.size > PROVIDER_BACKFILL_MAX_FILE_SIZE) {
      toast.error("Archivo demasiado grande", { description: "El límite es 10 MB." });
      return false;
    }
    return true;
  };

  const selectFile = (selectedFile?: File) => {
    if (selectedFile && validateFile(selectedFile)) resetFile(selectedFile);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const analyzeFile = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setErrors([]);
    setPreview(null);
    setResult(null);
    setAnalyzed(0);
    try {
      const parseResult = await parseProviderBackfillWorkbook(file);
      setParsed(parseResult);
      const report: ExcelSyncReport = { counts: emptyCounts(), rows: [] };
      const batches = chunkProviderBackfillCandidates(
        parseResult.candidates,
        PROVIDER_BACKFILL_PREVIEW_BATCH_SIZE,
      );
      let analyzedCount = 0;
      for (const batch of batches) {
        const page: ExcelSyncReport = await convex.query(api.transacciones.previewProviderExcelSync, {
          proyecto_id: scope === "all" ? undefined : scope,
          candidates: batch,
        });
        addCounts(report.counts, page.counts);
        report.rows.push(...page.rows);
        analyzedCount += batch.length;
        setAnalyzed(analyzedCount);
      }
      setPreview(report);
      if (readyCount(report.counts) > 0) {
        toast.success("Excel analizado", {
          description: `${readyTransactionCount(report)} transacciones listas para actualizar.`,
        });
      } else {
        toast.info("No hay transacciones listas para actualizar.");
      }
    } catch (caught) {
      const issues = caught instanceof ProviderBackfillImportValidationError
        ? caught.issues
        : [caught instanceof Error ? caught.message : "No fue posible leer el archivo."];
      setErrors(issues);
      toast.error("El Excel no pasó la validación", { description: issues[0] });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSync = async () => {
    if (!parsed || !preview || readyCount(preview.counts) === 0) return;
    setIsSyncing(true);
    setErrors([]);
    setProcessed(0);
    try {
      const completed: ExcelSyncReport = { counts: emptyCounts(), rows: [] };
      const syncCandidates = preview.rows
        .filter((row) =>
          row.status === "ready_existing_provider" || row.status === "ready_new_provider"
        )
        .map(toSyncCandidate);
      const batches = chunkProviderBackfillCandidates(
        syncCandidates,
        PROVIDER_BACKFILL_SYNC_BATCH_SIZE,
      );
      let processedCount = 0;
      for (const batch of batches) {
        const page: ExcelSyncReport = await syncFromExcel({
          proyecto_id: scope === "all" ? undefined : scope,
          candidates: batch,
        });
        addCounts(completed.counts, page.counts);
        completed.rows.push(...page.rows);
        processedCount += batch.length;
        setProcessed(processedCount);
      }
      setResult(completed);
      toast.success("Proveedores actualizados", {
        description: `${completed.counts.providers_created} proveedores creados y ${completed.counts.updated} transacciones vinculadas.`,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No fue posible completar la actualización.";
      setErrors([message]);
      toast.error("La actualización se interrumpió", {
        description: `${message} Puedes volver a ejecutar el archivo de forma segura.`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const busy = isAnalyzing || isSyncing;
  const newProviderCount = preview
    ? new Set(
        preview.rows
          .filter((row) => row.status === "ready_new_provider")
          .map((row) => normalizeProviderName(row.provider_name)),
      ).size
    : 0;
  const syncCandidateCount = preview ? readyCount(preview.counts) : 0;
  const progress = syncCandidateCount
    ? Math.min(100, (processed / syncCandidateCount) * 100)
    : 0;
  const analysisProgress = parsed?.transactionCount
    ? Math.min(100, (analyzed / parsed.transactionCount) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Actualizar proveedores desde Excel</DialogTitle>
          <DialogDescription>
            Usa el archivo original con la columna PROVEEDOR. Se actualizarán transacciones existentes y se crearán únicamente los proveedores faltantes. Admite hasta {PROVIDER_BACKFILL_MAX_ROWS.toLocaleString("es-MX")} filas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Alcance</p>
            <Select value={scope} onValueChange={(value) => {
              setScope(value === "all" ? "all" : value as Id<"desarrollos">);
              setPreview(null);
              setResult(null);
            }} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos incluidos en el Excel</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project._id} value={project._id}>{project.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!preview && !result && (
            <div
              className={`border-2 border-dashed p-7 text-center transition-colors ${dragActive ? "border-blue-500 bg-blue-50" : file ? "border-green-500 bg-green-50" : "border-border-strong"}`}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="space-y-3">
                  <FileSpreadsheet className="mx-auto h-10 w-10 text-green-600" />
                  <div><p className="font-medium">{file.name}</p><p className="text-xs text-subtle-foreground">{(file.size / 1024).toFixed(1)} KB</p></div>
                  <Button type="button" variant="outline" onClick={() => document.getElementById("provider-backfill-file")?.click()} disabled={busy}>Cambiar archivo</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="mx-auto h-10 w-10 text-disabled-foreground" />
                  <p className="font-medium">Arrastra aquí el Excel de transacciones</p>
                  <Button type="button" variant="outline" onClick={() => document.getElementById("provider-backfill-file")?.click()}>Explorar archivos</Button>
                </div>
              )}
              <input
                id="provider-backfill-file"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <p className="mt-4 text-xs text-subtle-foreground">Columnas requeridas: ADMINISTRACIÓN, MONTO, FECHA, PROVEEDOR, FACTURA, TIPO DE PAGO y MONEDA.</p>
            </div>
          )}

          {errors.length > 0 && (
            <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Revisión necesaria</div>
              <ul className="list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          )}

          {isAnalyzing && (
            <div className="space-y-3 border p-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Leyendo y comparando el Excel…</span>
                {parsed && <span>{analyzed} de {parsed.transactionCount} transacciones</span>}
              </div>
              {parsed && <Progress value={analysisProgress} />}
            </div>
          )}

          {parsed && preview && !result && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="bg-background p-3 text-center"><strong className="text-2xl">{parsed.rowCount}</strong><p className="text-xs text-subtle-foreground">Filas</p></div>
                <div className="bg-background p-3 text-center"><strong className="text-2xl">{preview.counts.scanned}</strong><p className="text-xs text-subtle-foreground">Transacciones</p></div>
                <div className="bg-blue-50 p-3 text-center"><strong className="text-2xl text-blue-700">{newProviderCount}</strong><p className="text-xs text-blue-700">Proveedores nuevos</p></div>
                <div className="bg-green-50 p-3 text-center"><strong className="text-2xl text-green-700">{readyTransactionCount(preview)}</strong><p className="text-xs text-green-700">Se actualizarán</p></div>
                <div className="bg-amber-50 p-3 text-center"><strong className="text-2xl text-amber-800">{pendingCount(preview.counts)}</strong><p className="text-xs text-amber-800">Pendientes</p></div>
              </div>

              <div className="overflow-hidden border">
                <div className="border-b bg-background px-4 py-3"><h4 className="font-medium">Coincidencias encontradas</h4></div>
                <ScrollArea className="h-96">
                  {preview.rows.slice(0, PROVIDER_BACKFILL_PREVIEW_ROW_LIMIT).map((row) => (
                    <div key={row.source_key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b px-4 py-3 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.invoice} · {row.provider_name}</p>
                        <p className="text-xs text-subtle-foreground">{row.project_name} · {row.date} · {formatCurrency(row.amount_total, row.currency)} · filas {formatSourceRows(row.source_rows)}</p>
                        {row.project_match_mode === "alias" && row.matched_project_name && (
                          <p className="text-xs text-blue-700">Proyecto detectado: {row.matched_project_name}</p>
                        )}
                        {row.matched_provider_name && row.matched_provider_name !== row.provider_name && (
                          <p className="text-xs text-subtle-foreground">Catálogo: {row.matched_provider_name}</p>
                        )}
                        {row.match_mode === "historical_tolerance" && row.matched_transaction_date && (
                          <p className="text-xs text-blue-700">Coincidencia histórica: guardada el {row.matched_transaction_date} por {formatCurrency(row.matched_transaction_amount ?? row.amount_total, row.currency)}.</p>
                        )}
                        {(row.matched_transaction_count || 0) > 1 && (
                          <p className="text-xs text-blue-700">Se vincularán {row.matched_transaction_count} transacciones duplicadas idénticas.</p>
                        )}
                      </div>
                      <Badge variant="outline" className={statusClassName(row.status)}>{statusLabel(row.status)}</Badge>
                    </div>
                  ))}
                  {preview.rows.length > PROVIDER_BACKFILL_PREVIEW_ROW_LIMIT && (
                    <div className="border-t bg-background px-4 py-3 text-center text-xs text-muted-foreground">
                      Se muestran {PROVIDER_BACKFILL_PREVIEW_ROW_LIMIT.toLocaleString("es-MX")} de {preview.rows.length.toLocaleString("es-MX")} resultados para mantener ágil la vista. Los conteos incluyen todo el archivo.
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          )}

          {isSyncing && (
            <div className="space-y-3 border p-4">
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creando proveedores y actualizando vínculos…</span><span>{processed} de {syncCandidateCount} coincidencias</span></div>
              <Progress value={progress} />
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 border border-green-200 bg-green-50 p-4 text-green-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div><p className="font-medium">Actualización completada</p><p className="text-sm">No se creó ninguna transacción nueva.</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 p-3 text-center"><strong className="text-2xl text-blue-700">{result.counts.providers_created}</strong><p className="text-xs text-blue-700">Proveedores creados</p></div>
                <div className="bg-green-50 p-3 text-center"><strong className="text-2xl text-green-700">{result.counts.updated}</strong><p className="text-xs text-green-700">Transacciones vinculadas</p></div>
                <div className="bg-background p-3 text-center"><strong className="text-2xl">{result.counts.already_assigned}</strong><p className="text-xs text-subtle-foreground">Ya asignadas</p></div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          ) : preview ? (
            <>
              <Button variant="outline" onClick={() => resetFile(null)} disabled={busy}>Elegir otro archivo</Button>
              <Button onClick={handleSync} disabled={busy || readyCount(preview.counts) === 0}>
                Actualizar {readyTransactionCount(preview)} transacciones
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
              <Button onClick={analyzeFile} disabled={!file || busy}>{isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Analizar Excel</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
