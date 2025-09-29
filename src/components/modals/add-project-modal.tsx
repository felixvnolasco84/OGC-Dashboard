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
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Upload, Check, FolderPlus } from "lucide-react";
import { useEdgeStore } from "@/lib/edgestore";
import ExcelUploaderSection from "../Sections/ExcelUploaderSection";
import { Separator } from "@/components/ui/separator";

export default function AddProjectModal() {
    const isOpen = useAddProjectModal((state) => state.isOpen);
    const onClose = useAddProjectModal((state) => state.onClose);
    const formData = useAddProjectModal((state) => state.formData);
    const updateFormData = useAddProjectModal((state) => state.updateFormData);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [showExcelUploader, setShowExcelUploader] = useState(false);

    const createProject = useMutation(api.desarrollos.create);
    const { edgestore } = useEdgeStore();

    const handleInputChange = (field: string, value: string) => {
        updateFormData({ [field]: value });
    };

    const handleImageUpload = async (file: File) => {
        if (!file) return;

        setUploadingImage(true);
        try {
            const res = await edgestore.publicFiles.upload({
                file,
            });
            updateFormData({ image: res.url });
        } catch (error) {
            console.error("Error uploading image:", error);
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        setIsSubmitting(true);
        try {
            await createProject({
                nombre: formData.nombre,
                descripcion: formData.descripcion,
                image: formData.image || "",
            });
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
        return formData.nombre.trim() && formData.descripcion.trim();
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

                        {/* Project Image Upload */}
                        <div className="space-y-2">
                            <Label htmlFor="image">Información del proyecto</Label>
                            <div className="border-2 border-dashed rounded-none p-4 hover:border-gray-400 transition-colors">
                                <input
                                    type="file"
                                    id="image-upload"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleImageUpload(file);
                                    }}
                                />
                                <label
                                    htmlFor="image-upload"
                                    className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-900"
                                >
                                    <Upload className="w-5 h-5" />
                                    <span>Subir archivo Excel</span>
                                    {uploadingImage && <span className="text-sm text-gray-500">Subiendo...</span>}
                                    {formData.image && !uploadingImage && (
                                        <Check className="w-5 h-5 text-green-600" />
                                    )}
                                </label>
                                {formData.image && !uploadingImage && (
                                    <div className="mt-4">
                                        <img
                                            src={formData.image}
                                            alt="Preview"
                                            className="max-h-40 rounded-lg object-cover"
                                        />
                                    </div>
                                )}
                            </div>
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
