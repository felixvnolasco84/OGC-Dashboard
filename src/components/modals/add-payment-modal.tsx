"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Circle, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function AddPaymentModal() {
    const paymentContext = useAddPaymentModal((state) => state.paymentContext);
    const isOpen = useAddPaymentModal((state) => state.isOpen);
    const onClose = useAddPaymentModal((state) => state.onClose);
    const formData = useAddPaymentModal((state) => state.formData);
    const updateFormData = useAddPaymentModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const createPayment = useMutation(api.pagos.create);

    // Fetch available familias if needed
    const availableFamilias = useQuery(
        api.partida.getDistinctFamiliasByPartida,
        paymentContext?.relatedCost &&
            !paymentContext.relatedCost.familia &&
            paymentContext.relatedCost.proyecto
            ? {
                partidaNombre: paymentContext.relatedCost.nombre,
                projectId: paymentContext.relatedCost.proyecto
            }
            : "skip"
    );

    // Fetch available sub_partidas if needed
    const availableSubPartidas = useQuery(
        api.partida.getDistinctSubPartidasByFamilia,
        paymentContext?.relatedCost &&
            !paymentContext.relatedCost.sub_partida &&
            (paymentContext.relatedCost.familia || formData.familia) &&
            paymentContext.relatedCost.proyecto
            ? {
                partidaNombre: paymentContext.relatedCost.nombre,
                familia: formData.familia || paymentContext.relatedCost.familia || "",
                projectId: paymentContext.relatedCost.proyecto
            }
            : "skip"
    );

    // Debug logging
    useEffect(() => {
        if (paymentContext?.relatedCost) {
            console.log("Payment Context:", {
                nombre: paymentContext.relatedCost.nombre,
                familia: paymentContext.relatedCost.familia,
                sub_partida: paymentContext.relatedCost.sub_partida,
                proyecto: paymentContext.relatedCost.proyecto,
                needsFamilia: !paymentContext.relatedCost.familia,
                needsSubPartida: !paymentContext.relatedCost.sub_partida
            });
            console.log("Query should run for familias:", !paymentContext.relatedCost.familia && !!paymentContext.relatedCost.proyecto);
            console.log("Query should run for subpartidas:", !paymentContext.relatedCost.sub_partida && !!(paymentContext.relatedCost.familia || formData.familia) && !!paymentContext.relatedCost.proyecto);
        }
        console.log("Available Familias:", availableFamilias);
        console.log("Available SubPartidas:", availableSubPartidas);
        console.log("Form Data familia:", formData.familia);
    }, [paymentContext, availableFamilias, availableSubPartidas, formData.familia]);

    // Pre-populate familia and sub_partida from relatedCost when modal opens
    useEffect(() => {
        if (paymentContext?.relatedCost) {
            updateFormData({
                familia: paymentContext.relatedCost.familia || "",
                sub_partida: paymentContext.relatedCost.sub_partida || ""
            });
        }
    }, [paymentContext, updateFormData]);


    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext) return;

        setIsSubmitting(true);
        try {
            if (!paymentContext.relatedCost.proyecto) {
                throw new Error("Proyecto no encontrado");
            }
            await createPayment({
                ...formData,
                monto: formData.monto,
                tipo_cambio: formData.tipo_cambio,
                partida_id: paymentContext.relatedCost._id,
                partida: paymentContext.relatedCost.nombre,
                sub_partida: formData.sub_partida || paymentContext.relatedCost.sub_partida,
                familia: formData.familia || paymentContext.relatedCost.familia,
                proyecto: paymentContext.relatedCost.proyecto,

            });
            onClose();
        } catch (error) {
            console.error("Error creating payment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Determine what fields need to be filled based on context
    const needsFamilia = !paymentContext?.relatedCost?.familia;
    const needsSubPartida = !paymentContext?.relatedCost?.sub_partida;

    const isFormValid = () => {
        const basicValid = formData.monto &&
            formData.monto > 0 &&
            formData.fecha &&
            formData.tipo_pago &&
            formData.status;

        // Check if required contextual fields are filled
        const familiaValid = !needsFamilia || (formData.familia && formData.familia.trim() !== "");
        const subPartidaValid = !needsSubPartida || (formData.sub_partida && formData.sub_partida.trim() !== "");

        return basicValid && familiaValid && subPartidaValid;
    };

    if (!paymentContext) return null;

    const { relatedCost } = paymentContext;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Nuevo pago</SheetTitle>
                    <SheetDescription className="sr-only">
                        Registra un nuevo pago para esta partida
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
                    {needsFamilia ? (
                        <div className="space-y-2">
                            <Select
                                value={formData.familia}
                                onValueChange={(value) => handleInputChange('familia', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Familia" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFamilias && availableFamilias.length > 0 ? (
                                        availableFamilias.map((familia) => (
                                            <SelectItem key={familia} value={familia}>
                                                {familia}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <div className="px-2 py-6 text-sm text-muted-foreground text-center">
                                            No hay familias disponibles
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Select value={relatedCost.familia} disabled>
                                <SelectTrigger className="bg-gray-50">
                                    <SelectValue placeholder="Familia" />
                                </SelectTrigger>
                            </Select>
                        </div>
                    )}

                    {/* Sub-partida */}
                    {needsSubPartida ? (
                        <div className="space-y-2">
                            <Select
                                value={formData.sub_partida}
                                onValueChange={(value) => handleInputChange('sub_partida', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Subpartida" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableSubPartidas && availableSubPartidas.length > 0 ? (
                                        availableSubPartidas.map((subPartida) => (
                                            <SelectItem key={subPartida} value={subPartida}>
                                                {subPartida}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <div className="px-2 py-6 text-sm text-muted-foreground text-center">
                                            {needsFamilia && !formData.familia
                                                ? "Primero selecciona una familia"
                                                : "No hay sub-partidas disponibles"}
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Select value={relatedCost.sub_partida} disabled>
                                <SelectTrigger className="bg-gray-50">
                                    <SelectValue placeholder="Subpartida" />
                                </SelectTrigger>
                            </Select>
                        </div>
                    )}

                    {/* Category/Description */}
                    <div className="space-y-2">
                        <Input
                            placeholder="Categoría (anticipo, material, estimación)"
                            value={formData.codigo_referencia || ''}
                            onChange={(e) => handleInputChange('codigo_referencia', e.target.value)}
                        />
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
                            {isSubmitting ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
