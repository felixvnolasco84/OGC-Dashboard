import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTransactionConceptosModal } from "@/hooks/transaction-conceptos-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Layers } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

// Type definitions
type Partida = {
  _id: Id<"partidas">;
  nombre: string;
  familia: string;
  sub_partida: string;
};

type LineItem = {
  _id: Id<"pagos">;
  partida_id?: Id<"partidas">;
  monto: number;
  concepto?: string;
  partida_nombre_snapshot?: string;
  familia_snapshot?: string;
  sub_partida_snapshot?: string;
  classification_status?: "mapped" | "custom" | "unresolved";
  partida?: Partida;
};

type GroupedItem = {
  partida: string;
  familia: string;
  items: LineItem[];
  total: number;
};

type GroupedItems = Record<string, GroupedItem>;

export default function TransactionConceptosModal() {
  const { isOpen, onClose, transactionId } = useTransactionConceptosModal();
  
  const transaction = useQuery(
    api.transacciones.getTransactionConceptosById,
    isOpen && transactionId ? { id: transactionId } : "skip"
  );

  const formatCurrency = (amount: number) => {
    const currency = /^[A-Z]{3}$/.test(transaction?.moneda || "") ? transaction!.moneda : "MXN";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Group line items by partida
  const groupedItems = transaction?.lineItems?.reduce((acc: GroupedItems, item: LineItem) => {
    const groupKey = String(item.partida_id || item.partida_nombre_snapshot || item.concepto || item._id);
    if (!acc[groupKey]) {
      acc[groupKey] = {
        partida: item.partida_nombre_snapshot || item.partida?.nombre || item.concepto || "Sin partida",
        familia: item.familia_snapshot || item.partida?.familia || "Concepto personalizado",
        items: [],
        total: 0,
      };
    }
    acc[groupKey].items.push(item);
    acc[groupKey].total += item.monto;
    return acc;
  }, {} as GroupedItems);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Conceptos de Transacción</DialogTitle>
          {transaction?.factura && (
            <p className="text-sm text-gray-500">Factura: {transaction.factura}</p>
          )}
        </DialogHeader>

        {!transaction ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-gray-50 rounded-none p-6">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Total Conceptos</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {transaction.lineItems?.length || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Monto Total</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(transaction.monto_total)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fecha</p>
                  <p className="text-sm text-gray-900">
                    {transaction.fecha
                      ? new Date(transaction.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            {!transaction.lineItems || transaction.lineItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No hay conceptos registrados para esta transacción
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 bg-white">
                <Table>
                  <TableHeader className="bg-white">
                    <TableRow className="border-b border-gray-200">
                      <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                        #
                      </TableHead>
                      <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                        Partida
                      </TableHead>
                      <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                        Familia
                      </TableHead>
                      <TableHead className="px-6 py-4 text-left text-base font-medium text-muted-foreground border-r border-gray-200 last:border-r-0">
                        Sub-partida
                      </TableHead>
                      <TableHead className="px-6 py-4 text-right text-base font-medium text-muted-foreground">
                        Monto
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transaction.lineItems.map((item, index: number) => (
                      <TableRow key={item._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <TableCell className="px-4 py-4 text-base text-gray-500 border-r border-gray-100 last:border-r-0">
                          {index + 1}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-base text-gray-900 border-r border-gray-100 last:border-r-0">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {item.partida_nombre_snapshot || item.partida?.nombre || item.concepto || "Sin partida"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-base text-gray-900 border-r border-gray-100 last:border-r-0">
                          {item.familia_snapshot || item.partida?.familia || "N/A"}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-base text-gray-900 border-r border-gray-100 last:border-r-0">
                          {item.sub_partida_snapshot || item.partida?.sub_partida || item.concepto || "N/A"}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right text-base text-gray-900">
                          <span className="font-medium text-gray-900">
                            {formatCurrency(item.monto)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="border-t border-gray-200 bg-white">
                    <TableRow className="hover:bg-gray-50">
                      <TableCell colSpan={4} className="px-4 py-4 text-right text-base font-medium text-gray-900 border-r border-gray-100">
                        Total:
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right text-base">
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(
                            transaction.lineItems.reduce((sum: number, item: LineItem) => sum + item.monto, 0)
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}

            {/* Grouped Summary by Partida */}
            {groupedItems && Object.keys(groupedItems).length > 1 && (
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-900">Resumen por Partida</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.values(groupedItems).map((group: GroupedItem, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-none p-4">
                      <p className="text-sm font-medium text-gray-900">{group.partida}</p>
                      <p className="text-xs text-gray-500">{group.familia}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant="outline" className="rounded-none text-xs">
                          {group.items.length} {group.items.length === 1 ? 'concepto' : 'conceptos'}
                        </Badge>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(group.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
