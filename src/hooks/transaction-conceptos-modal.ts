import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface TransactionConceptosModalState {
  isOpen: boolean;
  transactionId: Id<"transacciones"> | null;
  onOpen: (transactionId: Id<"transacciones">) => void;
  onClose: () => void;
}

export const useTransactionConceptosModal = create<TransactionConceptosModalState>((set) => ({
  isOpen: false,
  transactionId: null,
  onOpen: (transactionId) => set({ isOpen: true, transactionId }),
  onClose: () => set({ isOpen: false, transactionId: null }),
}));
