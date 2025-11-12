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
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Circle, Plus, X, Upload, File, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

export default function AddPaymentModal() {
    // Store hooks
    const paymentContext = useAddPaymentModal((state) => state.paymentContext);
    const isOpen = useAddPaymentModal((state) => state.isOpen);
    const partidas = useAddPaymentModal((state) => state.partidas);
    const onClose = useAddPaymentModal((state) => state.onClose);
    const addPartida = useAddPaymentModal((state) => state.addPartida);
    const removePartida = useAddPaymentModal((state) => state.removePartida);
    const updatePartida = useAddPaymentModal((state) => state.updatePartida);
    const togglePartidaExpanded = useAddPaymentModal((state) => state.togglePartidaExpanded);
    const addFamilia = useAddPaymentModal((state) => state.addFamilia);
    const removeFamilia = useAddPaymentModal((state) => state.removeFamilia);
    const updateFamilia = useAddPaymentModal((state) => state.updateFamilia);
    const toggleFamiliaExpanded = useAddPaymentModal((state) => state.toggleFamiliaExpanded);
    const addSubPartida = useAddPaymentModal((state) => state.addSubPartida);
    const removeSubPartida = useAddPaymentModal((state) => state.removeSubPartida);
    const updateSubPartida = useAddPaymentModal((state) => state.updateSubPartida);
    const toggleFamiliaDirect = useAddPaymentModal((state) => state.toggleFamiliaDirect);
    const updateFamiliaDirectPayment = useAddPaymentModal((state) => state.updateFamiliaDirectPayment);

    // Local state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<"Pagado" | "Por pagar">("Pagado");
    const [categoria, setCategoria] = useState("");
    const [tipoPago, setTipoPago] = useState("");
    const [moneda, setMoneda] = useState("MXN");
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [banco, setBanco] = useState("");
    const [numeroCuenta, setNumeroCuenta] = useState("");
    const [codigoReferencia, setCodigoReferencia] = useState("");
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentType, setDocumentType] = useState("");
    const [documentName, setDocumentName] = useState("");
    const [documentDescription, setDocumentDescription] = useState("");
    // const [isUploadingDocument, setIsUploadingDocument] = useState(false); // Unused after Appwrite removal

    const createTransaction = useMutation(api.transacciones.createTransaction);
    // const createDocument = useMutation(api.documentos.create); // Unused after Appwrite removal

    // Fetch all partidas for this project
    const allPartidas = useQuery(
        api.partida.getByProject,
        paymentContext ? { projectId: paymentContext.projectId } : "skip"
    );

    // Get unique partida names (nivel 1)
    const getUniquePartidaNames = () => {
        if (!allPartidas) return [];
        const partidasNivel1 = allPartidas.filter(p => p.nivel === 1);
        const uniqueNames = [...new Set(partidasNivel1.map(p => p.nombre).filter(n => n && n.trim() !== ""))];
        return uniqueNames.sort();
    };

    // Get available familias for a partida
    const getAvailableFamilias = (partidaName: string) => {
        if (!partidaName || !allPartidas) return [];
        const partidasNivel2 = allPartidas.filter(p =>
            p.nivel === 2 &&
            p.partida_nombre === partidaName
        );
        const uniqueFamilias = [...new Set(partidasNivel2.map(p => p.familia).filter(f => f && f.trim() !== ""))];
        return uniqueFamilias.sort();
    };

    // Get available sub_partidas for a partida and familia
    const getAvailableSubPartidas = (partidaName: string, familiaName: string) => {
        if (!partidaName || !familiaName || !allPartidas) return [];
        const partidasNivel3 = allPartidas.filter(p =>
            p.nivel === 3 &&
            p.partida_nombre === partidaName &&
            p.familia === familiaName
        );
        const uniqueSubPartidas = [...new Set(partidasNivel3.map(p => p.sub_partida || p.nombre).filter(sp => sp && sp.trim() !== ""))];
        return uniqueSubPartidas.sort();
    };

    // Check if a familia has sub-partidas available (to determine if direct payment should be allowed)
    const familiaHasSubPartidas = (partidaName: string, familiaName: string): boolean => {
        return getAvailableSubPartidas(partidaName, familiaName).length > 0;
    };

    // When familia is selected, find its ID (for direct payments)
    const handleFamiliaSelectWithId = (partidaId: string, familiaId: string, partidaName: string, familiaName: string) => {
        if (!allPartidas) return;

        // Find the nivel 2 item with matching partida_nombre and familia
        const exactFamilia = allPartidas.find(p =>
            p.nivel === 2 &&
            p.partida_nombre === partidaName &&
            p.familia === familiaName
        );

        if (exactFamilia) {
            updateFamilia(partidaId, familiaId, familiaName);
            updateFamiliaDirectPayment(partidaId, familiaId, {
                partida_id: exactFamilia._id
            });
        } else {
            updateFamilia(partidaId, familiaId, familiaName);
        }
    };

    // When sub_partida is selected, find its ID
    const handleSubPartidaSelect = (partidaId: string, familiaId: string, subPartidaId: string, partidaName: string, familiaName: string, subPartidaName: string) => {
        if (!allPartidas) return;

        const exactPartida = allPartidas.find(p =>
            p.nivel === 3 &&
            p.partida_nombre === partidaName &&
            p.familia === familiaName &&
            (p.sub_partida === subPartidaName || p.nombre === subPartidaName)
        );

        if (exactPartida) {
            updateSubPartida(partidaId, familiaId, subPartidaId, {
                sub_partida: subPartidaName,
                partida_id: exactPartida._id
            });
        }
    };

    // Calculate total amount from all partidas
    const calculateTotalAmount = () => {
        return partidas.reduce((partidaSum, partida) => {
            return partidaSum + partida.familias.reduce((familiaSum, familia) => {
                const hasSubPartidas = familiaHasSubPartidas(partida.partida, familia.familia);

                // If familia is direct payment AND has no sub-partidas, add its monto
                if (familia.isDirect && !hasSubPartidas) {
                    return familiaSum + (familia.monto || 0);
                }
                // Otherwise, sum sub-partidas
                return familiaSum + familia.subPartidas.reduce((subSum, sub) => {
                    return subSum + (sub.monto || 0);
                }, 0);
            }, 0);
        }, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext) return;

        setIsSubmitting(true);
        try {
            // Build line items array from the hierarchical structure
            const lineItems: Array<{
                partida_id: Id<"partidas">;
                partida: string;
                familia: string;
                sub_partida: string;
                monto: number;
            }> = [];

            // Iterate through all partidas, familias, and subPartidas to build line items
            for (const partida of partidas) {
                for (const familia of partida.familias) {
                    // Check if this familia is a direct payment AND has no sub-partidas available
                    const hasSubPartidas = familiaHasSubPartidas(partida.partida, familia.familia);

                    if (familia.isDirect && !hasSubPartidas) {
                        if (familia.partida_id && familia.partida_id !== "" && familia.monto && familia.monto > 0) {
                            lineItems.push({
                                partida_id: familia.partida_id as Id<"partidas">,
                                partida: partida.partida,
                                familia: familia.familia,
                                sub_partida: "", // Direct familia payment has no sub-partida
                                monto: familia.monto,
                            });
                        }
                    } else {
                        // Regular payment with sub-partidas
                        for (const subPartida of familia.subPartidas) {
                            if (subPartida.partida_id && subPartida.partida_id !== "" && subPartida.monto > 0) {
                                lineItems.push({
                                    partida_id: subPartida.partida_id as Id<"partidas">,
                                    partida: partida.partida,
                                    familia: familia.familia,
                                    sub_partida: subPartida.sub_partida,
                                    monto: subPartida.monto,
                                });
                            }
                        }
                    }
                }
            }

            // Create a single transaction with all line items
            const result = await createTransaction({
                proyecto: paymentContext.projectId,
                monto_total: calculateTotalAmount(),
                fecha,
                tipo_pago: tipoPago,
                moneda,
                tipo_cambio: "1",
                status,
                categoria,
                banco: tipoPago !== 'efectivo' ? banco : undefined,
                tarjeta: undefined,
                numero_cuenta: tipoPago !== 'efectivo' ? numeroCuenta : undefined,
                numero_transferencia: undefined,
                codigo_referencia: codigoReferencia || undefined,
                factura: undefined,
                comprobante: undefined,
                presupuesto_archivo: undefined,
                lineItems,
            });

            // Note: Document upload functionality removed (Appwrite dependency removed)
            // To re-enable, integrate with Convex storage or another storage solution
            if (documentFile && result.transaccionId) {
                toast.info("Funcionalidad de documentos temporalmente deshabilitada", {
                    description: "El pago se registró correctamente, pero la carga de documentos requiere configuración adicional.",
                });
            }

            // Reset form
            setStatus("Pagado");
            setCategoria("");
            setTipoPago("");
            setMoneda("MXN");
            setFecha(new Date().toISOString().split('T')[0]);
            setBanco("");
            setNumeroCuenta("");
            setCodigoReferencia("");
            setDocumentFile(null);
            setDocumentType("");
            setDocumentName("");
            setDocumentDescription("");

            toast.success("Transacción registrada", {
                description: `Se creó la transacción con ${result.pagoIds.length} concepto(s) exitosamente.`,
            });
            onClose();
        } catch (error) {
            console.error("Error creating payments:", error);
            toast.error("Error al crear el pago");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        // Check if at least one payment is valid (either direct familia or sub-partida)
        const hasValidPayment = partidas.some(partida =>
            partida.familias.some(familia => {
                const hasSubPartidas = familiaHasSubPartidas(partida.partida, familia.familia);

                // Check direct familia payment - only valid if familia has NO sub-partidas
                if (familia.isDirect && !hasSubPartidas) {
                    return familia.partida_id &&
                        familia.partida_id !== "" &&
                        familia.familia &&
                        familia.monto &&
                        familia.monto > 0;
                }
                // Check sub-partida payment
                return familia.subPartidas.some(sub =>
                    sub.partida_id &&
                    sub.partida_id !== "" &&
                    sub.sub_partida &&
                    sub.monto > 0
                );
            })
        );

        return hasValidPayment && tipoPago && fecha && status;
    };

    if (!paymentContext) return null;

    const totalAmount = calculateTotalAmount();
    const totalPayments = partidas.reduce((sum, p) => sum + p.familias.reduce((f, fam) => {
        const hasSubPartidas = familiaHasSubPartidas(p.partida, fam.familia);
        // If direct familia AND has no sub-partidas, count as 1 payment, otherwise count sub-partidas
        return f + (fam.isDirect && !hasSubPartidas ? 1 : fam.subPartidas.length);
    }, 0), 0);

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[800px] sm:max-w-[800px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-xl font-medium text-gray-900">Pagos Múltiples</SheetTitle>
                    <SheetDescription className="text-sm text-gray-600">
                        Registra pagos para múltiples partidas, familias y sub-partidas
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                    {/* Status Selection */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setStatus('Pagado')}
                                className={cn(
                                    "flex items-center gap-3 p-4 rounded-none border transition-all",
                                    status === 'Pagado'
                                        ? "border-green-600 bg-white"
                                        : "border-gray-300 bg-white hover:border-gray-400"
                                )}
                            >
                                <Check className={cn(
                                    "h-5 w-5",
                                    status === 'Pagado' ? "text-green-600" : "text-gray-400"
                                )} />
                                <span className={cn(
                                    "text-base",
                                    status === 'Pagado' ? "text-gray-900 font-medium" : "text-gray-600"
                                )}>Pagado</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatus('Por pagar')}
                                className={cn(
                                    "flex items-center gap-3 p-4 rounded-none border transition-all",
                                    status === 'Por pagar'
                                        ? "border-gray-600 bg-white"
                                        : "border-gray-300 bg-white hover:border-gray-400"
                                )}
                            >
                                <Circle className={cn(
                                    "h-5 w-5",
                                    status === 'Por pagar' ? "text-gray-600" : "text-gray-400"
                                )} />
                                <span className={cn(
                                    "text-base",
                                    status === 'Por pagar' ? "text-gray-900 font-medium" : "text-gray-600"
                                )}>Por pagar</span>
                            </button>
                        </div>
                    </div>

                    {/* Hierarchical Partida/Familia/SubPartida Selection */}
                    <div className="space-y-4 border p-4 rounded-none bg-gray-50">
                        <div className="flex items-center justify-between">
                            <h3 className="font-medium text-gray-900">Partidas</h3>
                            <span className="text-sm text-gray-600">
                                Total: {new Intl.NumberFormat('es-MX', {
                                    style: 'currency',
                                    currency: moneda
                                }).format(totalAmount)}
                            </span>
                        </div>

                        {/* Partidas List */}
                        <div className="space-y-4">
                            {partidas.map((partida) => (
                                <div key={partida.id} className="bg-white border rounded-none">
                                    {/* Partida Header */}
                                    <div className="flex items-center gap-2 p-3 bg-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => togglePartidaExpanded(partida.id)}
                                            className="text-gray-600 hover:text-gray-900"
                                        >
                                            {partida.isExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </button>
                                        <Select
                                            value={partida.partida}
                                            onValueChange={(value) => updatePartida(partida.id, value)}
                                        >
                                            <SelectTrigger className="flex-1 h-10">
                                                <SelectValue placeholder="Seleccionar partida" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {getUniquePartidaNames().map((nombre) => (
                                                    <SelectItem key={nombre} value={nombre}>
                                                        {nombre}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {partidas.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removePartida(partida.id)}
                                                className="h-8 w-8 p-0"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-600" />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Familias (nested) */}
                                    {partida.isExpanded && partida.partida && (
                                        <div className="p-3 space-y-3">
                                            {partida.familias.map((familia) => (
                                                <div key={familia.id} className="border-l-2 border-gray-300 pl-4 space-y-2">
                                                    {/* Familia Header */}
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleFamiliaExpanded(partida.id, familia.id)}
                                                            className="text-gray-600 hover:text-gray-900"
                                                        >
                                                            {familia.isExpanded ? (
                                                                <ChevronDown className="h-3 w-3" />
                                                            ) : (
                                                                <ChevronRight className="h-3 w-3" />
                                                            )}
                                                        </button>
                                                        <Select
                                                            value={familia.familia}
                                                            onValueChange={(value) => handleFamiliaSelectWithId(partida.id, familia.id, partida.partida, value)}
                                                        >
                                                            <SelectTrigger className="flex-1 h-9">
                                                                <SelectValue placeholder="Seleccionar familia" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {getAvailableFamilias(partida.partida).map((fam) => (
                                                                    <SelectItem key={fam} value={fam}>
                                                                        {fam}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {partida.familias.length > 1 && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => removeFamilia(partida.id, familia.id)}
                                                                className="h-7 w-7 p-0"
                                                            >
                                                                <X className="h-3 w-3 text-red-600" />
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {/* Toggle for direct payment - only show if familia has NO sub-partidas */}
                                                    {familia.familia && !familiaHasSubPartidas(partida.partida, familia.familia) && (
                                                        <div className="ml-4 flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                id={`direct-${familia.id}`}
                                                                checked={familia.isDirect}
                                                                onChange={() => toggleFamiliaDirect(partida.id, familia.id)}
                                                                className="h-4 w-4 rounded border-gray-300"
                                                            />
                                                            <label htmlFor={`direct-${familia.id}`} className="text-xs text-gray-600 cursor-pointer">
                                                                Pago directo (sin sub-partidas)
                                                            </label>
                                                        </div>
                                                    )}

                                                    {/* Direct Payment Input OR SubPartidas List */}
                                                    {familia.isExpanded && familia.familia && (
                                                        <>
                                                            {familia.isDirect && !familiaHasSubPartidas(partida.partida, familia.familia) ? (
                                                                /* Direct Payment Mode - only if familia has NO sub-partidas */
                                                                <div className="ml-4 flex items-center gap-2">
                                                                    <div className="flex-1">
                                                                        <MoneyInput
                                                                            placeholder="Monto"
                                                                            value={familia.monto || 0}
                                                                            onChange={(value) =>
                                                                                updateFamiliaDirectPayment(partida.id, familia.id, { monto: value })
                                                                            }
                                                                            currency={moneda}
                                                                            className="text-left h-9 text-sm"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Normal Mode with SubPartidas - shown when familia has sub-partidas OR isDirect is false */
                                                                <div className="space-y-2 ml-4">
                                                                    {familia.subPartidas.map((subPartida) => (
                                                                        <div key={subPartida.id} className="flex items-center gap-2">
                                                                            <Select
                                                                                value={subPartida.sub_partida}
                                                                                onValueChange={(value) =>
                                                                                    handleSubPartidaSelect(
                                                                                        partida.id,
                                                                                        familia.id,
                                                                                        subPartida.id,
                                                                                        partida.partida,
                                                                                        familia.familia,
                                                                                        value
                                                                                    )
                                                                                }
                                                                            >
                                                                                <SelectTrigger className="flex-1 h-9 text-sm">
                                                                                    <SelectValue placeholder="Sub-partida" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {getAvailableSubPartidas(partida.partida, familia.familia).map((sub) => (
                                                                                        <SelectItem key={sub} value={sub}>
                                                                                            {sub}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <div className="w-32">
                                                                                <MoneyInput
                                                                                    placeholder="Monto"
                                                                                    value={subPartida.monto || 0}
                                                                                    onChange={(value) =>
                                                                                        updateSubPartida(partida.id, familia.id, subPartida.id, { monto: value })
                                                                                    }
                                                                                    currency={moneda}
                                                                                    className="text-left h-9 text-sm"
                                                                                />
                                                                            </div>
                                                                            {familia.subPartidas.length > 1 && (
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    onClick={() => removeSubPartida(partida.id, familia.id, subPartida.id)}
                                                                                    className="h-7 w-7 p-0"
                                                                                >
                                                                                    <X className="h-3 w-3 text-gray-400" />
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => addSubPartida(partida.id, familia.id)}
                                                                        className="w-full text-xs h-8"
                                                                    >
                                                                        <Plus className="h-3 w-3 mr-1" />
                                                                        Agregar Sub-partida
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => addFamilia(partida.id)}
                                                className="w-full text-sm h-9"
                                            >
                                                <Plus className="h-4 w-4 mr-1" />
                                                Agregar Familia
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={addPartida}
                            className="w-full"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Agregar Partida
                        </Button>
                    </div>

                    {/* Payment Details */}
                    <div className="space-y-3 pt-2">
                        {/* Categoría */}
                        <Select value={categoria} onValueChange={setCategoria}>
                            <SelectTrigger className="h-12">
                                <SelectValue placeholder="Categoría (anticipo, material, estimación)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="anticipo">Anticipo</SelectItem>
                                <SelectItem value="material">Material</SelectItem>
                                <SelectItem value="estimacion">Estimación</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="grid grid-cols-2 gap-3">
                            <Select value={tipoPago} onValueChange={setTipoPago}>
                                <SelectTrigger className="h-12">
                                    <SelectValue placeholder="Tipo de pago" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="efectivo">Efectivo</SelectItem>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={moneda} onValueChange={setMoneda}>
                                <SelectTrigger className="h-12">
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
                            <div className="relative">
                                <MoneyInput
                                    placeholder="Monto total"
                                    value={totalAmount}
                                    onChange={() => { }}
                                    currency={moneda}
                                    disabled
                                    className="h-12 bg-gray-100"
                                />
                            </div>
                            <Input
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="h-12"
                                required
                            />
                        </div>

                        {/* Bank Details (conditional) */}
                        {tipoPago && tipoPago !== 'efectivo' && (
                            <div className="space-y-3 pt-2">
                                <Input
                                    placeholder="Banco"
                                    value={banco}
                                    onChange={(e) => setBanco(e.target.value)}
                                    className="h-12"
                                />
                                <Input
                                    placeholder="Número de cuenta"
                                    value={numeroCuenta}
                                    onChange={(e) => setNumeroCuenta(e.target.value)}
                                    className="h-12"
                                />
                            </div>
                        )}

                        {/* Description */}
                        <Input
                            placeholder="Código de referencia / Notas"
                            value={codigoReferencia}
                            onChange={(e) => setCodigoReferencia(e.target.value)}
                            className="h-12"
                        />

                        {/* Document Attachment */}
                        <div className="space-y-3 pt-4 border-t">
                            <h3 className="text-sm font-medium text-gray-900">Adjuntar documento (opcional)</h3>

                            <div className="space-y-2">
                                <label className="text-sm text-gray-700">Tipo de documento</label>
                                <Select value={documentType} onValueChange={setDocumentType}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Seleccionar tipo de documento" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="factura">Factura</SelectItem>
                                        <SelectItem value="comprobante">Comprobante</SelectItem>
                                        <SelectItem value="presupuesto">Presupuesto</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {documentType && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm text-gray-700">Nombre del documento</label>
                                        <Input
                                            placeholder="Ej: Factura #12345"
                                            value={documentName}
                                            onChange={(e) => setDocumentName(e.target.value)}
                                            className="h-12"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-gray-700">Descripción (opcional)</label>
                                        <Input
                                            placeholder="Descripción del documento"
                                            value={documentDescription}
                                            onChange={(e) => setDocumentDescription(e.target.value)}
                                            className="h-12"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-gray-700">Archivo</label>
                                        <div className="border-2 border-dashed rounded-none p-4 text-center">
                                            {documentFile ? (
                                                <div className="space-y-2">
                                                    <File className="h-8 w-8 mx-auto text-green-600" />
                                                    <p className="text-sm font-medium">{documentFile.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {(documentFile.size / 1024).toFixed(2)} KB
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setDocumentFile(null)}
                                                    >
                                                        Cambiar archivo
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Upload className="h-8 w-8 mx-auto text-gray-400" />
                                                    <p className="text-sm text-gray-600">Arrastra un archivo o haz clic</p>
                                                    <Input
                                                        type="file"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) setDocumentFile(file);
                                                        }}
                                                        className="max-w-xs mx-auto"
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onClose} className="h-11">
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid() || isSubmitting}
                            className="bg-black hover:bg-gray-800 text-white h-11"
                        >
                            {isSubmitting ? 'Guardando...' : `Guardar ${totalPayments} pago(s)`}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
