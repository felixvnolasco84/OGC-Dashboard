import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, Bot, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type InvoiceDocument = {
  _id: Id<"documentos">;
  nombre: string;
  type: string;
  mime_type?: string;
  size?: number;
};

type Props = {
  invoiceId?: Id<"invoice_records">;
  transaction: {
    _id: Id<"transacciones">;
    proyecto: Id<"desarrollos">;
    monto_total: number;
    moneda: string;
    documents?: InvoiceDocument[];
  };
};

type ItemDraft = {
  categoryId: string;
  canonicalLabel: string;
  assetCandidate: boolean;
};

function fileKind(document: InvoiceDocument) {
  const mime = (document.mime_type || "").toLowerCase();
  const name = document.nombre.toLowerCase();
  if (mime.includes("xml") || name.endsWith(".xml")) return "xml";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g)$/i.test(name)) return "image";
  return null;
}

function formatMoney(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toLocaleString("es-MX")} ${currency}`;
  }
}

const STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  extracting: "Analizando",
  review_required: "Revisión requerida",
  approved: "Aprobada",
  rejected: "Rechazada",
  failed: "Falló",
  stale: "Fuente modificada",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "Factura",
  credit_note: "Nota de crédito",
  receipt: "Recibo",
  payment_complement: "Complemento de pago",
  unknown: "Tipo no identificado",
};

const RECONCILIATION_LABELS: Record<string, string> = {
  allocation_transaction_mismatch: "el importe asignado difiere de la transacción",
  transaction_overallocated: "la transacción queda sobreasignada",
  multiple_currencies: "hay transacciones en monedas distintas",
  invoice_currency_mismatch: "la moneda de la factura no coincide",
  invoice_total_mismatch: "el total asignado no coincide con la factura",
  missing_invoice_total: "no se recuperó el total de la factura",
  unknown_document_type: "no se identificó el tipo de comprobante",
  unclassified_items: "quedaron conceptos sin clasificar",
};

export function InvoiceAnalysisPanel({ transaction, invoiceId }: Props) {
  const analysis = useQuery(api.invoiceAnalysis.getByTransaction, {
    transaction_id: transaction._id,
    invoice_id: invoiceId,
  });
  const startAnalysis = useMutation(api.invoiceAnalysis.startInvoiceAnalysis);
  const reviewAnalysis = useMutation(api.invoiceAnalysis.reviewInvoiceAnalysis);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [allocationAmount, setAllocationAmount] = useState(String(transaction.monto_total));
  const [reason, setReason] = useState("");

  const eligibleDocuments = useMemo(
    () => (transaction.documents || []).filter((document) => fileKind(document)),
    [transaction.documents],
  );
  const defaultDocuments = useMemo(() => {
    const xml = eligibleDocuments.find((document) => fileKind(document) === "xml");
    const visual = eligibleDocuments.find((document) => fileKind(document) !== "xml");
    return [xml, visual].filter(Boolean) as InvoiceDocument[];
  }, [eligibleDocuments]);
  const selectedDocuments = useMemo(
    () => eligibleDocuments.filter((document) => selectedDocumentIds.has(String(document._id))),
    [eligibleDocuments, selectedDocumentIds],
  );

  useEffect(() => {
    setSelectedDocumentIds(new Set(defaultDocuments.map((document) => String(document._id))));
  }, [transaction._id, defaultDocuments]);

  useEffect(() => {
    if (!analysis?.run) return;
    const next = Object.fromEntries(analysis.items.map((item) => [String(item._id), {
      categoryId: item.category_id ? String(item.category_id) : "",
      canonicalLabel: item.canonical_label,
      assetCandidate: item.asset_candidate,
    }]));
    setItemDrafts(next);
    const suggestedAmount = analysis.invoice?.invoice_type === "credit_note"
      ? -Math.abs(transaction.monto_total)
      : transaction.monto_total;
    setAllocationAmount(String(analysis.allocations[0]?.amount ?? suggestedAmount));
  }, [analysis, transaction.monto_total]);

  async function handleStart() {
    if (!selectedDocuments.length) return;
    setIsSubmitting(true);
    try {
      await startAnalysis({
        project_id: transaction.proyecto,
        document_ids: selectedDocuments.map((document) => document._id),
        transaction_ids: [transaction._id],
        client_request_id: crypto.randomUUID(),
      });
      toast.success("Análisis de factura iniciado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar el análisis");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleSource(document: InvoiceDocument, checked: boolean) {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      const kind = fileKind(document);
      if (!checked) {
        next.delete(String(document._id));
        return next;
      }
      for (const candidate of eligibleDocuments) {
        if (fileKind(candidate) === kind) next.delete(String(candidate._id));
      }
      next.add(String(document._id));
      return next;
    });
  }

  async function handleDecision(decision: "approve" | "reject") {
    if (!analysis?.invoice || !analysis.run) return;
    if (decision === "approve" && analysis.invoice.invoice_type === "payment_complement") {
      toast.error("Los complementos de pago no representan un gasto adicional. Rechaza este análisis.");
      return;
    }
    const amount = Number(allocationAmount);
    if (decision === "approve" && (!Number.isFinite(amount) || amount === 0)) {
      toast.error("Captura un importe de asignación válido.");
      return;
    }
    setIsSubmitting(true);
    try {
      await reviewAnalysis({
        invoice_id: analysis.invoice._id,
        run_id: analysis.run._id,
        expected_revision: analysis.invoice.revision,
        decision,
        reason: reason.trim() || undefined,
        items: analysis.items.map((item) => {
          const draft = itemDrafts[String(item._id)];
          return {
            item_id: item._id,
            category_id: draft?.categoryId ? draft.categoryId as Id<"invoice_cost_categories"> : undefined,
            canonical_label: draft?.canonicalLabel || item.description,
            asset_candidate: draft?.assetCandidate ?? false,
          };
        }),
        allocations: decision === "approve" ? [{ transaction_id: transaction._id, amount }] : [],
      });
      toast.success(decision === "approve" ? "Desglose aprobado" : "Análisis rechazado");
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la revisión");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (analysis === undefined) {
    return <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const status = analysis?.invoice?.status;
  const canReview = status === "review_required" && analysis?.run?.status === "review_required";
  const isPaymentComplement = analysis?.invoice?.invoice_type === "payment_complement";

  return (
    <section className="space-y-4 border-b border-border bg-muted/20 px-6 py-5" aria-labelledby="invoice-analysis-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h3 id="invoice-analysis-title" className="text-sm font-semibold text-foreground">Desglose inteligente de factura</h3>
            {status && <Badge variant="outline">{STATUS_LABELS[status] || status}</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            La IA propone conceptos y categorías. Un administrador o Finanzas debe revisarlos antes de que formen parte de consultas y reportes.
          </p>
        </div>
        {(!analysis?.invoice || status === "failed" || status === "rejected" || status === "stale") && (
          <Button size="sm" onClick={handleStart} disabled={isSubmitting || selectedDocuments.length === 0}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : status ? <RefreshCw /> : <Bot />}
            {status ? "Analizar de nuevo" : "Analizar factura"}
          </Button>
        )}
      </div>

      {!selectedDocuments.length && !analysis?.invoice && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Falta una fuente compatible</AlertTitle>
          <AlertDescription>Adjunta un CFDI XML, PDF, PNG o JPEG a esta transacción.</AlertDescription>
        </Alert>
      )}

      {(!analysis?.invoice || status === "failed" || status === "rejected" || status === "stale") && eligibleDocuments.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <p className="text-xs font-medium">Fuentes a analizar</p>
          {eligibleDocuments.map((document) => (
            <label key={document._id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={selectedDocumentIds.has(String(document._id))}
                onCheckedChange={(checked) => toggleSource(document, checked === true)}
              />
              <span className="truncate">{document.nombre}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">{fileKind(document)?.toUpperCase()}</Badge>
            </label>
          ))}
          <p className="text-[11px] text-muted-foreground">Máximo un XML y un PDF o imagen. El XML es la fuente contable prioritaria.</p>
        </div>
      )}

      {!analysis?.invoice && selectedDocuments.length > 0 && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Se analizará {selectedDocuments.map((document) => document.nombre).join(" + ")}. Si existe XML, sus importes prevalecen sobre la lectura visual.
        </div>
      )}

      {(status === "queued" || status === "extracting") && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-4 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div><p className="font-medium">Procesando documentos</p><p className="text-xs text-muted-foreground">La vista se actualizará automáticamente al terminar.</p></div>
        </div>
      )}

      {analysis?.run?.status === "failed" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>No se pudo analizar la factura</AlertTitle>
          <AlertDescription>{analysis.run.error || "Vuelve a intentarlo o revisa el archivo."}</AlertDescription>
        </Alert>
      )}

      {analysis?.invoice && analysis.run && (canReview || status === "approved") && (
        <div className="space-y-4">
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <div className="border border-border bg-card p-3"><span className="text-muted-foreground">Emisor</span><p className="mt-1 truncate font-medium">{analysis.invoice.issuer_name || "No identificado"}</p></div>
            <div className="border border-border bg-card p-3"><span className="text-muted-foreground">Folio</span><p className="mt-1 font-medium">{analysis.invoice.folio || analysis.invoice.uuid || "—"}</p></div>
            <div className="border border-border bg-card p-3"><span className="text-muted-foreground">Tipo y moneda</span><p className="mt-1 font-medium">{DOCUMENT_TYPE_LABELS[analysis.invoice.invoice_type || "unknown"] || analysis.invoice.invoice_type} · {analysis.invoice.currency || "—"}</p></div>
            <div className="border border-border bg-card p-3"><span className="text-muted-foreground">Total recuperado</span><p className="mt-1 font-medium">{formatMoney(analysis.invoice.total, analysis.invoice.currency || transaction.moneda)}</p></div>
          </div>

          {analysis.run.warnings.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Revisa estas advertencias</AlertTitle>
              <AlertDescription><ul className="list-disc space-y-1 pl-4">{analysis.run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></AlertDescription>
            </Alert>
          )}

          {isPaymentComplement && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Complemento de pago detectado</AlertTitle>
              <AlertDescription>Este documento confirma un pago, pero no representa un gasto adicional. No puede aprobarse como desglose de factura.</AlertDescription>
            </Alert>
          )}

          <div className="overflow-hidden border border-border bg-card">
            <div className="border-b border-border px-4 py-3"><p className="text-sm font-medium">Conceptos recuperados ({analysis.items.length})</p></div>
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {analysis.items.map((item) => {
                const draft = itemDrafts[String(item._id)];
                return (
                  <div key={item._id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px]">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Original</p>
                      <p className="mt-1 text-sm leading-snug">{item.description}</p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatMoney(item.gross_amount ?? item.net_amount, analysis.invoice.currency || transaction.moneda)}</p>
                      <Input className="mt-2" value={draft?.canonicalLabel ?? item.canonical_label} onChange={(event) => setItemDrafts((current) => ({ ...current, [String(item._id)]: { ...(current[String(item._id)] || { categoryId: "", assetCandidate: false }), canonicalLabel: event.target.value } }))} disabled={!canReview} aria-label={`Nombre normalizado de ${item.description}`} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Categoría</p>
                      <Select value={draft?.categoryId || undefined} onValueChange={(value) => setItemDrafts((current) => ({ ...current, [String(item._id)]: { ...(current[String(item._id)] || { canonicalLabel: item.description, assetCandidate: false }), categoryId: value } }))} disabled={!canReview}>
                        <SelectTrigger><SelectValue placeholder="Sin clasificar" /></SelectTrigger>
                        <SelectContent>{analysis.categories.map((category) => <SelectItem key={category._id} value={category._id}>{category.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="mt-2 text-[11px] text-muted-foreground">Confianza IA: {item.confidence}</p>
                    </div>
                    <label className="flex items-center gap-2 self-start text-xs">
                      <Checkbox checked={draft?.assetCandidate ?? item.asset_candidate} onCheckedChange={(checked) => setItemDrafts((current) => ({ ...current, [String(item._id)]: { ...(current[String(item._id)] || { categoryId: "", canonicalLabel: item.description }), assetCandidate: checked === true } }))} disabled={!canReview} />
                      Activo potencial
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {canReview && (
            <div className="space-y-3 border border-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="text-xs font-medium">Importe asignado a esta transacción</label><Input type="number" step="0.01" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} /></div>
                <div><label className="text-xs font-medium">Motivo de excepción o rechazo</label><Textarea className="min-h-9" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Obligatorio si los importes no concilian o si rechazas" /></div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => handleDecision("reject")} disabled={isSubmitting || !reason.trim()}><XCircle />Rechazar</Button>
                <Button onClick={() => handleDecision("approve")} disabled={isSubmitting || analysis.items.length === 0 || isPaymentComplement}>{isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Aprobar desglose</Button>
              </div>
            </div>
          )}

          {status === "approved" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />Este desglose ya puede utilizarse en consultas agregadas del chatbot.
              </div>
              {analysis.invoice.reconciliation_status === "exception" && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Aprobada con excepciones: {(analysis.invoice.reconciliation_exception_codes || []).map((code) => RECONCILIATION_LABELS[code] || code).join(", ")}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
