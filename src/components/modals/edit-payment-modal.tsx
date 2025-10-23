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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Circle, Upload } from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";

export default function EditPaymentModal() {
    const paymentContext = useEditPaymentModal((state) => state.paymentContext);
    const isOpen = useEditPaymentModal((state) => state.isOpen);
    const onClose = useEditPaymentModal((state) => state.onClose);
    const formData = useEditPaymentModal((state) => state.formData);
    const updateFormData = useEditPaymentModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const updateTransaction = useMutation(api.transacciones.updateTransaction);

    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext?.payment.transaction?._id) return;

        setIsSubmitting(true);
        try {
            // Update the transaction (payment details)
            await updateTransaction({
                id: paymentContext.payment.transaction._id,
                fecha: formData.fecha,
                tipo_pago: formData.tipo_pago,
                moneda: formData.moneda,
                tipo_cambio: formData.tipo_cambio,
                status: formData.status,
                banco: formData.banco,
                tarjeta: formData.tarjeta,
                numero_cuenta: formData.numero_cuenta,
                numero_transferencia: formData.numero_transferencia,
                codigo_referencia: formData.codigo_referencia,
                factura: formData.factura,
            });
            
            // Note: Line item amount (monto) updates would require a separate mutation
            // For now, we only update transaction-level details
            
            onClose();
        } catch (error) {
            console.error("Error updating transaction:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return formData.monto &&
            formData.monto > 0 &&
            formData.fecha &&
            formData.tipo_pago &&
            formData.status;
    };

    if (!paymentContext) return null;

    const { relatedCost } = paymentContext;

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
                    {/* Status Selection */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Tipo de pago</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => handleInputChange('status', 'Pagado')}
                                className={cn(
                                    "flex items-center gap-2 p-4 rounded-lg border-2 transition-all",
                                    formData.status === 'Pagado'
                                        ? "border-green-500 bg-green-50"
                                        : "border-gray-200 bg-white hover:border-gray-300"
                                )}
                            >
                                <Check className={cn(
                                    "h-5 w-5",
                                    formData.status === 'Pagado' ? "text-green-600" : "text-gray-400"
                                )} />
                                <span className={cn(
                                    "font-medium",
                                    formData.status === 'Pagado' ? "text-green-700" : "text-gray-600"
                                )}>Pagado</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleInputChange('status', 'Por pagar')}
                                className={cn(
                                    "flex items-center gap-2 p-4 rounded-lg border-2 transition-all",
                                    formData.status === 'Por pagar'
                                        ? "border-gray-500 bg-gray-50"
                                        : "border-gray-200 bg-white hover:border-gray-300"
                                )}
                            >
                                <Circle className={cn(
                                    "h-5 w-5",
                                    formData.status === 'Por pagar' ? "text-gray-600" : "text-gray-400"
                                )} />
                                <span className={cn(
                                    "font-medium",
                                    formData.status === 'Por pagar' ? "text-gray-700" : "text-gray-600"
                                )}>Por pagar</span>
                            </button>
                        </div>
                    </div>

                    {/* Partida Selection */}
                    <div className="space-y-2">
                        <Select value={relatedCost.nombre} disabled>
                            <SelectTrigger className="bg-gray-50">
                                <SelectValue placeholder="Partida" />
                            </SelectTrigger>
                        </Select>
                    </div>

                    {/* Familia */}
                    <div className="space-y-2">
                        <Select value={relatedCost.familia} disabled>
                            <SelectTrigger className="bg-gray-50">
                                <SelectValue placeholder="Familia" />
                            </SelectTrigger>
                        </Select>
                    </div>

                    {/* Sub-partida */}
                    <div className="space-y-2">
                        <Select value={relatedCost.sub_partida} disabled>
                            <SelectTrigger className="bg-gray-50">
                                <SelectValue placeholder="Subpartida" />
                            </SelectTrigger>
                        </Select>
                    </div>

                    {/* Payment Details - Two Columns */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Select value={formData.tipo_pago} onValueChange={(value) => handleInputChange('tipo_pago', value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tipo de pago" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="efectivo">Efectivo</SelectItem>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Select value={formData.moneda} onValueChange={(value) => handleInputChange('moneda', value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Moneda" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MXN">MXN</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Input
                                type="number"
                                step="0.01"
                                placeholder="Monto"
                                value={formData.monto}
                                onChange={(e) => handleInputChange('monto', e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Input
                                type="date"
                                placeholder="Fecha de pago"
                                value={formData.fecha}
                                onChange={(e) => handleInputChange('fecha', e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Conditional Bank Details based on tipo_pago */}
                    {formData.tipo_pago && formData.tipo_pago !== 'efectivo' && (
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-gray-900">Detalles del pago</h3>
                            
                            {/* Banco field - shown for all non-cash payments */}
                            <div className="space-y-2">
                                <Input
                                    placeholder="Banco"
                                    value={formData.banco || ''}
                                    onChange={(e) => handleInputChange('banco', e.target.value)}
                                />
                            </div>

                            {/* Card number - only for tarjeta */}
                            {formData.tipo_pago === 'tarjeta' && (
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Últimos 4 dígitos de tarjeta"
                                        value={formData.tarjeta || ''}
                                        onChange={(e) => handleInputChange('tarjeta', e.target.value)}
                                        maxLength={19}
                                    />
                                </div>
                            )}

                            {/* Account details - for transferencia, tarjeta, and cheque */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Input
                                        placeholder="Número de cuenta"
                                        value={formData.numero_cuenta || ''}
                                        onChange={(e) => handleInputChange('numero_cuenta', e.target.value)}
                                    />
                                </div>
                                
                                {/* Transfer number - only for transferencia */}
                                {formData.tipo_pago === 'transferencia' && (
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="Número de transferencia"
                                            value={formData.numero_transferencia || ''}
                                            onChange={(e) => handleInputChange('numero_transferencia', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Soporte Section */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Soporte</h3>
                        
                        <div className="space-y-3">
                            {/* Agregar factura */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Upload className="h-5 w-5" />
                                    <span className="text-sm">Agregar factura</span>
                                </div>
                            </div>

                            {/* Agregar comprobante */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Upload className="h-5 w-5" />
                                    <span className="text-sm">Agregar comprobante</span>
                                </div>
                            </div>

                            {/* Agregar presupuesto */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Upload className="h-5 w-5" />
                                    <span className="text-sm">Agregar presupuesto</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Descripción Section */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Descripción</h3>
                        <Input
                            placeholder="Notas adicionales"
                            value={formData.codigo_referencia || ''}
                            onChange={(e) => handleInputChange('codigo_referencia', e.target.value)}
                        />
                    </div>

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
                            {isSubmitting ? 'Actualizando...' : 'Actualizar'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
