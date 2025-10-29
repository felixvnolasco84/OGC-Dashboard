import { create } from "zustand";

interface AddProyectoModalState {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export const useAddProyectoModal = create<AddProyectoModalState>((set) => ({
  isOpen: false,
  onOpen: () =>
    set({
      isOpen: true,
    }),
  onClose: () =>
    set({
      isOpen: false,
    }),
}));
