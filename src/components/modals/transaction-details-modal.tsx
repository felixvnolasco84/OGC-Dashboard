import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Building2,
  Download,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Save,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { InvoiceAnalysisPanel } from "@/components/invoices/InvoiceAnalysisPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";

type Partida = {
  _id: Id<"partidas">;
  nombre: string;
  familia: string;
  sub_partida: string;
};

type LineItem = {
  _id: Id<"pagos">;
  monto: number;
  concepto?: string;
  partida_nombre_snapshot?: string;
  familia_snapshot?: string;
  sub_partida_snapshot?: string;
  partida?: Partida;
};

type Document = {
  _id: Id<"documentos">;
  nombre: string;
  descripcion: string;
  image?: string;
  type: string;
  size?: number;
  url?: string | null;
};

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 py-3">
      <dt className="text-xs text-subtle-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{children || "—"}</dd>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";

  return new Date(value.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(amount: number, currency?: string) {
  const safeCurrency = /^[A-Z]{3}$/.test(currency || "") ? currency : "MXN";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function TransactionDetailsModal() {
  const { isOpen, onClose, transactionId } = useTransactionDetailsModal();
  const transaction = useQuery(
    api.transacciones.getTransactionDetailsById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );
  const conceptsTransaction = useQuery(
    api.transacciones.getTransactionConceptosById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );
  const documentsTransaction = useQuery(
    api.transacciones.getTransactionDocumentsById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );
  const providers = useQuery(api.proveedores.getAll, isOpen ? {} : "skip");
  const currentUser = useQuery(api.users.getCurrentUser, isOpen ? {} : "skip");
  const updateTransaction = useMutation(api.transacciones.updateTransaction);
  const [selectedProvider, setSelectedProvider] = useState<Id<"proveedores"> | "unassigned">("unassigned");
  const [isSavingProvider, setIsSavingProvider] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setSelectedProvider(transaction.proveedor_id || "unassigned");
  }, [transaction]);

  const handleProviderSave = async () => {
    if (!transaction) return;

    setIsSavingProvider(true);
    try {
      await updateTransaction({
        id: transaction._id,
        proveedor_id: selectedProvider === "unassigned" ? null : selectedProvider,
      });
      toast.success(selectedProvider === "unassigned" ? "Proveedor desvinculado" : "Proveedor asignado");
    } catch (error) {
      toast.error("No se pudo actualizar la transacción", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsSavingProvider(false);
    }
  };

  const statusClass = transaction?.status === "Pagado"
    ? "border-green-200 bg-green-50 text-green-700"
    : transaction?.status === "Por pagar"
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : "border-border bg-muted text-muted-foreground";
  const lineItems = conceptsTransaction?.lineItems || [];
  const documents = documentsTransaction?.documents || [];
  const lineItemsTotal = lineItems.reduce(
    (sum: number, item: LineItem) => sum + item.monto,
    0
  );
  const providerIsDirty = Boolean(transaction) &&
    selectedProvider !== (transaction?.proveedor_id || "unassigned");
  const canReviewInvoices = currentUser?.role === "admin" || currentUser?.role === "finance";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-square-modal=""
        className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle className="text-lg font-medium">Detalle de transacción</DialogTitle>
          <DialogDescription>
            {transaction?.factura
              ? `Factura ${transaction.factura}`
              : transaction?.codigo_referencia
                ? `Referencia ${transaction.codigo_referencia}`
                : "Información general, conceptos y documentos del pago"}
          </DialogDescription>
        </DialogHeader>

        {transaction === undefined ? (
          <div className="flex min-h-64 items-center justify-center" aria-label="Cargando transacción">
            <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
          </div>
        ) : transaction === null ? (
          <div className="flex min-h-64 items-center justify-center px-6 text-sm text-subtle-foreground">
            No se encontró la transacción.
          </div>
        ) : (
          <div className="max-h-[calc(92vh-81px)] overflow-y-auto">
            <section className="px-6 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs text-subtle-foreground">Monto total</p>
                  <p className="mt-1 text-3xl font-medium tracking-tight text-foreground tabular-nums">
                    {formatCurrency(transaction.monto_total, transaction.moneda)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatDate(transaction.fecha)}
                    {transaction.moneda && ` · ${transaction.moneda}`}
                    {transaction.tipo_cambio && ` · TC ${transaction.tipo_cambio}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {transaction.status && (
                    <Badge variant="outline" className={`${statusClass} px-2.5 py-1 text-xs font-normal`}>
                      {transaction.status}
                    </Badge>
                  )}
                  {transaction.tipo_pago && (
                    <Badge variant="outline" className="border-border bg-card px-2.5 py-1 text-xs font-normal capitalize text-muted-foreground">
                      {transaction.tipo_pago}
                    </Badge>
                  )}
                </div>
              </div>
            </section>

            <section className="border-t border-border px-6 py-2">
              <h3 className="pt-4 text-xs font-medium uppercase tracking-[0.12em] text-subtle-foreground">
                Información del pago
              </h3>
              <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:gap-x-8 sm:[&>*:nth-child(2)]:border-t-0 lg:grid-cols-3 lg:[&>*:nth-child(3)]:border-t-0">
                <DetailItem label="Categoría">
                  <span className="capitalize">{transaction.categoria || "—"}</span>
                </DetailItem>
                {transaction.factura && <DetailItem label="Factura">{transaction.factura}</DetailItem>}
                {transaction.codigo_referencia && (
                  <DetailItem label="Código de referencia">{transaction.codigo_referencia}</DetailItem>
                )}
                {transaction.banco && <DetailItem label="Banco">{transaction.banco}</DetailItem>}
                {transaction.tarjeta && <DetailItem label="Tarjeta">{transaction.tarjeta}</DetailItem>}
                {transaction.numero_cuenta && (
                  <DetailItem label="Número de cuenta">
                    <span className="font-mono text-xs">{transaction.numero_cuenta}</span>
                  </DetailItem>
                )}
                {transaction.numero_transferencia && (
                  <DetailItem label="Número de transferencia">
                    <span className="font-mono text-xs">{transaction.numero_transferencia}</span>
                  </DetailItem>
                )}
                {transaction.comprobante && (
                  <DetailItem label="Comprobante">{transaction.comprobante}</DetailItem>
                )}
              </dl>
            </section>

            <section className="border-t border-border px-6 py-5">
              <div className="mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">Proveedor</h3>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <label className="mb-1.5 block text-xs text-subtle-foreground" htmlFor="transaction-provider">
                    Proveedor asignado
                  </label>
                  <Select
                    value={selectedProvider}
                    onValueChange={(value) => setSelectedProvider(value as Id<"proveedores"> | "unassigned")}
                    disabled={isSavingProvider || providers === undefined}
                  >
                    <SelectTrigger id="transaction-provider" className="h-10 w-full rounded-none border-border-strong">
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Sin proveedor</SelectItem>
                      {providers?.map((provider) => (
                        <SelectItem key={provider._id} value={provider._id}>
                          {provider.razon_social}{provider.rfc ? ` · ${provider.rfc}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="h-10 rounded-none px-4 shadow-none"
                  onClick={() => void handleProviderSave()}
                  disabled={!providerIsDirty || isSavingProvider}
                >
                  {isSavingProvider ? <Loader2 className="animate-spin" /> : <Save />}
                  Guardar proveedor
                </Button>
              </div>
              {transaction.proveedor && (
                <Link
                  to={`/proyecto/${transaction.proyecto}/proveedores`}
                  onClick={onClose}
                  className="mt-3 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Ver ficha del proveedor <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </section>

            <section className="border-t border-border">
              <div className="flex items-center justify-between gap-3 px-6 py-5">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Conceptos</h3>
                </div>
                <Badge variant="outline" className="rounded-none tabular-nums">
                  {conceptsTransaction === undefined ? <Loader2 className="h-3 w-3 animate-spin" /> : lineItems.length}
                </Badge>
              </div>

              {conceptsTransaction === undefined ? (
                <div className="flex min-h-40 items-center justify-center border-t border-border">
                  <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
                </div>
              ) : lineItems.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center border-t border-border px-6 text-center">
                  <ListChecks className="h-6 w-6 text-disabled-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">Sin conceptos</p>
                  <p className="mt-1 text-sm text-subtle-foreground">
                    Esta transacción todavía no tiene conceptos registrados.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border-t border-border px-6 py-5">
                  <div className="min-w-[760px] border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                          <TableHead className="h-10 w-12 px-3 text-xs font-medium text-subtle-foreground">#</TableHead>
                          <TableHead className="h-10 px-3 text-xs font-medium text-subtle-foreground">Partida</TableHead>
                          <TableHead className="h-10 px-3 text-xs font-medium text-subtle-foreground">Familia</TableHead>
                          <TableHead className="h-10 px-3 text-xs font-medium text-subtle-foreground">Subpartida</TableHead>
                          <TableHead className="h-10 px-3 text-right text-xs font-medium text-subtle-foreground">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item: LineItem, index: number) => (
                          <TableRow key={item._id} className="border-b border-border hover:bg-muted/30">
                            <TableCell className="px-3 py-3 text-xs tabular-nums text-subtle-foreground">
                              {index + 1}
                            </TableCell>
                            <TableCell className="max-w-64 px-3 py-3 text-sm font-medium text-foreground">
                              {item.partida_nombre_snapshot || item.partida?.nombre || item.concepto || "Sin partida"}
                            </TableCell>
                            <TableCell className="px-3 py-3 text-sm text-muted-foreground">
                              {item.familia_snapshot || item.partida?.familia || "—"}
                            </TableCell>
                            <TableCell className="px-3 py-3 text-sm text-muted-foreground">
                              {item.sub_partida_snapshot || item.partida?.sub_partida || item.concepto || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums">
                              {formatCurrency(item.monto, transaction.moneda)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="border-t border-border bg-card hover:bg-card">
                          <TableCell colSpan={4} className="px-3 py-3 text-right text-xs font-medium text-subtle-foreground">
                            Total de conceptos
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums">
                            {formatCurrency(lineItemsTotal, transaction.moneda)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
              )}
            </section>

            <section className="border-t border-border">
              <div className="flex items-center justify-between gap-3 px-6 py-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Documentos</h3>
                </div>
                <Badge variant="outline" className="rounded-none tabular-nums">
                  {documentsTransaction === undefined ? <Loader2 className="h-3 w-3 animate-spin" /> : documents.length}
                </Badge>
              </div>

              {canReviewInvoices && documentsTransaction && (
                <div className="border-t border-border">
                  <InvoiceAnalysisPanel transaction={documentsTransaction} />
                </div>
              )}

              {documentsTransaction === undefined ? (
                <div className="flex min-h-40 items-center justify-center border-t border-border">
                  <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center border-t border-border px-6 text-center">
                  <FileText className="h-6 w-6 text-disabled-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">Sin documentos</p>
                  <p className="mt-1 text-sm text-subtle-foreground">
                    No hay archivos vinculados a esta transacción.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {documents.map((doc: Document) => {
                    const documentUrl = doc.url || doc.image;
                    const fileSize = formatFileSize(doc.size);

                    return (
                      <article
                        key={doc._id}
                        className="flex flex-col gap-4 px-6 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-muted/50">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{doc.nombre}</p>
                              <Badge variant="outline" className="rounded-none border-border bg-card px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
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
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
