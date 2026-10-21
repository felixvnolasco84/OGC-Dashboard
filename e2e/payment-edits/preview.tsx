import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import EditPaymentModal from "@/components/modals/edit-payment-modal";
import EditTransactionModal from "@/components/modals/edit-transaction-modal";
import { useEditPaymentModal } from "@/hooks/edit-payment-modal";
import { useEditTransactionModal } from "@/hooks/edit-transaction-modal";
import { initial } from "./convex-stub";
import TransactionCard from "@/components/Cards/TransactionCard";
import AddPaymentModal from "@/components/modals/add-payment-modal";
import TransactionConceptosModal from "@/components/modals/transaction-conceptos-modal";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useTransactionConceptosModal } from "@/hooks/transaction-conceptos-modal";

function ConceptsPreview() {
  const add = useAddPaymentModal(), concepts = useTransactionConceptosModal();
  const start = (direct: boolean) => {
    add.onOpen({ projectId: "project" } as any);
    useAddPaymentModal.setState({ partidas: [{ id: "part", partida: "OBRA", isExpanded: true, familias: [{
      id: "family", familia: direct ? "CONCRETO" : "ACERO", isExpanded: true, monto: direct ? 100 : 0,
      partida_id: direct ? "family-direct" : "", subPartidas: [{ id: "sub", partida_id: direct ? "" : "leaf", sub_partida: direct ? "" : "VARILLA", monto: direct ? 0 : 100 }],
    }] }] } as any);
  };
  return <main className="min-h-screen bg-background p-2 text-foreground sm:p-6">
    <div data-testid="transaction-card" className="max-w-2xl border">
      <TransactionCard transaction={initial.transaction as any} index={0} formatCurrency={value => `$${Number(value).toFixed(2)}`} lineItems={initial.lineItems.map((p, i) => ({ ...p,
        partida: "OBRA", familia: i ? "CONCRETO" : "ACERO", sub_partida: i ? "" : "VARILLA",
        concepto_adicional: i ? undefined : "Entrega de acero para losa en frente norte · " + "detalle".repeat(25),
      })) as any} />
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={() => start(false)}>Crear con subpartida</Button>
      <Button onClick={() => start(true)}>Crear directo a familia</Button>
      <Button onClick={() => concepts.onOpen("tx" as any)}>Ver desglose</Button>
    </div>
    <AddPaymentModal /><TransactionConceptosModal /><EditTransactionModal /><Toaster />
  </main>;
}
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
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).get("case") === "concepts" ? <ConceptsPreview /> : <Preview />);
