import { useState, type ReactNode } from "react";
import { useConvex, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";

function timestamp(value: number) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function date(value: string) {
  return value.split("-").reverse().join("/");
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "MXN" }).format(value);
}

function attemptLabel(attempt: Doc<"labor_payment_import_attempts">) {
  if (attempt.status === "completed") return attempt.result?.status === "replaced" ? "Actualizada" : "Completada";
  return { processing: "En proceso", unchanged: "Sin cambios", failed: "Fallida", legacy: "Histórica" }[attempt.status];
}

function DownloadOriginal({ attemptId, available }: { attemptId: Id<"labor_payment_import_attempts">; available: boolean }) {
  const convex = useConvex();
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { url, file_name } = await convex.query(api.laborImportHistory.getDownloadUrl, { attempt_id: attemptId });
      if (!url) throw new Error("Archivo original no disponible.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("No fue posible descargar el archivo original.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      toast.error("No se pudo descargar el Excel", { description: error instanceof Error ? error.message : "Intenta de nuevo." });
    } finally {
      setDownloading(false);
    }
  };
  if (!available) return <p className="text-xs text-muted-foreground">Archivo original no disponible</p>;
  return (
    <Button type="button" variant="outline" size="sm" className="rounded-none" disabled={downloading} onClick={() => void download()}>
      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Descargar Excel
    </Button>
  );
}

function AttemptCard({ attempt, available, children }: {
  attempt: Doc<"labor_payment_import_attempts">; available: boolean; children?: ReactNode;
}) {
  return (
    <article className="min-w-0 border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="break-all text-sm font-medium text-foreground">{attempt.source.file_name}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{attempt.imported_by_name} · {timestamp(attempt.created_at)}</p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0 rounded-none">{attemptLabel(attempt)}</Badge>
      </div>
      <p className="mt-3 break-words text-xs text-muted-foreground">
        Hoja: {attempt.source.sheet_name}{attempt.size !== undefined && ` · ${(attempt.size / 1024).toFixed(1)} KB`}
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer">{attempt.dates.length} {attempt.dates.length === 1 ? "corte" : "cortes"} · Referencia del archivo</summary>
        <p className="mt-2 break-words">Cortes: {attempt.dates.map(date).join(", ")}</p>
        <p className="mt-1 break-all">SHA-256: {attempt.source.file_hash}</p>
      </details>
      {attempt.result && (
        <p className="mt-3 text-sm text-foreground">
          {attempt.result.transaction_count} {attempt.result.transaction_count === 1 ? "pago" : "pagos"} · {attempt.result.row_count} {attempt.result.row_count === 1 ? "fila" : "filas"} · {money(attempt.result.amount_total, attempt.source.currency)}
        </p>
      )}
      {attempt.status === "legacy" && <p className="mt-3 text-xs text-muted-foreground">Metadatos anteriores al respaldo de archivos. No se dispone del resultado original de la carga.</p>}
      {attempt.error && <p className="mt-3 break-words text-sm text-destructive">{attempt.error}</p>}
      <div className="mt-3"><DownloadOriginal attemptId={attempt._id} available={available} /></div>
      {children}
    </article>
  );
}

