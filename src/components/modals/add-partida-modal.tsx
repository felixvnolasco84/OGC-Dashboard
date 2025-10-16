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
        // Convert to number for numeric fields
        const numericFields = ['nivel', 'cantidad', 'precio_unitario', 'presupuesto_original', 'presupuesto_aprobado', 'pagado'];
        if (numericFields.includes(field)) {
            const numValue = value === '' ? 0 : parseFloat(value);
            updateFormData({ [field]: numValue });
        } else {
            updateFormData({ [field]: value });
        }
    };

    // Auto-calculate presupuesto fields when cantidad or precio_unitario changes
    useEffect(() => {
        const cantidad = formData.cantidad || 0;
        const precioUnitario = formData.precio_unitario || 0;        
        const total = cantidad * precioUnitario;

        if (cantidad > 0 && precioUnitario > 0) {
            updateFormData({
                presupuesto_original: total,
                presupuesto_aprobado: total,
            });
        }
    }, [formData.cantidad, formData.precio_unitario, updateFormData]);

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
            formData.unidad &&
            formData.cantidad &&
            formData.cantidad > 0 &&
            formData.precio_unitario &&
            formData.precio_unitario > 0 &&
            formData.presupuesto_aprobado &&
            formData.presupuesto_aprobado > 0;
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
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="unidad">Unidad *</Label>
                                    <Input
                                        id="unidad"
                                        placeholder="Ej: m², m³, kg"
                                        value={formData.unidad}
                                        onChange={(e) => handleInputChange('unidad', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cantidad">Cantidad *</Label>
                                    <Input
                                        id="cantidad"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.cantidad || ''}
                                        onChange={(e) => handleInputChange('cantidad', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="precio_unitario">Precio Unitario *</Label>
                                    <Input
                                        id="precio_unitario"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.precio_unitario || ''}
                                        onChange={(e) => handleInputChange('precio_unitario', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Calculated Total - Display Only */}
                            <div className="p-4 bg-muted rounded-lg">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Total Calculado</p>
                                <p className="text-2xl font-semibold text-blue-600">{formatCurrency(formData.presupuesto_aprobado || 0)}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Budget Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Presupuestal</CardTitle>
                            <CardDescription>Presupuesto y estado inicial</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="presupuesto_original">Presupuesto Original</Label>
                                    <Input
                                        id="presupuesto_original"
                                        type="number"
                                        step="0.01"
                                        placeholder="Auto-calculado"
                                        value={formData.presupuesto_original || ''}
                                        onChange={(e) => handleInputChange('presupuesto_original', e.target.value)}
                                        disabled
                                    />
                                    <p className="text-xs text-muted-foreground">Calculado automáticamente</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="presupuesto_aprobado">Presupuesto Aprobado *</Label>
                                    <Input
                                        id="presupuesto_aprobado"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.presupuesto_aprobado || ''}
                                        onChange={(e) => handleInputChange('presupuesto_aprobado', e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">Puedes ajustar el monto si es necesario</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pagado">Monto Pagado Inicial</Label>
                                <Input
                                    id="pagado"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.pagado || ''}
                                    onChange={(e) => handleInputChange('pagado', e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Dejar en 0 si no hay pagos iniciales</p>
                            </div>

                            {/* Display remaining amount */}
                            {formData.presupuesto_aprobado > 0 && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Por Ejercer</p>
                                    <p className="text-lg font-semibold text-orange-600">
                                        {formatCurrency((formData.presupuesto_aprobado || 0) - (formData.pagado || 0))}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Additional Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Adicional</CardTitle>
                            <CardDescription>Datos de registro y jerarquía</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="nivel">Nivel</Label>
                                    <Input
                                        id="nivel"
                                        type="number"
                                        min="1"
                                        max="3"
                                        value={formData.nivel}
                                        onChange={(e) => handleInputChange('nivel', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">1=Partida, 2=Familia, 3=Sub-partida</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="partida_nombre">Partida Padre</Label>
                                    <Input
                                        id="partida_nombre"
                                        placeholder="Ej: PRELIMINARY"
                                        value={formData.partida_nombre}
                                        onChange={(e) => handleInputChange('partida_nombre', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Solo para nivel 2 y 3</p>
                                </div>
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
