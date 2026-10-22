import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Download, FileSpreadsheet, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useIncomeImport } from "@/hooks/use-income-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type Attempt = NonNullable<FunctionReturnType<typeof api.incomeImportHistory.getAttempt>>;
type Metadata = Omit<Attempt, "can_resume" | "file_available">;
const timestamp = (value: number) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(value);
export const sourceRowLabel = (sourceRow: number | undefined, position: number) => sourceRow !== undefined ? `Fila reportada: ${sourceRow}` : `Registro ${position} de la respuesta · fila de Excel no informada`;

export function IncomeOriginal({ attempt, available }: { attempt: Metadata; available: boolean }) {
  const convex = useConvex();
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const { url, file_name } = await convex.query(api.incomeImportHistory.getDownloadUrl, { attempt_id: attempt._id });
      if (!url) throw new Error("Archivo original no disponible.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("No fue posible descargar el Excel original.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = objectUrl; link.download = file_name;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { toast.error("No se pudo descargar el Excel", { description: error instanceof Error ? error.message : "Intenta de nuevo." }); }
    finally { setDownloading(false); }
  };
  return available ? <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>
    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar Excel
  </Button> : <p className="text-xs text-muted-foreground">Archivo original no disponible</p>;
}

function MetadataCard({ attempt, available }: { attempt: Metadata; available: boolean }) {
  return <>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h3 className="break-all text-sm font-medium">{attempt.file_name}</h3><p className="mt-1 text-xs text-muted-foreground">{attempt.imported_by_name} · {timestamp(attempt.created_at)}</p></div>
      <Badge variant="outline" className="w-fit shrink-0">{{ processing: "En proceso", completed: "Completada", failed: "Fallida" }[attempt.status]}</Badge>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{(attempt.size / 1024).toFixed(1)} KB · {attempt.response_rows} registros devueltos · {attempt.rejected_rows} rechazados</p>
    {attempt.result && <div className="mt-2 text-sm"><p>{attempt.result.created} ingreso(s) creado(s)</p><p className="mt-1 tabular-nums">{attempt.result.amounts.map(amount => formatCurrency(amount.monto, amount.moneda)).join(" · ")}</p></div>}
    {attempt.parser_summary && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Resumen reportado por el lector</summary><p className="mt-2">{attempt.parser_summary.totalRows} filas reportadas; {attempt.parser_summary.validRows} válidas y {attempt.parser_summary.errors} errores según el lector. Solo se dispone del detalle de los registros devueltos.</p></details>}
    <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Referencia del archivo</summary><p className="mt-2 break-all">SHA-256: {attempt.file_hash}</p></details>
    {attempt.error && <p className="mt-3 break-words text-sm text-destructive" role="status">{attempt.error}</p>}
    <div className="mt-3"><IncomeOriginal attempt={attempt} available={available} /></div>
  </>;
}

function Pages({ page, loading, done, previous, next }: { page: number; loading: boolean; done: boolean; previous: () => void; next: () => void }) {
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><span>Página {page}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || page === 1} onClick={previous}>Anterior</Button><Button variant="outline" size="sm" disabled={loading || done} onClick={next}>Siguiente</Button></div></div>;
}

function AttemptItems({ attemptId }: { attemptId: Id<"income_import_attempts"> }) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const result = useQuery(api.incomeImportHistory.listAttemptItems, { attempt_id: attemptId, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 } });
  return <div className="mt-3 border-t border-border pt-3">
    <p className="text-xs text-muted-foreground">Valores al confirmar la carga. Las filas que el lector no devolvió no tienen detalle disponible.</p>
    {!result ? <p role="status" className="py-3 text-sm">Cargando registros...</p> : <ul className="divide-y divide-border">{result.page.map(item => <li key={item._id} className="min-w-0 py-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span className="break-words">{item.descripcion || "Sin descripción"}</span><span className="tabular-nums">{formatCurrency(item.monto, item.moneda)}</span></div>
      <p className="mt-1 text-xs text-muted-foreground">{item.fecha || "Sin fecha"} · {item.outcome === "created" ? "Creado" : item.outcome === "rejected" ? "Rechazado" : "Pendiente"}{item.deleted ? " · Ingreso eliminado" : item.modified ? " · Ingreso modificado después de la carga" : ""}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sourceRowLabel(item.source_row, item.position)}</p>
      {item.errors.length > 0 && <p className="mt-1 break-words text-xs text-destructive">{item.errors.join(" · ")}</p>}
      <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Valores devueltos por el lector</summary><pre className="mt-2 whitespace-pre-wrap break-all font-mono">{item.raw_json}</pre></details>
    </li>)}</ul>}
    <Pages page={cursors.length} loading={!result} done={result?.isDone ?? true} previous={() => setCursors(cursors.slice(0, -1))} next={() => result && setCursors([...cursors, result.continueCursor])} />
  </div>;
}

