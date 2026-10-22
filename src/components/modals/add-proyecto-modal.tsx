"use client";
import { useBudgetCreation } from "@/hooks/use-budget-creation";
import { BudgetAttemptCard } from "@/components/Presupuesto/BudgetOriginal";
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
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Upload, FolderPlus, FileSpreadsheet } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  NO_PROJECT_LOCATION,
  NO_PROJECT_LOCATION_LABEL,
} from "@/lib/project-locations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AddProyectoModal() {
  const isOpen = useAddProyectoModal((state) => state.isOpen);
  const onClose = useAddProyectoModal((state) => state.onClose);
  const formData = useAddProyectoModal((state) => state.formData);
  const updateFormData = useAddProyectoModal((state) => state.updateFormData);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExcelUploader, setShowExcelUploader] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const projectLocations = useQuery(api.project_locations.list);
  const creation = useBudgetCreation();
  const confirmedAttempt = useQuery(api.budgetCreationHistory.get, creation.attemptId ? { attempt_id: creation.attemptId } : "skip");
  const progressRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen || !creation.attemptId) return;
    const frame = requestAnimationFrame(() => progressRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [isOpen, creation.attemptId, isSubmitting]);

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
    if (isSubmitting || confirmedAttempt?.proyecto) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        updateFormData({ excel: droppedFile });
        setResult(null);
      }
    }
  }, [updateFormData, isSubmitting, confirmedAttempt?.proyecto]);

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

  const handleInputChange = (field: string, value: string) => {
    // Convert to number for honorarios_porcentaje field
    if (field === 'indirectos_porcentaje') {
      updateFormData({ indirectos_porcentaje: value === '' ? undefined : Number(value) });
    } else if (field === 'honorarios_porcentaje') {
      const numValue = parseFloat(value) || 0;
      updateFormData({ [field]: numValue });
    } else {
      updateFormData({ [field]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.excel || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const project = await creation.create({ nombre: formData.nombre, descripcion: formData.descripcion,
        ubicacion: formData.ubicacion, honorarios_porcentaje: formData.honorarios_porcentaje,
        indirectos_porcentaje: formData.indirectos_porcentaje }, formData.excel);
      if (project) {
        toast.success('Proyecto creado con su Excel original respaldado');
        handleClose();
      }
    } catch (error) {
      toast.error('La creación sigue pendiente', { description: error instanceof Error ? error.message : 'Puedes reanudarla desde Creaciones de proyectos.' });
    } finally { setIsSubmitting(false); }
  };

  const handleClose = () => {
    creation.clear();
    // Reset form state
    updateFormData({ nombre: '', descripcion: '', excel: null, honorarios_porcentaje: 0, indirectos_porcentaje: undefined, ubicacion: undefined });
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
      <SheetContent data-square-modal="" className="w-full sm:w-[800px] sm:max-w-[800px] overflow-y-auto">
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
          <fieldset disabled={isSubmitting || Boolean(confirmedAttempt?.proyecto)} className="min-w-0 space-y-6">
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

            <div className="space-y-2">
              <Label htmlFor="ubicacion">Ubicación</Label>
              <Select
                value={formData.ubicacion || NO_PROJECT_LOCATION}
                onValueChange={(value) => updateFormData({
                  ubicacion: value === NO_PROJECT_LOCATION
                    ? undefined
                    : value,
                })}
              >
                <SelectTrigger id="ubicacion" className="rounded-none">
                  <SelectValue placeholder="Selecciona una ubicación" />
                </SelectTrigger>
                <SelectContent data-square-modal="">
                  <SelectItem value={NO_PROJECT_LOCATION}>
                    {NO_PROJECT_LOCATION_LABEL}
                  </SelectItem>
                  {(projectLocations || []).map((location) => (
                    <SelectItem key={location.key} value={location.key}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Opcional. Se utilizará para filtrar y agrupar el proyecto.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="indirectos_porcentaje">Indirectos (%)</Label>
              <Input id="indirectos_porcentaje" type="number" min="0" max="100" step="0.01"
                placeholder="Sin activar" value={formData.indirectos_porcentaje ?? ''}
                onChange={e => handleInputChange('indirectos_porcentaje', e.target.value)} />
              <p className="text-xs text-muted-foreground">Cargo automático sobre los pagos elegibles del historial completo del proyecto, con las mismas exclusiones que honorarios y sin fecha de inicio. Captura los costos reales en P&amp;L como costo de estructura, categoría INDIRECTOS. Vacío conserva la lógica anterior; 0% activa el esquema sin cargo.</p>
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
              <p className="text-xs text-muted-foreground">Porcentaje que se aplicará sobre el total de transacciones para calcular honorarios</p>
            </div>

            <Separator />

            <div
              className={`border-2 border-dashed rounded-none p-8 text-center transition-colors ${dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : file
                    ? 'border-green-500 bg-green-50'
                    : 'border-border-strong hover:border-border-strong'
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
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
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
                    <Upload className="h-12 w-12 text-disabled-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-foreground">
                      Arrastra y suelta un archivo Excel aquí
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">o</p>
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
                  <p className="text-xs text-disabled-foreground">Archivos soportados: .xlsx, .xls (máx. 10MB)</p>
                </div>
              )}
            </div>

          </fieldset>
          {result && !result.success && <p role="alert" className="text-sm text-destructive">{result.message}</p>}
          <p className="text-xs text-muted-foreground">Al confirmar se guardará el Excel original para consultarlo desde Presupuesto y Documentos.</p>
          {creation.attemptId && <div ref={progressRef}><BudgetAttemptCard attemptId={creation.attemptId} /></div>}
          {/* Form Actions */}
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 bg-background py-4 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>
              {creation.attemptId ? "Cerrar y conservar intento" : "Cancelar"}
              </Button>
            {!confirmedAttempt?.proyecto && <Button
                type="submit"
                disabled={!isFormValid() || isSubmitting}
              >
                {isSubmitting ? 'Guardando y creando…' : 'Crear proyecto y guardar Excel'}
            </Button>}
            </div>
          </form>
        ) : (
          <div className="mt-6">
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 bg-background py-4 border-t mt-6">
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
