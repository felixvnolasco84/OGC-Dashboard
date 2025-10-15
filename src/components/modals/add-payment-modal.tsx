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
import { Check, Circle, Plus, X, Upload, File } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";
import { uploadDocument } from "@/lib/appwrite";
import { toast } from "sonner";

type SubPartidaItem = {
    id: string;
    partida_id: Id<"partidas"> | "";
    partida: string;
    familia: string;
    sub_partida: string;
    monto: number;
};

export default function AddPaymentModal() {
    const paymentContext = useAddPaymentModal((state) => state.paymentContext);
    const isOpen = useAddPaymentModal((state) => state.isOpen);
    const onClose = useAddPaymentModal((state) => state.onClose);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<"Pagado" | "Por pagar">("Pagado");
    const [selectedPartida, setSelectedPartida] = useState("");
    const [selectedFamilia, setSelectedFamilia] = useState("");
    const [subPartidas, setSubPartidas] = useState<SubPartidaItem[]>([]);
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
    const [isUploadingDocument, setIsUploadingDocument] = useState(false);
    
    const createPayment = useMutation(api.pagos.create);
    const createDocument = useMutation(api.documentos.create);

    // Fetch all partidas for this project
    const allPartidas = useQuery(
        api.partida.getByProject,
        paymentContext ? { projectId: paymentContext.projectId } : "skip"
    );

    // Calculate total amount from all sub-partidas
    const totalAmount = subPartidas.reduce((sum, item) => sum + (item.monto || 0), 0);

    // Add a new sub-partida item
    const addSubPartida = () => {
        setSubPartidas([...subPartidas, {
            id: Date.now().toString(),
            partida_id: "",
            partida: selectedPartida,
            familia: selectedFamilia,
            sub_partida: "",
            monto: 0
        }]);
    };

    // Remove a sub-partida item
    const removeSubPartida = (id: string) => {
        setSubPartidas(subPartidas.filter(item => item.id !== id));
    };

    // Update a sub-partida item
    const updateSubPartida = (id: string, updates: Partial<SubPartidaItem>) => {
        setSubPartidas(subPartidas.map(item => 
            item.id === id ? { ...item, ...updates } : item
        ));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentContext) return;

        setIsSubmitting(true);
        try {
            // Create a payment for each sub-partida
            const pagoIds: Id<"pagos">[] = [];
            
            for (const item of subPartidas) {
                if (item.partida_id && item.partida_id !== "") {
                    const pagoId = await createPayment({
                        partida_id: item.partida_id as Id<"partidas">,
                        partida: item.partida,
                        familia: item.familia,
                        sub_partida: item.sub_partida,
                        monto: item.monto,
                        fecha,
                        tipo_pago: tipoPago,
                        banco,
                        tarjeta: "",
                        numero_cuenta: numeroCuenta,
                        numero_transferencia: "",
                        codigo_referencia: codigoReferencia,
                        factura: "",
                        moneda,
                        tipo_cambio: "1",
                        status,
                        proyecto: paymentContext.projectId,
                    });
                    if (pagoId) pagoIds.push(pagoId);
                }
            }

            // Upload document if provided
            if (documentFile && pagoIds.length > 0) {
                setIsUploadingDocument(true);
                try {
                    const uploadResult = await uploadDocument(documentFile);
                    
                    if (uploadResult.success && documentType) {
                        await createDocument({
                            nombre: documentName || documentFile.name,
                            descripcion: documentDescription || `Documento adjunto al pago - ${new Date().toLocaleDateString()}`,
                            image: uploadResult.fileId!,
                            type: documentType,
                            proyecto: paymentContext.projectId,
                            pago_ids: pagoIds,
                        });
                        toast.success("Documento adjuntado", {
                            description: `El documento se vinculó a ${pagoIds.length} pago(s).`,
                        });
                    } else {
                        toast.error("Error al subir el documento", {
                            description: uploadResult.error,
                        });
                    }
                } catch (error) {
                    console.error("Error uploading document:", error);
                    toast.error("Error al subir el documento");
                } finally {
                    setIsUploadingDocument(false);
                }
            }

            // Reset form
            setStatus("Pagado");
            setSelectedPartida("");
            setSelectedFamilia("");
            setSubPartidas([]);
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
            toast.success("Pago registrado", {
                description: `Se crearon ${pagoIds.length} pago(s) exitosamente.`,
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
        return (
            subPartidas.length > 0 &&
            subPartidas.every(item => 
                item.partida_id && 
                item.partida_id !== "" && 
                item.sub_partida &&
                item.monto > 0
            ) &&
            tipoPago &&
            fecha &&
            status
        );
    };

    // Get unique partida names for dropdown
    const getUniquePartidaNames = () => {
        if (!allPartidas) return [];
        const uniqueNames = [...new Set(allPartidas.map(p => p.nombre).filter(n => n && n.trim() !== ""))];
        return uniqueNames.sort();
    };


    // Get available sub_partidas for selected partida and familia
    const getAvailableSubPartidas = () => {
        if (!selectedPartida || !selectedFamilia || !allPartidas) return [];
        
        const partidasWithFamilia = allPartidas.filter(p => 
            p.nombre === selectedPartida && p.familia === selectedFamilia
        );
        const uniqueSubPartidas = [...new Set(partidasWithFamilia.map(p => p.sub_partida).filter(sp => sp && sp.trim() !== ""))];
        return uniqueSubPartidas.sort();
    };

    // When familia is selected
    const handleFamiliaSelect = (familia: string) => {
        setSelectedFamilia(familia);
        // Add first sub-partida item automatically when familia is selected
        setSubPartidas([{
            id: Date.now().toString(),
            partida_id: "",
            partida: selectedPartida,
            familia: familia,
            sub_partida: "",
            monto: 0
        }]);
    };

    // When sub_partida is selected for an item
    const handleSubPartidaSelect = (id: string, subPartida: string) => {
        if (!allPartidas) return;
        
        const exactPartida = allPartidas.find(p => 
            p.nombre === selectedPartida && 
            p.familia === selectedFamilia && 
            p.sub_partida === subPartida
        );
        
        if (exactPartida) {
            updateSubPartida(id, {
                sub_partida: subPartida,
                partida_id: exactPartida._id
            });
        }
    };

    // Get available familias for selected partida
    const getAvailableFamilias = () => {
        if (!selectedPartida || !allPartidas) return [];
        
        const partidasWithName = allPartidas.filter(p => p.nombre === selectedPartida);
        const uniqueFamilias = [...new Set(partidasWithName.map(p => p.familia).filter(f => f && f.trim() !== ""))];
        return uniqueFamilias.sort();
    };

    if (!paymentContext) return null;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-xl font-medium text-gray-900">Tipo de pago</SheetTitle>
                    <SheetDescription className="sr-only">
                        Registra uno o varios pagos para diferentes partidas
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                    {/* Tipo de pago header */}
                    <div className="space-y-4">                        
                        {/* Status Selection */}
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

                    {/* Partida Selection */}
                    <div className="space-y-3">
                        <Select
                            value={selectedPartida}
                            onValueChange={(value) => {
                                setSelectedPartida(value);
                                setSelectedFamilia("");
                                setSubPartidas([]);
                            }}
                        >
                            <SelectTrigger className="h-12">
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

                        {/* Familia */}
                        <Select
                            value={selectedFamilia}
                            onValueChange={handleFamiliaSelect}
                            disabled={!selectedPartida}
                        >
                            <SelectTrigger className="h-12">
                                <SelectValue placeholder="Seleccionar familia" />
                            </SelectTrigger>
                            <SelectContent>
                                {getAvailableFamilias().map((familia) => (
                                    <SelectItem key={familia} value={familia}>
                                        {familia}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Sub-partidas List */}
                        {selectedFamilia && (
                            <div className="border p-2 space-y-3">
                                {subPartidas.map((item) => (
                                    <div key={item.id} className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <Select
                                                value={item.sub_partida}
                                                onValueChange={(value) => handleSubPartidaSelect(item.id, value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccionar sub-partida" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {getAvailableSubPartidas().map((subPartida) => (
                                                        <SelectItem key={subPartida} value={subPartida}>
                                                            {subPartida}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="w-40">
                                            <MoneyInput
                                                placeholder="Monto"
                                                value={item.monto || 0}
                                                onChange={(value) => updateSubPartida(item.id, { monto: value })}
                                                currency={moneda}
                                                className="text-left"
                                            />
                                        </div>
                                        {subPartidas.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeSubPartida(item.id)}
                                                className="h-9 w-9 p-0 text-gray-400 hover:text-red-600"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}

                                {/* Add Sub-partida Button */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={addSubPartida}
                                    className="w-full justify-between text-gray-600 hover:text-gray-900 hover:bg-transparent flex p-0"
                                >
                                    <div className="flex items-center gap-2 p-2 border w-full">
                                        <Plus className="h-4 w-4" />
                                        Agregar Partida
                                    </div>                                    
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Payment Details */}
                    <div className="space-y-3 pt-2">
                        {/* Categoría */}
                        <Select
                            value={categoria}
                            onValueChange={setCategoria}
                        >
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
                            <Select
                                value={tipoPago}
                                onValueChange={setTipoPago}
                            >
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
                            <Select
                                value={moneda}
                                onValueChange={setMoneda}
                            >
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
                                    onChange={() => {}}
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
                            
                            {/* Document Type */}
                            <div className="space-y-2">
                                <label className="text-sm text-gray-700">Tipo de documento</label>
                                <Select
                                    value={documentType}
                                    onValueChange={setDocumentType}
                                >
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

                            {/* Show document fields only if type is selected */}
                            {documentType && (
                                <>
                                    {/* Document Name */}
                                    <div className="space-y-2">
                                        <label className="text-sm text-gray-700">Nombre del documento</label>
                                        <Input
                                            placeholder="Ej: Factura #12345"
                                            value={documentName}
                                            onChange={(e) => setDocumentName(e.target.value)}
                                            className="h-12"
                                        />
                                    </div>

                                    {/* Document Description */}
                                    <div className="space-y-2">
                                        <label className="text-sm text-gray-700">Descripción (opcional)</label>
                                        <Input
                                            placeholder="Descripción del documento"
                                            value={documentDescription}
                                            onChange={(e) => setDocumentDescription(e.target.value)}
                                            className="h-12"
                                        />
                                    </div>

                                    {/* File Upload */}
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
                                                    <p className="text-sm text-gray-600">Arrastra un archivo o haz clic para seleccionar</p>
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
                            disabled={!isFormValid() || isSubmitting || isUploadingDocument}
                            className="bg-black hover:bg-gray-800 text-white h-11"
                        >
                            {isSubmitting || isUploadingDocument ? 'Guardando...' : `Guardar pago`}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}
