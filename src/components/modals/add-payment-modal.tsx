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
import { Check, Circle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";

export default function AddPaymentModal() {
    const paymentContext = useAddPaymentModal((state) => state.paymentContext);
    const isOpen = useAddPaymentModal((state) => state.isOpen);
    const onClose = useAddPaymentModal((state) => state.onClose);
    const payments = useAddPaymentModal((state) => state.payments);
    const addPayment = useAddPaymentModal((state) => state.addPayment);
    const removePayment = useAddPaymentModal((state) => state.removePayment);
    const updatePayment = useAddPaymentModal((state) => state.updatePayment);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const createPayment = useMutation(api.pagos.create);

    // Fetch all partidas for this project
    const allPartidas = useQuery(
        api.partida.getByProject,
        paymentContext ? { projectId: paymentContext.projectId } : "skip"
    );

    const handleInputChange = (index: number, field: string, value: string | number) => {
        updatePayment(index, { [field]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext) return;

        setIsSubmitting(true);
        try {
            // Create all payments in parallel
            await Promise.all(
                payments.map(async (payment) => {
                    if (payment.partida_id && payment.partida_id !== "") {
                        await createPayment({
                            partida_id: payment.partida_id as Id<"partidas">,
                            partida: payment.partida,
                            familia: payment.familia,
                            sub_partida: payment.sub_partida,
                            monto: payment.monto,
                            fecha: payment.fecha,
                            tipo_pago: payment.tipo_pago,
                            banco: payment.banco,
                            tarjeta: payment.tarjeta,
                            numero_cuenta: payment.numero_cuenta,
                            numero_transferencia: payment.numero_transferencia,
                            codigo_referencia: payment.codigo_referencia,
                            factura: payment.factura,
                            moneda: payment.moneda,
                            tipo_cambio: payment.tipo_cambio,
                            status: payment.status,
                            proyecto: paymentContext.projectId,
                        });
                    }
                })
            );
            onClose();
        } catch (error) {
            console.error("Error creating payments:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return payments.every(payment =>
            payment.partida_id &&
            payment.partida_id !== "" &&
            payment.familia &&
            payment.familia.trim() !== "" &&
            payment.sub_partida &&
            payment.sub_partida.trim() !== "" &&
            payment.monto > 0 &&
            payment.fecha &&
            payment.tipo_pago &&
            payment.status
        );
    };

    // Get unique partida names for dropdown
    const getUniquePartidaNames = () => {
        if (!allPartidas) return [];
        const uniqueNames = [...new Set(allPartidas.map(p => p.nombre).filter(n => n && n.trim() !== ""))];
        return uniqueNames.sort();
    };

    // Get available familias for a selected partida
    const getAvailableFamilias = (index: number) => {
        const payment = payments[index];
        if (!payment.partida || !allPartidas) return [];
        
        const partidasWithName = allPartidas.filter(p => p.nombre === payment.partida);
        const uniqueFamilias = [...new Set(partidasWithName.map(p => p.familia).filter(f => f && f.trim() !== ""))];
        return uniqueFamilias.sort();
    };

    // Get available sub_partidas for a selected familia
    const getAvailableSubPartidas = (index: number) => {
        const payment = payments[index];
        if (!payment.partida || !payment.familia || !allPartidas) return [];
        
        const partidasWithFamilia = allPartidas.filter(p => 
            p.nombre === payment.partida && p.familia === payment.familia
        );
        const uniqueSubPartidas = [...new Set(partidasWithFamilia.map(p => p.sub_partida).filter(sp => sp && sp.trim() !== ""))];
        return uniqueSubPartidas.sort();
    };

    // When familia is selected, find the matching partida_id
    const handleFamiliaSelect = (index: number, familia: string) => {
        const payment = payments[index];
        if (!allPartidas) return;
        
        const matchingPartida = allPartidas.find(p => 
            p.nombre === payment.partida && p.familia === familia
        );
        
        if (matchingPartida) {
            updatePayment(index, {
                familia,
                partida_id: matchingPartida._id,
                sub_partida: ""
            });
        }
    };

    // When sub_partida is selected, find the exact matching partida_id
    const handleSubPartidaSelect = (index: number, subPartida: string) => {
        const payment = payments[index];
        if (!allPartidas) return;
        
        const exactPartida = allPartidas.find(p => 
            p.nombre === payment.partida && 
            p.familia === payment.familia && 
            p.sub_partida === subPartida
        );
        
        if (exactPartida) {
            updatePayment(index, {
                sub_partida: subPartida,
                partida_id: exactPartida._id
            });
        }
    };

    if (!paymentContext) return null;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Registrar pagos</SheetTitle>
                    <SheetDescription className="sr-only">
                        Registra uno o varios pagos para diferentes partidas
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                    {/* Payment Entries */}
                    <div className="space-y-6">
                        {payments.map((payment, index) => (
                            <div key={index} className="border rounded-lg p-4 bg-gray-50 space-y-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-gray-900">
                                        Pago {index + 1}
                                    </h3>
                                    {payments.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removePayment(index)}
                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>

                                {/* Status Selection */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange(index, 'status', 'Pagado')}
                                        className={cn(
                                            "flex items-center gap-2 p-3 rounded-lg border-2 transition-all",
                                            payment.status === 'Pagado'
                                                ? "border-green-500 bg-green-50"
                                                : "border-gray-300 bg-white hover:border-gray-400"
                                        )}
                                    >
                                        <Check className={cn(
                                            "h-4 w-4",
                                            payment.status === 'Pagado' ? "text-green-600" : "text-gray-400"
                                        )} />
                                        <span className={cn(
                                            "text-sm font-medium",
                                            payment.status === 'Pagado' ? "text-green-700" : "text-gray-600"
                                        )}>Pagado</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange(index, 'status', 'Por pagar')}
                                        className={cn(
                                            "flex items-center gap-2 p-3 rounded-lg border-2 transition-all",
                                            payment.status === 'Por pagar'
                                                ? "border-gray-500 bg-gray-100"
                                                : "border-gray-300 bg-white hover:border-gray-400"
                                        )}
                                    >
                                        <Circle className={cn(
                                            "h-4 w-4",
                                            payment.status === 'Por pagar' ? "text-gray-600" : "text-gray-400"
                                        )} />
                                        <span className={cn(
                                            "text-sm font-medium",
                                            payment.status === 'Por pagar' ? "text-gray-700" : "text-gray-600"
                                        )}>Por pagar</span>
                                    </button>
                                </div>

                                {/* Partida Selection */}
                                <Select
                                    value={payment.partida}
                                    onValueChange={(value) => handleInputChange(index, 'partida', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona partida" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getUniquePartidaNames().map((nombre) => (
                                            <SelectItem key={nombre} value={nombre}>
                                                {nombre}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Familia */}
                                <Select
                                    value={payment.familia}
                                    onValueChange={(value) => handleFamiliaSelect(index, value)}
                                    disabled={!payment.partida}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona familia" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getAvailableFamilias(index).map((familia) => (
                                            <SelectItem key={familia} value={familia}>
                                                {familia}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Sub-partida */}
                                <Select
                                    value={payment.sub_partida}
                                    onValueChange={(value) => handleSubPartidaSelect(index, value)}
                                    disabled={!payment.familia}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona subpartida" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getAvailableSubPartidas(index).map((subPartida) => (
                                            <SelectItem key={subPartida} value={subPartida}>
                                                {subPartida}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Payment Details */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Select
                                        value={payment.tipo_pago}
                                        onValueChange={(value) => handleInputChange(index, 'tipo_pago', value)}
                                    >
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
                                    <Select
                                        value={payment.moneda}
                                        onValueChange={(value) => handleInputChange(index, 'moneda', value)}
                                    >
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

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="Monto"
                                        value={payment.monto || ''}
                                        onChange={(e) => handleInputChange(index, 'monto', parseFloat(e.target.value))}
                                        required
                                    />
                                    <Input
                                        type="date"
                                        value={payment.fecha}
                                        onChange={(e) => handleInputChange(index, 'fecha', e.target.value)}
                                        required
                                    />
                                </div>

                                {/* Conditional Bank Details */}
                                {payment.tipo_pago && payment.tipo_pago !== 'efectivo' && (
                                    <div className="space-y-3 pt-2">
                                        <Input
                                            placeholder="Banco"
                                            value={payment.banco}
                                            onChange={(e) => handleInputChange(index, 'banco', e.target.value)}
                                        />

                                        {payment.tipo_pago === 'tarjeta' && (
                                            <Input
                                                placeholder="Últimos 4 dígitos de tarjeta"
                                                value={payment.tarjeta}
                                                onChange={(e) => handleInputChange(index, 'tarjeta', e.target.value)}
                                                maxLength={4}
                                            />
                                        )}

                                        <div className="grid grid-cols-2 gap-3">
                                            <Input
                                                placeholder="Número de cuenta"
                                                value={payment.numero_cuenta}
                                                onChange={(e) => handleInputChange(index, 'numero_cuenta', e.target.value)}
                                            />
                                            {payment.tipo_pago === 'transferencia' && (
                                                <Input
                                                    placeholder="Número de transferencia"
                                                    value={payment.numero_transferencia}
                                                    onChange={(e) => handleInputChange(index, 'numero_transferencia', e.target.value)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Description */}
                                <Input
                                    placeholder="Descripción / Notas"
                                    value={payment.codigo_referencia}
                                    onChange={(e) => handleInputChange(index, 'codigo_referencia', e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Add Payment Button */}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={addPayment}
                        className="w-full border-dashed"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar otro pago
                    </Button>

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid() || isSubmitting}
                            className="bg-black hover:bg-gray-800 text-white"
                        >
                            {isSubmitting ? 'Guardando...' : `Guardar ${payments.length} pago${payments.length > 1 ? 's' : ''}`}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
