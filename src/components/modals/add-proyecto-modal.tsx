"use client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAddProyectoModal } from "@/hooks/add-proyecto-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useCallback } from 'react';
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Upload, FolderPlus, FileSpreadsheet } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function AddProyectoModal() {
  const isOpen = useAddProyectoModal((state) => state.isOpen);
  const onClose = useAddProyectoModal((state) => state.onClose);
  const formData = useAddProyectoModal((state) => state.formData);
  const updateFormData = useAddProyectoModal((state) => state.updateFormData);

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
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const handleRemoveFile = () => {
    setFile(null);
    updateFormData({ excel: null });
    setResult(null);
  };

  const handleBrowseClick = () => {
    document.getElementById('file-upload')?.click();
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
  const createTransaction = useMutation(api.transacciones.createTransaction);

  const handleInputChange = (field: string, value: string) => {
    // Convert to number for honorarios_porcentaje field
    if (field === 'honorarios_porcentaje') {
      const numValue = parseFloat(value) || 0;
      updateFormData({ [field]: numValue });
    } else {
      updateFormData({ [field]: value });
    }
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
    const formDataToSend = new FormData();
    formDataToSend.append('file', file);

    // const response = await fetch("http://localhost:3000/upload", {
    const response = await fetch("https://ogc-excel-reader.vercel.app/upload", {
      method: "POST",
      body: formDataToSend,
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
        honorarios_porcentaje: formData.honorarios_porcentaje,
      });

      // Type for the record from the API
      type PartidaRecord = {
        nivel: number;
        nombre: string;
        familia: string;
        sub_partida: string;
        unidad: string;
        cantidad: number;
        precio_unitario: number;
        presupuesto_original: number;
        presupuesto_aprobado: number;
        pagado: number;
        weeklyPayments?: Array<{
          week: number;
          columnLetter: string;
          amount: number;
          position: number;
        }>;
      };

      // Upload all partidas from the Excel data and create associated payments
      // Track current partida name for nested items
      let currentPartidaNombre = '';
      
      const partidaPromises = response.data.map(async (record: PartidaRecord) => {
        // Update current partida name when we encounter a nivel 1 item
        if (record.nivel === 1) {
          currentPartidaNombre = record.nombre;
        }
        
        // Create the partida
        const partidaId = await uploadProjectData({
          nivel: record.nivel || 0,
          nombre: record.nombre || '',
          familia: record.familia || '',
          sub_partida: record.sub_partida || '',
          partida_nombre: record.nivel > 1 ? currentPartidaNombre : undefined,
          unidad: record.unidad || '',
          cantidad: record.cantidad || 0,
          precio_unitario: record.precio_unitario || 0,
          presupuesto_original: record.presupuesto_original || 0,
          presupuesto_aprobado: record.presupuesto_aprobado || 0,
          pagado: record.pagado || 0,
          archivo_origen: response.fileName || formData.excel?.name || 'unknown',
          proyecto: project,
        });

        // Create transactions for this partida if weeklyPayments exist
        if (record.weeklyPayments && record.weeklyPayments.length > 0) {
          const transactionPromises = record.weeklyPayments.map((payment) => {
            // Only create transaction if amount is greater than 0
            if (payment.amount <= 0) {
              return Promise.resolve(null);
            }

            // Create a transaction with a single line item for this weekly payment
            return createTransaction({
              proyecto: project,
              monto_total: payment.amount,
              fecha: excelSerialToDate(payment.week),
              tipo_pago: 'transferencia', // Default payment type
              moneda: 'MXN',
              tipo_cambio: '1',
              status: 'Pendiente',
              codigo_referencia: `Week-${payment.position}`,
              banco: '',
              tarjeta: '',
              numero_cuenta: '',
              numero_transferencia: '',
              factura: '',
              comprobante: '',
              presupuesto_archivo: '',
              lineItems: [
                {
                  partida_id: partidaId,
                  partida: record.nivel === 1 ? record.nombre : currentPartidaNombre,
                  familia: record.familia || '',
                  sub_partida: record.sub_partida || '',
                  monto: payment.amount,
                }
              ]
            });
          });

          await Promise.all(transactionPromises);
        }

        return partidaId;
      });

      const partidas = await Promise.all(partidaPromises);
      console.log(`Successfully uploaded ${partidas.length} partida records with their transactions`);

      // Show success toast
      toast.success('Proyecto creado exitosamente', {
        description: `Se creó el proyecto "${formData.nombre}" con ${partidas.length} partidas y sus transacciones asociadas.`,
        duration: 5000,
      });

      // Reset form and close modal
      updateFormData({ nombre: '', descripcion: '', excel: null, honorarios_porcentaje: 0 });
      setFile(null);
      setShowExcelUploader(false);
      onClose();
    } catch (error) {
      console.error("Error creating project:", error);

      // Show error toast
      toast.error('Error al crear el proyecto', {
        description: error instanceof Error ? error.message : 'Ocurrió un error inesperado. Por favor intenta nuevamente.',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form state
    updateFormData({ nombre: '', descripcion: '', excel: null, honorarios_porcentaje: 0 });
    setFile(null);
    setShowExcelUploader(false);
    setResult(null);
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

            {/* Honorarios Percentage */}
            <div className="space-y-2">
              <Label htmlFor="honorarios_porcentaje">Porcentaje de Honorarios (%)</Label>
              <Input
                id="honorarios_porcentaje"
                type="number"
                placeholder="Ej: 15"
                value={formData.honorarios_porcentaje || ''}
                onChange={(e) => handleInputChange('honorarios_porcentaje', e.target.value)}
                min="0"
                max="100"
                step="0.01"
                className="rounded-none"
              />
              <p className="text-xs text-gray-500">Porcentaje que se aplicará sobre el total de transacciones para calcular honorarios</p>
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBrowseClick}
                      disabled={isSubmitting}
                    >
                      Cambiar Archivo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveFile}
                      disabled={isSubmitting}
                    >
                      Eliminar
                    </Button>
                  </div>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Upload className="h-12 w-12 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Arrastra y suelta un archivo Excel aquí
                    </p>
                    <p className="text-sm text-gray-500 mt-1">o</p>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBrowseClick}
                      disabled={isSubmitting}
                    >
                      Explorar Archivos
                    </Button>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-gray-400">Archivos soportados: .xlsx, .xls (máx. 10MB)</p>
                </div>
              )}
            </div>

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
