import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadSalesProyectoDocumentsModalStore {
    isOpen: boolean;
    salesProyectoId?: Id<"sales_projects">;
    transactionId?: Id<"sales_transacciones">;
    onOpen: (salesProyectoId: Id<"sales_projects">, transactionId?: Id<"sales_transacciones">) => void;
    onClose: () => void;
}

export const useUploadSalesProyectoDocumentsModal = create<UploadSalesProyectoDocumentsModalStore>((set) => ({
    isOpen: false,
    salesProyectoId: undefined,
    transactionId: undefined,
    onOpen: (salesProyectoId, transactionId) => set({
        isOpen: true,
        salesProyectoId,
        transactionId
    }),
    onClose: () => set({ isOpen: false, salesProyectoId: undefined, transactionId: undefined }),
}));