function ResumeAttempt({ attempt, userId }: { attempt: Attempt; userId: string }) {
  const [file, setFile] = useState<File>();
  const workflow = useIncomeImport(attempt.proyecto, userId, result => toast.success("Carga recuperada", { description: `${result.created} ingreso(s) creado(s).` }));
  return <div className="mt-3 space-y-3 border-t border-border pt-3">
    {!attempt.file_available && <div><label htmlFor={`resume-${attempt._id}`} className="text-xs text-muted-foreground">Selecciona el mismo Excel para completar su respaldo</label><Input id={`resume-${attempt._id}`} type="file" accept=".xlsx,.xls,.xlsm" disabled={workflow.busy} onChange={event => setFile(event.target.files?.[0])} /></div>}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={workflow.busy || (!attempt.file_available && !file)} onClick={() => void workflow.run({ attemptId: attempt._id, file })}>{workflow.busy ? "Recuperando..." : "Continuar carga"}</Button><Button variant="outline" size="sm" disabled={workflow.busy} onClick={() => void workflow.cancel(attempt._id).catch(error => toast.error(error.message))}>Descartar intento</Button></div>
    {workflow.error && <p className="break-words text-sm text-destructive" role="alert">{workflow.error}</p>}
  </div>;
}

export function IncomeImportHistoryDialog({ projectId }: { projectId: Id<"desarrollos"> }) {
  const user = useQuery(api.users.getCurrentUser);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const result = useQuery(api.incomeImportHistory.listHistory, open ? { proyecto: projectId, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 } } : "skip");
  return <>
    <Button variant="outline" size="sm" onClick={() => { setCursors([null]); setExpandedId(null); setOpen(true); }}><History className="h-4 w-4" /> Historial de cargas</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent data-square-modal="" variant="ledger" className="flex flex-col"><DialogHeader variant="ledger"><DialogTitle>Historial de cargas de ingresos</DialogTitle><DialogDescription>Excel originales e intentos confirmados de este proyecto, del más reciente al más antiguo.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
        {!result ? <p className="py-8 text-sm" role="status">Cargando historial...</p> : result.page.length === 0 ? <p className="py-8 text-sm text-muted-foreground">Todavía no hay cargas en el historial. Los ingresos anteriores no tienen información de archivo de origen.</p> : <div className="space-y-3">{result.page.map(attempt => <article key={attempt._id} className="min-w-0 border border-border bg-card p-4">
          <MetadataCard attempt={attempt} available={attempt.file_available} />
          <Button variant="ghost" size="sm" className="mt-2" aria-expanded={expandedId === attempt._id} onClick={() => setExpandedId(expandedId === attempt._id ? null : attempt._id)}>{expandedId === attempt._id ? "Ocultar registros" : "Ver registros"}</Button>
          {expandedId === attempt._id && <AttemptItems key={attempt._id} attemptId={attempt._id} />}
          {attempt.can_resume && user && <ResumeAttempt attempt={attempt} userId={user._id} />}
        </article>)}</div>}
        <Pages page={cursors.length} loading={!result} done={result?.isDone ?? true} previous={() => { setExpandedId(null); setCursors(cursors.slice(0, -1)); }} next={() => { if (result) { setExpandedId(null); setCursors([...cursors, result.continueCursor]); } }} />
      </div>
    </DialogContent></Dialog>
  </>;
}

export function IngresoSourceDialog({ ingresoId }: { ingresoId: Id<"ingresos"> }) {
  const [open, setOpen] = useState(false);
  const source = useQuery(api.incomeImportHistory.getIngresoSource, open ? { ingreso_id: ingresoId } : "skip");
  return <><Button variant="quiet" size="iconXs" aria-label="Archivo Excel de origen" title="Archivo Excel de origen" onClick={() => setOpen(true)}><FileSpreadsheet className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent variant="ledger" data-square-modal=""><DialogHeader variant="ledger"><DialogTitle>Archivo Excel de origen</DialogTitle><DialogDescription>Respaldo y valores registrados al importar este ingreso.</DialogDescription></DialogHeader><div className="overflow-y-auto p-4 sm:p-6">
      {source === undefined ? <p role="status">Cargando origen...</p> : source === null ? <p className="text-sm text-muted-foreground">Sin información de archivo de origen. No se guardó una relación comprobable para este ingreso.</p> : <><MetadataCard attempt={source.attempt} available={source.file_available} /><div className="mt-4 border-t border-border pt-3"><p className="text-sm">Valor al importar: {formatCurrency(source.item.monto, source.item.moneda)} · {source.item.fecha}</p><p className="mt-1 break-words text-sm">{source.item.descripcion || "Sin descripción"}</p><p className="mt-2 text-xs text-muted-foreground">{sourceRowLabel(source.item.source_row, source.item.position)}</p></div></>}
    </div></DialogContent></Dialog>
  </>;
}

