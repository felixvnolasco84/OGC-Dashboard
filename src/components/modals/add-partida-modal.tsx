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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

type Nivel = 1 | 2 | 3;

type PartidaFormFields = {
    nivel: number;
    nombre: string;
    familia: string;
    sub_partida: string;
    unidad: string;
    partida_nombre: string;
    cantidad: number;
    precio_unitario: number;
    presupuesto_original: number;
    presupuesto_aprobado: number;
    pagado: number;
    archivo_origen: string;
};

type DraftItem = PartidaFormFields & { _draftId: string };

export default function AddPartidaModal() {
    const partidaContext = useAddPartidaModal((state) => state.partidaContext);
    const isOpen = useAddPartidaModal((state) => state.isOpen);
    const onClose = useAddPartidaModal((state) => state.onClose);
    const formData = useAddPartidaModal((state) => state.formData);
    const updateFormData = useAddPartidaModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    // Track when the user has manually overridden the auto-calculated approved budget
    const [aprobadoOverridden, setAprobadoOverridden] = useState(false);
    // Items the user has staged to be created in batch when submitting
    const [drafts, setDrafts] = useState<DraftItem[]>([]);

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

    const parentOptions = useMemo(() => {
        const dbNames = (nivel1Partidas || []).map((p) => p.nombre);
        const draftNames = drafts.filter((d) => d.nivel === 1).map((d) => d.nombre);
        return Array.from(new Set([...dbNames, ...draftNames]))
            .filter((n) => n && n.trim() !== "")
            .sort();
    }, [nivel1Partidas, drafts]);

    // For nivel 3, available familias = DB familias under selected parent + draft nivel-2 familias under same parent
    const familiaOptions = useMemo(() => {
        const dbFamilias = distinctFamilias || [];
        const draftFamilias = drafts
            .filter((d) => d.nivel === 2 && d.partida_nombre === formData.partida_nombre)
            .map((d) => d.familia);
        return Array.from(new Set([...dbFamilias, ...draftFamilias]))
            .filter((f) => f && f.trim() !== "")
            .sort();
    }, [distinctFamilias, drafts, formData.partida_nombre]);

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

    // Reset override flag and drafts whenever the modal is opened/closed
    useEffect(() => {
        if (isOpen) {
            setAprobadoOverridden(false);
            setDrafts([]);
        }
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

    const buildPayloadFor = (data: PartidaFormFields) => {
        // Normalize fields based on nivel to keep DB consistent with sync logic
        if (data.nivel === 1) {
            return {
                ...data,
                familia: "",
                sub_partida: "",
                partida_nombre: "",
            };
        }
        if (data.nivel === 2) {
            return {
                ...data,
                // For nivel 2, nombre mirrors the parent partida name (matches sync convention)
                nombre: data.partida_nombre,
                sub_partida: "",
            };
        }
        // nivel === 3
        return {
            ...data,
            nombre: data.partida_nombre,
        };
    };

    const isFormValidFor = (data: PartidaFormFields) => {
        const baseValid =
            data.unidad &&
            data.cantidad > 0 &&
            data.precio_unitario > 0 &&
            data.presupuesto_aprobado > 0;

        if (!baseValid) return false;

        if (data.nivel === 1) {
            return Boolean(data.nombre.trim());
        }
        if (data.nivel === 2) {
            return Boolean(data.partida_nombre.trim() && data.familia.trim());
        }
        // nivel === 3
        return Boolean(
            data.partida_nombre.trim() &&
                data.familia.trim() &&
                data.sub_partida.trim()
        );
    };

    const isFormValid = () => isFormValidFor(formData);

    const handleAddToList = () => {
        if (!isFormValid()) return;
        const draft: DraftItem = { ...formData, _draftId: crypto.randomUUID() };
        setDrafts((prev) => [...prev, draft]);
        // Reset item-specific fields, but preserve nivel + parent selections so
        // the user can quickly add several items of the same kind.
        updateFormData({
            nombre: nivel === 1 ? "" : formData.nombre,
            familia: nivel === 3 ? formData.familia : "",
            sub_partida: "",
            unidad: "",
            cantidad: 0,
            precio_unitario: 0,
            presupuesto_original: 0,
            presupuesto_aprobado: 0,
            pagado: 0,
        });
        setAprobadoOverridden(false);
        toast.success("Agregado a la lista");
    };

    const handleRemoveDraft = (id: string) => {
        setDrafts((prev) => prev.filter((d) => d._draftId !== id));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!partidaContext) return;

        // Collect all items to create: staged drafts + current form (if valid).
        // Strip the local-only _draftId field before sending to the backend.
        const items: PartidaFormFields[] = drafts.map((d) => {
            const copy: Partial<DraftItem> = { ...d };
            delete copy._draftId;
            return copy as PartidaFormFields;
        });
        if (isFormValid()) {
            items.push({ ...formData });
        }

        if (items.length === 0) {
            toast.error("Agrega al menos un elemento válido");
            return;
        }

        // Sort by nivel ascending so parent partidas (nivel 1) are created before
        // their children (nivel 2/3); the backend validates parent existence.
        items.sort((a, b) => a.nivel - b.nivel);

        setIsSubmitting(true);
        let succeeded = 0;
        try {
            for (const data of items) {
                const payload = buildPayloadFor(data);
                await createPartida({
                    ...payload,
                    proyecto: partidaContext.proyecto,
                });
                succeeded++;
            }
            toast.success(
                `${succeeded} elemento${succeeded === 1 ? "" : "s"} creado${succeeded === 1 ? "" : "s"} correctamente`
            );
            setDrafts([]);
            onClose();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Error desconocido";
            console.error("Error creating partidas:", error);
            toast.error(
                `Se crearon ${succeeded} de ${items.length}. Error: ${message}`
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!partidaContext) return null;

    const nivelLabel = nivel === 1 ? "Partida" : nivel === 2 ? "Familia" : "Sub-partida";

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Agregar Elementos al Presupuesto</SheetTitle>
                    <SheetDescription>
                        Agrega una o varias partidas, familias y sub-partidas al proyecto{" "}
                        {partidaContext.projectName}. Usa &ldquo;Agregar a la lista&rdquo; para apilar varios elementos antes de guardar.
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

                {drafts.length > 0 && (
                    <Card className="mb-4">
                        <CardHeader>
                            <CardTitle className="text-lg">
                                Items por agregar ({drafts.length})
                            </CardTitle>
                            <CardDescription>
                                Estos elementos se crearán al guardar
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {drafts.map((d) => {
                                const tipo =
                                    d.nivel === 1
                                        ? "Partida"
                                        : d.nivel === 2
                                          ? "Familia"
                                          : "Sub-partida";
                                const label =
                                    d.nivel === 1
                                        ? d.nombre
                                        : d.nivel === 2
                                          ? `${d.partida_nombre} / ${d.familia}`
                                          : `${d.partida_nombre} / ${d.familia} / ${d.sub_partida}`;
                                return (
                                    <div
                                        key={d._draftId}
                                        className="flex items-center justify-between rounded-md border px-3 py-2 gap-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Badge variant="secondary" className="shrink-0">
                                                {tipo}
                                            </Badge>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {d.cantidad} {d.unidad} ·{" "}
                                                    {formatCurrency(d.presupuesto_aprobado)}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveDraft(d._draftId)}
                                            aria-label="Quitar de la lista"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                )}

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
                                                {familiaOptions.length === 0 ? (
                                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                        Sin familias registradas
                                                    </div>
                                                ) : (
                                                    familiaOptions.map((f) => (
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
                    <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-4 pb-6">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleAddToList}
                            disabled={!isFormValid() || isSubmitting}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Agregar a la lista
                        </Button>
                        <Button
                            type="submit"
                            disabled={(drafts.length === 0 && !isFormValid()) || isSubmitting}
                        >
                            {isSubmitting
                                ? "Guardando..."
                                : (() => {
                                      const total =
                                          drafts.length + (isFormValid() ? 1 : 0);
                                      if (total <= 1) return `Guardar ${nivelLabel}`;
                                      return `Guardar ${total} elementos`;
                                  })()}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    );
}
