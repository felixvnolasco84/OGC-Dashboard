import { useState, type ReactNode } from "react";
import { useConvex, useQuery } from "convex/react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { Infer } from "convex/values";
import type { programImportTargetValidator } from "../../../convex/programaObraImportValidators";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ProgramImportTarget = Infer<typeof programImportTargetValidator>;
type Attempt = Omit<Doc<"programa_obra_import_attempts">, "reviewed_json">;
const time = (value: number) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(value);
const label = (attempt: Attempt) => attempt.status === "completed" ? attempt.result?.status === "updated" ? "Actualizada" : "Completada"
  : ({ processing: "En proceso", unchanged: "Sin cambios", failed: "Fallida", legacy: "Histórica" })[attempt.status];

function Pager({ cursors, result, setCursors }: {
  cursors: Array<string | null>; result?: { isDone: boolean; continueCursor: string }; setCursors: (value: Array<string | null>) => void;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
    <span>Página {cursors.length}</span><div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={!result || cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Anterior</Button>
      <Button variant="outline" size="sm" disabled={!result || result.isDone} onClick={() => result && setCursors([...cursors, result.continueCursor])}>Siguiente</Button>
    </div>
  </div>;
}
function DownloadOriginal({ id, available }: { id: Id<"programa_obra_import_attempts">; available: boolean }) {
  const convex = useConvex(); const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { url, file_name } = await convex.query(api.programaObraImportHistory.getDownloadUrl, { attempt_id: id });
      if (!url) throw new Error("Archivo original no disponible.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("No fue posible descargar el Excel.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = blobUrl; link.download = file_name;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) { toast.error("No se pudo descargar el original", { description: error instanceof Error ? error.message : "Intenta de nuevo." }); }
    finally { setBusy(false); }
  };
  return available ? <Button variant="outline" size="sm" data-viewer-readonly-allow="true" disabled={busy} onClick={() => void download()}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar Excel
  </Button> : <p className="text-xs text-muted-foreground">Archivo original no disponible</p>;
}
function AttemptCard({ attempt, available, children }: { attempt: Attempt; available: boolean; children?: ReactNode }) {
  return <article className="min-w-0 space-y-3 border border-border bg-card p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h3 className="flex items-start gap-2 text-sm font-medium"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-all">{attempt.source?.file_name ?? "Revisión histórica de importación"}</span></h3>
        <p className="mt-1 text-xs text-muted-foreground">{attempt.imported_by_name} · {time(attempt.created_at)}</p></div>
      <Badge variant="outline" className="w-fit shrink-0 rounded-none">{label(attempt)}</Badge>
    </div>
    {attempt.source && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Referencia del archivo{attempt.size != null && ` · ${(attempt.size / 1024).toFixed(1)} KB`}</summary>
      {attempt.source.sheet_name && <p className="mt-2 break-words">Hoja informada por el lector: {attempt.source.sheet_name}</p>}
      <p className="mt-2 break-all">SHA-256: {attempt.source.file_hash}</p>
    </details>}
    {attempt.result && <p className="text-sm">{attempt.result.created} {attempt.result.created === 1 ? "alta" : "altas"} · {attempt.result.updated} {attempt.result.updated === 1 ? "actualización" : "actualizaciones"} · {attempt.result.unchanged} {attempt.result.unchanged === 1 ? "fila sin cambios" : "filas sin cambios"}{attempt.result.activity_effects > 0 && ` · ${attempt.result.activity_effects} ${attempt.result.activity_effects === 1 ? "efecto en actividades" : "efectos en actividades"}`}</p>}
    {attempt.status === "legacy" && <p className="text-xs text-muted-foreground">Se conserva la revisión aplicada. No se guardó el archivo original de esa importación.</p>}
    {attempt.error && <p className="break-words text-sm text-destructive">{attempt.error}</p>}
    <DownloadOriginal id={attempt._id} available={available} />{children}
  </article>;
}
const valueFields: Array<[string, string]> = [
  ["partida", "Partida"], ["familia", "Familia"], ["subpartida", "Subpartida"], ["name", "Actividad"],
  ["fecha_inicio", "Inicio"], ["fecha_fin", "Fin"], ["anticipo_fecha", "Anticipo"], ["anticipo_porcentaje", "Anticipo (%)"],
  ["suministro_fecha", "Suministro"], ["finiquito_fecha", "Finiquito"], ["finiquito_porcentaje", "Finiquito (%)"], ["peso", "Peso (%)"],
  ["orden", "Orden"], ["current_start", "Inicio vigente"], ["current_finish", "Fin vigente"], ["forecast_finish", "Fin previsto"],
  ["progress", "Avance (%)"], ["actual_start", "Inicio real"], ["actual_finish", "Fin real"],
];
function Values({ item }: { item: Doc<"programa_obra_import_items"> }) {
  const before = JSON.parse(item.before_json || "{}") as Record<string, unknown>;
  const after = JSON.parse(item.after_json) as Record<string, unknown>;
  return <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Ver valores al importar</summary>
    <dl className="mt-2 space-y-1">{valueFields.filter(([key]) => before[key] != null || after[key] != null).map(([key, title]) =>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2" key={key}><dt className="text-muted-foreground">{title}</dt><dd className="break-words">{item.outcome !== "created" && before[key] !== after[key] ? `${before[key] ?? "Sin valor"} → ` : ""}{String(after[key] ?? "Sin valor")}</dd></div>)}</dl>
  </details>;
}
function AttemptDetails({ id }: { id: Id<"programa_obra_import_attempts"> }) {
  const attempt = useQuery(api.programaObraImportHistory.getAttempt, { attempt_id: id });
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const result = useQuery(api.programaObraImportHistory.listAttemptItems, { attempt_id: id, paginationOpts: { cursor: cursors.at(-1)!, numItems: 25 } });
  const reviewed = attempt?.reviewed_json ? JSON.parse(attempt.reviewed_json) : null;
  const snapshot = attempt?.snapshot_json ? JSON.parse(attempt.snapshot_json) : null;
  const decisions = (reviewed?.review?.date_resolutions ?? []) as Array<{ partida: string; child: string; parent_finish: string; child_finish: string; choice: string }>;
  return <div className="mt-4 space-y-4 border-t border-border pt-4">
    <p className="text-xs text-muted-foreground">El respaldo conserva el Excel recibido. Estos valores y decisiones describen la revisión aplicada; su posición en la revisión no indica una fila física del archivo.</p>
    {!!decisions.length && <section className="space-y-2"><h4 className="text-sm font-medium">Decisiones de fechas</h4>{decisions.map((d, i) => <p className="break-words text-xs" key={i}>{d.partida} / {d.child}: {d.choice === "child" ? `extender partida hasta ${d.child_finish}` : `ajustar hijo hasta ${d.parent_finish}`} (originales: partida {d.parent_finish}, hijo {d.child_finish}).</p>)}</section>}
    {reviewed?.rows?.some((r: { programa_obra_id?: string; detalle_id?: string }) => r.programa_obra_id || r.detalle_id) && <details className="text-xs"><summary className="cursor-pointer">Coincidencias elegidas por ID</summary>{reviewed.rows.filter((r: { programa_obra_id?: string; detalle_id?: string }) => r.programa_obra_id || r.detalle_id).map((r: { partida: string; familia?: string; programa_obra_id?: string; detalle_id?: string }, i: number) => <p className="mt-2 break-all" key={i}>{r.partida}{r.familia && ` / ${r.familia}`} · {r.detalle_id ?? r.programa_obra_id}</p>)}</details>}
    {!!snapshot?.absent?.length && <details className="text-xs"><summary className="cursor-pointer">{snapshot.absent.length} registros ausentes que se conservaron</summary><ul className="mt-2 space-y-1">{snapshot.absent.map((a: { id: string; name: string }) => <li className="break-words" key={a.id}>{a.name}</li>)}</ul></details>}
    {snapshot?.warnings?.map((warning: string, i: number) => <p className="text-xs text-muted-foreground" key={i}>{warning}</p>)}
    {attempt?.status === "legacy" && <details className="text-xs"><summary className="cursor-pointer">Ver datos de la revisión histórica</summary>{(snapshot?.rows ?? []).map((r: { partida: string; familia?: string; fecha_inicio?: string; fecha_fin?: string }, i: number) => <p className="mt-2 break-words" key={i}>{r.partida}{r.familia && ` / ${r.familia}`} · {r.fecha_inicio ?? "Sin inicio"} / {r.fecha_fin ?? "Sin fin"}</p>)}</details>}
    {!result ? <p role="status" className="text-sm">Cargando registros…</p> : result.page.length === 0 ? <p className="text-sm text-muted-foreground">Este intento no tiene vínculos de filas o actividades registrados.</p> : <ul className="divide-y divide-border">{result.page.map(item => <li className="py-3" key={item._id}>
      <p className="break-words text-sm font-medium">{item.name}{item.deleted ? " · Registro eliminado" : item.archived ? " · Archivado" : ""}</p>
      <p className="mt-1 text-xs text-muted-foreground">{item.kind === "row" ? `Fila incluida · Posición ${(item.review_index ?? 0) + 1} en la revisión` : `Efecto en actividad · ${item.effect_reason}`} · {{ created: "Alta", updated: "Actualización", unchanged: "Sin cambios" }[item.outcome]}</p>
      <Values item={item} />
    </li>)}</ul>}
    <Pager cursors={cursors} setCursors={setCursors} result={result} />
  </div>;
}

export function ProgramaObraImportHistory({ proyecto, onClose, initialAttemptId }: { proyecto: Id<"desarrollos">; onClose: () => void; initialAttemptId?: Id<"programa_obra_import_attempts"> }) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [expanded, setExpanded] = useState<Id<"programa_obra_import_attempts"> | null>(initialAttemptId ?? null);
  const result = useQuery(api.programaObraImportHistory.listHistory, { proyecto, paginationOpts: { cursor: cursors.at(-1)!, numItems: 25 } });
  const selected = useQuery(api.programaObraImportHistory.getAttempt, initialAttemptId ? { attempt_id: initialAttemptId } : "skip");
  const content = initialAttemptId ? (selected ? <AttemptCard attempt={selected} available={selected.file_available}><AttemptDetails id={initialAttemptId} /></AttemptCard> : <p role="status">Cargando revisión…</p>) : <>
    {!result ? <p role="status" className="text-sm">Cargando historial…</p> : !result.page.length ? <p className="text-sm text-muted-foreground">Todavía no hay cargas en el historial.</p> : result.page.map(attempt => <AttemptCard key={attempt._id} attempt={attempt} available={attempt.file_available}>
      <Button variant="ghost" size="sm" data-viewer-readonly-allow="true" aria-expanded={expanded === attempt._id} onClick={() => setExpanded(expanded === attempt._id ? null : attempt._id)}>{expanded === attempt._id ? "Ocultar detalle" : "Ver detalle de carga"}</Button>
      {expanded === attempt._id && <AttemptDetails key={attempt._id} id={attempt._id} />}
    </AttemptCard>)}
    <Pager cursors={cursors} setCursors={value => { setExpanded(null); setCursors(value); }} result={result} />
  </>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent variant="ledger" className="flex flex-col"><DialogHeader variant="ledger"><DialogTitle>Historial de cargas · Programa de obra</DialogTitle><DialogDescription>Originales e intentos confirmados del proyecto, del más reciente al más antiguo.</DialogDescription></DialogHeader><div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:p-6">{content}</div></DialogContent></Dialog>;
}

export function ProgramaObraImportSources({ proyecto, target, title = "Archivos Excel de origen" }: { proyecto: Id<"desarrollos">; target: ProgramImportTarget; title?: string }) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const result = useQuery(api.programaObraImportHistory.listSources, { proyecto, target, paginationOpts: { cursor: cursors.at(-1)!, numItems: 25 } });
  return <section className="space-y-3"><h3 className="text-sm font-medium">{title}</h3>
    {target.kind === "activity" && <p className="text-xs text-muted-foreground">Consecuencias registradas de la importación. No acreditan que una fila del Excel corresponda a este frente.</p>}
    {!result ? <p role="status" className="text-sm">Cargando fuentes…</p> : !result.page.length ? <p className="text-sm text-muted-foreground">Sin fuentes de Excel registradas para este elemento. Las revisiones anteriores pueden consultarse en el historial del programa.</p> : result.page.map(item => <AttemptCard key={item._id} attempt={item.attempt} available={item.file_available}>
      <p className="text-xs text-muted-foreground">{item.kind === "row" ? `Incluido en la revisión · Posición ${(item.review_index ?? 0) + 1}` : item.effect_reason} · {item.name}</p><Values item={item} />
    </AttemptCard>)}
    {result && (!result.isDone || cursors.length > 1) && <Pager cursors={cursors} setCursors={setCursors} result={result} />}
  </section>;
}
export function ProgramaObraSourcesDialog({ proyecto, target, name, onClose }: { proyecto: Id<"desarrollos">; target: ProgramImportTarget; name: string; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent variant="ledger" className="flex flex-col"><DialogHeader variant="ledger"><DialogTitle>Fuentes de Excel · {name}</DialogTitle><DialogDescription>Importaciones vinculadas a la identidad de este registro.</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto p-4 sm:p-6"><ProgramaObraImportSources proyecto={proyecto} target={target} /></div></DialogContent></Dialog>;
}
