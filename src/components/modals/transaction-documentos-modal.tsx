import { useQuery } from "convex/react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";
import { InvoiceAnalysisPanel } from "@/components/invoices/InvoiceAnalysisPanel";

type Document = {
  _id: Id<"documentos">;
  nombre: string;
  descripcion: string;
  image?: string;
  storage_id?: Id<"_storage">;
  type: string;
  size?: number;
  uploaded_at?: number;
  url?: string | null;
};

function formatDate(value?: string) {
  if (!value) return "—";

  return new Date(value.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TransactionDocumentosModal() {
  const { isOpen, onClose, transactionId } = useTransactionDocumentosModal();

  const transaction = useQuery(
    api.transacciones.getTransactionDocumentsById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );
  const currentUser = useQuery(api.users.getCurrentUser, isOpen ? {} : "skip");
  const canReviewInvoices = currentUser?.role === "admin" || currentUser?.role === "finance";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-square-modal=""
        className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle className="text-lg font-medium">Documentos</DialogTitle>
          <DialogDescription>
            {transaction?.factura ? `Factura ${transaction.factura}` : "Archivos vinculados a la transacción"}
          </DialogDescription>
        </DialogHeader>

        {!transaction ? (
          <div className="flex min-h-64 items-center justify-center" aria-label="Cargando documentos">
            <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
          </div>
        ) : (
          <div className="max-h-[calc(90vh-81px)] overflow-y-auto">
            {canReviewInvoices && <InvoiceAnalysisPanel transaction={transaction} />}
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {transaction.documents?.length || 0}
              </span>
              <span>{transaction.documents?.length === 1 ? "documento" : "documentos"}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(transaction.fecha)}</span>
            </div>

            {!transaction.documents || transaction.documents.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <FileText className="h-7 w-7 text-disabled-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">Sin documentos</p>
                <p className="mt-1 max-w-sm text-sm text-subtle-foreground">
                  No hay archivos vinculados a esta transacción.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {transaction.documents.map((doc: Document) => {
                  const documentUrl = doc.url || doc.image;
                  const fileSize = formatFileSize(doc.size);

                  return (
                    <article key={doc._id} className="flex flex-col gap-4 px-6 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-muted/50">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{doc.nombre}</p>
                            <Badge variant="outline" className="border-border bg-card px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                              {doc.type || "Archivo"}
                            </Badge>
                          </div>
                          {doc.descripcion && (
                            <p className="mt-1 line-clamp-2 text-sm text-subtle-foreground">{doc.descripcion}</p>
                          )}
                          {fileSize && <p className="mt-1 text-xs text-disabled-foreground">{fileSize}</p>}
                        </div>
                      </div>

                      {documentUrl && (
                        <div className="flex shrink-0 items-center gap-1 pl-12 sm:pl-0">
                          <Button variant="ghost" size="sm" className="h-8 px-2.5 text-muted-foreground hover:text-foreground" asChild>
                            <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink />
                              Abrir
                            </a>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-subtle-foreground hover:text-foreground" asChild>
                            <a
                              href={documentUrl}
                              download={doc.nombre}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Descargar ${doc.nombre}`}
                            >
                              <Download />
                            </a>
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
