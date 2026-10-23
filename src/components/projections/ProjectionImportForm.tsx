import { useRef, useState } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProjectionResult, ProjectionTarget } from "../../../convex/projectionImportValidators";
import { normalizeProjectionResponse, projectionDate, projectionFileError, projectionHash, projectionReviewHash, projectionSummary, PROJECTION_READER,
  type ProjectionFormat, type ProjectionReview } from "../../../convex/projectionImportRules";
import { Button } from "@/components/ui/button";

const money = (value: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
function savedRequest(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }
function saveRequest(key: string, value: string | null) { try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* The in-memory request remains usable. */ } }

export function ProjectionImportForm({ target, format, projectName, onBusyChange }: {
  target: ProjectionTarget; format: ProjectionFormat; projectName: string; onBusyChange?: (busy: boolean) => void;
}) {
  const convex = useConvex();
  const start = useMutation(api.projectionImportHistory.startAttempt);
  const attach = useMutation(api.projectionImportHistory.attachFile);
  const fail = useMutation(api.projectionImportHistory.failAttempt);
  const confirm = useAction(api.projectionImports.confirmImport);
  const input = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const request = useRef<string | null>(null);
  const uploadedId = useRef<Id<"_storage"> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ review: ProjectionReview; hash: string; reviewHash: string; revision: string } | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [retry, setRetry] = useState(false);
  const busy = phase !== null;
  const phaseChange = (value: string | null) => { setPhase(value); onBusyChange?.(value !== null); };
  const select = async (selected: File) => {
    if (processing.current) return;
    processing.current = true;
    setFile(selected); setPreview(null); setResult(null); setError(""); setRetry(false); request.current = null; uploadedId.current = null;
    phaseChange("Validando Excel...");
    try {
      const fileError = projectionFileError(selected);
      if (fileError) throw new Error(fileError);
      const state = await convex.query(api.projectionImportHistory.getCurrentState, { target });
      const form = new FormData(); form.append("file", selected);
      const response = await fetch(`${PROJECTION_READER}${format}`, { method: "POST", body: form, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error("No fue posible validar el Excel. Intenta de nuevo.");
      const review = normalizeProjectionResponse(await response.json(), format);
      setPreview({ review, hash: await projectionHash(await selected.arrayBuffer()), reviewHash: await projectionReviewHash(review), revision: state.revision });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible validar el archivo."); }
    finally { processing.current = false; phaseChange(null); }
  };
  const showResult = (value: ProjectionResult, key: string) => {
    setResult(value); setError(""); setRetry(false); saveRequest(key, null); request.current = null; uploadedId.current = null;
  };
  const submit = async () => {
    if (processing.current || !file || !preview || result) return;
    processing.current = true; setError("");
    phaseChange("Guardando el Excel original...");
    const key = `ogc-projection:${target.kind}:${target.project_id}:${format}:${encodeURIComponent(file.name)}:${encodeURIComponent(file.type)}:${preview.hash}:${preview.reviewHash}`;
    let attemptId: Id<"projection_import_attempts"> | null = null;
    let definiteTransferFailure = false;
    try {
      request.current ||= savedRequest(key) || crypto.randomUUID();
      saveRequest(key, request.current);
      const started = await start({ target, format, request_id: request.current, file_name: file.name, file_hash: preview.hash,
        size: file.size, content_type: file.type || "application/octet-stream", review_hash: preview.reviewHash, expected_revision: preview.revision });
      attemptId = started.attempt_id;
      if (started.result) { showResult(started.result, key); return; }
      if (started.status !== "processing") throw new Error("El intento anterior terminó. Confirma una nueva carga.");
      if (started.upload_url) {
        if (!uploadedId.current) {
          const response = await fetch(started.upload_url, { method: "POST", body: file, headers: { "Content-Type": started.upload_content_type } });
          if (!response.ok) { definiteTransferFailure = true; throw new Error("No fue posible guardar el original. Las proyecciones no se modificaron."); }
          const { storageId } = await response.json();
          if (typeof storageId !== "string") { definiteTransferFailure = true; throw new Error("No se recibió la referencia del respaldo."); }
          uploadedId.current = storageId as Id<"_storage">;
        }
        await attach({ attempt_id: attemptId, storage_id: uploadedId.current });
      }
      phaseChange("Verificando el original e importando proyecciones...");
      showResult(await confirm({ attempt_id: attemptId }), key);
    } catch (cause) {
      let message = cause instanceof Error ? cause.message : "No fue posible completar la carga.";
      if (attemptId) {
        try {
          if (definiteTransferFailure) await fail({ attempt_id: attemptId, error: message });
          const attempt = await convex.query(api.projectionImportHistory.getAttempt, { attempt_id: attemptId });
          if (attempt.result) { showResult(attempt.result, key); return; }
          if (attempt.status !== "processing") {
            saveRequest(key, null); request.current = null; uploadedId.current = null; setRetry(false);
            message = attempt.error || message;
          } else setRetry(true);
        } catch { setRetry(true); }
      } else setRetry(true);
      setError(`${message} Consulta el resultado en Historial de cargas.`);
    } finally { processing.current = false; phaseChange(null); }
  };
  const summary = preview ? projectionSummary(preview.review.rows) : null;
  return <section className="min-w-0 space-y-4" aria-label="Importar proyecciones">
    <div className="border border-dashed border-border-strong p-5 text-center" onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (!busy && event.dataTransfer.files[0]) void select(event.dataTransfer.files[0]); }}>
      <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{file?.name || "Selecciona o arrastra un Excel"}</p>
      <p className="mt-1 text-xs text-muted-foreground">.xlsx o .xls · Hasta 10 MB · {projectName}</p>
      <input ref={input} aria-label="Archivo Excel de proyecciones" type="file" accept=".xlsx,.xls" className="sr-only" disabled={busy}
        onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void select(selected); }} />
      <Button type="button" variant="outline" className="mt-3 rounded-none" disabled={busy} onClick={() => input.current?.click()}>{file ? "Cambiar archivo" : "Elegir Excel"}</Button>
    </div>
    {phase && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{phase}</p>}
    {error && <div className="space-y-2"><p role="alert" className="break-words border border-destructive/30 p-3 text-sm text-destructive">{error}</p>{file && !busy && <Button type="button" variant="outline" className="rounded-none" onClick={() => void select(file)}>Validar de nuevo</Button>}</div>}
    {preview && summary && !result && <div className="space-y-3 border border-border p-4">
      <h3 className="text-sm font-medium">Revisar antes de confirmar</h3>
      <p className="break-words text-xs text-muted-foreground">Proyecto: {projectName} · Hoja: {preview.review.sheet_name || "No informada"}</p>
      <div className="grid grid-cols-2 gap-3 text-sm"><p>{summary.rows} {summary.rows === 1 ? "partida" : "partidas"}</p><p>{summary.weeks} {summary.weeks === 1 ? "período" : "períodos"}</p><p className="col-span-2 tabular-nums">Importe proyectado: {money(summary.amount)}</p></div>
      <p className="text-xs text-muted-foreground">{projectionDate(summary.start_week)} – {projectionDate(summary.end_week)} · {summary.cells} proyecciones semanales</p>
      <details className="text-xs"><summary className="cursor-pointer">Ver partidas del archivo</summary><ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {preview.review.rows.map((row, index) => <li key={index} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2"><span className="break-words">{row.partida}{row.rowIndex !== undefined && ` · Fila ${row.rowIndex}`}</span><span className="tabular-nums">{money(row.weeklyProjections.reduce((sum, cell) => sum + cell.amount, 0))}</span></li>)}
      </ul></details>
      <p className="border-t border-border pt-3 text-sm">Al confirmar, estas cifras reemplazarán todas las proyecciones vigentes. Los Excel anteriores permanecerán en el historial.</p>
      <Button type="button" className="w-full rounded-none sm:w-auto" disabled={busy} onClick={() => void submit()}><Upload className="h-4 w-4" />{retry ? "Reintentar confirmación" : "Confirmar carga"}</Button>
    </div>}
    {result && <div role="status" className="space-y-2 border border-border p-4"><h3 className="font-medium">{result.outcome === "unchanged" ? "Carga registrada sin cambios" : "Proyecciones guardadas"}</h3>
      <p className="text-sm">{result.rows} {result.rows === 1 ? "partida" : "partidas"} · {result.cells} proyecciones · {money(result.amount)}</p><p className="text-xs text-muted-foreground">El Excel original y el resultado están disponibles en el historial.</p></div>}
    {!preview && !busy && <p className="text-xs text-muted-foreground">La validación no modifica las cifras ni crea historial. El intento se registra al confirmar.</p>}
  </section>;
}
