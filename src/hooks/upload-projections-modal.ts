import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadProjectionsModalState {
  isOpen: boolean;
  proyectoId: Id<"desarrollos"> | null;
  onOpen: (proyectoId: Id<"desarrollos">) => void;
  onClose: () => void;
}

export const useUploadProjectionsModal = create<UploadProjectionsModalState>((set) => ({
  isOpen: false,
  proyectoId: null,
  onOpen: (proyectoId) => set({ isOpen: true, proyectoId }),
  onClose: () => set({ isOpen: false, proyectoId: null }),
}));
