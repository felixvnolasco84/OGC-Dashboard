import { Doc, Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type EditTransactionContext = {
    transaction: Doc<"transacciones">;
    lineItems: Array<Doc<"pagos"> & {
        partida?: {
            _id: string;
            nombre: string;
            familia: string;
            sub_partida: string;
        };
    }>;
};

type TransactionFormData = {
    proveedor_id: Id<"proveedores"> | "";
    fecha: string;
    tipo_pago: string;
    banco: string;
    tarjeta: string;
    numero_cuenta: string;
    numero_transferencia: string;
    codigo_referencia: string;
    factura: string;
    comprobante: string;
    moneda: string;
    tipo_cambio: string;
    status: string;
    categoria: string;
};

type EditTransactionModalStore = {
    transactionContext?: EditTransactionContext;
    formData: TransactionFormData;
    isOpen: boolean;
    onOpen: (context: EditTransactionContext) => void;
    onClose: () => void;
    updateFormData: (data: Partial<TransactionFormData>) => void;
    resetForm: () => void;
};

const initialFormData: TransactionFormData = {
    proveedor_id: "",
    fecha: "",
    tipo_pago: "efectivo",
    moneda: "MXN",
    tipo_cambio: "1",
    status: "",
    categoria: "",
    codigo_referencia: "",
    factura: "",
    comprobante: "",
    banco: "",
    tarjeta: "",
    numero_cuenta: "",
    numero_transferencia: "",
};

export const useEditTransactionModal = create<EditTransactionModalStore>((set) => ({
    isOpen: false,
    formData: initialFormData,
    onOpen: (transactionContext: EditTransactionContext) => {
        const transaction = transactionContext.transaction;
        
        // Convert date from DD/MM/YYYY to YYYY-MM-DD for HTML date input
        const convertDateToISO = (dateStr: string): string => {
            if (!dateStr) return "";
            
            // Check if already in ISO format (YYYY-MM-DD)
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateStr;
            }
            
            // Convert from DD/MM/YYYY to YYYY-MM-DD
            if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                const [day, month, year] = dateStr.split('/');
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            return "";
        };
        
        const prefilledData: TransactionFormData = {
            proveedor_id: transaction.proveedor_id || "",
            fecha: convertDateToISO(transaction.fecha || ""),
            tipo_pago: (transaction.tipo_pago || "efectivo").toLowerCase(),
            banco: transaction.banco || "",
            tarjeta: transaction.tarjeta || "",
            numero_cuenta: transaction.numero_cuenta || "",
            numero_transferencia: transaction.numero_transferencia || "",
            codigo_referencia: transaction.codigo_referencia || "",
            factura: transaction.factura || "",
            comprobante: transaction.comprobante || "",
            moneda: transaction.moneda || "MXN",
            tipo_cambio: transaction.tipo_cambio || "1",
            status: transaction.status || "",
            categoria: (transaction.categoria || "").toLowerCase(),
        };

        set({
            isOpen: true,
            transactionContext,
            formData: prefilledData
        });
    },
    onClose: () => set({
        isOpen: false,
        transactionContext: undefined,
        formData: initialFormData
    }),
    updateFormData: (data: Partial<TransactionFormData>) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),
    resetForm: () => set({ formData: initialFormData }),
}));
