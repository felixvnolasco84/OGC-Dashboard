import { create } from "zustand";

interface UploadTransactionsModalState {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export const useUploadTransactionsModal = create<UploadTransactionsModalState>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));
