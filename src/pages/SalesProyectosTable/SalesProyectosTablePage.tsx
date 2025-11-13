import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, Plus } from "lucide-react";
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
import { useAddSalesProjectModal } from "@/hooks/add-sales-project-modal";
import { useEditSalesProjectModal } from "@/hooks/edit-sales-project-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function SalesProyectosTablePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Id<"sales_projects"> | null>(null);

  const projects = useQuery(api.sales_projects.getAllWithMetrics);
  const deleteProject = useMutation(api.sales_projects.deleteProject);
  const addSalesProjectModal = useAddSalesProjectModal();
  const editSalesProjectModal = useEditSalesProjectModal();

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
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const handleDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject({ id: projectToDelete });
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error("Error deleting sales project:", error);
    }
  };

  const openDeleteDialog = (projectId: Id<"sales_projects">) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">

        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-normal text-gray-900 mb-2">Proyectos de Ventas</h1>
              <p className="text-sm text-gray-500">
                Gestiona y consulta todos tus proyectos de ventas
              </p>
            </div>
            <div className="flex space-x-4">
              <Button
                onClick={() => addSalesProjectModal.onOpen()}
                variant="outline"
                size="lg"
                className="flex items-center gap-2 rounded-none text-gray-500 py-6"
              >
                Agregar Proyecto de Ventas
                <Plus className="h-6 w-6 rounded-full shadow-none" />
              </Button>
            </div>

          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 rounded-none border-gray-300 h-12"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-none">
          <table className="w-full">
            <thead className=" border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Proyecto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Total Ventas
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Comisión
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Fecha creación
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!projects ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Cargando proyectos de ventas...
                  </td>
                </tr>
              ) : filteredProjects && filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron proyectos de ventas
                  </td>
                </tr>
              ) : (
                filteredProjects?.map((project) => (
                  <tr
                    key={project._id}
                    className="hover: transition-colors"
                  >
                    <td className="px-6 py-4 border-r border-gray-200">
                      <div className="text-sm font-normal text-gray-900">
                        {project.nombre}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {formatCurrency(project.total_ventas)}
                    </td>
                    <td className="px-6 py-4 text-sm border-r border-gray-200">
                      {formatCurrency(project.comision_monto || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm border-r border-gray-200">
                      {project.fecha_creacion ||
                        new Date(project._creationTime).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                    </td>
                    <td className="px-6 py-4 border-r border-gray-200">
                      <Badge
                        variant="outline"
                        className={`${getStatusColor(
                          project.status || "Activo"
                        )} rounded-full px-3 py-1 text-xs font-normal`}
                      >
                        {project.status || "Activo"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 border-r border-gray-200">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4 text-gray-400" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 space-y-2">
                          <Button onClick={() => editSalesProjectModal.onOpen(project._id)} variant="outline" className="w-full text-xs">
                            Editar
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
              proyecto de ventas y todos sus datos relacionados.
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
