"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
    ChevronDown,
    ChevronRight,
    Folder,
    Layers,
    Package,
    Plus,
    Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ---- Types -----------------------------------------------------------------

type Metrics = {
    unidad: string;
    cantidad: number;
    precio_unitario: number;
    presupuesto_aprobado: number; // 0 means "auto" (use cantidad * precio_unitario at submit)
    pagado: number;
};

type DraftSubPartida = Metrics & {
    _id: string;
    sub_partida: string;
};

type DraftFamilia = Metrics & {
    _id: string;
    familia: string;
    /** Existing nivel-2 familia under an existing partida; not (re)created on save. */
    isExisting: boolean;
    isExpanded: boolean;
    subPartidas: DraftSubPartida[];
};

type DraftPartida = Metrics & {
    _id: string;
    nombre: string;
    /** Existing nivel-1 partida used only as a parent reference; not (re)created on save. */
    isExisting: boolean;
    isExpanded: boolean;
    familias: DraftFamilia[];
};

// ---- Factories -------------------------------------------------------------

const uid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyMetrics = (): Metrics => ({
    unidad: "",
    cantidad: 0,
    precio_unitario: 0,
    presupuesto_aprobado: 0,
    pagado: 0,
});

const newSubPartida = (): DraftSubPartida => ({
    _id: uid(),
    sub_partida: "",
    ...emptyMetrics(),
});

const newFamilia = (): DraftFamilia => ({
    _id: uid(),
    familia: "",
    isExisting: false,
    isExpanded: true,
    subPartidas: [],
    ...emptyMetrics(),
});

const newExistingFamilia = (familia: string): DraftFamilia => ({
    _id: uid(),
    familia,
    isExisting: true,
    isExpanded: true,
    subPartidas: [],
    ...emptyMetrics(),
});

const newPartida = (): DraftPartida => ({
    _id: uid(),
    nombre: "",
    isExisting: false,
    isExpanded: true,
    familias: [],
    ...emptyMetrics(),
});

const newExistingPartida = (nombre: string): DraftPartida => ({
    _id: uid(),
    nombre,
    isExisting: true,
    isExpanded: true,
    familias: [],
    ...emptyMetrics(),
});

// ---- Helpers ---------------------------------------------------------------

const toNumber = (value: string) => (value === "" ? 0 : Number(value));

const formatCurrency = (amount: number) => {
    if (!Number.isFinite(amount)) return "$0.00 MXN";
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
    }).format(amount);
};

const calcTotal = (m: Metrics) => (m.cantidad || 0) * (m.precio_unitario || 0);

const effectiveAprobado = (m: Metrics) => m.presupuesto_aprobado || calcTotal(m);

const isMetricsValid = (m: Metrics) =>
    Boolean(m.unidad.trim()) && (m.cantidad || 0) > 0 && (m.precio_unitario || 0) > 0;

// ---- Reusable inline cell input -------------------------------------------

type CellProps = {
    value: string | number;
    placeholder?: string;
    type?: "text" | "number";
    step?: string;
    onChange: (value: string) => void;
    className?: string;
    required?: boolean;
};

