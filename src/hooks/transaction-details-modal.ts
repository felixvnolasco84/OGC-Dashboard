import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface TransactionDetailsModalState {
  isOpen: boolean;
  transactionId: Id<"transacciones"> | null;
  onOpen: (transactionId: Id<"transacciones">) => void;
  onClose: () => void;
}

export const useTransactionDetailsModal = create<TransactionDetailsModalState>((set) => ({
  isOpen: false,
  transactionId: null,
  onOpen: (transactionId) => set({ isOpen: true, transactionId }),
  onClose: () => set({ isOpen: false, transactionId: null }),
}));
