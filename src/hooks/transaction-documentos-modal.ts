import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface TransactionDocumentosModalState {
  isOpen: boolean;
  transactionId: Id<"transacciones"> | null;
  invoiceId: Id<"invoice_records"> | null;
  onOpen: (transactionId: Id<"transacciones">, invoiceId?: Id<"invoice_records">) => void;
  onClose: () => void;
}

export const useTransactionDocumentosModal = create<TransactionDocumentosModalState>((set) => ({
  isOpen: false,
  transactionId: null,
  invoiceId: null,
  onOpen: (transactionId, invoiceId) => set({ isOpen: true, transactionId, invoiceId: invoiceId || null }),
  onClose: () => set({ isOpen: false, transactionId: null, invoiceId: null }),
}));
