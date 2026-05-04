"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

type Nivel = 1 | 2 | 3;

export default function AddPartidaModal() {
    const partidaContext = useAddPartidaModal((state) => state.partidaContext);
    const isOpen = useAddPartidaModal((state) => state.isOpen);
    const onClose = useAddPartidaModal((state) => state.onClose);
    const formData = useAddPartidaModal((state) => state.formData);
    const updateFormData = useAddPartidaModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    // Track when the user has manually overridden the auto-calculated approved budget
    const [aprobadoOverridden, setAprobadoOverridden] = useState(false);

    const createPartida = useMutation(api.partida.createPartida);

    // Load existing nivel 1 partidas (parents) for the project so user picks instead of typing
    const nivel1Partidas = useQuery(
        api.partida.getByNivel,
        partidaContext ? { proyecto: partidaContext.proyecto, nivel: 1 } : "skip"
    );

    // Distinct familias under the selected parent (used when nivel === 3)
    const distinctFamilias = useQuery(
        api.partida.getDistinctFamiliasByPartida,
        partidaContext && formData.nivel === 3 && formData.partida_nombre
            ? {
                  partidaNombre: formData.partida_nombre,
                  projectId: partidaContext.proyecto,
              }
            : "skip"
    );

    const nivel = formData.nivel as Nivel;

    const parentOptions = useMemo(
        () =>
            (nivel1Partidas || [])
                .map((p) => p.nombre)
                .filter((n, i, arr) => n && arr.indexOf(n) === i)
                .sort(),
        [nivel1Partidas]
    );

    const handleInputChange = (field: string, value: string) => {
        const numericFields = [
            "nivel",
            "cantidad",
            "precio_unitario",
            "presupuesto_original",
            "presupuesto_aprobado",
            "pagado",
        ];
        if (numericFields.includes(field)) {
            const numValue = value === "" ? 0 : parseFloat(value);
            updateFormData({ [field]: numValue });
            if (field === "presupuesto_aprobado") {
                setAprobadoOverridden(true);
            }
        } else {
            updateFormData({ [field]: value });
        }
    };

    // Reset override flag whenever the modal is reopened
    useEffect(() => {
        if (isOpen) setAprobadoOverridden(false);
    }, [isOpen]);

    // Reset hierarchy-dependent fields when nivel changes
    useEffect(() => {
        if (nivel === 1) {
            // Nivel 1: clear parent reference, familia/sub_partida are not used
            updateFormData({ partida_nombre: "", familia: "", sub_partida: "" });
        } else if (nivel === 2) {
            // Nivel 2: clear sub_partida, keep partida_nombre + familia
            updateFormData({ sub_partida: "" });
        }
    }, [nivel, updateFormData]);

    // Auto-calculate budget fields based on cantidad * precio_unitario,
    // but DO NOT overwrite presupuesto_aprobado if the user has overridden it.
    useEffect(() => {
        const cantidad = formData.cantidad || 0;
        const precioUnitario = formData.precio_unitario || 0;
        const total = cantidad * precioUnitario;

        if (cantidad > 0 && precioUnitario > 0) {
            const updates: Partial<typeof formData> = {
                presupuesto_original: total,
            };
            if (!aprobadoOverridden) {
                updates.presupuesto_aprobado = total;
            }
            updateFormData(updates);
        }
    }, [formData.cantidad, formData.precio_unitario, aprobadoOverridden, updateFormData]);

    const formatCurrency = (amount: string | number) => {
        const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
        if (isNaN(numAmount)) return "$0.00 MXN";
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
        }).format(numAmount);
    };

    const buildPayload = () => {
        // Normalize fields based on nivel to keep DB consistent with sync logic
        if (nivel === 1) {
            return {
                ...formData,
                familia: "",
                sub_partida: "",
                partida_nombre: "",
            };
        }
        if (nivel === 2) {
            return {
                ...formData,
                // For nivel 2, nombre mirrors the parent partida name (matches sync convention)
                nombre: formData.partida_nombre,
                sub_partida: "",
            };
        }
        // nivel === 3
        return {
            ...formData,
            nombre: formData.partida_nombre,
        };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!partidaContext) return;

        setIsSubmitting(true);
        try {
            const payload = buildPayload();
            await createPartida({
                ...payload,
                proyecto: partidaContext.proyecto,
            });
            toast.success("Partida creada correctamente");
            onClose();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Error desconocido";
            console.error("Error creating partida:", error);
            toast.error(`No se pudo crear la partida: ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        const baseValid =
            formData.unidad &&
            formData.cantidad > 0 &&
            formData.precio_unitario > 0 &&
            formData.presupuesto_aprobado > 0;

        if (!baseValid) return false;

        if (nivel === 1) {
            return Boolean(formData.nombre.trim());
        }
        if (nivel === 2) {
            return Boolean(formData.partida_nombre.trim() && formData.familia.trim());
        }
        // nivel === 3
        return Boolean(
            formData.partida_nombre.trim() &&
                formData.familia.trim() &&
                formData.sub_partida.trim()
        );
    };

    if (!partidaContext) return null;

    const nivelLabel = nivel === 1 ? "Partida" : nivel === 2 ? "Familia" : "Sub-partida";

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Agregar Nueva {nivelLabel}</SheetTitle>
                    <SheetDescription>
                        Registra una nueva {nivelLabel.toLowerCase()} para el proyecto{" "}
                        {partidaContext.projectName}
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
                            <p className="text-lg font-semibold">
                                {partidaContext.projectName || partidaContext.proyecto}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Separator className="my-4" />

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Hierarchy */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Jerarquía</CardTitle>
                            <CardDescription>
                                Selecciona el nivel y, si aplica, la partida padre
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="nivel">Nivel *</Label>
                                    <Select
                                        value={String(formData.nivel)}
                                        onValueChange={(v) =>
                                            updateFormData({ nivel: parseInt(v, 10) })
                                        }
                                    >
                                        <SelectTrigger id="nivel">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">1 - Partida</SelectItem>
                                            <SelectItem value="2">2 - Familia</SelectItem>
                                            <SelectItem value="3">3 - Sub-partida</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {nivel !== 1 && (
                                    <div className="space-y-2">
                                        <Label htmlFor="partida_nombre">Partida padre *</Label>
                                        <Select
                                            value={formData.partida_nombre || ""}
                                            onValueChange={(v) =>
                                                updateFormData({ partida_nombre: v })
                                            }
                                        >
                                            <SelectTrigger id="partida_nombre">
                                                <SelectValue placeholder="Selecciona la partida padre" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {parentOptions.length === 0 ? (
                                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                        No hay partidas nivel 1 en este proyecto
                                                    </div>
                                                ) : (
                                                    parentOptions.map((nombre) => (
                                                        <SelectItem key={nombre} value={nombre}>
                                                            {nombre}
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Basic Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Básica</CardTitle>
                            <CardDescription>
                                Datos principales de la {nivelLabel.toLowerCase()}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {nivel === 1 && (
                                <div className="space-y-2">
                                    <Label htmlFor="nombre">Nombre de la Partida *</Label>
                                    <Input
                                        id="nombre"
                                        placeholder="Ej: ESTRUCTURA"
                                        value={formData.nombre}
                                        onChange={(e) =>
                                            handleInputChange("nombre", e.target.value)
                                        }
                                        required
                                    />
                                </div>
                            )}

                            {nivel === 2 && (
                                <div className="space-y-2">
                                    <Label htmlFor="familia">Nombre de la Familia *</Label>
                                    <Input
                                        id="familia"
                                        placeholder="Ej: CONCRETOS"
                                        value={formData.familia}
                                        onChange={(e) =>
                                            handleInputChange("familia", e.target.value)
                                        }
                                        required
                                    />
                                </div>
                            )}

                            {nivel === 3 && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="familia">Familia *</Label>
                                        <Select
                                            value={formData.familia || ""}
                                            onValueChange={(v) =>
                                                updateFormData({ familia: v })
                                            }
                                            disabled={!formData.partida_nombre}
                                        >
                                            <SelectTrigger id="familia">
                                                <SelectValue placeholder="Selecciona la familia" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(distinctFamilias || []).length === 0 ? (
                                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                        Sin familias registradas
                                                    </div>
                                                ) : (
                                                    (distinctFamilias || []).map((f) => (
                                                        <SelectItem key={f} value={f}>
                                                            {f}
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="sub_partida">Nombre Sub-partida *</Label>
                                        <Input
                                            id="sub_partida"
                                            placeholder="Ej: COLUMNAS"
                                            value={formData.sub_partida}
                                            onChange={(e) =>
                                                handleInputChange("sub_partida", e.target.value)
                                            }
                                            required
                                        />
                                    </div>
                                </div>
                            )}
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
                                        onChange={(e) =>
                                            handleInputChange("unidad", e.target.value)
                                        }
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
                                        value={formData.cantidad || ""}
                                        onChange={(e) =>
                                            handleInputChange("cantidad", e.target.value)
                                        }
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
                                        value={formData.precio_unitario || ""}
                                        onChange={(e) =>
                                            handleInputChange("precio_unitario", e.target.value)
                                        }
                                        required
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-muted rounded-lg">
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                    Total Calculado
                                </p>
                                <p className="text-2xl font-semibold text-blue-600">
                                    {formatCurrency(formData.presupuesto_original || 0)}
                                </p>
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
                                    <Label htmlFor="presupuesto_original">
                                        Presupuesto Original
                                    </Label>
                                    <Input
                                        id="presupuesto_original"
                                        type="number"
                                        step="0.01"
                                        placeholder="Auto-calculado"
                                        value={formData.presupuesto_original || ""}
                                        disabled
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Calculado automáticamente
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="presupuesto_aprobado">
                                            Presupuesto Aprobado *
                                        </Label>
                                        {aprobadoOverridden && (
                                            <button
                                                type="button"
                                                className="text-xs text-blue-600 hover:underline"
                                                onClick={() => {
                                                    setAprobadoOverridden(false);
                                                    updateFormData({
                                                        presupuesto_aprobado:
                                                            formData.presupuesto_original,
                                                    });
                                                }}
                                            >
                                                Restaurar auto
                                            </button>
                                        )}
                                    </div>
                                    <Input
                                        id="presupuesto_aprobado"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.presupuesto_aprobado || ""}
                                        onChange={(e) =>
                                            handleInputChange(
                                                "presupuesto_aprobado",
                                                e.target.value
                                            )
                                        }
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Puedes ajustar el monto si es necesario
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pagado">Monto Pagado Inicial</Label>
                                <Input
                                    id="pagado"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.pagado || ""}
                                    onChange={(e) =>
                                        handleInputChange("pagado", e.target.value)
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Dejar en 0 si no hay pagos iniciales
                                </p>
                            </div>

                            {formData.presupuesto_aprobado > 0 && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">
                                        Por Ejercer
                                    </p>
                                    <p className="text-lg font-semibold text-orange-600">
                                        {formatCurrency(
                                            (formData.presupuesto_aprobado || 0) -
                                                (formData.pagado || 0)
                                        )}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Additional Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Información Adicional</CardTitle>
                            <CardDescription>Datos de registro</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="archivo_origen">Archivo de Origen</Label>
                                <Input
                                    id="archivo_origen"
                                    placeholder="Nombre del archivo (opcional)"
                                    value={formData.archivo_origen}
                                    onChange={(e) =>
                                        handleInputChange("archivo_origen", e.target.value)
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4 pb-6">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={!isFormValid() || isSubmitting}>
                            {isSubmitting ? "Guardando..." : `Guardar ${nivelLabel}`}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    );
}
