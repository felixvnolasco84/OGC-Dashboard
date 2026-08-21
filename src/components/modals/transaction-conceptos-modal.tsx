import { useQuery } from "convex/react";
import { ListChecks, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTransactionConceptosModal } from "@/hooks/transaction-conceptos-modal";

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

function formatDate(value?: string) {
  if (!value) return "—";

  return new Date(value.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TransactionConceptosModal() {
  const { isOpen, onClose, transactionId } = useTransactionConceptosModal();

  const transaction = useQuery(
    api.transacciones.getTransactionConceptosById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );

  const formatCurrency = (amount: number) => {
    const currency = /^[A-Z]{3}$/.test(transaction?.moneda || "")
      ? transaction?.moneda || "MXN"
      : "MXN";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const lineItemsTotal = transaction?.lineItems?.reduce(
    (sum: number, item: LineItem) => sum + item.monto,
    0
  ) || 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-square-modal=""
        className="max-h-[90vh] max-w-5xl gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle className="text-lg font-medium">Conceptos</DialogTitle>
          <DialogDescription>
            {transaction?.factura ? `Factura ${transaction.factura}` : "Desglose de la transacción"}
          </DialogDescription>
        </DialogHeader>

        {!transaction ? (
          <div className="flex min-h-64 items-center justify-center" aria-label="Cargando conceptos">
            <Loader2 className="h-5 w-5 animate-spin text-subtle-foreground" />
          </div>
        ) : (
          <div className="max-h-[calc(90vh-81px)] overflow-y-auto">
            <section className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted/40">
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Conceptos</p>
                <p className="mt-1 text-lg font-medium tabular-nums">{transaction.lineItems?.length || 0}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Monto total</p>
                <p className="mt-1 text-lg font-medium tabular-nums">{formatCurrency(transaction.monto_total)}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs text-subtle-foreground">Fecha</p>
                <p className="mt-1 text-sm font-medium">{formatDate(transaction.fecha)}</p>
              </div>
            </section>

            {!transaction.lineItems || transaction.lineItems.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <ListChecks className="h-7 w-7 text-disabled-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">Sin conceptos</p>
                <p className="mt-1 max-w-sm text-sm text-subtle-foreground">
                  Esta transacción todavía no tiene conceptos registrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto px-6 py-5">
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
                      {transaction.lineItems.map((item, index: number) => (
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
                            {formatCurrency(item.monto)}
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
                          {formatCurrency(lineItemsTotal)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
