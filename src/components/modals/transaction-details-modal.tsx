import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";

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

export default function TransactionDetailsModal() {
  const { isOpen, onClose, transactionId } = useTransactionDetailsModal();

  const transaction = useQuery(
    api.transacciones.getTransactionDetailsById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );

  const formatCurrency = (amount: number, currency?: string) => {
    const safeCurrency = /^[A-Z]{3}$/.test(currency || "") ? currency : "MXN";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const statusClass = transaction?.status === "Pagado"
    ? "border-green-200 bg-green-50 text-green-700"
    : transaction?.status === "Por pagar"
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : "border-border bg-muted text-muted-foreground";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-square-modal=""
        className="max-h-[90vh] max-w-2xl gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle className="text-lg font-medium">Detalle de transacción</DialogTitle>
          <DialogDescription>
            {transaction?.factura
              ? `Factura ${transaction.factura}`
              : transaction?.codigo_referencia
                ? `Referencia ${transaction.codigo_referencia}`
                : "Información general del pago"}
          </DialogDescription>
        </DialogHeader>

        {!transaction ? (
          <div className="flex min-h-64 items-center justify-center" aria-label="Cargando transacción">
            <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
          </div>
        ) : (
          <div className="max-h-[calc(90vh-81px)] overflow-y-auto">
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
              <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:gap-x-8 sm:[&>*:nth-child(2)]:border-t-0">
                <DetailItem label="Proveedor">
                  <span>{transaction.proveedor?.razon_social || "Sin proveedor"}</span>
                  {transaction.proveedor && (
                    <Link
                      to={`/proyecto/${transaction.proyecto}/proveedores`}
                      onClick={onClose}
                      className="mt-1 flex w-fit items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
                    >
                      Ver proveedor <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </DetailItem>
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

            <section className="grid grid-cols-2 divide-x divide-border border-t border-border bg-muted/40">
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Conceptos</p>
                <p className="mt-0.5 text-lg font-medium tabular-nums">{transaction.lineItemsCount || 0}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Documentos</p>
                <p className="mt-0.5 text-lg font-medium tabular-nums">{transaction.documentsCount || 0}</p>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
