import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type PaymentContext = {
    payments: Doc<"pagos">[];
    relatedPartida?: Doc<"partidas">;
    totalAmount: number;
};

type SeePaymentDetailsStore = {
    paymentContext?: PaymentContext;
    isOpen: boolean;
    onOpen: (context: PaymentContext) => void;
    onClose: () => void;
};

export const useSeePaymentDetailsModal = create<SeePaymentDetailsStore>((set) => ({
    isOpen: false,
    onOpen: (paymentContext: PaymentContext) => set({ isOpen: true, paymentContext }),
    onClose: () => set({ isOpen: false, paymentContext: undefined }),
}));
