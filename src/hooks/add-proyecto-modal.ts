import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface AddProyectoModalState {
  isOpen: boolean;
  proyectoId?: Id<"desarrollos">;
  mode: "create" | "edit";
  onOpen: (proyectoId?: Id<"desarrollos">) => void;
  onClose: () => void;
}

export const useAddProyectoModal = create<AddProyectoModalState>((set) => ({
  isOpen: false,
  mode: "create",
  proyectoId: undefined,
  onOpen: (proyectoId) =>
    set({
      isOpen: true,
      mode: proyectoId ? "edit" : "create",
      proyectoId,
    }),
  onClose: () =>
    set({
      isOpen: false,
      mode: "create",
      proyectoId: undefined,
    }),
}));
