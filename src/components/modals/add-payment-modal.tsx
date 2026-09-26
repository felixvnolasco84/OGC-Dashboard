"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CalendarDays, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Circle, Plus, X, Upload, File, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import ProviderFormDialog from "@/components/providers/ProviderFormDialog";
import { es } from "date-fns/locale";
import { formatMoney, sumMoney } from "@/lib/money";
import { buildPaymentDraft } from "@/lib/payment-draft";
import ProviderPaymentAccountPicker from "@/components/payments/ProviderPaymentAccountPicker";

const todayString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function AddPaymentModal() {
    // Store hooks
    const paymentContext = useAddPaymentModal((state) => state.paymentContext);
    const isOpen = useAddPaymentModal((state) => state.isOpen);
    const { isAuthenticated } = useConvexAuth();
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
    const updateFamiliaDirectPayment = useAddPaymentModal((state) => state.updateFamiliaDirectPayment);

    // Local state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitLock = useRef(false);
    const [status, setStatus] = useState<"Pagado" | "Por pagar">("Pagado");
    const [categoria, setCategoria] = useState("");
    const [tipoPago, setTipoPago] = useState("");
    const [moneda, setMoneda] = useState("MXN");
    const [fecha, setFecha] = useState(todayString);
    const [banco, setBanco] = useState("");
    const [clabe, setClabe] = useState("");
    const [paymentAccountId, setPaymentAccountId] = useState<Id<"payment_accounts"> | "">("");
    const [proveedorId, setProveedorId] = useState<Id<"proveedores"> | "">("");
    const [providerFormOpen, setProviderFormOpen] = useState(false);
    const [providerSearchOpen, setProviderSearchOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [numeroCuenta, setNumeroCuenta] = useState("");
    const [codigoReferencia, setCodigoReferencia] = useState("");
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentType, setDocumentType] = useState("");
    const [documentName, setDocumentName] = useState("");
    const [documentDescription, setDocumentDescription] = useState("");
    const [isUploadingDocument, setIsUploadingDocument] = useState(false);

    const closeModal = () => {
        setStatus("Pagado");
        setCategoria("");
        setTipoPago("");
        setMoneda("MXN");
        setFecha(todayString());
        setBanco("");
        setClabe("");
        setPaymentAccountId("");
        setProveedorId("");
        setProviderFormOpen(false);
        setProviderSearchOpen(false);
        setCalendarOpen(false);
        setNumeroCuenta("");
        setCodigoReferencia("");
        setDocumentFile(null);
        setDocumentType("");
        setDocumentName("");
        setDocumentDescription("");
        onClose();
    };

    const createTransaction = useMutation(api.transacciones.createTransaction);
    const generateUploadUrl = useMutation(api.documentos.generateUploadUrl);
    const createDocumentWithStorage = useMutation(api.documentos.createWithStorage);

    const selectProvider = (id: Id<"proveedores"> | "") => {
        setProveedorId(id);
        setPaymentAccountId("");
        setBanco("");
        setNumeroCuenta("");
        setClabe("");
    };

    const selectPaymentAccount = (id: Id<"payment_accounts"> | "") => {
        setPaymentAccountId(id);
        setBanco("");
        setNumeroCuenta("");
        setClabe("");
    };
    const providers = useQuery(
        api.proveedores.getAll,
        isOpen && isAuthenticated ? {} : "skip"
    );

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

    const draft = buildPaymentDraft(partidas, familiaHasSubPartidas);
    const totalAmount = sumMoney(draft.lineItems.map(item => item.monto), moneda);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext || !isFormValid() || submitLock.current) return;

        submitLock.current = true;
        setIsSubmitting(true);
        try {
            const lineItems = draft.lineItems;

            // Determine factura/comprobante based on document type
            const isFactura = documentType === "factura" && documentName;
            const isComprobante = documentType === "comprobante" && documentName;

            // Create a single transaction with all line items
            const result = await createTransaction({
                proyecto: paymentContext.projectId,
                proveedor_id: proveedorId || undefined,
                payment_account_id: paymentAccountId || undefined,
                monto_total: sumMoney(lineItems.map(item => item.monto), moneda),
                fecha,
                tipo_pago: tipoPago,
                moneda,
                tipo_cambio: "1",
                status,
                categoria,
                banco: tipoPago !== 'efectivo' ? banco : undefined,
                clabe: tipoPago !== 'efectivo' ? clabe : undefined,
                tarjeta: undefined,
                numero_cuenta: tipoPago !== 'efectivo' ? numeroCuenta : undefined,
                numero_transferencia: undefined,
                codigo_referencia: codigoReferencia || undefined,
                factura: isFactura ? documentName : undefined,
                comprobante: isComprobante ? documentName : undefined,
                presupuesto_archivo: documentType === "presupuesto" && documentName ? documentName : undefined,
                lineItems,
            });

            // Upload document if provided using Convex storage
            let documentUploaded = false;
            let uploadedDocumentName = "";

            if (documentFile && result.transaccionId && documentType && documentName) {
                try {
                    setIsUploadingDocument(true);
                    uploadedDocumentName = documentName; // Store before reset

                    // Step 1: Generate upload URL
                    const uploadUrl = await generateUploadUrl();

                    // Step 2: Upload file to Convex storage
                    const uploadResult = await fetch(uploadUrl, {
                        method: "POST",
                        headers: { "Content-Type": documentFile.type },
                        body: documentFile,
                    });

                    if (!uploadResult.ok) {
                        throw new Error("Failed to upload file");
                    }

                    const { storageId } = await uploadResult.json();

                    // Step 3: Create document record linked to the transaction
                    await createDocumentWithStorage({
                        nombre: documentName,
                        descripcion: documentDescription || "",
                        storage_id: storageId,
                        type: documentType,
                        size: documentFile.size,
                        mime_type: documentFile.type || undefined,
                        proyecto: paymentContext.projectId,
                        transaccion_id: result.transaccionId,
                    });

                    documentUploaded = true;
                } catch (docError) {
                    console.error("Error uploading document:", docError);
                    toast.error("Error al subir documento", {
                        description: "La transacción se creó pero el documento no se pudo adjuntar.",
                    });
                } finally {
                    setIsUploadingDocument(false);
                }
            }

            // Show success toast with document info if applicable
            const conceptosText = `${result.pagoIds.length} concepto(s)`;
            const documentText = documentUploaded ? ` y documento "${uploadedDocumentName}" adjuntado` : "";
            toast.success("Transacción registrada", {
                description: `Se creó la transacción con ${conceptosText}${documentText}.`,
            });
            closeModal();
        } catch (error) {
            console.error("Error creating payments:", error);
            toast.error("Error al crear el pago");
        } finally {
            submitLock.current = false;
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return allPartidas !== undefined && draft.lineItems.length > 0 && draft.incompleteCount === 0 && tipoPago && fecha && status && categoria;
    };

    if (!paymentContext) return null;

    const totalPayments = draft.lineItems.length;

    return (
        <>
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) closeModal(); }}>
            <SheetContent data-square-modal="" variant="paymentForm">
                <SheetHeader>
                    <SheetTitle>Registrar pagos</SheetTitle>
                    <SheetDescription>
                        Agrega conceptos por partida y completa los datos del pago.
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                    {/* Status Selection */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                type="button"
                                onClick={() => setStatus('Pagado')}
                                aria-pressed={status === 'Pagado'}
                                variant={status === 'Pagado' ? 'choiceSelected' : 'choice'}
                                size="choice"
                            >
                                <Check className={cn(
                                    "h-5 w-5",
                                    status === 'Pagado' ? "text-success" : "text-disabled-foreground"
                                )} />
                                <span className={cn(
                                    "text-base",
                                    status === 'Pagado' ? "text-foreground font-medium" : "text-muted-foreground"
                                )}>Pagado</span>
                            </Button>
                            <Button
                                type="button"
                                onClick={() => setStatus('Por pagar')}
                                aria-pressed={status === 'Por pagar'}
                                variant={status === 'Por pagar' ? 'choiceSelected' : 'choice'}
                                size="choice"
                            >
                                <Circle className={cn(
                                    "h-5 w-5",
                                    status === 'Por pagar' ? "text-muted-foreground" : "text-disabled-foreground"
                                )} />
                                <span className={cn(
                                    "text-base",
                                    status === 'Por pagar' ? "text-foreground font-medium" : "text-muted-foreground"
                                )}>Por pagar</span>
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2 border p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium text-foreground">Proveedor</h3>
                                <p className="text-xs text-muted-foreground">Opcional; puede asignarse o modificarse después.</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setProviderFormOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Nuevo
                            </Button>
                        </div>
                        <Popover open={providerSearchOpen} onOpenChange={setProviderSearchOpen}>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="combobox" role="combobox" aria-expanded={providerSearchOpen}
                                    aria-label="Buscar proveedor">
                                    <span className="truncate">{providers?.find(provider => provider._id === proveedorId)?.razon_social || "Sin proveedor"}</span>
                                    <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent variant="filter" align="start" className="z-[100] w-[var(--radix-popover-trigger-width)]">
                                <Command>
                                    <CommandInput placeholder="Buscar por nombre o RFC..." />
                                    <CommandList>
                                        <CommandEmpty>{providers === undefined ? "Cargando proveedores..." : "No se encontraron proveedores"}</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem value="sin proveedor" onSelect={() => { selectProvider(""); setProviderSearchOpen(false); }}>
                                                <Check className={cn("mr-2 h-4 w-4", proveedorId ? "opacity-0" : "opacity-100")} />
                                                Sin proveedor
                                            </CommandItem>
                                            {providers?.map(provider => (
                                                <CommandItem key={provider._id} value={`${provider.razon_social} ${provider.rfc || ""} ${provider._id}`}
                                                    onSelect={() => { selectProvider(provider._id); setProviderSearchOpen(false); }}>
                                                    <Check className={cn("mr-2 h-4 w-4 shrink-0", proveedorId === provider._id ? "opacity-100" : "opacity-0")} />
                                                    <span className="min-w-0 truncate">{provider.razon_social}</span>
                                                    {provider.rfc && <span className="ml-auto pl-2 text-xs text-muted-foreground">{provider.rfc}</span>}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Hierarchical Partida/Familia/SubPartida Selection */}
                    <div className="space-y-4 border p-4 rounded-none bg-background">
                        <div className="flex items-center justify-between">
                            <h3 className="font-medium text-foreground">Partidas</h3>
                            <span className="text-sm text-muted-foreground tabular-nums">Total: {formatMoney(totalAmount, moneda)}</span>
                        </div>

                        {/* Partidas List */}
                        <div className="space-y-4">
                            {partidas.map((partida) => (
                                <div key={partida.id} className="bg-card border rounded-none">
                                    {/* Partida Header */}
                                    <div className="flex items-center gap-2 p-3 bg-muted">
                                        <Button
                                            type="button"
                                            onClick={() => togglePartidaExpanded(partida.id)}
                                            variant="quiet"
                                            size="iconSm"
                                        >
                                            {partida.isExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <Select
                                            value={partida.partida}
                                            onValueChange={(value) => updatePartida(partida.id, value)}
                                        >
                                            <SelectTrigger className="flex-1 h-10">
                                                <SelectValue placeholder="Seleccionar partida" />
                                            </SelectTrigger>
                                            <SelectContent data-square-modal="">
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
                                                variant="quiet"
                                                size="iconSm"
                                                onClick={() => removePartida(partida.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-danger" />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Familias (nested) */}
                                    {partida.isExpanded && partida.partida && (
                                        <div className="p-3 space-y-3">
                                            {partida.familias.map((familia) => (
                                                <div key={familia.id} className="border-l-2 border-border-strong pl-4 space-y-2">
                                                    {/* Familia Header */}
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            onClick={() => toggleFamiliaExpanded(partida.id, familia.id)}
                                                            variant="quiet"
                                                            size="iconXs"
                                                        >
                                                            {familia.isExpanded ? (
                                                                <ChevronDown className="h-3 w-3" />
                                                            ) : (
                                                                <ChevronRight className="h-3 w-3" />
                                                            )}
                                                        </Button>
                                                        <Select
                                                            value={familia.familia}
                                                            onValueChange={(value) => handleFamiliaSelectWithId(partida.id, familia.id, partida.partida, value)}
                                                        >
                                                            <SelectTrigger className="flex-1 h-9">
                                                                <SelectValue placeholder="Seleccionar familia" />
                                                            </SelectTrigger>
                                                            <SelectContent data-square-modal="">
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
                                                                variant="quiet"
                                                                size="iconXs"
                                                                onClick={() => removeFamilia(partida.id, familia.id)}
                                                            >
                                                                <X className="h-3 w-3 text-danger" />
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {/* Direct Payment Input OR SubPartidas List */}
                                                    {familia.isExpanded && familia.familia && (
                                                        <>
                                                            {!familiaHasSubPartidas(partida.partida, familia.familia) ? (
                                                                <div className="ml-4 space-y-1">
                                                                    <label htmlFor={`familia-monto-${familia.id}`} className="text-xs text-muted-foreground">Monto de la familia</label>
                                                                    <div className="flex-1">
                                                                        <MoneyInput
                                                                            id={`familia-monto-${familia.id}`}
                                                                            placeholder="Monto"
                                                                            value={familia.monto || 0}
                                                                            onChange={(value) =>
                                                                                updateFamiliaDirectPayment(partida.id, familia.id, { monto: value })
                                                                            }
                                                                            currency={moneda}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Family with sub-items */
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
                                                            <SelectTrigger className="flex-1 h-9">
                                                                                    <SelectValue placeholder="Sub-partida" />
                                                                                </SelectTrigger>
                                                                                <SelectContent data-square-modal="">
                                                                                    {getAvailableSubPartidas(partida.partida, familia.familia).map((sub) => (
                                                                                        <SelectItem key={sub} value={sub}>
                                                                                            {sub}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <div className="w-32">
                                                                                <MoneyInput
                                                                                    aria-label={`Monto de ${subPartida.sub_partida || "sub-partida"}`}
                                                                                    placeholder="Monto"
                                                                                    value={subPartida.monto || 0}
                                                                                    onChange={(value) =>
                                                                                        updateSubPartida(partida.id, familia.id, subPartida.id, { monto: value })
                                                                                    }
                                                                                    currency={moneda}
                                                                                />
                                                                            </div>
                                                                            {familia.subPartidas.length > 1 && (
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="quiet"
                                                                                    size="iconXs"
                                                                                    onClick={() => removeSubPartida(partida.id, familia.id, subPartida.id)}
                                                                                >
                                                                                    <X className="h-3 w-3 text-disabled-foreground" />
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="fullSm"
                                                                        onClick={() => addSubPartida(partida.id, familia.id)}
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
                                                onClick={() => addFamilia(partida.id)}
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

                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Agregar Partida
                        </Button>
                    </div>

                    {/* Payment Details */}
                    <div className="space-y-3 pt-2">
                        <h3 className="font-medium text-foreground">Datos del pago</h3>
                        <div className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Categoría</span>
                            <Select value={categoria} onValueChange={setCategoria}>
                                <SelectTrigger className="h-12" aria-label="Categoría"><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                                <SelectContent data-square-modal="">
                                    <SelectItem value="anticipo">Anticipo</SelectItem>
                                    <SelectItem value="material">Material</SelectItem>
                                    <SelectItem value="estimacion">Estimación</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Método de pago</span>
                            <Select value={tipoPago} onValueChange={(value) => {
                                setTipoPago(value);
                                if (value !== "transferencia" && value !== "cheque") setPaymentAccountId("");
                            }}>
                                <SelectTrigger className="h-12" aria-label="Método de pago">
                                    <SelectValue placeholder="Tipo de pago" />
                                </SelectTrigger>
                                <SelectContent data-square-modal="">
                                    <SelectItem value="efectivo">Efectivo</SelectItem>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                </SelectContent>
                            </Select>
                            </div>
                            <div className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Moneda</span>
                            <Select value={moneda} onValueChange={setMoneda}>
                                <SelectTrigger className="h-12" aria-label="Moneda">
                                    <SelectValue placeholder="Moneda" />
                                </SelectTrigger>
                                <SelectContent data-square-modal="">
                                    <SelectItem value="MXN">MXN</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                </SelectContent>
                            </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Total calculado</span>
                                <div className="flex h-12 items-center border border-border bg-muted px-3 font-medium tabular-nums" aria-live="polite">
                                    {formatMoney(totalAmount, moneda)}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Fecha del pago</span>
                                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="combobox" size="combobox" aria-label="Fecha del pago">
                                            <span className="flex items-center gap-2">
                                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                                {fecha ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" })
                                                    .format(new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))) : "Elegir fecha"}
                                            </span>
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent variant="calendarLayer" align="start">
                                        <Calendar mode="single" locale={es}
                                            selected={fecha ? new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10))) : undefined}
                                            onSelect={(date) => {
                                                if (!date) return;
                                                setFecha(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
                                                setCalendarOpen(false);
                                            }}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {/* Bank Details (conditional) */}
                        {tipoPago && tipoPago !== 'efectivo' && (
                            <div className="space-y-3 pt-2">
                                {paymentContext && (tipoPago === "transferencia" || tipoPago === "cheque") && proveedorId && (
                                    <ProviderPaymentAccountPicker
                                        projectId={paymentContext.projectId}
                                        providerId={proveedorId}
                                        method={tipoPago}
                                        selectedId={paymentAccountId}
                                        banco={banco}
                                        numeroCuenta={numeroCuenta}
                                        clabe={clabe}
                                        onSelect={selectPaymentAccount}
                                    />
                                )}
                                {!paymentAccountId && <>
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
                                {(tipoPago === "transferencia" || tipoPago === "cheque") && <Input
                                    placeholder="CLABE (opcional)"
                                    aria-label="CLABE"
                                    inputMode="numeric"
                                    value={clabe}
                                    onChange={(e) => setClabe(e.target.value)}
                                    className="h-12"
                                />}
                                </>}
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
                            <h3 className="text-sm font-medium text-foreground">Adjuntar documento (opcional)</h3>

                            <div className="space-y-2">
                                <label className="text-sm text-foreground">Tipo de documento</label>
                                <Select value={documentType} onValueChange={setDocumentType}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Seleccionar tipo de documento" />
                                    </SelectTrigger>
                                    <SelectContent data-square-modal="">
                                        <SelectItem value="factura">Factura</SelectItem>
                                        {/* <SelectItem value="comprobante">Comprobante</SelectItem>
                                        <SelectItem value="presupuesto">Presupuesto</SelectItem> */}
                                    </SelectContent>
                                </Select>
                            </div>

                            {documentType && (
                                <>
                                    {/* <div className="space-y-2">
                                        <label className="text-sm text-foreground">Nombre del documento</label>
                                        <Input
                                            placeholder="Ej: Factura #12345"
                                            value={documentName}
                                            onChange={(e) => setDocumentName(e.target.value)}
                                            className="h-12"
                                        />
                                    </div> */}
                                                               <div className="space-y-2">
                                        <label className="text-sm text-foreground">Archivo</label>
                                        <div className="border-2 border-dashed rounded-none p-4 text-center">
                                            {documentFile ? (
                                                <div className="space-y-2">
                                                    <File className="h-8 w-8 mx-auto text-success" />
                                                    <p className="text-sm font-medium">{documentFile.name}</p>
                                                    <p className="text-xs text-muted-foreground">
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
                                                    <Upload className="h-8 w-8 mx-auto text-disabled-foreground" />
                                                    <p className="text-sm text-muted-foreground">Arrastra un archivo o haz clic</p>
                                                    <Input
                                                        type="file"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setDocumentFile(file);
                                                                // Auto-populate document name if empty
                                                                if (!documentName) {
                                                                    setDocumentName(file.name); // Keep full filename with extension
                                                                }
                                                            }
                                                        }}
                                                        className="max-w-xs mx-auto"
                                                        accept=".xml,.pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm text-foreground">Descripción (opcional)</label>
                                        <Input
                                            placeholder="Descripción del documento"
                                            value={documentDescription}
                                            onChange={(e) => setDocumentDescription(e.target.value)}
                                            className="h-12"
                                        />
                                    </div>


                                </>
                            )}
                        </div>
                    </div>

                    {/* Form Actions */}
                    {draft.incompleteCount > 0 && (
                        <p role="alert" className="text-sm text-danger">
                            Completa {draft.incompleteCount} concepto{draft.incompleteCount === 1 ? "" : "s"} antes de guardar.
                        </p>
                    )}
                    <div className="flex justify-end space-x-2 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={closeModal} disabled={isSubmitting || isUploadingDocument}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid() || isSubmitting || isUploadingDocument}
                            variant="inverse"
                        >
                            {isSubmitting || isUploadingDocument ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {isUploadingDocument ? 'Subiendo documento...' : 'Guardando...'}
                                </>
                            ) : (
                                `Guardar ${totalPayments} pago(s)`
                            )}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
        <ProviderFormDialog open={providerFormOpen} onOpenChange={setProviderFormOpen} onSaved={selectProvider} />
        </>
    )
}
