import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadSalesDocumentsModalStore {
    isOpen: boolean;
    transactionId?: Id<"sales_transacciones">;
    projectId?: Id<"sales_projects">;
    onOpen: (data?: { transactionId?: Id<"sales_transacciones">; projectId?: Id<"sales_projects"> }) => void;
    onClose: () => void;
}

export const useUploadSalesDocumentsModal = create<UploadSalesDocumentsModalStore>((set) => ({
    isOpen: false,
    transactionId: undefined,
    projectId: undefined,
    onOpen: (data) => set({ 
        isOpen: true, 
        transactionId: data?.transactionId, 
        projectId: data?.projectId 
    }),
    onClose: () => set({ isOpen: false, transactionId: undefined, projectId: undefined }),
}));
