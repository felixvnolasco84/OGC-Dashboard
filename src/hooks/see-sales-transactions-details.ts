import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

// Type for enriched sales payment with transaction and partida data
type EnrichedSalesPayment = Doc<"sales_pagos"> & {
    // Fields from sales transaction
    proyecto?: string;
    fecha?: string;
    tipo_pago?: string;
    moneda?: string;
    status?: string;
    nombre_cliente?: string;
    codigo_referencia?: string;
    numero_cuenta?: string;
    numero_transferencia?: string;
    factura?: string;
    tipo_cambio?: string;
    // Fields from sales partida
    partida?: string;
    familia?: string;
    sub_partida?: string;
    // Transaction object reference
    transaction?: Doc<"sales_transacciones"> | null;
};

type SalesPaymentContext = {
    payments: EnrichedSalesPayment[];
    relatedPartida?: Doc<"sales_partidas">;
    totalAmount: number;
};

type SeeSalesPaymentDetailsStore = {
    paymentContext?: SalesPaymentContext;
    isOpen: boolean;
    onOpen: (context: SalesPaymentContext) => void;
    onClose: () => void;
};

export const useSeeSalesPaymentDetailsModal = create<SeeSalesPaymentDetailsStore>((set) => ({
    isOpen: false,
    onOpen: (paymentContext: SalesPaymentContext) => set({ isOpen: true, paymentContext }),
    onClose: () => set({ isOpen: false, paymentContext: undefined }),
}));
