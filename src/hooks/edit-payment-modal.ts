import { Doc, Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

// Type for payment with populated billing information from getById query


type EditPaymentContext = {
    payment: Doc<"pagos">;
    relatedCost: Doc<"partidas">;
    totalAmount: number;
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
    status: string;
    proyecto: Id<"desarrollos">;
};

type EditPaymentModalStore = {
    paymentContext?: EditPaymentContext;
    formData: PaymentFormData;
    isOpen: boolean;
    onOpen: (context: EditPaymentContext) => void;
    onClose: () => void;
    updateFormData: (data: Partial<PaymentFormData>) => void;
    resetForm: () => void;
};

const initialFormData: PaymentFormData = {
    monto: 0,
    fecha: "",
    tipo_pago: "efectivo",
    moneda: "MXN",
    tipo_cambio: "1",
    status: "",
    proyecto: "" as Id<"desarrollos">,
    codigo_referencia: "",
    factura: "",
    banco: "",
    tarjeta: "",
    numero_cuenta: "",
    numero_transferencia: "",
};

export const useEditPaymentModal = create<EditPaymentModalStore>((set) => ({
    isOpen: false,
    formData: initialFormData,
    onOpen: (paymentContext: EditPaymentContext) => {
        // Pre-fill form with existing payment data
        const payment = paymentContext.payment;
        const prefilledData: PaymentFormData = {
            monto: payment.monto || 0,
            fecha: payment.fecha || "",
            tipo_pago: payment.tipo_pago || "efectivo",
            banco: payment.banco || "",
            tarjeta: payment.tarjeta || "",
            numero_cuenta: payment.numero_cuenta || "",
            numero_transferencia: payment.numero_transferencia || "",
            codigo_referencia: payment.codigo_referencia || "",
            factura: payment.factura || "",
            moneda: payment.moneda || "MXN",
            tipo_cambio: payment.tipo_cambio || "1",
            status: payment.status || "",
            proyecto: payment.proyecto,

        };

        set({
            isOpen: true,
            paymentContext,
            formData: prefilledData
        });
    },
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
