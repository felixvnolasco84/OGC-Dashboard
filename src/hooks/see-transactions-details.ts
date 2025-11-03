import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

// Type for enriched payment with transaction and partida data
// These fields are added by backend queries (pagos.ts)
type EnrichedPayment = Doc<"pagos"> & {
    // Fields from transaction
    proyecto?: string;
    fecha?: string;
    tipo_pago?: string;
    moneda?: string;
    status?: string;
    banco?: string;
    codigo_referencia?: string;
    numero_cuenta?: string;
    numero_transferencia?: string;
    factura?: string;
    tipo_cambio?: string;
    tarjeta?: string;
    // Fields from partida
    partida?: string;
    familia?: string;
    sub_partida?: string;
    administracion?: string;
    // Transaction object reference
    transaction?: Doc<"transacciones"> | null;
};

type PaymentContext = {
    payments: EnrichedPayment[];
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
