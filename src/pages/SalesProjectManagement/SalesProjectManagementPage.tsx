import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Building2, Pencil } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function SalesProjectManagementPage() {
  const salesProjects = useQuery(api.sales_projects.getAll);
  const createProject = useMutation(api.sales_projects.create);
  const updateProject = useMutation(api.sales_projects.update);
  const deleteProjectMutation = useMutation(api.sales_projects.deleteProject);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form state
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [image, setImage] = useState("");
  const [status, setStatus] = useState("Activo");
  const [comisionPorcentaje, setComisionPorcentaje] = useState<number>(0);

  const currentProject = salesProjects?.find((p) => p._id === selectedProject);

  // Reset form
  const resetForm = () => {
    setNombre("");
    setDescripcion("");
    setImage("");
    setStatus("Activo");
    setComisionPorcentaje(0);
    setIsEditing(false);
    setIsCreating(false);
  };

  // Handle project selection
  const handleProjectSelect = (projectId: string) => {
    setSelectedProject(projectId);
    const project = salesProjects?.find((p) => p._id === projectId);
    if (project) {
      setNombre(project.nombre);
      setDescripcion(project.descripcion);
      setImage(project.image);
      setStatus(project.status || "Activo");
      setComisionPorcentaje(project.comision_porcentaje || 0);
      setIsEditing(false);
    }
  };

  // Handle create new project
  const handleCreateNew = () => {
    setSelectedProject(null);
    resetForm();
    setIsCreating(true);
    setIsEditing(true);
  };

  // Handle edit existing project
  const handleEdit = () => {
    setIsEditing(true);
  };

  // Handle save (create or update)
  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre del proyecto es requerido");
      return;
    }

    setIsSaving(true);
    try {
      if (isCreating) {
        // Create new project
        const newProjectId = await createProject({
          nombre,
          descripcion,
          image,
          status,
          comision_porcentaje: comisionPorcentaje,
        });
        toast.success("Proyecto de ventas creado correctamente");
        setSelectedProject(newProjectId);
        setIsCreating(false);
        setIsEditing(false);
      } else if (selectedProject) {
        // Update existing project
        await updateProject({
          id: selectedProject as Id<"sales_projects">,
          nombre,
          descripcion,
          image,
          status,
          comision_porcentaje: comisionPorcentaje,
        });
        toast.success("Proyecto actualizado correctamente");
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error saving project:", error);
      toast.error("Error al guardar el proyecto");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      setSelectedProject(null);
      resetForm();
    } else if (currentProject) {
      // Restore original values
      setNombre(currentProject.nombre);
      setDescripcion(currentProject.descripcion);
      setImage(currentProject.image);
      setStatus(currentProject.status || "Activo");
      setComisionPorcentaje(currentProject.comision_porcentaje || 0);
      setIsEditing(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedProject) return;

    setIsDeleting(true);
    try {
      await deleteProjectMutation({
        id: selectedProject as Id<"sales_projects">,
      });
      toast.success("Proyecto eliminado correctamente");
      setShowDeleteDialog(false);
      setSelectedProject(null);
      resetForm();
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Error al eliminar el proyecto");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!salesProjects) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-normal text-gray-900 mb-2">
              Gestión de Proyectos de Ventas
            </h1>
            <p className="text-gray-600">
              Administra los proyectos de ventas y sus configuraciones
            </p>
          </div>
          <Button onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Proyecto
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Proyectos ({salesProjects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {salesProjects.map((project) => (
                  <button
                    key={project._id}
                    onClick={() => handleProjectSelect(project._id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedProject === project._id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <Building2 className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {project.nombre}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {project.status || "Activo"}
                        </p>
                        {project.comision_porcentaje !== undefined && (
                          <p className="text-xs text-blue-600 mt-1">
                            Comisión: {project.comision_porcentaje}%
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Project Editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {isCreating
                    ? "Nuevo Proyecto"
                    : currentProject
                    ? currentProject.nombre
                    : "Selecciona un proyecto"}
                </CardTitle>
                {currentProject && !isEditing && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!currentProject && !isCreating ? (
                <div className="text-center py-12 text-gray-500">
                  Selecciona un proyecto de la lista o crea uno nuevo
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Nombre */}
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre del Proyecto *</Label>
                    <Input
                      id="nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      disabled={!isEditing}
                      placeholder="Ej: Torre Residencial Norte"
                    />
                  </div>

                  {/* Descripción */}
                  <div className="space-y-2">
                    <Label htmlFor="descripcion">Descripción</Label>
                    <Textarea
                      id="descripcion"
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      disabled={!isEditing}
                      placeholder="Descripción del proyecto..."
                      rows={4}
                    />
                  </div>

                  {/* Image URL */}
                  <div className="space-y-2">
                    <Label htmlFor="image">URL de Imagen</Label>
                    <Input
                      id="image"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      disabled={!isEditing}
                      placeholder="https://..."
                    />
                    {image && (
                      <div className="mt-2">
                        <img
                          src={image}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-lg border"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="space-y-2">
                    <Label htmlFor="status">Estado</Label>
                    <Select
                      value={status}
                      onValueChange={setStatus}
                      disabled={!isEditing}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Activo">Activo</SelectItem>
                        <SelectItem value="En Proceso">En Proceso</SelectItem>
                        <SelectItem value="Completado">Completado</SelectItem>
                        <SelectItem value="Pausado">Pausado</SelectItem>
                        <SelectItem value="Cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Comisión Porcentaje */}
                  <div className="space-y-2">
                    <Label htmlFor="comision">Porcentaje de Comisión (%)</Label>
                    <Input
                      id="comision"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={comisionPorcentaje}
                      onChange={(e) => setComisionPorcentaje(parseFloat(e.target.value) || 0)}
                      disabled={!isEditing}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500">
                      Porcentaje de comisión aplicado a las ventas del proyecto
                    </p>
                  </div>

                  {/* Metadata (read-only) */}
                  {!isCreating && currentProject && (
                    <div className="pt-4 border-t space-y-2">
                      <div className="text-xs text-gray-500">
                        <p>
                          <span className="font-medium">Fecha de creación:</span>{" "}
                          {currentProject.fecha_creacion || "N/A"}
                        </p>
                        <p>
                          <span className="font-medium">Comisión calculada:</span>{" "}
                          ${(currentProject.comision_monto || 0).toLocaleString("es-MX")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {isEditing && (
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={handleCancel}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isCreating ? "Crear Proyecto" : "Guardar Cambios"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar proyecto?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará el proyecto "{currentProject?.nombre}" y todos sus datos
              asociados. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
