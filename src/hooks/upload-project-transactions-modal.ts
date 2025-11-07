import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadProjectTransactionsModalState {
  isOpen: boolean;
  proyectoId: Id<"desarrollos"> | null;
  proyectoNombre: string | null;
  onOpen: (proyectoId: Id<"desarrollos">, proyectoNombre: string) => void;
  onClose: () => void;
}

export const useUploadProjectTransactionsModal = create<UploadProjectTransactionsModalState>((set) => ({
  isOpen: false,
  proyectoId: null,
  proyectoNombre: null,
  onOpen: (proyectoId: Id<"desarrollos">, proyectoNombre: string) => set({ isOpen: true, proyectoId, proyectoNombre }),
  onClose: () => set({ isOpen: false, proyectoId: null, proyectoNombre: null }),
}));
