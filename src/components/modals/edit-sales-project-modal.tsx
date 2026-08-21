"use client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEditSalesProjectModal } from "@/hooks/edit-sales-project-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from 'react';
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Edit } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EditSalesProjectModal() {
  const isOpen = useEditSalesProjectModal((state) => state.isOpen);
  const onClose = useEditSalesProjectModal((state) => state.onClose);
  const projectId = useEditSalesProjectModal((state) => state.projectId);
  const formData = useEditSalesProjectModal((state) => state.formData);
  const updateFormData = useEditSalesProjectModal((state) => state.updateFormData);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const project = useQuery(
    api.sales_projects.getById,
    projectId ? { id: projectId } : "skip"
  );

  const updateProject = useMutation(api.sales_projects.update);

  // Pre-fill form when project data loads
  useEffect(() => {
    if (project) {
      updateFormData({
        nombre: project.nombre,
        descripcion: project.descripcion,
        status: project.status || "Activo",
        comision_porcentaje: project.comision_porcentaje || 0,
      });
    }
  }, [project, updateFormData]);

  const handleInputChange = (field: string, value: string) => {
    // Convert to number for comision_porcentaje field
    if (field === 'comision_porcentaje') {
      const numValue = parseFloat(value) || 0;
      updateFormData({ [field]: numValue });
    } else {
      updateFormData({ [field]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectId) return;

    setIsSubmitting(true);

    try {
      // Update the sales project
      await updateProject({
        id: projectId,
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        status: formData.status,
        comision_porcentaje: formData.comision_porcentaje,
      });

      // Show success toast
      toast.success('Proyecto de ventas actualizado exitosamente', {
        description: `Se actualizó el proyecto "${formData.nombre}".`,
        duration: 5000,
      });

      // Close modal
      onClose();
    } catch (error) {
      console.error("Error updating sales project:", error);

      // Show error toast
      toast.error('Error al actualizar el proyecto de ventas', {
        description: error instanceof Error ? error.message : 'Ocurrió un error inesperado. Por favor intenta nuevamente.',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const isFormValid = () => {
    return formData.nombre.trim() && formData.descripcion.trim();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent data-square-modal="" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar Proyecto de Ventas
          </SheetTitle>
          <SheetDescription>
            Modifica la información del proyecto de ventas
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del Proyecto *</Label>
            <Input
              id="nombre"
              type="text"
              placeholder="Ej: Proyecto Ventas Q1 2024"
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
              placeholder="Describe el proyecto de ventas..."
              value={formData.descripcion}
              onChange={(e) => handleInputChange('descripcion', e.target.value)}
              rows={4}
              required
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Estado del Proyecto</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => handleInputChange('status', value)}
            >
              <SelectTrigger className="rounded-none">
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent data-square-modal="">
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
                <SelectItem value="Entregado">Entregado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Commission Percentage */}
          <div className="space-y-2">
            <Label htmlFor="comision_porcentaje">Porcentaje de Comisión (%)</Label>
            <Input
              id="comision_porcentaje"
              type="number"
              placeholder="Ej: 5"
              value={formData.comision_porcentaje || ''}
              onChange={(e) => handleInputChange('comision_porcentaje', e.target.value)}
              min="0"
              max="100"
              step="0.01"
              className="rounded-none"
            />
            <p className="text-xs text-subtle-foreground">Porcentaje de comisión sobre las ventas totales</p>
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
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