function PageControls({ page, loading, isDone, previous, next }: {
  page: number; loading: boolean; isDone: boolean; previous: () => void; next: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
      <span>Página {page}</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-none" disabled={page === 1 || loading} onClick={previous}>
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-none" disabled={isDone || loading} onClick={next}>
          Siguiente <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AttemptItems({ attemptId, onViewTransaction }: {
  attemptId: Id<"labor_payment_import_attempts">; onViewTransaction: (id: Id<"transacciones">) => void;
}) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const result = useQuery(api.laborImportHistory.listAttemptItems, {
    attempt_id: attemptId, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 },
  });
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs text-muted-foreground">Valores y filas incluidos en este Excel al confirmar la carga.</p>
      {!result ? <p className="text-sm text-muted-foreground" role="status">Cargando movimientos...</p> : result.page.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este intento no importó movimientos.</p>
      ) : (
        <ul className="divide-y divide-border">
          {result.page.map(item => (
            <li key={item._id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {item.deleted ? <span className="break-all">{item.factura} · Transacción eliminada</span> : (
                  <button type="button" className="break-all text-left font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onViewTransaction(item.transaccion_id)}>
                    {item.factura}
                  </button>
                )}
                <span className="tabular-nums">{money(item.monto_total, item.moneda)}</span>
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">{item.proveedor} · {date(item.fecha)} · {{ created: "Creada", updated: "Actualizada", unchanged: "Sin cambios" }[item.outcome]}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">Filas de origen: {item.source_rows.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
      <PageControls page={cursors.length} loading={!result} isDone={result?.isDone ?? true}
        previous={() => setCursors(current => current.slice(0, -1))}
        next={() => result && setCursors(current => [...current, result.continueCursor])} />
    </div>
  );
}

export function LaborImportHistoryDialog({ projectId }: { projectId: Id<"desarrollos"> }) {
  const [open, setOpen] = useState(false);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [expandedId, setExpandedId] = useState<Id<"labor_payment_import_attempts"> | null>(null);
  const openTransaction = useTransactionDetailsModal(state => state.onOpen);
  const result = useQuery(api.laborImportHistory.listHistory, open ? {
    proyecto: projectId, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 },
  } : "skip");
  return (
    <>
      <Button type="button" variant="outline" size="lg" className="rounded-none" onClick={() => { setCursors([null]); setExpandedId(null); setOpen(true); }}>
        <History className="h-4 w-4" /> Historial de cargas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent variant="ledger" className="flex flex-col">
          <DialogHeader variant="ledger">
            <DialogTitle>Historial de cargas</DialogTitle>
            <DialogDescription>Excel originales e intentos confirmados de este proyecto, del más reciente al más antiguo.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {!result ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Cargando historial...</p> : result.page.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay cargas en el historial.</p>
            ) : (
              <div className="space-y-3">
                {result.page.map(attempt => (
                  <AttemptCard key={attempt._id} attempt={attempt} available={attempt.file_available}>
                    {attempt.result && (
                      <Button type="button" variant="ghost" size="sm" className="mt-2 rounded-none" aria-expanded={expandedId === attempt._id}
                        onClick={() => setExpandedId(expandedId === attempt._id ? null : attempt._id)}>
                        {expandedId === attempt._id ? "Ocultar movimientos" : "Ver movimientos"}
                      </Button>
                    )}
                    {expandedId === attempt._id && <AttemptItems key={attempt._id} attemptId={attempt._id} onViewTransaction={id => { setOpen(false); openTransaction(id); }} />}
                  </AttemptCard>
                ))}
              </div>
            )}
            <PageControls page={cursors.length} loading={!result} isDone={result?.isDone ?? true}
              previous={() => { setExpandedId(null); setCursors(current => current.slice(0, -1)); }}
              next={() => { if (result) { setExpandedId(null); setCursors(current => [...current, result.continueCursor]); } }} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TransactionImportSources({ transactionId }: { transactionId: Id<"transacciones"> }) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const result = useQuery(api.laborImportHistory.listTransactionSources, {
    transaccion_id: transactionId, paginationOpts: { cursor: cursors[cursors.length - 1], numItems: 25 },
  });
  const legacy = useQuery(api.laborImportHistory.getLegacyTransactionReference, { transaccion_id: transactionId });
  return (
    <section className="border-t border-border px-6 py-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground"><FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Archivos Excel de origen</h3>
      {!result ? <p className="text-sm text-muted-foreground" role="status">Cargando archivos de origen...</p> : result.page.length === 0 && !legacy ? (
        <p className="text-sm text-muted-foreground">Sin cargas de Excel registradas para esta transacción.</p>
      ) : (
        <div className="space-y-3">
          {result.page.map(item => (
            <AttemptCard key={item._id} attempt={item.attempt} available={item.file_available}>
              <p className="mt-3 text-xs text-muted-foreground">Este Excel incluyó {money(item.monto_total, item.moneda)} para la transacción. Filas: {item.source_rows.join(", ")}.</p>
            </AttemptCard>
          ))}
          {legacy && cursors.length === 1 && (
            <div className="border border-border p-4 text-xs text-muted-foreground">
              <p className="break-all font-medium text-foreground">{legacy.file_name}</p>
              <p className="mt-1">Hoja: {legacy.sheet_name} · {timestamp(legacy.imported_at)}</p>
              <p className="mt-2">Referencia histórica del corte. Archivo original no disponible; no es posible comprobar qué filas del archivo corresponden a esta transacción.</p>
            </div>
          )}
        </div>
      )}
      {result && (!result.isDone || cursors.length > 1) && <PageControls page={cursors.length} loading={false} isDone={result.isDone}
        previous={() => setCursors(current => current.slice(0, -1))}
        next={() => setCursors(current => [...current, result.continueCursor])} />}
    </section>
  );
}
