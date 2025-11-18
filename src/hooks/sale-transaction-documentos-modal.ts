import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface SaleTransactionDocumentosModalState {
  isOpen: boolean;
  transactionId: Id<"sales_transacciones"> | null;
  onOpen: (transactionId: Id<"sales_transacciones">) => void;
  onClose: () => void;
}

export const useSaleTransactionDocumentosModal = create<SaleTransactionDocumentosModalState>((set) => ({
  isOpen: false,
  transactionId: null,
  onOpen: (transactionId) => set({ isOpen: true, transactionId }),
  onClose: () => set({ isOpen: false, transactionId: null }),
}));
