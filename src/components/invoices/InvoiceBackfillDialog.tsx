import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, FileClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";

function candidateKind(candidate: { name: string; type: string }) {
  const value = `${candidate.name} ${candidate.type}`.toLowerCase();
  if (value.includes(".xml") || value.includes("xml")) return "xml";
  return "visual";
}

export function InvoiceBackfillDialog({ projectId }: { projectId: Id<"desarrollos"> }) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const canReview = currentUser?.role === "admin" || currentUser?.role === "finance";
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const candidates = useQuery(
    api.invoiceAnalysis.listHistoricalCandidates,
    open && canReview ? { project_id: projectId } : "skip",
  );
  const queue = useQuery(
    api.invoiceAnalysis.listReviewQueue,
    canReview ? { project_id: projectId, limit: 50 } : "skip",
  );
  const startAnalysis = useMutation(api.invoiceAnalysis.startInvoiceAnalysis);
  const documentsModal = useTransactionDocumentosModal();

  const groups = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof candidates>>();
    for (const candidate of candidates || []) {
      if (!candidate.transaction_id) continue;
      const key = String(candidate.transaction_id);
      grouped.set(key, [...(grouped.get(key) || []), candidate]);
    }
    return [...grouped.entries()].map(([transactionId, documents]) => ({
      transactionId: transactionId as Id<"transacciones">,
      documents,
      selectedDocuments: [
        documents.find((document) => candidateKind(document) === "xml"),
        documents.find((document) => candidateKind(document) === "visual"),
      ].filter(Boolean) as typeof documents,
    }));
  }, [candidates]);

  function toggle(transactionId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= 10) {
          toast.error("Puedes iniciar hasta diez facturas por lote.");
          return current;
        }
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return next;
    });
  }

  async function handleStartBatch() {
    const selectedGroups = groups.filter((group) => selected.has(String(group.transactionId)));
    if (!selectedGroups.length) return;
    setSubmitting(true);
    const results = await Promise.allSettled(selectedGroups.map((group) => startAnalysis({
      project_id: projectId,
      document_ids: group.selectedDocuments.map((document) => document.id),
      transaction_ids: [group.transactionId],
      client_request_id: crypto.randomUUID(),
    })));
    const completed = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - completed;
    setSubmitting(false);
    setSelected(new Set());
    if (completed) toast.success(`${completed} análisis histórico(s) iniciado(s)`);
    if (failed) toast.error(`${failed} análisis no pudieron iniciarse`);
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
                  <button key={invoice._id} type="button" className="flex w-full items-center justify-between border border-border p-3 text-left text-sm hover:bg-muted/40" onClick={() => { setOpen(false); documentsModal.onOpen(invoice.primary_transaction_id); }}>
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
                {candidates === undefined ? <Loader2 className="h-4 w-4 animate-spin" /> : groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No se detectaron documentos históricos pendientes.</p>
                ) : groups.map((group) => (
                  <label key={group.transactionId} className="flex items-start gap-3 border border-border p-3 text-sm">
                    <Checkbox checked={selected.has(String(group.transactionId))} onCheckedChange={(checked) => toggle(String(group.transactionId), checked === true)} />
                    <span className="min-w-0"><span className="block font-medium">{group.selectedDocuments.map((document) => document.name).join(" + ")}</span><span className="text-xs text-muted-foreground">Transacción {String(group.transactionId).slice(-8).toUpperCase()}</span></span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
