import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { FileSpreadsheet, Download, Loader2, History } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { budgetOriginalUrl, useBudgetCreation } from "@/hooks/use-budget-creation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

function pages<T>(initial: T) { return [initial]; }
function PageControls({ cursors, setCursors, result }: { cursors: Array<string | null>; setCursors: (v: Array<string | null>) => void; result: { isDone: boolean; continueCursor: string } }) {
  return <div data-viewer-readonly-allow="true" className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
    <span>Página {cursors.length}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Anterior</Button>
      <Button variant="outline" size="sm" disabled={result.isDone} onClick={() => setCursors([...cursors, result.continueCursor])}>Siguiente</Button></div></div>;
}
function BudgetItems({ attemptId }: { attemptId: Id<"budget_creation_attempts"> }) {
  const [cursors, setCursors] = useState(pages<string | null>(null));
  const result = useQuery(api.budgetCreationHistory.items, { attempt_id: attemptId, paginationOpts: { cursor: cursors.at(-1)!, numItems: 25 } });
  if (!result) return <p role="status">Cargando registros…</p>;
  return <div className="space-y-2 pt-3">{result.page.map(item => {
    const snapshot = JSON.parse(item.snapshot_json);
    const row = snapshot.normalized;
    return <div key={item._id} className="border border-border p-3 text-xs leading-relaxed">
      <p className="font-medium">Registro interpretado {item.source_index + 1}{item.transaccion_id ? " · Pago semanal" : " · Partida"}{item.deleted ? " · Registro eliminado" : ""}</p>
      {row ? <><p className="break-words">{[row.partida_nombre || row.nombre, row.familia, row.sub_partida].filter(Boolean).join(" › ")}</p>
        <p>Cantidad: {row.cantidad} {row.unidad} · Precio unitario: {row.precio_unitario}</p><p>Original: {row.presupuesto_original} · Aprobado: {row.presupuesto_aprobado} · Pagado al importar: {row.pagado}</p></>
        : <p>Fecha: {snapshot.fecha} · Importe: {snapshot.amount} MXN · Referencia: Week-{snapshot.position} · Columna: {snapshot.columnLetter || "No informada"}</p>}
    </div>;
  })}<p className="text-xs text-muted-foreground">El número identifica el orden devuelto por el lector; no representa una fila física del Excel. Los valores corresponden al momento de la creación.</p>
    {(!result.isDone || cursors.length > 1) && <PageControls cursors={cursors} setCursors={setCursors} result={result} />}</div>;
}
export function BudgetAttemptCard({ attemptId }: { attemptId: Id<"budget_creation_attempts"> }) {
  const attempt = useQuery(api.budgetCreationHistory.get, { attempt_id: attemptId });
  const { getToken } = useAuth();
  const creation = useBudgetCreation();
  const [downloading, setDownloading] = useState(false);
  const [details, setDetails] = useState(false);
  if (!attempt) return <p role="status" className="text-sm text-muted-foreground">Cargando Excel de origen…</p>;
  const interrupted = attempt.status === "failed" || (attempt.status === "processing" && Date.now() - attempt.updated_at > 30 * 60 * 1000);
  const label = attempt.status === "completed" ? "Completada" : interrupted ? attempt.proyecto ? "Creación incompleta" : "Fallida" : attempt.status === "processing" ? "En proceso" : "Pendiente";
  const download = async () => {
    setDownloading(true);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Inicia sesión para descargar el Excel.");
      const response = await fetch(budgetOriginalUrl(attemptId), { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = attempt.file_name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error("No se pudo descargar el original", { description: error instanceof Error ? error.message : "Intenta de nuevo." }); }
    finally { setDownloading(false); }
  };
  return <article className="min-w-0 space-y-3 border border-border p-4 text-left">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 flex-1 gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><p className="min-w-0 break-words text-sm font-medium">{attempt.file_name}</p></div><Badge variant="outline">{label}</Badge></div>
    <p className="break-words text-xs text-muted-foreground">{attempt.form.nombre} · {attempt.created_by_name} · {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(attempt.created_at)}</p>
    <p className="text-xs text-muted-foreground">{attempt.partidas_created} de {attempt.row_count ?? "—"} partidas · {attempt.payments_created} de {attempt.payment_count ?? "—"} pagos semanales · {(attempt.size / 1024).toFixed(1)} KB</p>
    {attempt.error && <p role="status" className="break-words text-sm text-destructive">{attempt.error}</p>}
    {attempt.proyecto && attempt.status !== "completed" && <p className="text-xs text-muted-foreground">El proyecto conserva sus avances. Reanuda esta creación para completar el presupuesto; sus partidas y pagos están protegidos durante la carga.</p>}
    <div className="flex flex-wrap gap-2">
      {attempt.file_available ? <Button data-viewer-readonly-allow="true" variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Descargar Excel</Button>
        : <p className="text-xs text-muted-foreground">Archivo original no disponible. Vuelve a seleccionar el mismo archivo y formulario en Agregar proyecto para reintentar.</p>}
      {attempt.can_resume && attempt.file_available && attempt.status !== "completed" && <Button variant="outline" size="sm" disabled={creation.busy} onClick={async () => {
        try { const proyecto = await creation.resume(attemptId); if (proyecto) toast.success("Creación completada"); }
        catch (error) { toast.error("La creación sigue pendiente", { description: error instanceof Error ? error.message : "Puedes reanudarla." }); }
      }}>{creation.busy && <Loader2 className="h-4 w-4 animate-spin" />}{creation.busy ? "Creando…" : "Reanudar creación"}</Button>}
      {attempt.partidas_created > 0 && <Button data-viewer-readonly-allow="true" size="sm" variant="outline" onClick={() => setDetails(!details)} aria-expanded={details}>{details ? "Ocultar registros" : "Ver registros de origen"}</Button>}
    </div>
    {creation.busy && <Button size="sm" variant="quiet" onClick={creation.stop}>Pausar al terminar el paso actual</Button>}
    {!attempt.proyecto && <p className="text-xs text-muted-foreground">Los intentos sin proyecto se conservan durante 30 días desde su confirmación.</p>}
    {details && <BudgetItems attemptId={attemptId} />}
  </article>;
}
export function BudgetCreationHistory({ projectId }: { projectId?: Id<"desarrollos"> }) {
  const [cursors, setCursors] = useState(pages<string | null>(null));
  const result = useQuery(api.budgetCreationHistory.list, { proyecto: projectId, paginationOpts: { cursor: cursors.at(-1)!, numItems: 25 } });
  return <div className="min-w-0 space-y-3">{!result ? <p role="status" className="text-sm text-muted-foreground">Cargando creaciones…</p> : result.page.length ? result.page.map(attempt => <BudgetAttemptCard key={attempt._id} attemptId={attempt._id} />)
    : <p className="text-sm text-muted-foreground">{projectId ? "Archivo original no disponible. Este proyecto no tiene un Excel inicial respaldado." : "Todavía no hay creaciones registradas."}</p>}
    {result && (!result.isDone || cursors.length > 1) && <PageControls cursors={cursors} setCursors={setCursors} result={result} />}</div>;
}
export function BudgetOriginalDialog({ projectId }: { projectId?: Id<"desarrollos"> }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><Button variant="outline" onClick={() => setOpen(true)} data-viewer-readonly-allow="true"><History className="h-4 w-4" />{projectId ? "Excel de origen" : "Creaciones de proyectos"}</Button>
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{projectId ? "Excel del presupuesto inicial" : "Creaciones de proyectos"}</DialogTitle><DialogDescription>Consulta el archivo original, el avance y los registros generados al crear el proyecto.</DialogDescription></DialogHeader>
      {open && <BudgetCreationHistory key={projectId || "all"} projectId={projectId} />}</DialogContent></Dialog>;
}
export function BudgetRecordSource({ partidaId, transactionId }: { partidaId?: Id<"partidas">; transactionId?: Id<"transacciones"> }) {
  const source = useQuery(api.budgetCreationHistory.source, { partida_id: partidaId, transaccion_id: transactionId });
  if (!source) return <p role="status" className="p-4 text-sm text-muted-foreground">Cargando origen…</p>;
  if (!source.attempt_id && !source.legacy_name) return partidaId ? <p className="p-4 text-sm text-muted-foreground">No hay un Excel de origen registrado para este concepto.</p> : null;
  return <section className="min-w-0 space-y-3 border-t border-border px-4 py-5 sm:px-6"><h3 className="text-sm font-medium">Excel del presupuesto inicial</h3>
    {source.attempt_id ? <><BudgetAttemptCard attemptId={source.attempt_id} />{source.items.map(item => <p key={item._id} className="text-xs text-muted-foreground">Origen: registro interpretado {item.source_index + 1}{item.payment_index !== undefined ? ` · pago semanal ${item.payment_index + 1}` : ""}.</p>)}</>
      : <p className="break-words text-sm text-muted-foreground">{source.legacy_name} · Archivo original no disponible. Referencia histórica sin respaldo verificable.</p>}</section>;
}
