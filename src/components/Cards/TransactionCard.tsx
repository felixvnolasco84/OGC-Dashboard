import { Check, Lock, FileText, ExternalLink, Edit } from "lucide-react";
import { Doc } from "convex/_generated/dataModel";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

import { useEditTransactionModal } from "@/hooks/edit-transaction-modal";

type EnrichedPayment = Doc<"pagos"> & {
  proyecto?: string;
  fecha?: string;
  tipo_pago?: string;
  moneda?: string;
  status?: string;
  banco?: string;
  codigo_referencia?: string;
  numero_cuenta?: string;
  numero_transferencia?: string;
  factura?: string;
  tipo_cambio?: string;
  tarjeta?: string;
  partida?: string;
  familia?: string;
  sub_partida?: string;
  transaction?: Doc<"transacciones"> | null;
};

interface DocumentWithUrl extends Doc<"documentos"> {
  url: string | null;
}

interface TransactionCardProps {
  transaction: Doc<"transacciones">;
  lineItems: EnrichedPayment[];
  index: number;
  formatCurrency: (amount: string | number) => string;
  documents?: DocumentWithUrl[];
}

export default function TransactionCard({
  transaction,
  lineItems,
  index,
  formatCurrency,
  documents = []
}: TransactionCardProps) {
  const editTransactionModal = useEditTransactionModal();

  // Use the status property from transaction
  const isPagado = transaction.status === 'Pagado';

  // Calculate total from line items
  const totalAmount = lineItems.reduce((sum, item) => sum + item.monto, 0);
  const lineItemsCount = lineItems.length;

  const handleEdit = () => {
    editTransactionModal.onOpen({
      transaction,
      lineItems: lineItems.map(item => ({
        _id: item._id,
        _creationTime: item._creationTime,
        transaccion_id: item.transaccion_id,
        partida_id: item.partida_id,
        monto: item.monto,
        partida: item.partida && item.familia && item.sub_partida ? {
          _id: item.partida_id,
          nombre: item.partida,
          familia: item.familia,
          sub_partida: item.sub_partida,
        } : undefined,
      })),
    });
  };

  return (
    <div className="bg-white overflow-hidden">
      {/* Transaction Header */}
      <div className="p-4 border-b border-gray-400 leading-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-12 h-12 rounded-md flex items-center justify-center ${isPagado ? 'bg-[#E0F0E2]' : 'bg-orange-100'
              }`}>
              {isPagado ? (
                <div className="w-fit bg-green-800 rounded-full p-0.5">
                  <Check className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-fit bg-orange-800 rounded-full p-0.5">
                  <Lock className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {transaction.status || (isPagado ? 'Aprobado' : 'Pendiente')}
              </p>
              <p className="text-sm text-gray-600">
                Transacción #{String(index + 1).padStart(3, '0')} • {lineItemsCount} concepto{lineItemsCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="text-right flex items-center gap-3">
            <p className="text-xl text-gray-900">
              {formatCurrency(totalAmount)} {transaction.moneda || 'MXN'}
            </p>

          </div>
          <div className="flex">
            <Button
              onClick={handleEdit}
              variant="ghost"
              size="icon"
              className="justify-end ml-2 font-normal"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#777770]">Fecha</span>
            <span className="text-muted-foreground">{transaction.fecha}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#777770]">Método de pago</span>
            <span className="text-muted-foreground">{transaction.tipo_pago}</span>
          </div>
          {transaction.numero_cuenta && (
            <div className="flex justify-between">
              <span className="text-[#777770]">Cuenta cargo</span>
              <span className="text-muted-foreground">{transaction.numero_cuenta}</span>
            </div>
          )}
          {transaction.numero_transferencia && (
            <div className="flex justify-between">
              <span className="text-[#777770]">Cuenta abono</span>
              <span className="text-muted-foreground">{transaction.numero_transferencia}</span>
            </div>
          )}
          {transaction.codigo_referencia && (
            <div className="flex justify-between">
              <span className="text-[#777770]">Referencia</span>
              <span className="text-muted-foreground">{transaction.codigo_referencia}</span>
            </div>
          )}
        </div>

        {/* Line Items Summary */}
        {lineItemsCount > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-2">Conceptos incluidos:</p>
            <div className="space-y-1">
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate">
                    {item.partida && item.familia && item.sub_partida
                      ? `${item.partida} › ${item.familia} › ${item.sub_partida}`
                      : item.partida && item.familia
                        ? `${item.partida} › ${item.familia}`
                        : item.partida || 'Concepto'}
                  </span>
                  <span className="text-gray-900 ml-2 whitespace-nowrap">
                    {formatCurrency(item.monto)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2">
          {/* Additional Tags */}
          <div className="space-y-2 pt-2 flex flex-wrap gap-2">
            {transaction.banco && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                {transaction.banco}
              </span>
            )}
            {transaction.moneda && transaction.moneda !== 'MXN' && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                {transaction.moneda} {transaction.tipo_cambio && `(TC: ${transaction.tipo_cambio})`}
              </span>
            )}
            {transaction.tarjeta && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-700">
                {transaction.tarjeta}
              </span>
            )}
            {transaction.categoria && (
              <Badge className="rounded-sm" variant={"outline"}>
                {transaction.categoria}
              </Badge>

            )}
          </div>

          {/* File Attachments */}
          <div className="flex flex-col gap-2 pt-2 justify-end">
            {documents && documents.length > 0 ? (
              // Show documents from database with preview links
              documents.map((doc) => (
                doc.url ? (
                  <Button
                    key={doc._id}
                    onClick={() => window.open(doc.url!, '_blank')}
                    size={"md"}
                    className="flex items-center gap-2 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md justify-end transition-colors cursor-pointer"
                    title={`Ver ${doc.nombre}`}
                  >
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700 font-medium">
                      {doc.nombre}
                    </span>
                    <ExternalLink className="w-3 h-3 text-gray-600" />
                  </Button>
                ) : (
                  <div
                    key={doc._id}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md justify-end"
                    title={doc.nombre}
                  >
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700 font-medium">
                      {doc.nombre}
                    </span>
                  </div>
                )
              ))
            ) : (
              // Fallback to legacy fields if no documents
              <>
                {transaction.factura && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md justify-end">
                    <span className="text-sm text-gray-700">
                      {transaction.factura.includes('http') ? 'Factura' : transaction.factura}
                    </span>
                    <div className="w-fit bg-green-800 rounded-full p-0.5">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}
                {transaction.comprobante && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md justify-end">
                    <span className="text-sm text-gray-700">
                      {transaction.comprobante.includes('http') ? 'Comprobante' : transaction.comprobante}
                    </span>
                    <div className="w-fit bg-green-800 rounded-full p-0.5">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
