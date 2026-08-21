import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAddProyectoModal } from "@/hooks/add-proyecto-modal";
import { useEditProyectoModal } from "@/hooks/edit-proyecto-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { useUploadTransactionsModal } from "@/hooks/upload-transactions-modal";
import { useUploadProjectionsModal } from "@/hooks/upload-projections-modal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function ProyectosTablePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Id<"desarrollos"> | null>(null);

  const projects = useQuery(api.desarrollos.getAllWithMetrics);
  const deleteProject = useMutation(api.desarrollos.deleteProject);
  const addProyectoModal = useAddProyectoModal();
  const editProyectoModal = useEditProyectoModal();
  const uploadTransactionsModal = useUploadTransactionsModal();
  const uploadProjectionsModal = useUploadProjectionsModal();

  const filteredProjects = projects?.filter((project) =>
    project.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Activo":
        return "bg-green-50 text-green-700 border-green-200";
      case "Cancelado":
        return "bg-red-50 text-red-700 border-red-200";
      case "Entregado":
        return "bg-muted text-foreground border-border";
      default:
        return "bg-muted text-foreground border-border";
    }
  };

  const handleDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject({ id: projectToDelete });
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  const openDeleteDialog = (projectId: Id<"desarrollos">) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="bg-card min-h-screen">
      <div className="max-w-full mx-auto  py-8 text-left">

        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-normal text-foreground mb-2">Proyectos</h1>
              <p className="text-sm text-subtle-foreground">
                Gestiona y consulta todos tus proyectos de construcción
              </p>
            </div>
            <div className="flex space-x-4">
              <Button
                onClick={() => addProyectoModal.onOpen()}
                variant="outline"
                size="lg"
                className="flex items-center gap-2 rounded-none text-subtle-foreground py-6"
              >
                Agregar Proyecto
                <Plus className="h-6 w-6 rounded-full shadow-none" />
              </Button>
              <Button
                onClick={() => uploadTransactionsModal.onOpen()}
                variant="outline"
                size="lg"
                className="flex items-center gap-2 rounded-none text-subtle-foreground py-6"
              >
                Subir Transacciones
                <Upload className="h-6 w-6 rounded-full shadow-none" />
              </Button>
            </div>

          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-disabled-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 rounded-none border-border-strong h-12"
            />
          </div>
        </div>
        {/* Header */}


        {/* Table */}
        <div className="border border-border rounded-none">
          <table className="w-full">
            <thead className=" border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Proyecto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Presupuesto original
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Presupuesto aprobado
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Pagado
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Avance obra
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Honorarios
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Fecha creación
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!projects ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-subtle-foreground">
                    Cargando proyectos...
                  </td>
                </tr>
              ) : filteredProjects && filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-subtle-foreground">
                    No se encontraron proyectos
                  </td>
                </tr>
              ) : (
                filteredProjects?.map((project) => (
                  <tr
                    key={project._id}
                    className="hover: transition-colors"
                  >
                    <td className="px-6 py-4 border-r border-border">
                      <div className="text-sm font-normal text-foreground">
                        {project.nombre}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {formatCurrency(project.presupuesto_original)}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {formatCurrency(project.presupuesto_aprobado)}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {formatCurrency(project.pagado)}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {project.avance}%
                    </td>
                    <td className="px-6 py-4 text-sm border-r border-border">
                      {formatCurrency(project.honorarios_monto || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm border-r border-border">
                      {project.fecha_creacion ||
                        new Date(project._creationTime).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                    </td>
                    <td className="px-6 py-4 border-r border-border">
                      <Badge
                        variant="outline"
                        className={`${getStatusColor(
                          project.status || "Activo"
                        )} rounded-full px-3 py-1 text-xs font-normal`}
                      >
                        {project.status || "Activo"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 border-r border-border">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4 text-disabled-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 space-y-2">
                          <Button onClick={() => editProyectoModal.onOpen(project._id)} variant="outline" className="w-full text-xs">
                            Editar
                          </Button>
                          <Button
                            onClick={() => uploadProjectionsModal.onOpen(project._id)}
                            variant="outline"
                            className="w-full text-xs flex items-center gap-2"
                          >
                            <Upload className="h-3 w-3" />
                            Subir Proyecciones
                          </Button>
                          <Button onClick={() => openDeleteDialog(project._id)} variant="outline" className="w-full text-xs">
                            Eliminar
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no puede ser deshecha. Esto eliminará permanentemente el
              proyecto y todos sus datos relacionados (partidas, pagos, transacciones, documentos).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProjectToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
