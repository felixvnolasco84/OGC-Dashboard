import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface SaleTransactionDetailsModalState {
  isOpen: boolean;
  transactionId: Id<"sales_transacciones"> | null;
  onOpen: (transactionId: Id<"sales_transacciones">) => void;
  onClose: () => void;
}

export const useSaleTransactionDetailsModal = create<SaleTransactionDetailsModalState>((set) => ({
  isOpen: false,
  transactionId: null,
  onOpen: (transactionId) => set({ isOpen: true, transactionId }),
  onClose: () => set({ isOpen: false, transactionId: null }),
}));
