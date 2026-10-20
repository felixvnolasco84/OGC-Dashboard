import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { LaborImportHistoryDialog } from "@/components/transactions/LaborImportHistory";
import UploadProjectTransactionsModal from "@/components/modals/upload-project-transactions-modal";
import TransactionDetailsModal from "@/components/modals/transaction-details-modal";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import type { Id } from "../../convex/_generated/dataModel";
import "@/index.css";

function Preview() {
  const upload = useUploadProjectTransactionsModal();
  const details = useTransactionDetailsModal();
  return (
    <MemoryRouter>
      <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
        <h1 className="text-xl">Prueba local · respaldo de Excel</h1>
        <p className="mt-2 text-sm text-muted-foreground">Datos ficticios, sin conexión al backend.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LaborImportHistoryDialog projectId={"project" as Id<"desarrollos">} />
          <Button onClick={() => upload.onOpen("project" as Id<"desarrollos">, "Obra")}>Subir Excel de prueba</Button>
          <Button onClick={() => details.onOpen("transaction" as Id<"transacciones">)}>Ver transacción de prueba</Button>
        </div>
        <UploadProjectTransactionsModal />
        <TransactionDetailsModal />
        <Toaster />
      </main>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