function Cell({
    value,
    placeholder,
    type = "text",
    step,
    onChange,
    className = "",
    required,
}: CellProps) {
    return (
        <Input
            type={type}
            step={step}
            placeholder={placeholder}
            value={typeof value === "number" ? (value === 0 ? "" : value) : value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            className={`h-8 text-sm ${className}`}
        />
    );
}

// ---- Metrics row (5 inline editable fields shared by all levels) ----------

type MetricsRowProps = {
    metrics: Metrics;
    onChange: (patch: Partial<Metrics>) => void;
    requireUnidad?: boolean;
};

function MetricsRow({ metrics, onChange, requireUnidad = true }: MetricsRowProps) {
    const total = calcTotal(metrics);
    return (
        <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-2 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Unidad
                </span>
                <Cell
                    placeholder="m², kg…"
                    value={metrics.unidad}
                    onChange={(v) => onChange({ unidad: v })}
                    required={requireUnidad}
                />
            </div>
            <div className="col-span-2 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Cantidad
                </span>
                <Cell
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={metrics.cantidad}
                    onChange={(v) => onChange({ cantidad: toNumber(v) })}
                />
            </div>
            <div className="col-span-2 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    P. unitario
                </span>
                <Cell
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={metrics.precio_unitario}
                    onChange={(v) => onChange({ precio_unitario: toNumber(v) })}
                />
            </div>
            <div className="col-span-2 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Aprobado
                </span>
                <Cell
                    type="number"
                    step="0.01"
                    placeholder={total ? total.toFixed(2) : "auto"}
                    value={metrics.presupuesto_aprobado}
                    onChange={(v) => onChange({ presupuesto_aprobado: toNumber(v) })}
                />
            </div>
            <div className="col-span-2 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Pagado
                </span>
                <Cell
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={metrics.pagado}
                    onChange={(v) => onChange({ pagado: toNumber(v) })}
                />
            </div>
            <div className="col-span-2 text-right">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Total
                </span>
                <p className="text-sm font-semibold text-blue-600">
                    {formatCurrency(effectiveAprobado(metrics))}
                </p>
            </div>
        </div>
    );
}

// ---- Main component -------------------------------------------------------

export default function AddPartidaModal() {
    const partidaContext = useAddPartidaModal((s) => s.partidaContext);
    const isOpen = useAddPartidaModal((s) => s.isOpen);
    const onClose = useAddPartidaModal((s) => s.onClose);

    const createPartida = useMutation(api.partida.createPartida);

    // Existing nivel-1 partidas in the project (so users can attach new
    // children to a partida that already exists, without recreating it).
    const nivel1Partidas = useQuery(
        api.partida.getByNivel,
        partidaContext ? { proyecto: partidaContext.proyecto, nivel: 1 } : "skip",
    );

    const [partidas, setPartidas] = useState<DraftPartida[]>([]);
    const [existingSelectorValue, setExistingSelectorValue] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset state every time the sheet is (re)opened.
    useEffect(() => {
        if (isOpen) {
            setPartidas([]);
            setExistingSelectorValue("");
        }
    }, [isOpen]);

    // ---- Mutation helpers (immutable updates) ----------------------------

    const setPartida = (id: string, patch: Partial<DraftPartida>) =>
        setPartidas((prev) =>
            prev.map((p) => (p._id === id ? { ...p, ...patch } : p)),
        );

    const setFamilia = (
        partidaId: string,
        famId: string,
        patch: Partial<DraftFamilia>,
    ) =>
        setPartidas((prev) =>
            prev.map((p) =>
                p._id !== partidaId
                    ? p
                    : {
                          ...p,
                          familias: p.familias.map((f) =>
                              f._id === famId ? { ...f, ...patch } : f,
                          ),
                      },
            ),
        );

    const setSubPartida = (
        partidaId: string,
        famId: string,
        spId: string,
        patch: Partial<DraftSubPartida>,
    ) =>
        setPartidas((prev) =>
            prev.map((p) =>
                p._id !== partidaId
                    ? p
                    : {
                          ...p,
                          familias: p.familias.map((f) =>
                              f._id !== famId
                                  ? f
                                  : {
                                        ...f,
                                        subPartidas: f.subPartidas.map((sp) =>
                                            sp._id === spId
                                                ? { ...sp, ...patch }
                                                : sp,
                                        ),
                                    },
                          ),
                      },
            ),
        );

    const removePartida = (id: string) =>
        setPartidas((prev) => prev.filter((p) => p._id !== id));

    const removeFamilia = (partidaId: string, famId: string) =>
        setPartidas((prev) =>
            prev.map((p) =>
                p._id !== partidaId
                    ? p
                    : { ...p, familias: p.familias.filter((f) => f._id !== famId) },
            ),
        );

    const removeSubPartida = (partidaId: string, famId: string, spId: string) =>
        setPartidas((prev) =>
            prev.map((p) =>
                p._id !== partidaId
                    ? p
                    : {
                          ...p,
                          familias: p.familias.map((f) =>
                              f._id !== famId
                                  ? f
                                  : {
                                        ...f,
                                        subPartidas: f.subPartidas.filter(
                                            (sp) => sp._id !== spId,
                                        ),
                                    },
                          ),
                      },
            ),
        );

    const addPartidaNew = () =>
        setPartidas((prev) => [...prev, newPartida()]);

    const addPartidaExisting = (nombre: string) => {
        if (!nombre) return;
        setPartidas((prev) =>
            prev.some((p) => p.nombre === nombre)
                ? prev
                : [...prev, newExistingPartida(nombre)],
        );
    };

    const addFamilia = (partidaId: string) =>
        setPartidas((prev) =>
            prev.map((p) =>
                p._id === partidaId
                    ? { ...p, isExpanded: true, familias: [...p.familias, newFamilia()] }
                    : p,
            ),
        );

    const addFamiliaExisting = (partidaId: string, familiaName: string) => {
        if (!familiaName) return;
        setPartidas((prev) =>
            prev.map((p) =>
                p._id !== partidaId
                    ? p
                    : p.familias.some((f) => f.familia === familiaName)
                      ? p
                      : {
                            ...p,
                            isExpanded: true,
                            familias: [...p.familias, newExistingFamilia(familiaName)],
                        },
            ),
        );
    };

    const addSubPartida = (partidaId: string, famId: string) =>
        setPartidas((prev) =>
            prev.map((p) =>
                p._id !== partidaId
                    ? p
                    : {
                          ...p,
                          isExpanded: true,
                          familias: p.familias.map((f) =>
                              f._id === famId
                                  ? {
                                        ...f,
                                        isExpanded: true,
                                        subPartidas: [...f.subPartidas, newSubPartida()],
                                    }
                                  : f,
                          ),
                      },
            ),
        );

    // ---- Derived values --------------------------------------------------

    const usedPartidaNames = useMemo(
        () =>
            new Set(
                partidas
                    .map((p) => p.nombre.trim())
                    .filter((n) => n.length > 0),
            ),
        [partidas],
    );

    const availableExisting = useMemo(
        () =>
            (nivel1Partidas || []).filter(
                (p) => p.nombre && !usedPartidaNames.has(p.nombre),
            ),
        [nivel1Partidas, usedPartidaNames],
    );

    const { itemsToCreate, grandTotal } = useMemo(() => {
        let count = 0;
        let total = 0;
        for (const p of partidas) {
            if (!p.isExisting) {
                count += 1;
                total += effectiveAprobado(p);
            }
            for (const f of p.familias) {
                if (!f.isExisting) {
                    count += 1;
                    total += effectiveAprobado(f);
                }
                for (const sp of f.subPartidas) {
                    count += 1;
                    total += effectiveAprobado(sp);
                }
            }
        }
        return { itemsToCreate: count, grandTotal: total };
    }, [partidas]);

    // ---- Validation ------------------------------------------------------

    const isAllValid = useMemo(() => {
        if (partidas.length === 0) return false;
        let toCreate = 0;
        for (const p of partidas) {
            if (!p.nombre.trim()) return false;
            if (!p.isExisting) {
                if (!isMetricsValid(p)) return false;
                toCreate += 1;
            }
            for (const f of p.familias) {
                if (!f.familia.trim()) return false;
                if (!f.isExisting) {
                    if (!isMetricsValid(f)) return false;
                    toCreate += 1;
                }
                for (const sp of f.subPartidas) {
                    if (!sp.sub_partida.trim() || !isMetricsValid(sp)) return false;
                    toCreate += 1;
                }
            }
        }
        return toCreate > 0;
    }, [partidas]);

    // ---- Submit ----------------------------------------------------------

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!partidaContext || !isAllValid) {
            toast.error("Revisa los campos obligatorios de todos los elementos");
            return;
        }

        const proyecto = partidaContext.proyecto;

        const buildMetricsPayload = (m: Metrics) => {
            const cantidad = m.cantidad || 0;
            const precio = m.precio_unitario || 0;
            const original = cantidad * precio;
            const aprobado = m.presupuesto_aprobado || original;
            return {
                unidad: m.unidad,
                cantidad,
                precio_unitario: precio,
                presupuesto_original: original,
                presupuesto_aprobado: aprobado,
                pagado: m.pagado || 0,
            };
        };

        type Item = { nivel: number; payload: Record<string, unknown> };
        const items: Item[] = [];

        for (const p of partidas) {
            if (!p.isExisting) {
                items.push({
                    nivel: 1,
                    payload: {
                        nivel: 1,
                        nombre: p.nombre,
                        familia: "",
                        sub_partida: "",
                        archivo_origen: "",
                        ...buildMetricsPayload(p),
                    },
                });
            }
            for (const f of p.familias) {
                if (!f.isExisting) {
                    items.push({
                        nivel: 2,
                        payload: {
                            nivel: 2,
                            nombre: p.nombre,
                            partida_nombre: p.nombre,
                            familia: f.familia,
                            sub_partida: "",
                            archivo_origen: "",
                            ...buildMetricsPayload(f),
                        },
                    });
                }
                for (const sp of f.subPartidas) {
                    items.push({
                        nivel: 3,
                        payload: {
                            nivel: 3,
                            nombre: p.nombre,
                            partida_nombre: p.nombre,
                            familia: f.familia,
                            sub_partida: sp.sub_partida,
                            archivo_origen: "",
                            ...buildMetricsPayload(sp),
                        },
                    });
                }
            }
        }

        // Ensure parents are created before children.
        items.sort((a, b) => a.nivel - b.nivel);

        setIsSubmitting(true);
        let succeeded = 0;
        try {
            for (const it of items) {
                await createPartida({ ...it.payload, proyecto } as Parameters<typeof createPartida>[0]);
                succeeded += 1;
            }
            toast.success(
                `${succeeded} elemento${succeeded === 1 ? "" : "s"} creado${succeeded === 1 ? "" : "s"}`,
            );
            onClose();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Error desconocido";
            console.error("Error creating partidas:", error);
            toast.error(`Se crearon ${succeeded} de ${items.length}. ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!partidaContext) return null;

    // ---- Render ----------------------------------------------------------

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-[min(1100px,95vw)] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Agregar Elementos al Presupuesto</SheetTitle>
                    <SheetDescription>
                        Crea de forma masiva partidas, familias y sub-partidas para
                        el proyecto{" "}
                        <span className="font-medium">
                            {partidaContext.projectName ?? partidaContext.proyecto}
                        </span>
                        . Cada nivel se desglosa dentro del nivel superior.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" onClick={addPartidaNew}>
                            <Plus className="h-4 w-4 mr-1" /> Agregar Partida
                        </Button>
                        <Select
                            value={existingSelectorValue}
                            onValueChange={(v) => {
                                addPartidaExisting(v);
                                setExistingSelectorValue("");
                            }}
                        >
                            <SelectTrigger className="h-9 w-[280px]">
                                <SelectValue placeholder="Usar partida existente como padre…" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableExisting.length === 0 ? (
                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                        Sin partidas disponibles
                                    </div>
                                ) : (
                                    availableExisting.map((p) => (
                                        <SelectItem key={p._id} value={p.nombre}>
                                            {p.nombre}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                            {itemsToCreate} elemento{itemsToCreate === 1 ? "" : "s"}
                        </Badge>
                        <Badge>{formatCurrency(grandTotal)}</Badge>
                    </div>
                </div>

                <Separator className="my-4" />

                {partidas.length === 0 ? (
                    <div className="rounded-md border border-dashed py-12 text-center">
                        <Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Aún no hay elementos</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Agrega una partida nueva o selecciona una existente para
                            empezar a desglosar familias y sub-partidas.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3 pb-24">
                        {partidas.map((p) => (
                            <PartidaCard
                                key={p._id}
                                partida={p}
                                proyectoId={partidaContext.proyecto}
                                onPatch={(patch) => setPartida(p._id, patch)}
                                onRemove={() => removePartida(p._id)}
                                onAddFamilia={() => addFamilia(p._id)}
                                onAddFamiliaExisting={(name) =>
                                    addFamiliaExisting(p._id, name)
                                }
                                onPatchFamilia={(famId, patch) =>
                                    setFamilia(p._id, famId, patch)
                                }
                                onRemoveFamilia={(famId) => removeFamilia(p._id, famId)}
                                onAddSubPartida={(famId) =>
                                    addSubPartida(p._id, famId)
                                }
                                onPatchSubPartida={(famId, spId, patch) =>
                                    setSubPartida(p._id, famId, spId, patch)
                                }
                                onRemoveSubPartida={(famId, spId) =>
                                    removeSubPartida(p._id, famId, spId)
                                }
                            />
                        ))}

                        <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={!isAllValid || isSubmitting}
                            >
                                {isSubmitting
                                    ? "Guardando..."
                                    : `Guardar ${itemsToCreate} elemento${
                                          itemsToCreate === 1 ? "" : "s"
                                      }`}
                            </Button>
                        </div>
                    </form>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ---- PartidaCard -----------------------------------------------------------

type PartidaCardProps = {
    partida: DraftPartida;
    proyectoId: Id<"desarrollos">;
    onPatch: (patch: Partial<DraftPartida>) => void;
    onRemove: () => void;
    onAddFamilia: () => void;
    onAddFamiliaExisting: (familiaName: string) => void;
    onPatchFamilia: (famId: string, patch: Partial<DraftFamilia>) => void;
    onRemoveFamilia: (famId: string) => void;
    onAddSubPartida: (famId: string) => void;
    onPatchSubPartida: (
        famId: string,
        spId: string,
        patch: Partial<DraftSubPartida>,
    ) => void;
    onRemoveSubPartida: (famId: string, spId: string) => void;
};

function PartidaCard({
    partida,
    proyectoId,
    onPatch,
    onRemove,
    onAddFamilia,
    onAddFamiliaExisting,
    onPatchFamilia,
    onRemoveFamilia,
    onAddSubPartida,
    onPatchSubPartida,
    onRemoveSubPartida,
}: PartidaCardProps) {
    const Chevron = partida.isExpanded ? ChevronDown : ChevronRight;

    // Existing familias under this partida (only relevant when the partida
    // itself already exists in the DB). Lets the user attach more sub-partidas
    // to a familia that already exists, without recreating it.
    const existingFamilias = useQuery(
        api.partida.getDistinctFamiliasByPartida,
        partida.isExisting && partida.nombre
            ? { partidaNombre: partida.nombre, projectId: proyectoId }
            : "skip",
    );

    const usedFamiliaNames = new Set(
        partida.familias.map((f) => f.familia).filter(Boolean),
    );
    const availableExistingFamilias = (existingFamilias || []).filter(
        (name) => !usedFamiliaNames.has(name),
    );

    const [familiaSelectorValue, setFamiliaSelectorValue] = useState("");
    return (
        <div className="rounded-md border bg-card overflow-hidden">
            {/* Partida header */}
            <div className="bg-muted/40 px-3 py-2 border-b">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onPatch({ isExpanded: !partida.isExpanded })}
                        className="p-1 hover:bg-muted rounded"
                        aria-label={partida.isExpanded ? "Colapsar" : "Expandir"}
                    >
                        <Chevron className="h-4 w-4" />
                    </button>
                    <Folder className="h-4 w-4 text-amber-600" />
                    <Badge variant={partida.isExisting ? "outline" : "default"}>
                        {partida.isExisting ? "Partida existente" : "Partida"}
                    </Badge>
                    {partida.isExisting ? (
                        <span className="text-sm font-medium">{partida.nombre}</span>
                    ) : (
                        <Cell
                            placeholder="Nombre de la partida (ej. ESTRUCTURA)"
                            value={partida.nombre}
                            onChange={(v) => onPatch({ nombre: v })}
                            required
                            className="flex-1"
                        />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onRemove}
                        aria-label="Eliminar partida"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                {!partida.isExisting && partida.isExpanded && (
                    <div className="mt-3">
                        <MetricsRow
                            metrics={partida}
                            onChange={(patch) => onPatch(patch)}
                        />
                    </div>
                )}
            </div>

            {partida.isExpanded && (
                <div className="p-3 space-y-2">
                    {partida.familias.length === 0 && (
                        <p className="text-xs text-muted-foreground italic px-1">
                            Sin familias. Agrega una para desglosar este nivel.
                        </p>
                    )}
                    {partida.familias.map((f) => (
                        <FamiliaCard
                            key={f._id}
                            familia={f}
                            onPatch={(patch) => onPatchFamilia(f._id, patch)}
                            onRemove={() => onRemoveFamilia(f._id)}
                            onAddSubPartida={() => onAddSubPartida(f._id)}
                            onPatchSubPartida={(spId, patch) =>
                                onPatchSubPartida(f._id, spId, patch)
                            }
                            onRemoveSubPartida={(spId) =>
                                onRemoveSubPartida(f._id, spId)
                            }
                        />
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onAddFamilia}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar Familia
                        </Button>
                        {partida.isExisting && (
                            <Select
                                value={familiaSelectorValue}
                                onValueChange={(v) => {
                                    onAddFamiliaExisting(v);
                                    setFamiliaSelectorValue("");
                                }}
                            >
                                <SelectTrigger className="h-8 w-[260px] text-xs">
                                    <SelectValue placeholder="Usar familia existente…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableExistingFamilias.length === 0 ? (
                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                            {existingFamilias === undefined
                                                ? "Cargando…"
                                                : "Sin familias disponibles"}
                                        </div>
                                    ) : (
                                        availableExistingFamilias.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ---- FamiliaCard -----------------------------------------------------------

type FamiliaCardProps = {
    familia: DraftFamilia;
    onPatch: (patch: Partial<DraftFamilia>) => void;
    onRemove: () => void;
    onAddSubPartida: () => void;
    onPatchSubPartida: (spId: string, patch: Partial<DraftSubPartida>) => void;
    onRemoveSubPartida: (spId: string) => void;
};

function FamiliaCard({
    familia,
    onPatch,
    onRemove,
    onAddSubPartida,
    onPatchSubPartida,
    onRemoveSubPartida,
}: FamiliaCardProps) {
    const Chevron = familia.isExpanded ? ChevronDown : ChevronRight;
    return (
        <div className="rounded-md border bg-background ml-4 border-l-4 border-l-blue-300">
            <div className="px-3 py-2 border-b bg-blue-50/50">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onPatch({ isExpanded: !familia.isExpanded })}
                        className="p-1 hover:bg-muted rounded"
                        aria-label={familia.isExpanded ? "Colapsar" : "Expandir"}
                    >
                        <Chevron className="h-4 w-4" />
                    </button>
                    <Package className="h-4 w-4 text-blue-600" />
                    <Badge variant={familia.isExisting ? "outline" : "secondary"}>
                        {familia.isExisting ? "Familia existente" : "Familia"}
                    </Badge>
                    {familia.isExisting ? (
                        <span className="text-sm font-medium flex-1">
                            {familia.familia}
                        </span>
                    ) : (
                        <Cell
                            placeholder="Nombre de la familia (ej. CONCRETOS)"
                            value={familia.familia}
                            onChange={(v) => onPatch({ familia: v })}
                            required
                            className="flex-1"
                        />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onRemove}
                        aria-label="Eliminar familia"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                {!familia.isExisting && familia.isExpanded && (
                    <div className="mt-3">
                        <MetricsRow
                            metrics={familia}
                            onChange={(patch) => onPatch(patch)}
                        />
                    </div>
                )}
            </div>
            {familia.isExpanded && (
                <div className="p-3 space-y-2">
                    {familia.subPartidas.length === 0 && (
                        <p className="text-xs text-muted-foreground italic px-1">
                            Sin sub-partidas en esta familia.
                        </p>
                    )}
                    {familia.subPartidas.map((sp) => (
                        <SubPartidaRow
                            key={sp._id}
                            sub={sp}
                            onPatch={(patch) => onPatchSubPartida(sp._id, patch)}
                            onRemove={() => onRemoveSubPartida(sp._id)}
                        />
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onAddSubPartida}
                        className="w-full justify-start"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Agregar Sub-partida
                    </Button>
                </div>
            )}
        </div>
    );
}

// ---- SubPartidaRow ---------------------------------------------------------

type SubPartidaRowProps = {
    sub: DraftSubPartida;
    onPatch: (patch: Partial<DraftSubPartida>) => void;
    onRemove: () => void;
};

function SubPartidaRow({ sub, onPatch, onRemove }: SubPartidaRowProps) {
    return (
        <div className="rounded-md border bg-background ml-4 border-l-4 border-l-emerald-300 p-3">
            <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-emerald-600" />
                <Badge variant="outline">Sub-partida</Badge>
                <Cell
                    placeholder="Nombre de la sub-partida (ej. COLUMNAS)"
                    value={sub.sub_partida}
                    onChange={(v) => onPatch({ sub_partida: v })}
                    required
                    className="flex-1"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onRemove}
                    aria-label="Eliminar sub-partida"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <MetricsRow metrics={sub} onChange={onPatch} />
        </div>
    );
}
