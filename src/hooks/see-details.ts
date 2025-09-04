import { create } from "zustand";

type SeeDetailsStore = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export const useSeeDetailsModal = create<SeeDetailsStore>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));
