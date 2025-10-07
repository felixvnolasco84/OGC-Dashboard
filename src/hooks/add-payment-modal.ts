import { Doc, Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPaymentContext = {
    relatedCost: Doc<"partidas">;
    totalAmount: number;
    remainingAmount?: number;
};

type PaymentFormData = {
    monto: string;
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
    informacion_facturacion_pago?: Id<"informacion_facturacion_pago">;
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
    monto: "",
    fecha: new Date().toISOString().split('T')[0],
    tipo_pago: "efectivo",
    moneda: "MXN",
    tipo_cambio: "1",
    informacion_facturacion_pago: undefined,
    codigo_referencia: "",
    factura: "",
    banco: "",
    tarjeta: "",
    numero_cuenta: "",
    numero_transferencia: "",
    familia: "",
    sub_partida: "",
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
