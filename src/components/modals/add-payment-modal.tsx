"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function AddPaymentModal() {
    const paymentContext = useAddPaymentModal((state) => state.paymentContext);
    const isOpen = useAddPaymentModal((state) => state.isOpen);
    const onClose = useAddPaymentModal((state) => state.onClose);
    const formData = useAddPaymentModal((state) => state.formData);
    const updateFormData = useAddPaymentModal((state) => state.updateFormData);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const createPayment = useMutation(api.pagos.create);

    const formatCurrency = (amount: string | number) => {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(numAmount);
    };

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
                proyecto: paymentContext.relatedCost.proyecto,
            });
            onClose();
        } catch (error) {
            console.error("Error creating payment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return formData.monto && 
               parseFloat(formData.monto) > 0 && 
               formData.fecha && 
               formData.tipo_pago;
    };

    if (!paymentContext) return null;

    const { relatedCost, totalAmount, remainingAmount } = paymentContext;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Agregar Nuevo Pago</SheetTitle>
                    <SheetDescription>
                        Registra un nuevo pago para este costo
                    </SheetDescription>
                </SheetHeader>

                {/* Cost Summary */}
                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="text-lg">Información de la Partida</CardTitle>
                        <CardDescription>Detalles de la partida al que se aplicará el pago</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Monto Total</p>
                                <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
                            </div>
                            {remainingAmount !== undefined && (
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Monto Pendiente</p>
                                    <p className="text-2xl font-bold text-orange-600">{formatCurrency(remainingAmount)}</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="font-medium">Administración:</span>
                                <p className="text-muted-foreground">{relatedCost.proyecto}</p>
                            </div>
                            <div>
                                <span className="font-medium">Partida:</span>
                                <p className="text-muted-foreground">{relatedCost.nombre}</p>
                            </div>
                            <div>
                                <span className="font-medium">Familia:</span>
                                <p className="text-muted-foreground">{relatedCost.familia}</p>
                            </div>
                            <div>
                                <span className="font-medium">Sub Partida:</span>
                                <p className="text-muted-foreground">{relatedCost.sub_partida}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Separator className="my-4" />

                {/* Payment Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información del Pago</CardTitle>
                            <CardDescription>Completa los datos del nuevo pago</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Basic Payment Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="monto">Monto *</Label>
                                    <Input
                                        id="monto"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.monto}
                                        onChange={(e) => handleInputChange('monto', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fecha">Fecha *</Label>
                                    <Input
                                        id="fecha"
                                        type="date"
                                        value={formData.fecha}
                                        onChange={(e) => handleInputChange('fecha', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="tipo_pago">Tipo de Pago *</Label>
                                    <Select value={formData.tipo_pago} onValueChange={(value) => handleInputChange('tipo_pago', value)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona tipo de pago" />
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
                                    <Label htmlFor="moneda">Moneda</Label>
                                    <Select value={formData.moneda} onValueChange={(value) => handleInputChange('moneda', value)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona moneda" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                                            <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {formData.moneda !== 'MXN' && (
                                <div className="space-y-2">
                                    <Label htmlFor="tipo_cambio">Tipo de Cambio</Label>
                                    <Input
                                        id="tipo_cambio"
                                        type="number"
                                        step="0.0001"
                                        placeholder="1.0000"
                                        value={formData.tipo_cambio}
                                        onChange={(e) => handleInputChange('tipo_cambio', e.target.value)}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Bank and Payment Details */}
                    {formData.tipo_pago !== 'efectivo' && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Detalles Bancarios</CardTitle>
                                <CardDescription>Información adicional del pago</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="banco">Banco</Label>
                                        <Input
                                            id="banco"
                                            placeholder="Nombre del banco"
                                            value={formData.banco || ''}
                                            onChange={(e) => handleInputChange('banco', e.target.value)}
                                        />
                                    </div>
                                    {formData.tipo_pago === 'tarjeta' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="tarjeta">Tarjeta</Label>
                                            <Input
                                                id="tarjeta"
                                                placeholder="Últimos 4 dígitos"
                                                value={formData.tarjeta || ''}
                                                onChange={(e) => handleInputChange('tarjeta', e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="numero_cuenta">Número de Cuenta</Label>
                                        <Input
                                            id="numero_cuenta"
                                            placeholder="Número de cuenta"
                                            value={formData.numero_cuenta || ''}
                                            onChange={(e) => handleInputChange('numero_cuenta', e.target.value)}
                                        />
                                    </div>
                                    {formData.tipo_pago === 'transferencia' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="numero_transferencia">Número de Transferencia</Label>
                                            <Input
                                                id="numero_transferencia"
                                                placeholder="Número de transferencia"
                                                value={formData.numero_transferencia || ''}
                                                onChange={(e) => handleInputChange('numero_transferencia', e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="codigo_referencia">Código de Referencia</Label>
                                    <Input
                                        id="codigo_referencia"
                                        placeholder="Código de referencia"
                                        value={formData.codigo_referencia || ''}
                                        onChange={(e) => handleInputChange('codigo_referencia', e.target.value)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Additional Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Adicional</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="factura">Factura</Label>
                                <Input
                                    id="factura"
                                    placeholder="Número de factura"
                                    value={formData.factura || ''}
                                    onChange={(e) => handleInputChange('factura', e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={!isFormValid() || isSubmitting}
                        >
                            {isSubmitting ? 'Guardando...' : 'Guardar Pago'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
