import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface RequisicionHistoryModalStore {
  isOpen: boolean;
  proyectoId: Id<"desarrollos"> | null;
  requisicionId: Id<"requisiciones"> | null; // For individual requisicion history
  mode: "all" | "single"; // Show all project history or single requisicion
  
  // Actions
  openAllHistory: (proyectoId: Id<"desarrollos">) => void;
  openSingleHistory: (proyectoId: Id<"desarrollos">, requisicionId: Id<"requisiciones">) => void;
  close: () => void;
}

export const useRequisicionHistoryModal = create<RequisicionHistoryModalStore>((set) => ({
  isOpen: false,
  proyectoId: null,
  requisicionId: null,
  mode: "all",
  
  openAllHistory: (proyectoId) => set({
    isOpen: true,
    proyectoId,
    requisicionId: null,
    mode: "all",
  }),
  
  openSingleHistory: (proyectoId, requisicionId) => set({
    isOpen: true,
    proyectoId,
    requisicionId,
    mode: "single",
  }),
  
  close: () => set({
    isOpen: false,
    proyectoId: null,
    requisicionId: null,
    mode: "all",
  }),
}));
