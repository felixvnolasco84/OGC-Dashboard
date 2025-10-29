import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface EditProyectoModalState {
  isOpen: boolean;
  proyectoId?: Id<"desarrollos">;
  onOpen: (proyectoId: Id<"desarrollos">) => void;
  onClose: () => void;
}

export const useEditProyectoModal = create<EditProyectoModalState>((set) => ({
  isOpen: false,
  proyectoId: undefined,
  onOpen: (proyectoId) =>
    set({
      isOpen: true,
      proyectoId,
    }),
  onClose: () =>
    set({
      isOpen: false,
      proyectoId: undefined,
    }),
}));
