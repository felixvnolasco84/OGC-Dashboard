import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPaymentContext = {
    relatedCost: Doc<"partidas">;
    totalAmount: number;
    remainingAmount?: number;
};

type PaymentFormData = {
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
    familia: string;
    sub_partida: string;
    status: string;
};

type AddPaymentModalStore = {
    paymentContext?: AddPaymentContext;
    formData: PaymentFormData;
    isOpen: boolean;
    onOpen: (context: AddPaymentContext) => void;
    onClose: () => void;
    updateFormData: (data: Partial<PaymentFormData>) => void;
    resetForm: () => void;
};

const initialFormData: PaymentFormData = {
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
    familia: "",
    sub_partida: "",
    status: "",
};

export const useAddPaymentModal = create<AddPaymentModalStore>((set) => ({
    isOpen: false,
    formData: initialFormData,
    onOpen: (paymentContext: AddPaymentContext) => set({
        isOpen: true,
        paymentContext,
        formData: { ...initialFormData }
    }),
    onClose: () => set({
        isOpen: false,
        paymentContext: undefined,
        formData: initialFormData
    }),
    updateFormData: (data: Partial<PaymentFormData>) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),
    resetForm: () => set({ formData: initialFormData }),
}));
