"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useAddProjectModal } from "@/hooks/add-project-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useCallback } from 'react';
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Upload, FolderPlus, FileSpreadsheet } from "lucide-react";
import ExcelUploaderSection from "../Sections/ExcelUploaderSection";
import { Separator } from "@/components/ui/separator";

export default function AddProjectModal() {
    const isOpen = useAddProjectModal((state) => state.isOpen);
    const onClose = useAddProjectModal((state) => state.onClose);
    const formData = useAddProjectModal((state) => state.formData);
    const updateFormData = useAddProjectModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showExcelUploader, setShowExcelUploader] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [, setResult] = useState<UploadResult | null>(null);
    const [file, setFile] = useState<File | null>(null);


    type UploadResult = {
        success: boolean;
        message: string;
        data?: {
            successfulRecords?: number;
            failedRecords?: number;
            totalRecords?: number;
            fileName?: string;
            processedAt?: string;
        };
        errors?: string[];
    };



    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (validateFile(droppedFile)) {
                setFile(droppedFile);
                updateFormData({ excel: droppedFile });
                setResult(null);
            }
        }
    }, [updateFormData]);

    const validateFile = (file: File): boolean => {
        if (!file) return false;

        const validExtensions = ['.xlsx', '.xls'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!validExtensions.includes(fileExtension)) {
            setResult({
                success: false,
                message: 'Solo se permiten archivos Excel (.xlsx, .xls).'
            });
            return false;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB
            setResult({
                success: false,
                message: 'El archivo excede el tamaño máximo permitido (10MB).'
            });
            return false;
        }

        return true;
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile && validateFile(selectedFile)) {
            setFile(selectedFile);
            updateFormData({ excel: selectedFile });
            setResult(null);
        }
    };


    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };



    const createProject = useMutation(api.desarrollos.create);
    const uploadProjectData = useMutation(api.partida.createPartida);
    const createPayment = useMutation(api.pagos.create);

    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };
    // Helper function to convert Excel serial date to JavaScript Date
    const excelSerialToDate = (serial: number): string => {
        // Excel stores dates as days since 1/1/1900
        // Subtract 25569 to convert to Unix epoch, then multiply by milliseconds in a day
        const date = new Date((serial - 25569) * 86400 * 1000);
        // Format as DD/MM/YYYY
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const handleExcelUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        
        // const response = await fetch("https://ogc-excel-reader.vercel.app/upload", {
        const response = await fetch("http://localhost:3000/upload", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        console.log(data);

        return data;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsSubmitting(true);

        try {
            if (!formData.excel) {
                return;
            }

            const response = await handleExcelUpload(formData.excel);

            if (!response.success || !response.data || response.data.length === 0) {
                console.error('No data received from server');
                return;
            }

            // Create the project
            const project = await createProject({
                nombre: formData.nombre,
                descripcion: formData.descripcion,
                image: "",
            });

            // Type for the record from the API
            type PartidaRecord = {
                partida: string;
                familia: string;
                sub_partida: string;
                Cantidad: number;
                PrecioUnitario: number;
                Subtotal: number;
                Iva: number;
                total: number;
                aprobado: number;
                pagado: number;
                por_liquidar: number;
                actual: number;
                weeklyPayments?: Array<{
                    week: number;
                    columnLetter: string;
                    amount: number;
                    position: number;
                }>;
            };

            // Upload all partidas from the Excel data and create associated payments
            const partidaPromises = response.data.map(async (record: PartidaRecord) => {
                // Create the partida
                const partidaId = await uploadProjectData({
                    nombre: record.partida || '',
                    familia: record.familia || '',
                    sub_partida: record.sub_partida || '',
                    Cantidad: record.Cantidad || 0,
                    PrecioUnitario: record.PrecioUnitario || 0,
                    Subtotal: record.Subtotal || 0,
                    Iva: record.Iva || 0,
                    total: record.total || 0,
                    aprobado: record.aprobado || 0,
                    pagado: record.pagado || 0,
                    por_liquidar: record.por_liquidar || 0,
                    actual: record.actual || 0,
                    fecha_carga: new Date().toISOString(),
                    archivo_origen: response.fileName || formData.excel?.name || 'unknown',
                    proyecto: project,
                });

                // Create payments for this partida if weeklyPayments exist
                if (record.weeklyPayments && record.weeklyPayments.length > 0) {
                    const paymentPromises = record.weeklyPayments.map((payment) => {
                        // Only create payment if amount is greater than 0
                        if (payment.amount <= 0) {
                            return Promise.resolve(null);
                        }

                        return createPayment({
                            partida_id: partidaId,
                            partida: record.partida || '',
                            familia: record.familia || '',
                            sub_partida: record.sub_partida || '',
                            monto: payment.amount,
                            fecha: excelSerialToDate(payment.week),
                            tipo_pago: 'transferencia', // Default payment type
                            banco: '',
                            tarjeta: '',
                            numero_cuenta: '',
                            numero_transferencia: '',
                            codigo_referencia: `Week-${payment.position}`,
                            factura: '',
                            moneda: 'MXN',
                            tipo_cambio: '1',
                            status: 'Pendiente',
                            proyecto: project,
                        });
                    });

                    await Promise.all(paymentPromises);
                }

                return partidaId;
            });

            const partidas = await Promise.all(partidaPromises);
            console.log(`Successfully uploaded ${partidas.length} partida records with their payments`);

            setShowExcelUploader(true);
        } catch (error) {
            console.error("Error creating project:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setShowExcelUploader(false);
        onClose();
    };

    const isFormValid = () => {
        return formData.nombre.trim() && formData.descripcion.trim() && formData.excel;
    };

    return (
        <Sheet open={isOpen} onOpenChange={handleClose}>
            <SheetContent className="w-[800px] sm:max-w-[800px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <FolderPlus className="h-5 w-5" />
                        {showExcelUploader ? "Subir Excel del Proyecto" : "Crear Nuevo Proyecto"}
                    </SheetTitle>
                    <SheetDescription>
                        {showExcelUploader
                            ? "Sube el archivo Excel con los datos del presupuesto"
                            : "Complete la información básica del proyecto antes de subir el Excel"}
                    </SheetDescription>
                </SheetHeader>

                {!showExcelUploader ? (
                    <form onSubmit={handleSubmit} className="space-y-6 mt-6">
                        {/* Project Name */}
                        <div className="space-y-2">
                            <Label htmlFor="nombre">Nombre del Proyecto *</Label>
                            <Input
                                id="nombre"
                                type="text"
                                placeholder="Ej: Larena - Torre G"
                                value={formData.nombre}
                                onChange={(e) => handleInputChange('nombre', e.target.value)}
                                required
                                className="rounded-none"
                            />
                        </div>

                        {/* Project Description */}
                        <div className="space-y-2">
                            <Label htmlFor="descripcion">Descripción del Proyecto *</Label>
                            <Textarea
                                id="descripcion"
                                placeholder="Describe el proyecto, ubicación, detalles importantes..."
                                value={formData.descripcion}
                                onChange={(e) => handleInputChange('descripcion', e.target.value)}
                                rows={4}
                                required
                            />
                        </div>

                        <Separator />

                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                                ? 'border-blue-500 bg-blue-50'
                                : file
                                    ? 'border-green-500 bg-green-50'
                                    : 'border-gray-300 hover:border-gray-400'
                                }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            {file ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-center gap-3">
                                        <FileSpreadsheet className="h-8 w-8 text-green-600" />
                                        <div className="text-left">
                                            <p className="font-medium text-gray-900">{file.name}</p>
                                            <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-center">
                                        {/* <Button disabled={isSubmitting}>
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Procesando...
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    Subir Archivo
                                                </>
                                            )}
                                        </Button> */}
                                        {/* <Button variant="outline" onClick={resetUpload} disabled={isSubmitting}>
                    Cancelar
                  </Button> */}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex justify-center">
                                        <Upload className="h-12 w-12 text-gray-400" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-medium text-gray-900">
                                            Selecciona un archivo Excel
                                        </p>
                                        <p className="text-gray-500">Archivos soportados: .xlsx, .xls (máx. 10MB)</p>
                                    </div>
                                    <div>
                                        <label htmlFor="file-upload">
                                            <Button variant="outline" className="cursor-pointer">
                                                Explorar Archivos
                                            </Button>
                                        </label>
                                        <input
                                            id="file-upload"
                                            type="file"
                                            accept=".xlsx,.xls"
                                            onChange={handleFileInput}
                                            className="hidden"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Project Image Upload */}
                        {/* <div className="space-y-2">
                            <Label htmlFor="image">Información del proyecto</Label>
                            <div className="border-2 border-dashed rounded-none p-4 hover:border-gray-400 transition-colors">
                                <input
                                    type="file"
                                    id="image-upload"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleExcelUpload(file);
                                    }}
                                />
                                <label
                                    htmlFor="image-upload"
                                    className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900"
                                >
                                    <Upload className="w-5 h-5" />
                                    <span>Subir archivo Excel</span>
                                    {isSubmitting && <span className="text-sm text-gray-500">Subiendo...</span>}
                                    {formData.excel && !isSubmitting && (
                                        <Check className="w-5 h-5 text-green-600" />
                                    )}
                                </label>
                                {formData.excel && !isSubmitting && (
                                    <div className="mt-4">
                                        <div className="flex items-center justify-center gap-3">
                                            <FileSpreadsheet className="h-8 w-8 text-green-600" />
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900">{formData.excel.name}</p>
                                                <p className="text-sm text-gray-500">{formatFileSize(formData.excel.size)}</p>
                                            </div>
                                        </div>
                                        <img
                                            src={formData.excel}
                                            alt="Preview"
                                            className="max-h-40 rounded-lg object-cover"
                                        />
                                    </div>
                                )}
                            </div>
                        </div> */}

                        {/* Form Actions */}
                        <div className="flex justify-end space-x-2 pt-4 border-t">
                            <Button type="button" variant="outline" onClick={handleClose}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={!isFormValid() || isSubmitting}
                            >
                                {isSubmitting ? 'Creando...' : 'Continuar con Excel'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="mt-6">
                        <ExcelUploaderSection />
                        <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
                            <Button variant="outline" onClick={handleClose}>
                                Finalizar
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
