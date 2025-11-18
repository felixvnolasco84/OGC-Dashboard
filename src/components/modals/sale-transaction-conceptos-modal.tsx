import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSaleTransactionConceptosModal } from "@/hooks/sale-transaction-conceptos-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layers } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

// Type definitions - using actual backend types
type LineItem = {
  _id: Id<"sales_pagos">;
  sales_partida_id: Id<"sales_partidas">;
  monto: number;
  partida?: {
    _id: Id<"sales_partidas">;
    nombre: string;
    familia: string;
    sub_partida: string;
  } | null;
};

type GroupedItem = {
  partida: string;
  familia: string;
  items: LineItem[];
  total: number;
};

type GroupedItems = Record<string, GroupedItem>;

export default function SaleTransactionConceptosModal() {
  const { isOpen, onClose, transactionId } = useSaleTransactionConceptosModal();
  
  const transaction = useQuery(
    api.sales_transacciones.getTransactionById,
    transactionId ? { id: transactionId } : "skip"
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Group line items by partida
  const groupedItems = transaction?.lineItems?.reduce((acc: GroupedItems, item: LineItem) => {
    const partidaId = item.sales_partida_id;
    if (!acc[partidaId]) {
      acc[partidaId] = {
        partida: item.partida?.nombre || "N/A",
        familia: item.partida?.familia || "N/A",
        items: [],
        total: 0,
      };
    }
    acc[partidaId].items.push(item);
    acc[partidaId].total += item.monto;
    return acc;
  }, {} as GroupedItems);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Conceptos de Transacción de Venta</DialogTitle>
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
              <div className="border border-gray-200 rounded-none">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Partida
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Familia
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Sub-partida
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Monto
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {transaction.lineItems.map((item, index: number) => (
                      <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">
                              {item.partida?.nombre || "N/A"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.partida?.familia || "N/A"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.partida?.sub_partida || "N/A"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(item.monto)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                        Total:
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-bold text-gray-900">
                          {formatCurrency(
                            transaction.lineItems.reduce((sum: number, item: LineItem) => sum + item.monto, 0)
                          )}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
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
