import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadSalesProjectTransactionsModalState {
  isOpen: boolean;
  salesProyectoId: Id<"sales_projects"> | null;
  salesProyectoNombre: string | null;
  onOpen: (salesProyectoId: Id<"sales_projects">, salesProyectoNombre: string) => void;
  onClose: () => void;
}

export const useUploadSalesProjectTransactionsModal = create<UploadSalesProjectTransactionsModalState>((set) => ({
  isOpen: false,
  salesProyectoId: null,
  salesProyectoNombre: null,
  onOpen: (salesProyectoId: Id<"sales_projects">, salesProyectoNombre: string) => set({ isOpen: true, salesProyectoId, salesProyectoNombre }),
  onClose: () => set({ isOpen: false, salesProyectoId: null, salesProyectoNombre: null }),
}));
