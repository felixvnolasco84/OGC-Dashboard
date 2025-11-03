import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import TransactionCard from "./TransactionCard";

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

interface TransactionCardWithDocumentsProps {
  transaction: Doc<"transacciones">;
  lineItems: EnrichedPayment[];
  index: number;
  formatCurrency: (amount: string | number) => string;
}

export default function TransactionCardWithDocuments({
  transaction,
  lineItems,
  index,
  formatCurrency
}: TransactionCardWithDocumentsProps) {
  // Query documents for this specific transaction
  const documents = useQuery(
    api.documentos.getByTransaccion,
    { transaccion_id: transaction._id }
  );

  return (
    <TransactionCard
      transaction={transaction}
      lineItems={lineItems}
      index={index}
      formatCurrency={formatCurrency}
      documents={documents || []}
    />
  );
}
