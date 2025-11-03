"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useEditPaymentModal } from "@/hooks/edit-payment-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";

export default function EditPaymentModal() {
    const paymentContext = useEditPaymentModal((state) => state.paymentContext);
    const isOpen = useEditPaymentModal((state) => state.isOpen);
    const onClose = useEditPaymentModal((state) => state.onClose);
    const formData = useEditPaymentModal((state) => state.formData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editedAmount, setEditedAmount] = useState<number | null>(null);
    const updatePago = useMutation(api.pagos.updatePago);

    const getCurrentAmount = () => {
        return editedAmount !== null ? editedAmount : formData.monto;
    };

    const handleAmountChange = (value: number) => {
        setEditedAmount(value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext?.payment._id) return;

        setIsSubmitting(true);
        try {
            // Update the individual pago amount
            await updatePago({
                id: paymentContext.payment._id,
                monto: getCurrentAmount(),
            });

            // If there's a transaction, update its total amount
            if (paymentContext.payment.transaction?._id) {
                // Note: The transaction total will be recalculated by triggers
                // but we can manually update it here for immediate feedback
            }
            
            onClose();
            setEditedAmount(null);
        } catch (error) {
            console.error("Error updating payment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        const amount = getCurrentAmount();
        return amount && amount > 0;
    };

    if (!paymentContext) return null;

    const { relatedCost, payment } = paymentContext;
    const transaction = payment.transaction;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Editar pago</SheetTitle>
                    <SheetDescription className="sr-only">
                        Modifica la información del pago seleccionado
                    </SheetDescription>
                </SheetHeader>

                {/* Payment Form */}
                <form onSubmit={handleSubmit} className="mt-6 space-y-6">

                 {/* Partida Information - Read Only */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Concepto del pago</h3>
                        <div className="border rounded-lg p-4 bg-gray-50">
                            <p className="text-sm text-gray-900">
                                {relatedCost.nombre} › {relatedCost.familia} › {relatedCost.sub_partida}
                            </p>
                        </div>
                    </div>

                    {/* Payment Summary */}
                    <div className="bg-gray-50 p-4 rounded-lg border">
                        <p className="text-sm text-gray-600 mb-1">Monto del pago</p>
                        <div className="flex items-center gap-2">
                            <span className="text-lg text-gray-500">$</span>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={getCurrentAmount()}
                                onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
                                className="text-2xl font-semibold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                                required
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Pago individual
                        </p>
                    </div>

                    {/* Transaction Status - Read Only */}
                    {transaction && (
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-gray-900">Estado de la transacción</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div
                                    className={cn(
                                        "flex items-center gap-2 p-4 rounded-lg border-2",
                                        transaction.status === 'Pagado'
                                            ? "border-green-500 bg-green-50"
                                            : "border-gray-200 bg-gray-50"
                                    )}
                                >
                                    <Check className={cn(
                                        "h-5 w-5",
                                        transaction.status === 'Pagado' ? "text-green-600" : "text-gray-400"
                                    )} />
                                    <span className={cn(
                                        "font-medium",
                                        transaction.status === 'Pagado' ? "text-green-700" : "text-gray-600"
                                    )}>Pagado</span>
                                </div>
                                <div
                                    className={cn(
                                        "flex items-center gap-2 p-4 rounded-lg border-2",
                                        transaction.status === 'Por pagar'
                                            ? "border-gray-500 bg-gray-50"
                                            : "border-gray-200 bg-gray-50"
                                    )}
                                >
                                    <Circle className={cn(
                                        "h-5 w-5",
                                        transaction.status === 'Por pagar' ? "text-gray-600" : "text-gray-400"
                                    )} />
                                    <span className={cn(
                                        "font-medium",
                                        transaction.status === 'Por pagar' ? "text-gray-700" : "text-gray-600"
                                    )}>Por pagar</span>
                                </div>
                            </div>
                        </div>
                    )}

   

                    {/* Transaction Details - Read Only */}
                    {transaction && (
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-gray-900">Detalles de la transacción</h3>
                            <div className="grid grid-cols-1 gap-2 text-sm border rounded-lg p-4 bg-gray-50">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Fecha</span>
                                    <span className="text-gray-900">{transaction.fecha}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Tipo de pago</span>
                                    <span className="text-gray-900 capitalize">{transaction.tipo_pago}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Moneda</span>
                                    <span className="text-gray-900">{transaction.moneda}</span>
                                </div>
                                {transaction.banco && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Banco</span>
                                        <span className="text-gray-900">{transaction.banco}</span>
                                    </div>
                                )}
                                {transaction.categoria && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Categoría</span>
                                        <span className="text-gray-900 capitalize">{transaction.categoria}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid() || isSubmitting}
                            className="bg-black hover:bg-gray-800 text-white"
                        >
                            {isSubmitting ? 'Actualizando...' : 'Actualizar pago'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
