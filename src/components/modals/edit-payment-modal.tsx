import { useEditPaymentModal } from "@/hooks/edit-payment-modal";
import PaymentEditSheet from "@/components/payments/PaymentEditSheet";

export default function EditPaymentModal() {
  const { isOpen, paymentContext, onClose, session } = useEditPaymentModal();
  if (!isOpen || !paymentContext) return null;
  const payment = paymentContext.payment;
  return <PaymentEditSheet key={session} id={payment.transaccion_id} paymentId={payment._id} contextIds={[payment._id]} onClose={onClose} />;
}
