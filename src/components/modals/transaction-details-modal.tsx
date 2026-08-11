import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, DollarSign, CreditCard, FileText, Building2, Hash } from "lucide-react";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import { Link } from "react-router";

export default function TransactionDetailsModal() {
  const { isOpen, onClose, transactionId } = useTransactionDetailsModal();
    
  const transaction = useQuery(
    api.transacciones.getTransactionById,
    transactionId ? { id: transactionId } : "skip"
  );

  const formatCurrency = (amount: number, currency: string = "MXN") => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Pagado":
        return "bg-green-50 text-green-700 border-green-200";
      case "Por pagar":
        return "bg-orange-50 text-orange-700 border-orange-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getTipoPagoColor = (tipoPago?: string) => {
    switch (tipoPago?.toLowerCase()) {
      case "efectivo":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "transferencia":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "tarjeta":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "cheque":
        return "bg-gray-50 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Detalles de Transacción</DialogTitle>
        </DialogHeader>

        {!transaction ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Transaction Summary */}
            <div className="bg-gray-50 rounded-none p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Monto Total</p>
                  <p className="text-3xl font-semibold text-gray-900">
                    {formatCurrency(transaction.monto_total, transaction.moneda)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(transaction.status)} rounded-none px-3 py-1 text-xs font-normal`}
                  >
                    {transaction.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`${getTipoPagoColor(transaction.tipo_pago)} rounded-none px-3 py-1 text-xs font-normal capitalize`}
                  >
                    {transaction.tipo_pago}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {transaction.fecha
                      ? new Date(transaction.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      : "-"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="h-4 w-4" />
                  <span>
                    {transaction.moneda} {transaction.tipo_cambio && `(TC: ${transaction.tipo_cambio})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Transaction Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Información de Pago</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <label className="text-sm font-medium text-gray-600">Proveedor</label>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {transaction.proveedor?.razon_social || "Sin proveedor"}
                  </p>
                  {transaction.proveedor && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">
                        {transaction.proveedor.is_archived
                          ? "Proveedor archivado"
                          : transaction.proveedor.tipo === "generico"
                            ? "Proveedor genérico"
                            : transaction.proveedor.is_complete ? "Datos completos" : "RFC pendiente"}
                      </p>
                      <Link
                        to={`/proyecto/${transaction.proyecto}/proveedores`}
                        onClick={onClose}
                        className="inline-block text-xs text-blue-600 hover:underline"
                      >
                        Ver proveedor
                      </Link>
                    </div>
                  )}
                </div>
                {/* Factura */}
                {transaction.factura && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <label className="text-sm font-medium text-gray-600">Factura</label>
                    </div>
                    <p className="text-sm text-gray-900 font-medium">{transaction.factura}</p>
                  </div>
                )}

                {/* Categoría */}
                {transaction.categoria && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Categoría</label>
                    <p className="text-sm text-gray-900 capitalize">{transaction.categoria}</p>
                  </div>
                )}

                {/* Código de Referencia */}
                {transaction.codigo_referencia && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-gray-400" />
                      <label className="text-sm font-medium text-gray-600">Código de Referencia</label>
                    </div>
                    <p className="text-sm text-gray-900">{transaction.codigo_referencia}</p>
                  </div>
                )}

                {/* Banco */}
                {transaction.banco && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <label className="text-sm font-medium text-gray-600">Banco</label>
                    </div>
                    <p className="text-sm text-gray-900">{transaction.banco}</p>
                  </div>
                )}

                {/* Tarjeta */}
                {transaction.tarjeta && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      <label className="text-sm font-medium text-gray-600">Tarjeta</label>
                    </div>
                    <p className="text-sm text-gray-900">{transaction.tarjeta}</p>
                  </div>
                )}

                {/* Número de Cuenta */}
                {transaction.numero_cuenta && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Número de Cuenta</label>
                    <p className="text-sm text-gray-900 font-mono">{transaction.numero_cuenta}</p>
                  </div>
                )}

                {/* Número de Transferencia */}
                {transaction.numero_transferencia && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Número de Transferencia</label>
                    <p className="text-sm text-gray-900 font-mono">{transaction.numero_transferencia}</p>
                  </div>
                )}

                {/* Comprobante */}
                {transaction.comprobante && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-600">Comprobante</label>
                    <p className="text-sm text-gray-900">{transaction.comprobante}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items & Documents Summary */}
            <div className="border-t pt-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-600">Conceptos (Line Items)</label>
                <p className="text-2xl font-semibold text-gray-900">
                  {transaction.lineItems?.length || 0}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-600">Documentos</label>
                <p className="text-2xl font-semibold text-gray-900">
                  {transaction.documents?.length || 0}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
