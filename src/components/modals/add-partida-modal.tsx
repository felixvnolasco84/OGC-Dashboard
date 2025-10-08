"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";

export default function AddPartidaModal() {
    const partidaContext = useAddPartidaModal((state) => state.partidaContext);
    const isOpen = useAddPartidaModal((state) => state.isOpen);
    const onClose = useAddPartidaModal((state) => state.onClose);
    const formData = useAddPartidaModal((state) => state.formData);
    const updateFormData = useAddPartidaModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const createPartida = useMutation(api.partida.createPartida);

    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };

    // Auto-calculate fields when relevant values change
    useEffect(() => {
        const cantidad = formData.Cantidad || 0;
        const precioUnitario = formData.PrecioUnitario || 0;
        const subtotal = cantidad * precioUnitario;
        const iva = subtotal * 0.16; // 16% IVA
        const total = subtotal + iva;

        updateFormData({
            Subtotal: subtotal,
            Iva: iva,
            total: total,
        });
    }, [formData.Cantidad, formData.PrecioUnitario, updateFormData]);

    // Auto-calculate por_liquidar and actual
    useEffect(() => {
        const aprobado = formData.aprobado || 0;
        const pagado = formData.pagado || 0;
        const porLiquidar = aprobado - pagado;

        updateFormData({
            por_liquidar: porLiquidar,
            actual: aprobado, // actual is same as aprobado initially
        });
    }, [formData.aprobado, formData.pagado, updateFormData]);

    const formatCurrency = (amount: string | number) => {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(numAmount)) return "$0.00 MXN";
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(numAmount);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!partidaContext) return;

        setIsSubmitting(true);
        try {
            await createPartida({
                ...formData,
                proyecto: partidaContext.proyecto,
            });
            onClose();
        } catch (error) {
            console.error("Error creating partida:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return formData.nombre &&
            formData.familia &&
            formData.sub_partida &&
            formData.Cantidad &&
            formData.Cantidad > 0 &&
            formData.PrecioUnitario &&
            formData.PrecioUnitario > 0 &&
            formData.aprobado &&
            formData.aprobado > 0;
    };

    if (!partidaContext) return null;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Agregar Nueva Partida</SheetTitle>
                    <SheetDescription>
                        Registra una nueva partida para el proyecto {partidaContext.projectName}
                    </SheetDescription>
                </SheetHeader>

                {/* Project Info */}
                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="text-lg">Información del Proyecto</CardTitle>
                        <CardDescription>Detalles del proyecto</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Proyecto</p>
                            <p className="text-lg font-semibold">{partidaContext.projectName || partidaContext.proyecto}</p>
                        </div>
                    </CardContent>
                </Card>

                <Separator className="my-4" />

                {/* Partida Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Básica</CardTitle>
                            <CardDescription>Datos principales de la partida</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nombre">Nombre de la Partida *</Label>
                                <Input
                                    id="nombre"
                                    placeholder="Ej: Estructura"
                                    value={formData.nombre}
                                    onChange={(e) => handleInputChange('nombre', e.target.value)}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="familia">Familia *</Label>
                                    <Input
                                        id="familia"
                                        placeholder="Ej: Concreto"
                                        value={formData.familia}
                                        onChange={(e) => handleInputChange('familia', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sub_partida">Sub-partida *</Label>
                                    <Input
                                        id="sub_partida"
                                        placeholder="Ej: Columnas"
                                        value={formData.sub_partida}
                                        onChange={(e) => handleInputChange('sub_partida', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quantity and Price */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Cantidad y Precio</CardTitle>
                            <CardDescription>Información de cantidad y costos</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="Cantidad">Cantidad *</Label>
                                    <Input
                                        id="Cantidad"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.Cantidad}
                                        onChange={(e) => handleInputChange('Cantidad', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="PrecioUnitario">Precio Unitario *</Label>
                                    <Input
                                        id="PrecioUnitario"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.PrecioUnitario}
                                        onChange={(e) => handleInputChange('PrecioUnitario', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Calculated Fields - Display Only */}
                            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Subtotal</p>
                                    <p className="text-lg font-semibold">{formatCurrency(formData.Subtotal)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">IVA (16%)</p>
                                    <p className="text-lg font-semibold">{formatCurrency(formData.Iva)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Total</p>
                                    <p className="text-lg font-semibold text-blue-600">{formatCurrency(formData.total)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Budget Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Presupuestal</CardTitle>
                            <CardDescription>Presupuesto y pagos</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="aprobado">Presupuesto Aprobado *</Label>
                                    <Input
                                        id="aprobado"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.aprobado}
                                        onChange={(e) => handleInputChange('aprobado', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pagado">Monto Pagado</Label>
                                    <Input
                                        id="pagado"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.pagado}
                                        onChange={(e) => handleInputChange('pagado', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Dejar en 0 si no hay pagos iniciales</p>
                                </div>
                            </div>

                            {/* Calculated Budget Fields */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Por Liquidar</p>
                                    <p className="text-lg font-semibold text-orange-600">{formatCurrency(formData.por_liquidar)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Actual</p>
                                    <p className="text-lg font-semibold">{formatCurrency(formData.actual)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Additional Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Adicional</CardTitle>
                            <CardDescription>Datos de registro</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fecha_carga">Fecha de Carga</Label>
                                    <Input
                                        id="fecha_carga"
                                        type="date"
                                        value={formData.fecha_carga}
                                        onChange={(e) => handleInputChange('fecha_carga', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="archivo_origen">Archivo de Origen</Label>
                                    <Input
                                        id="archivo_origen"
                                        placeholder="Nombre del archivo"
                                        value={formData.archivo_origen}
                                        onChange={(e) => handleInputChange('archivo_origen', e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4 pb-6">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid() || isSubmitting}
                        >
                            {isSubmitting ? 'Guardando...' : 'Guardar Partida'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
