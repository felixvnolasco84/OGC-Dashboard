import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Download, History, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { ProjectionTarget } from "../../../convex/projectionImportValidators";
import { projectionDate } from "../../../convex/projectionImportRules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const money = (value: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
function OriginalDownload({ attemptId, available }: { attemptId: Id<"projection_import_attempts">; available: boolean }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const file = await convex.query(api.projectionImportHistory.getDownloadUrl, { attempt_id: attemptId });
      if (!file.url) throw new Error("Original no disponible.");
      const response = await fetch(file.url);
      if (!response.ok) throw new Error("No fue posible descargar el Excel.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = file.file_name;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible descargar el Excel."); }
    finally { setBusy(false); }
  };
  if (!available) return <p className="text-xs text-muted-foreground">Archivo original no disponible</p>;
  return <div className="space-y-2"><Button type="button" size="sm" variant="outline" className="rounded-none" disabled={busy} onClick={() => void download()}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Descargar Excel
  </Button>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
function PageControls({ page, done, loading, previous, next }: { page: number; done: boolean; loading: boolean; previous: () => void; next: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted-foreground"><span>Página {page}</span><div className="flex gap-2">
    <Button type="button" size="sm" variant="outline" className="rounded-none" disabled={page === 1 || loading} onClick={previous}><ChevronLeft className="h-4 w-4" />Anterior</Button>
    <Button type="button" size="sm" variant="outline" className="rounded-none" disabled={done || loading} onClick={next}>Siguiente<ChevronRight className="h-4 w-4" /></Button>
  </div></div>;
}
function SnapshotRow({ row }: { row: Doc<"projection_import_items">["row"] }) {
  return <article className="min-w-0 space-y-2 border-t border-border py-3"><p className="break-words text-sm font-medium">{row.partida}{row.rowIndex !== undefined && <span className="font-normal text-muted-foreground"> · Fila {row.rowIndex}</span>}</p>
    {(row.total !== undefined || row.declaredTotal !== undefined || row.calculatedTotal !== undefined) && <p className="break-words text-xs text-muted-foreground">
      {[row.total !== undefined ? `Total recibido: ${money(row.total)}` : "", row.declaredTotal !== undefined ? `Total declarado: ${money(row.declaredTotal)}` : "", row.calculatedTotal !== undefined ? `Total calculado: ${money(row.calculatedTotal)}` : ""].filter(Boolean).join(" · ")}
    </p>}
    <ul className="space-y-1 text-xs">{row.weeklyProjections.map((cell, index) => <li key={index} className="flex flex-wrap justify-between gap-2"><span>{projectionDate(cell.week)}{cell.columnLetter && ` · Columna ${cell.columnLetter}`}</span><span className="tabular-nums">{money(cell.amount)}</span></li>)}</ul>
  </article>;
}
function AttemptItems({ id, legacy }: { id: Id<"projection_import_attempts">; legacy: boolean }) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const data = useQuery(api.projectionImportHistory.listAttemptItems, { attempt_id: id, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 } });
  return <div className="mt-3"><p className="mb-2 text-xs text-muted-foreground">{legacy ? "Cifras existentes al incorporar el historial; las coordenadas originales no están disponibles." : "Valores incluidos en este Excel al confirmar. Las coordenadas se muestran cuando el lector las proporcionó."}</p>
    {!data ? <p role="status">Cargando valores...</p> : data.page.map(item => <SnapshotRow key={item._id} row={item.row} />)}
    <PageControls page={cursors.length} done={data?.isDone ?? true} loading={!data} previous={() => setCursors(current => current.slice(0, -1))}
      next={() => data && setCursors(current => [...current, data.continueCursor])} /></div>;
}
function AttemptCard({ attempt }: { attempt: Doc<"projection_import_attempts"> & { active: boolean; file_available: boolean } }) {
  const [expanded, setExpanded] = useState(false);
  const label = { processing: "En proceso", completed: attempt.result?.outcome === "replaced" ? "Actualizada" : "Completada", unchanged: "Sin cambios", failed: "Fallida", legacy: "Histórica" }[attempt.status];
  return <article className="min-w-0 space-y-3 border border-border bg-card p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="break-words text-sm font-medium [overflow-wrap:anywhere]">{attempt.file_name}</h3>
      <p className="mt-1 break-words text-xs text-muted-foreground">{attempt.imported_by_name} · {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(attempt.created_at)}</p></div>
      <div className="flex shrink-0 flex-wrap gap-2"><Badge variant="outline" className="w-fit rounded-none">{label}</Badge>{attempt.active && <Badge variant="outline" className="w-fit rounded-none">Vigente</Badge>}</div></div>
    <p className="break-words text-xs text-muted-foreground">Hoja: {attempt.sheet_name || "No informada"}{attempt.size !== undefined && ` · ${(attempt.size / 1024).toFixed(1)} KB`}</p>
    {attempt.result && <p className="text-sm">{attempt.result.rows} {attempt.result.rows === 1 ? "partida" : "partidas"} · {attempt.result.weeks} {attempt.result.weeks === 1 ? "período" : "períodos"} · {money(attempt.result.amount)}</p>}
    {attempt.status === "legacy" && <p className="text-xs text-muted-foreground">Metadatos anteriores al respaldo. Se desconoce el autor y no se conserva el resultado original de la carga.</p>}
    {attempt.error && <p className="break-words text-sm text-destructive">{attempt.error}</p>}
    {attempt.file_hash && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Referencia del archivo</summary><p className="mt-2 break-all">SHA-256: {attempt.file_hash}</p></details>}
    <OriginalDownload attemptId={attempt._id} available={attempt.file_available} />
    {(attempt.result || attempt.status === "legacy") && <Button type="button" size="sm" variant="ghost" className="rounded-none" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Ocultar valores" : "Ver valores importados"}</Button>}
    {expanded && <AttemptItems id={attempt._id} legacy={attempt.status === "legacy"} />}
  </article>;
}
export function ProjectionImportHistory({ target }: { target: ProjectionTarget }) {
  const [open, setOpen] = useState(false);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const data = useQuery(api.projectionImportHistory.listHistory, open ? { target, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 } } : "skip");
  return <><Button type="button" variant="outline" className="rounded-none" onClick={() => { setCursors([null]); setOpen(true); }}><History className="h-4 w-4" />Historial de cargas</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent variant="ledger" className="flex flex-col"><DialogHeader variant="ledger"><DialogTitle>Historial de proyecciones de {target.kind === "expense" ? "gasto" : "cobro"}</DialogTitle>
      <DialogDescription>Excel originales e intentos confirmados del proyecto, del más reciente al más antiguo.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6">{!data ? <p role="status">Cargando historial...</p> : data.page.length ? <div className="space-y-3">{data.page.map(attempt => <AttemptCard key={attempt._id} attempt={attempt} />)}</div> : <p className="py-6 text-sm text-muted-foreground">Todavía no hay cargas en el historial.</p>}
        <PageControls page={cursors.length} loading={!data} done={data?.isDone ?? true} previous={() => setCursors(current => current.slice(0, -1))}
          next={() => data && setCursors(current => [...current, data.continueCursor])} />
      </div></DialogContent></Dialog></>;
}
export function ProjectionSource({ target, week, partida }: { target: ProjectionTarget; week?: number; partida?: string }) {
  const [open, setOpen] = useState(false);
  const data = useQuery(api.projectionImportHistory.getCurrentSource, open ? { target, week, partida } : "skip");
  return <><Button type="button" size="sm" variant="ghost" className="rounded-none text-xs" onClick={() => setOpen(true)}>Ver origen{week === undefined ? " vigente" : ""}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent variant="ledger" className="flex flex-col"><DialogHeader variant="ledger"><DialogTitle>Excel de origen{week !== undefined ? ` · ${projectionDate(week)}` : ""}</DialogTitle><DialogDescription>Archivo y valores que respaldan las proyecciones vigentes.</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">{!data ? <p role="status">Cargando origen...</p> : data.attempt ? <><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{data.attempt.file_name}</p><OriginalDownload attemptId={data.attempt._id} available={data.file_available} />{data.rows.map((row, index) => <SnapshotRow key={index} row={row} />)}</>
        : <><p className="text-sm text-muted-foreground">Archivo original no disponible para estas proyecciones anteriores al historial.</p>{data.legacy_file_names.map(name => <p key={name} className="break-all text-sm">{name}</p>)}</>}</div>
    </DialogContent></Dialog></>;
}
