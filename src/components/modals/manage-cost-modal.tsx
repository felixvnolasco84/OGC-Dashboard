"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useManageCostModal } from "@/hooks/manage-cost-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Upload, Check } from "lucide-react";
import { useEdgeStore } from "@/lib/edgestore";
import { cn } from "@/lib/utils";

export default function ManageCostModal() {
    const context = useManageCostModal((state) => state.context);
    const isOpen = useManageCostModal((state) => state.isOpen);
    const onClose = useManageCostModal((state) => state.onClose);
    const formData = useManageCostModal((state) => state.formData);
    const updateFormData = useManageCostModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadingFile, setUploadingFile] = useState<string | null>(null);

    const createCosto = useMutation(api.costos.createCosto);
    const updateCosto = useMutation(api.costos.update);
    const { edgestore } = useEdgeStore();

    // Fetch distinct values for dropdowns
    const partidas = useQuery(api.costos.getAllDiferentPartida) || [];
    const familias = useQuery(api.costos.getAllDiferentFamilia) || [];
    const subPartidas = useQuery(api.costos.getAllDiferentSubPartida) || [];

    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };

    const handleFileUpload = async (
        file: File,
        fieldName: "factura" | "comprobante" | "presupuesto"
    ) => {
        if (!file) return;

        setUploadingFile(fieldName);
        try {
            const res = await edgestore.publicFiles.upload({
                file,
            });
            updateFormData({ [fieldName]: res.url });
        } catch (error) {
            console.error(`Error uploading ${fieldName}:`, error);
        } finally {
            setUploadingFile(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!context) return;

        setIsSubmitting(true);
        try {
            if (context.mode === "create") {
                await createCosto({
                    administracion: formData.administracion || "Default",
                    partida: formData.partida,
                    familia: formData.familia,
                    sub_partida: formData.sub_partida,
                    monto: formData.monto,
                    fecha: formData.fecha_pago,
                    codigo_referencia: formData.codigo_referencia || "",
                    factura: formData.factura,
                });
            } else if (context.mode === "edit" && context.cost) {
                await updateCosto({
                    id: context.cost._id,
                    administracion: formData.administracion || context.cost.administracion,
                    partida: formData.partida,
                    familia: formData.familia,
                    sub_partida: formData.sub_partida,
                    monto: formData.monto,
                    fecha: formData.fecha_pago,
                    codigo_referencia: formData.codigo_referencia || "",
                    factura: formData.factura,
                });
            }
            onClose();
        } catch (error) {
            console.error("Error managing cost:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = () => {
        return formData.partida &&
            formData.familia &&
            formData.sub_partida &&
            formData.monto &&
            parseFloat(formData.monto) > 0;
    };

    if (!context) return null;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>
                        {context.mode === "create" ? "Nuevo pago" : "Editar pago"}
                    </SheetTitle>
                    <SheetDescription>
                        {context.mode === "create"
                            ? "Complete la información para registrar un nuevo pago"
                            : "Actualice la información del pago"}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="space-y-6 mt-6">
                    {/* Payment Status Selection */}
                    <div className="space-y-3">
                        <Label className="text-base">Tipo de pago</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => handleInputChange('paymentStatus', 'pagado')}
                                className={cn(
                                    "flex items-center justify-center gap-2 p-3 border rounded-none transition-colors",
                                    formData.paymentStatus === 'pagado'
                                        ? "border-green-500 bg-green-50 text-green-700"
                                        : "border-gray-300 bg-white hover:bg-gray-50"
                                )}
                            >
                                {formData.paymentStatus === 'pagado' && (
                                    <Check className="w-5 h-5 text-green-600" />
                                )}
                                <span className="font-medium">Pagado</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleInputChange('paymentStatus', 'por_pagar')}
                                className={cn(
                                    "flex items-center justify-center gap-2 p-3 border rounded-none transition-colors",
                                    formData.paymentStatus === 'por_pagar'
                                        ? "border-gray-500 bg-gray-50 text-gray-700"
                                        : "border-gray-300 bg-white hover:bg-gray-50"
                                )}
                            >
                                {formData.paymentStatus === 'por_pagar' && (
                                    <span className="w-5 h-5 rounded-full border-2 border-gray-400" />
                                )}
                                <span className="font-medium">Por pagar</span>
                            </button>
                        </div>
                    </div>

                    <Separator />

                    {/* Cost Details */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            {/* <Label htmlFor="partida">Partida *</Label> */}
                            <Select value={formData.partida} onValueChange={(value) => handleInputChange('partida', value)}>
                                <SelectTrigger className="rounded-none">
                                    <SelectValue placeholder="Selecciona partida" />
                                </SelectTrigger>
                                <SelectContent>
                                    {partidas.map((partida) => (
                                        <SelectItem key={partida} value={partida}>
                                            {partida}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            {/* <Label htmlFor="familia">Familia *</Label> */}
                            <Select value={formData.familia} onValueChange={(value) => handleInputChange('familia', value)}>
                                <SelectTrigger className="rounded-none">
                                    <SelectValue placeholder="Selecciona familia" />
                                </SelectTrigger>
                                <SelectContent>
                                    {familias.map((familia) => (
                                        <SelectItem key={familia} value={familia}>
                                            {familia}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            {/* <Label htmlFor="sub_partida">Subpartida *</Label> */}
                            <Select value={formData.sub_partida} onValueChange={(value) => handleInputChange('sub_partida', value)}>
                                <SelectTrigger className="rounded-none">
                                    <SelectValue placeholder="Selecciona subpartida" />
                                </SelectTrigger>
                                <SelectContent>
                                    {subPartidas.map((subPartida) => (
                                        <SelectItem key={subPartida} value={subPartida}>
                                            {subPartida}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            {/* <Label htmlFor="categoria">Categoría (anticipo, material, estimación)</Label> */}
                            <Select value={formData.categoria} onValueChange={(value) => handleInputChange('categoria', value)}>
                                <SelectTrigger className="rounded-none">
                                    <SelectValue placeholder="Selecciona categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="anticipo">Anticipo</SelectItem>
                                    <SelectItem value="material">Material</SelectItem>
                                    <SelectItem value="estimacion">Estimación</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator />

                    {/* Payment Details */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                {/* <Label htmlFor="tipo_pago">Tipo de pago</Label> */}
                                <Select value={formData.tipo_pago} onValueChange={(value) => handleInputChange('tipo_pago', value)}>
                                    <SelectTrigger className="rounded-none">
                                        <SelectValue placeholder="Selecciona tipo" />
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
                                {/* <Label htmlFor="moneda">Moneda</Label> */}
                                <Select value={formData.moneda} onValueChange={(value) => handleInputChange('moneda', value)}>
                                    <SelectTrigger className="rounded-none">
                                        <SelectValue placeholder="Selecciona moneda" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MXN">MXN</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                {/* <Label htmlFor="monto">Monto *</Label> */}
                                <Input
                                    id="monto"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.monto}
                                    className="rounded-none"
                                    onChange={(e) => handleInputChange('monto', e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                {/* <Label htmlFor="fecha_pago">Fecha de pago</Label> */}
                                <Input
                                    id="fecha_pago"
                                    type="date"
                                    value={formData.fecha_pago}
                                    className="rounded-none"
                                    onChange={(e) => handleInputChange('fecha_pago', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* File Uploads - Soporte */}
                    <div className="space-y-4">
                        <Label className="text-base">Soporte</Label>

                        {/* Factura Upload */}
                        <div className="border-2 border-dashed rounded-none p-4 hover:border-gray-400 transition-colors">
                            <input
                                type="file"
                                id="factura-upload"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, "factura");
                                }}
                            />
                            <label
                                htmlFor="factura-upload"
                                className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900"
                            >
                                <Upload className="w-5 h-5" />
                                <span>Agregar factura</span>
                                {uploadingFile === "factura" && <span className="text-sm text-gray-500">Subiendo...</span>}
                                {formData.factura && uploadingFile !== "factura" && (
                                    <Check className="w-5 h-5 text-green-600" />
                                )}
                            </label>
                        </div>

                        {/* Comprobante Upload */}
                        <div className="border-2 border-dashed rounded-none p-4 hover:border-gray-400 transition-colors">
                            <input
                                type="file"
                                id="comprobante-upload"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, "comprobante");
                                }}
                            />
                            <label
                                htmlFor="comprobante-upload"
                                className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900"
                            >
                                <Upload className="w-5 h-5" />
                                <span>Agregar comprobante</span>
                                {uploadingFile === "comprobante" && <span className="text-sm text-gray-500">Subiendo...</span>}
                                {formData.comprobante && uploadingFile !== "comprobante" && (
                                    <Check className="w-5 h-5 text-green-600" />
                                )}
                            </label>
                        </div>

                        {/* Presupuesto Upload */}
                        <div className="border-2 border-dashed rounded-none p-4 hover:border-gray-400 transition-colors">
                            <input
                                type="file"
                                id="presupuesto-upload"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, "presupuesto");
                                }}
                            />
                            <label
                                htmlFor="presupuesto-upload"
                                className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900"
                            >
                                <Upload className="w-5 h-5" />
                                <span>Agregar presupuesto</span>
                                {uploadingFile === "presupuesto" && <span className="text-sm text-gray-500">Subiendo...</span>}
                                {formData.presupuesto && uploadingFile !== "presupuesto" && (
                                    <Check className="w-5 h-5 text-green-600" />
                                )}
                            </label>
                        </div>
                    </div>

                    <Separator />

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="descripcion">Descripción</Label>
                        <Textarea
                            id="descripcion"
                            placeholder="Categoría (anticipo, material, estimación)"
                            value={formData.descripcion}
                            onChange={(e) => handleInputChange('descripcion', e.target.value)}
                            rows={4}
                        />
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid() || isSubmitting}
                        >
                            {isSubmitting ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    );
}