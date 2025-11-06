import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadProyectoDocumentsModalStore {
    isOpen: boolean;
    proyectoId?: Id<"desarrollos">;
    transactionId?: Id<"transacciones">;
    onOpen: (proyectoId: Id<"desarrollos">, transactionId?: Id<"transacciones">) => void;
    onClose: () => void;
}

export const useUploadProyectoDocumentsModal = create<UploadProyectoDocumentsModalStore>((set) => ({
    isOpen: false,
    proyectoId: undefined,
    transactionId: undefined,
    onOpen: (proyectoId, transactionId) => set({ 
        isOpen: true, 
        proyectoId, 
        transactionId 
    }),
    onClose: () => set({ isOpen: false, proyectoId: undefined, transactionId: undefined }),
}));
