import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { IncomeImportResult } from "../../../convex/incomeImportValidators";
import { incomeFileError, parseIncomeReview, type IncomeReviewRow } from "../../../convex/incomeImportRules";
import { readIncomePending, useIncomeImport } from "@/hooks/use-income-import";
import { hashFile } from "@/lib/transactionImport";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IncomeImportHistoryDialog, sourceRowLabel } from "./IncomeImportHistory";

const ENDPOINT = "https://ogc-excel-reader.vercel.app/upload/ingresos";

export function IncomeBulkUpload({ projectId, userId, onBack }: { projectId: Id<"desarrollos">; userId: string; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [reviewJson, setReviewJson] = useState<string | null>(null);
  const [rows, setRows] = useState<IncomeReviewRow[] | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IncomeImportResult | null>(null);
  const [repeatAccepted, setRepeatAccepted] = useState(false);
  const validationRef = useRef(0);
  const workflow = useIncomeImport(projectId, userId, setResult);
  const pendingRequest = readIncomePending(projectId, userId);
  const pending = useQuery(api.incomeImportHistory.getRequestAttempt, pendingRequest ? { proyecto: projectId, request_id: pendingRequest } : "skip");
  const previous = useQuery(api.incomeImportHistory.findPreviousFile, fileHash ? { proyecto: projectId, file_hash: fileHash } : "skip");
  const busy = validating || workflow.busy;
  const select = (selected: File | null) => {
    validationRef.current++;
    setReviewJson(null); setRows(null); setFileHash(null); setResult(null); setRepeatAccepted(false);
    const issue = selected ? incomeFileError(selected) : null;
    setError(issue); setFile(issue ? null : selected);
  };
  const validate = async () => {
    if (!file || busy) return;
    const version = ++validationRef.current;
    setValidating(true); setError(null); setRows(null); setReviewJson(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("proyecto_id", projectId);
      const response = await fetch(ENDPOINT, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.message || data.error || "No se pudieron leer los ingresos.");
      const json = JSON.stringify({ ingresos: Array.isArray(data.ingresos) ? data.ingresos : [], ...(data.summary ? { summary: data.summary } : {}) });
      const parsed = parseIncomeReview(json);
      const hash = await hashFile(file);
      if (version === validationRef.current) { setRows(parsed.rows); setReviewJson(json); setFileHash(hash); setRepeatAccepted(false); }
    } catch (cause) { if (version === validationRef.current) setError(cause instanceof Error ? cause.message : "No se pudo validar el Excel."); }
    finally { if (version === validationRef.current) setValidating(false); }
  };
  const validCount = rows?.filter(row => row.status === "valid").length || 0;
  return <div>
    <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3"><div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:flex-1"><Button variant="outline" size="icon" className="shrink-0" aria-label="Volver a ingresos" disabled={busy} onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0"><h3 className="text-sm font-medium">Carga masiva</h3><p className="text-xs text-muted-foreground">El Excel original se guardará al confirmar.</p></div></div><IncomeImportHistoryDialog projectId={projectId} /></div>
    <div className="space-y-4 p-4 sm:p-6">
      {result ? <div className="space-y-4"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /><div><h3 className="text-sm font-medium">Carga masiva completada</h3><p className="mt-1 text-sm">{result.created} ingreso(s) creado(s), {result.rejected} registro(s) rechazado(s) de la respuesta del lector.</p><p className="mt-1 text-xs text-muted-foreground">El Excel original y sus registros están en el historial.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => select(null)}>Nueva carga</Button><Button onClick={onBack}>Volver a ingresos</Button></div></div> : <>
        {pendingRequest && <div className="space-y-2 border border-border bg-muted/40 p-3"><p className="break-words text-sm">Hay una confirmación anterior por revisar{pending ? `: ${pending.file_name}` : "."}</p><p className="text-xs text-muted-foreground">Recupera su resultado o continúa el mismo intento antes de iniciar otra carga. Si falta el respaldo, selecciona el mismo Excel.</p><Button variant="outline" size="sm" disabled={busy || pending === undefined} onClick={() => void workflow.run({ file: file || undefined, reviewJson: reviewJson || undefined })}>Recuperar carga anterior</Button></div>}
        <div className="space-y-2"><label htmlFor="income-bulk-file" className="text-sm font-medium">Archivo Excel</label><p className="text-xs text-muted-foreground">.xlsx, .xls o .xlsm · hasta 10 MB y 1,000 registros devueltos por el lector.</p>
          {file ? <div className="flex items-center gap-3 border border-border p-3"><FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p></div><Button variant="quiet" size="iconSm" aria-label="Quitar archivo" disabled={busy} onClick={() => select(null)}><X className="h-4 w-4" /></Button></div> : <Input id="income-bulk-file" type="file" accept=".xlsx,.xls,.xlsm" disabled={busy} onChange={event => select(event.target.files?.[0] || null)} />}
        </div>
        {file && !rows && <Button disabled={busy} onClick={() => void validate()}>{validating && <Loader2 className="h-4 w-4 animate-spin" />}{validating ? "Validando..." : "Validar archivo"}</Button>}
        {rows && <div className="space-y-3"><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{rows.length} registros devueltos</span><span>{validCount} válidos</span><span>{rows.length - validCount} con errores</span></div>
          {rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No se encontraron registros para cargar.</p> : <div className="max-h-80 overflow-auto border border-border"><Table><TableHeader><TableRow variant="ledgerHeader"><TableHead variant="ledger">Origen</TableHead><TableHead variant="ledger">Fecha</TableHead><TableHead variant="ledger">Descripción</TableHead><TableHead variant="ledger" className="text-right">Monto</TableHead><TableHead variant="ledger">Estado</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.position} variant={row.status === "invalid" ? "ledgerInvalid" : "ledger"}><TableCell variant="ledgerCompactSubtle" className="min-w-40">{sourceRowLabel(row.rowIndex, row.position)}</TableCell><TableCell variant="ledgerCompactEmphasis" className="whitespace-nowrap">{row.fecha || "—"}</TableCell><TableCell variant="ledgerCompactMuted" className="min-w-40">{row.descripcion || "—"}</TableCell><TableCell variant="ledgerCompactEmphasis" className="whitespace-nowrap text-right">{formatCurrency(row.monto, row.moneda)}</TableCell><TableCell variant="ledgerCompact" className="min-w-40">{row.status === "valid" ? "Válido" : row.errors.join(" · ")}</TableCell></TableRow>)}</TableBody></Table></div>}
          {previous && <label className="flex items-start gap-2 border border-border bg-muted/40 p-3 text-sm"><input type="checkbox" className="mt-1 shrink-0" disabled={busy} checked={repeatAccepted} onChange={event => setRepeatAccepted(event.target.checked)} /><span>Este Excel ya se cargó. Confirmo una nueva carga que agregará ingresos otra vez.</span></label>}
          <p className="text-xs text-muted-foreground">Se crearán los registros válidos. Se conservarán los errores y las referencias que devolvió el lector; su respuesta puede no incluir todas las filas físicas del Excel.</p>
          <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onBack}>Cancelar</Button><Button disabled={busy || !validCount || previous === undefined || Boolean(previous && !repeatAccepted) || Boolean(pendingRequest)} onClick={() => file && reviewJson && void workflow.run({ file, reviewJson })}>{workflow.busy ? "Guardando respaldo e ingresos..." : `Cargar ${validCount} ingreso(s)`}</Button></div>
        </div>}
        {(error || workflow.error) && <p className="break-words text-sm text-destructive" role="alert">{error || workflow.error}</p>}
      </>}
    </div>
  </div>;
}
