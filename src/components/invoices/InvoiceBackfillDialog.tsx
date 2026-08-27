import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Bot, FileClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";

export function InvoiceBackfillDialog({ projectId }: { projectId: Id<"desarrollos"> }) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const canReview = currentUser?.role === "admin" || currentUser?.role === "finance";
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const {
    results: candidates,
    status: candidatesStatus,
    loadMore: loadMoreCandidates,
  } = usePaginatedQuery(
    api.invoiceAnalysis.listHistoricalCandidates,
    open && canReview ? { project_id: projectId } : "skip",
    { initialNumItems: 50 },
  );
  const queue = useQuery(
    api.invoiceAnalysis.listReviewQueue,
    open && canReview ? { project_id: projectId, limit: 50 } : "skip",
  );
  const startAnalysis = useMutation(api.invoiceAnalysis.startInvoiceAnalysis);
  const documentsModal = useTransactionDocumentosModal();

  const groups = useMemo(() => {
    const grouped = new Map<string, typeof candidates>();
    for (const candidate of candidates || []) {
      if (!candidate.transaction_id) continue;
      const key = `${candidate.transaction_id}:${candidate.pair_key || `document:${candidate.id}`}`;
      grouped.set(key, [...(grouped.get(key) || []), candidate]);
    }
    return [...grouped.entries()].flatMap(([key, documents]) => {
      const xmlDocuments = documents.filter((document) => document.kind === "xml");
      const visualDocuments = documents.filter((document) => document.kind !== "xml");
      const transactionId = documents[0].transaction_id as Id<"transacciones">;
      if (xmlDocuments.length <= 1 && visualDocuments.length <= 1) {
        return [{ key, transactionId, selectedDocuments: documents, paired: documents.length === 2 }];
      }
      // Multiple files with the same apparent folio are deliberately kept
      // separate. Silently guessing a pair could combine different invoices.
      return documents.map((document) => ({
        key: `${key}:${document.id}`,
        transactionId,
        selectedDocuments: [document],
        paired: false,
      }));
    });
  }, [candidates]);

  function toggle(candidateKey: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= 10) {
          toast.error("Puedes iniciar hasta diez facturas por lote.");
          return current;
        }
        next.add(candidateKey);
      } else {
        next.delete(candidateKey);
      }
      return next;
    });
  }

  async function handleStartBatch() {
    const selectedGroups = groups.filter((group) => selected.has(group.key));
    if (!selectedGroups.length) return;
    setSubmitting(true);
    const completedKeys = new Set<string>();
    const nextFailures: Record<string, string> = {};
    for (let index = 0; index < selectedGroups.length; index += 2) {
      const batch = selectedGroups.slice(index, index + 2);
      const results = await Promise.allSettled(batch.map((group) => startAnalysis({
        project_id: projectId,
        document_ids: group.selectedDocuments.map((document) => document.id),
        transaction_ids: [group.transactionId],
        client_request_id: crypto.randomUUID(),
      })));
      results.forEach((result, resultIndex) => {
        const group = batch[resultIndex];
        if (result.status === "fulfilled") completedKeys.add(group.key);
        else nextFailures[group.key] = result.reason instanceof Error ? result.reason.message : "No se pudo iniciar el análisis";
      });
    }
    setSubmitting(false);
    setFailures(nextFailures);
    setSelected((current) => new Set([...current].filter((key) => !completedKeys.has(key))));
    if (completedKeys.size) toast.success(`${completedKeys.size} análisis histórico(s) iniciado(s)`);
    if (Object.keys(nextFailures).length) toast.error(`${Object.keys(nextFailures).length} análisis no pudieron iniciarse`);
  }

  if (!canReview) return null;

  return (
    <>
      <Button variant="outline" size="lg" className="flex items-center gap-2 rounded-none py-6 text-subtle-foreground" onClick={() => setOpen(true)}>
        Facturas IA
        {queue?.length ? <Badge className="ml-1 rounded-full px-1.5">{queue.length}</Badge> : <Bot className="h-5 w-5" />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0" data-square-modal="">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>Facturas y revisión con IA</DialogTitle>
            <DialogDescription>Procesa archivos históricos y abre los análisis que necesitan aprobación humana.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(90vh-140px)] space-y-5 overflow-y-auto px-6 py-5">
            <section>
              <h3 className="text-sm font-semibold">Pendientes de revisión ({queue?.length || 0})</h3>
              <div className="mt-2 space-y-2">
                {queue === undefined ? <Loader2 className="h-4 w-4 animate-spin" /> : queue.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay análisis pendientes.</p>
                ) : queue.map((invoice) => (
                  <button key={invoice._id} type="button" className="flex w-full items-center justify-between border border-border p-3 text-left text-sm hover:bg-muted/40" onClick={() => { setOpen(false); documentsModal.onOpen(invoice.primary_transaction_id, invoice._id); }}>
                    <span><span className="block font-medium">{invoice.folio || invoice.issuer_name || "Factura sin folio"}</span><span className="text-xs text-muted-foreground">{invoice.status}</span></span>
                    <span className="text-xs text-primary">Abrir revisión</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold">Facturas históricas sin analizar</h3><p className="text-xs text-muted-foreground">Selecciona hasta diez transacciones. Se usará un XML y un respaldo visual por factura.</p></div>
                <Button size="sm" onClick={handleStartBatch} disabled={submitting || selected.size === 0}>{submitting ? <Loader2 className="animate-spin" /> : <FileClock />}Analizar {selected.size || ""}</Button>
              </div>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {candidatesStatus === "LoadingFirstPage" ? <Loader2 className="h-4 w-4 animate-spin" /> : groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No se detectaron documentos históricos pendientes.</p>
                ) : groups.map((group) => (
                  <label key={group.key} className="flex items-start gap-3 border border-border p-3 text-sm">
                    <Checkbox checked={selected.has(group.key)} onCheckedChange={(checked) => toggle(group.key, checked === true)} />
                    <span className="min-w-0">
                      <span className="block font-medium">{group.selectedDocuments.map((document) => document.name).join(" + ")}</span>
                      <span className="text-xs text-muted-foreground">Transacción {String(group.transactionId).slice(-8).toUpperCase()}{group.paired ? " · pareja exacta por UUID/folio" : " · fuente individual"}</span>
                      {failures[group.key] && <span className="mt-1 block text-xs text-destructive">{failures[group.key]}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {(candidatesStatus === "CanLoadMore" || candidatesStatus === "LoadingMore") && (
                <Button className="mt-3 w-full" variant="outline" size="sm" disabled={candidatesStatus === "LoadingMore"} onClick={() => loadMoreCandidates(50)}>
                  {candidatesStatus === "LoadingMore" ? <Loader2 className="animate-spin" /> : null}
                  Cargar más documentos
                </Button>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
