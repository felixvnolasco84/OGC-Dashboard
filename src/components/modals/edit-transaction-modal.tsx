"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useEditTransactionModal } from "@/hooks/edit-transaction-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Doc, Id } from "../../../convex/_generated/dataModel";

export default function EditTransactionModal() {
    const transactionContext = useEditTransactionModal((state) => state.transactionContext);
    const isOpen = useEditTransactionModal((state) => state.isOpen);
    const { isAuthenticated } = useConvexAuth();
    const onClose = useEditTransactionModal((state) => state.onClose);
    const formData = useEditTransactionModal((state) => state.formData);
    const updateFormData = useEditTransactionModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editedLineItems, setEditedLineItems] = useState<Record<string, number>>({});
    const updateTransaction = useMutation(api.transacciones.updateTransaction);
    const updatePago = useMutation(api.pagos.updatePago);
    const providers = useQuery(
        api.proveedores.getAll,
        isOpen && isAuthenticated ? {} : "skip"
    );

    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };

    const handleLineItemChange = (itemId: string, newAmount: number) => {
        setEditedLineItems(prev => ({
            ...prev,
            [itemId]: newAmount
        }));
    };

    const getLineItemAmount = (item: Doc<"pagos">) => {
        if (item._id in editedLineItems) {
            return editedLineItems[item._id];
        }
        return item.monto;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transactionContext?.transaction._id) return;

        setIsSubmitting(true);
        try {
            // Update edited line items first
            for (const [itemId, newAmount] of Object.entries(editedLineItems)) {
                await updatePago({
                    id: itemId as Id<"pagos">,
                    monto: newAmount,
                });
            }

            // Calculate new total amount (including edited items)
            const newTotalAmount = transactionContext.lineItems.reduce((sum, item) => {
                const amount = getLineItemAmount(item);
                return sum + amount;
            }, 0);

            // Convert date from YYYY-MM-DD back to DD/MM/YYYY for storage
            const convertDateToDDMMYYYY = (dateStr: string): string => {
                if (!dateStr) return "";
                if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const [year, month, day] = dateStr.split('-');
                    return `${day}/${month}/${year}`;
                }
                return dateStr;
            };

            // Update transaction details with new total
            await updateTransaction({
                id: transactionContext.transaction._id,
                proveedor_id: formData.proveedor_id || null,
                monto_total: newTotalAmount,
                fecha: convertDateToDDMMYYYY(formData.fecha),
                tipo_pago: formData.tipo_pago.toUpperCase(),
                moneda: formData.moneda,
                tipo_cambio: formData.tipo_cambio,
                status: formData.status,
                categoria: formData.categoria.toUpperCase(),
                banco: formData.banco,
                tarjeta: formData.tarjeta,
                numero_cuenta: formData.numero_cuenta,
                numero_transferencia: formData.numero_transferencia,
                codigo_referencia: formData.codigo_referencia,
                factura: formData.factura,
                comprobante: formData.comprobante,
            });
            
            onClose();
            setEditedLineItems({});
        } catch (error) {
            console.error("Error updating transaction:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return formData.fecha &&
            formData.tipo_pago &&
            formData.status;
    };

    if (!transactionContext) return null;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    };

    const totalAmount = transactionContext.lineItems.reduce((sum, item) => {
        const amount = getLineItemAmount(item);
        return sum + amount;
    }, 0);

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Editar transacción</SheetTitle>
                    <SheetDescription className="sr-only">
                        Modifica la información de la transacción seleccionada
                    </SheetDescription>
                </SheetHeader>

                {/* Transaction Form */}
                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                    {/* Transaction Summary */}
                    <div className="bg-gray-50 p-4 rounded-lg border">
                        <p className="text-sm text-gray-600 mb-1">{transactionContext.transaction.monto_total === totalAmount ? "Monto total de la transacción" : "Monto total parcial"}</p>                        
                        <p className="text-2xl font-semibold">{formatCurrency(totalAmount)}</p>
                        {
                            transactionContext.transaction.monto_total !== totalAmount && (
                                <small className="text-muted-foreground">El monto total de la transacción es {formatCurrency(transactionContext.transaction.monto_total)}</small>
                            )
                        }
                        <p className="text-xs text-gray-500 mt-1">
                            {transactionContext.lineItems.length} concepto{transactionContext.lineItems.length !== 1 ? 's' : ''}
                        </p>
                    </div>

                    {/* Status Selection */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Estado</h3>
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

                    {/* Payment Details - Two Columns */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Detalles del pago</h3>

                        <Select
                            value={formData.proveedor_id || "none"}
                            onValueChange={(value) => updateFormData({
                                proveedor_id: value === "none" ? "" : value as Id<"proveedores">,
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sin proveedor" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin proveedor</SelectItem>
                                {providers?.map((provider) => (
                                    <SelectItem key={provider._id} value={provider._id}>
                                        {provider.razon_social}{provider.rfc ? ` · ${provider.rfc}` : " · RFC pendiente"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
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
                                    type="date"
                                    placeholder="Fecha de pago"
                                    value={formData.fecha}
                                    onChange={(e) => handleInputChange('fecha', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Select value={formData.categoria} onValueChange={(value) => handleInputChange('categoria', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="anticipo">Anticipo</SelectItem>
                                        <SelectItem value="material">Material</SelectItem>
                                        <SelectItem value="estimacion">Estimación</SelectItem>
                                        <SelectItem value="otro">Otro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {formData.moneda !== 'MXN' && (
                            <div className="space-y-2">
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Tipo de cambio"
                                    value={formData.tipo_cambio}
                                    onChange={(e) => handleInputChange('tipo_cambio', e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Conditional Bank Details based on tipo_pago */}
                    {formData.tipo_pago && formData.tipo_pago !== 'efectivo' && (
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-gray-900">Información bancaria</h3>
                            
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
                                        maxLength={4}
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

                    {/* Reference Section */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Código de Referencia</h3>
                        <Input
                            placeholder="Código de referencia o notas"
                            value={formData.codigo_referencia || ''}
                            onChange={(e) => handleInputChange('codigo_referencia', e.target.value)}
                        />
                    </div>

                    {/* Line Items - Editable */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Conceptos de la transacción</h3>
                        <p className="text-xs text-gray-500">Edita los montos individuales de cada concepto</p>
                        <div className="border rounded-lg divide-y">
                            {transactionContext.lineItems.map((item, idx) => (
                                <div key={item._id || idx} className="p-3 flex justify-between items-center gap-3">
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-900">
                                            {item.partida
                                                ? `${item.partida.nombre} › ${item.partida.familia} › ${item.partida.sub_partida}`
                                                : 'Concepto'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">$</span>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={getLineItemAmount(item)}
                                            onChange={(e) => handleLineItemChange(item._id, parseFloat(e.target.value) || 0)}
                                            className="w-32 text-right"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
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
                            {isSubmitting ? 'Actualizando...' : 'Actualizar transacción'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
