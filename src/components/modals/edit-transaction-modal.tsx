import { useEditTransactionModal } from "@/hooks/edit-transaction-modal";
import PaymentEditSheet from "@/components/payments/PaymentEditSheet";

export default function EditTransactionModal() {
  const { isOpen, transactionContext, onClose, session } = useEditTransactionModal();
  if (!isOpen || !transactionContext) return null;
  return <PaymentEditSheet key={session} id={transactionContext.transaction._id} contextIds={transactionContext.lineItems.map(p => p._id)} onClose={onClose} />;
}
