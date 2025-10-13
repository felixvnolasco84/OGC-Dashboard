import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPaymentContext = {
    projectId: Id<"desarrollos">;
};

type PaymentFormData = {
    partida_id: Id<"partidas"> | "";
    partida: string;
    familia: string;
    sub_partida: string;
    monto: number;
    fecha: string;
    tipo_pago: string;
    banco: string;
    tarjeta: string;
    numero_cuenta: string;
    numero_transferencia: string;
    codigo_referencia: string;
    factura: string;
    moneda: string;
    tipo_cambio: string;
    status: string;
};

type AddPaymentModalStore = {
    paymentContext?: AddPaymentContext;
    payments: PaymentFormData[];
    isOpen: boolean;
    onOpen: (context: AddPaymentContext) => void;
    onClose: () => void;
    addPayment: () => void;
    removePayment: (index: number) => void;
    updatePayment: (index: number, data: Partial<PaymentFormData>) => void;
    resetForm: () => void;
};

const createEmptyPayment = (): PaymentFormData => ({
    partida_id: "",
    partida: "",
    familia: "",
    sub_partida: "",
    monto: 0,
    fecha: new Date().toISOString().split('T')[0],
    tipo_pago: "efectivo",
    moneda: "MXN",
    tipo_cambio: "1",
    codigo_referencia: "",
    factura: "",
    banco: "",
    tarjeta: "",
    numero_cuenta: "",
    numero_transferencia: "",
    status: "",
});

export const useAddPaymentModal = create<AddPaymentModalStore>((set) => ({
    isOpen: false,
    payments: [createEmptyPayment()],
    onOpen: (paymentContext: AddPaymentContext) => set({
        isOpen: true,
        paymentContext,
        payments: [createEmptyPayment()]
    }),
    onClose: () => set({
        isOpen: false,
        paymentContext: undefined,
        payments: [createEmptyPayment()]
    }),
    addPayment: () => set((state) => ({
        payments: [...state.payments, createEmptyPayment()]
    })),
    removePayment: (index: number) => set((state) => ({
        payments: state.payments.filter((_, i) => i !== index)
    })),
    updatePayment: (index: number, data: Partial<PaymentFormData>) => set((state) => ({
        payments: state.payments.map((p, i) => i === index ? { ...p, ...data } : p)
    })),
    resetForm: () => set({ payments: [createEmptyPayment()] }),
}));
