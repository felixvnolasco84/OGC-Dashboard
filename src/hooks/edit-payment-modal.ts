import { Doc, Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

// Type for enriched payment with transaction data
type EnrichedPayment = Doc<"pagos"> & {
    transaction?: Doc<"transacciones"> | null;
};

type EditPaymentContext = {
    payment: EnrichedPayment;
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
        // Pre-fill form with transaction data (payment details) and pago data (line item amount)
        const payment = paymentContext.payment;
        const transaction = payment.transaction;
        
        const prefilledData: PaymentFormData = {
            // Line item amount from pagos table
            monto: payment.monto || 0,
            // All other fields from transacciones table
            fecha: transaction?.fecha || "",
            tipo_pago: transaction?.tipo_pago || "efectivo",
            banco: transaction?.banco || "",
            tarjeta: transaction?.tarjeta || "",
            numero_cuenta: transaction?.numero_cuenta || "",
            numero_transferencia: transaction?.numero_transferencia || "",
            codigo_referencia: transaction?.codigo_referencia || "",
            factura: transaction?.factura || "",
            moneda: transaction?.moneda || "MXN",
            tipo_cambio: transaction?.tipo_cambio || "1",
            status: transaction?.status || "",
            proyecto: transaction?.proyecto || ("" as Id<"desarrollos">),
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
