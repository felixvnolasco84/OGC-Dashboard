import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import EditPaymentModal from "@/components/modals/edit-payment-modal";
import EditTransactionModal from "@/components/modals/edit-transaction-modal";
import { useEditPaymentModal } from "@/hooks/edit-payment-modal";
import { useEditTransactionModal } from "@/hooks/edit-transaction-modal";
import { initial } from "./convex-stub";
import "@/index.css";

function Preview() {
  const payment = useEditPaymentModal(), transaction = useEditTransactionModal();
  return <main className="min-h-screen bg-background p-6 text-foreground"><h1 className="text-xl font-semibold">Prueba aislada · edición de pagos</h1>
    <p className="mt-2 text-sm text-muted-foreground">Datos ficticios. Esta vista no se conecta a servicios financieros.</p>
    <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => transaction.onOpen({ transaction: initial.transaction, lineItems: [initial.lineItems[0]] } as any)}>Editar transacción desde familia</Button>
      <Button onClick={() => payment.onOpen({ payment: { ...initial.lineItems[0], transaction: initial.transaction }, relatedCost: initial.lineItems[0].partida, totalAmount: 2000 } as any)}>Editar concepto A</Button>
      <Button onClick={() => payment.onOpen({ payment: { ...initial.lineItems[1], transaction: initial.transaction }, relatedCost: initial.lineItems[1].partida, totalAmount: 4000 } as any)}>Editar concepto B</Button></div>
    <EditPaymentModal /><EditTransactionModal /><Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
