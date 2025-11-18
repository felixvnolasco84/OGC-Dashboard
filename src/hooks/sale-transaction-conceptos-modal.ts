import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface SaleTransactionConceptosModalState {
  isOpen: boolean;
  transactionId: Id<"sales_transacciones"> | null;
  onOpen: (transactionId: Id<"sales_transacciones">) => void;
  onClose: () => void;
}

export const useSaleTransactionConceptosModal = create<SaleTransactionConceptosModalState>((set) => ({
  isOpen: false,
  transactionId: null,
  onOpen: (transactionId) => set({ isOpen: true, transactionId }),
  onClose: () => set({ isOpen: false, transactionId: null }),
}));
