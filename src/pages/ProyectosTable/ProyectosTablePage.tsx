import { BudgetOriginalDialog } from "@/components/Presupuesto/BudgetOriginal";
import { Table } from "@/components/ui/table";
import { ResponsiveCurrency } from "@/components/ui/responsive-currency";
import { Link } from "react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { History, Search, MoreHorizontal, MoreVertical, Plus, Settings2, Upload } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getProjectLocationLabel,
  NO_PROJECT_LOCATION,
  NO_PROJECT_LOCATION_LABEL,
} from "@/lib/project-locations";
import ProjectLocationsModal from "@/components/modals/project-locations-modal";

type LocationFilter = string;

export default function ProyectosTablePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [creationHistoryOpen, setCreationHistoryOpen] = useState(false);
  const [locationsModalOpen, setLocationsModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Id<"desarrollos"> | null>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const currentUser = useQuery(api.users.getCurrentUser);
  const projects = useQuery(api.desarrollos.getAllWithMetrics);
  const projectLocations = useQuery(api.project_locations.list);
  const deleteProject = useMutation(api.desarrollos.deleteProject);
  const addProyectoModal = useAddProyectoModal();
  const editProyectoModal = useEditProyectoModal();
  const uploadTransactionsModal = useUploadTransactionsModal();
  const uploadProjectionsModal = useUploadProjectionsModal();

  const runAfterActionsClose = (action: () => void) => {
    pendingActionRef.current = action;
    setActionsOpen(false);
  };

  const filteredProjects = projects?.filter((project) => {
    const matchesSearch = project.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = locationFilter === "all"
      || (locationFilter === NO_PROJECT_LOCATION
        ? !project.ubicacion
        : project.ubicacion === locationFilter);

    return matchesSearch && matchesLocation;
  });

  const formatCurrency = (amount: number) => {
    const compact = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    return <ResponsiveCurrency amount={amount} compact={compact} />;
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

        <div className="flex flex-col gap-4 px-4 sm:px-6 xl:px-12">
          <div className="mb-8 responsive-header">
            <div>
              <h1 className="text-3xl font-normal text-foreground mb-2">Proyectos</h1>
              <p className="text-sm text-muted-foreground">
                Gestiona y consulta todos tus proyectos de construcción
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => addProyectoModal.onOpen()}
                size="action"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo proyecto
              </Button>
              <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    ref={actionsTriggerRef}
                    type="button"
                    variant="outline"
                    size="actionIcon"
                    aria-label="Acciones de proyectos"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  className="w-64 max-w-[calc(100vw-2rem)] rounded-none [&_[role=menuitem]]:min-h-11 sm:[&_[role=menuitem]]:min-h-9"
                  onCloseAutoFocus={() => {
                    // Open dialogs after the menu has unmounted and restored focus.
                    const action = pendingActionRef.current;
                    pendingActionRef.current = null;
                    if (action) window.setTimeout(action, 0);
                  }}
                >
                  {currentUser?.role === "admin" && <>
                    <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Consultar</DropdownMenuLabel>
                    <DropdownMenuGroup aria-label="Consultar">
                      <DropdownMenuItem onSelect={() => runAfterActionsClose(() => setCreationHistoryOpen(true))}>
                        <History aria-hidden="true" />
                        Historial de creaciones
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>}
                  <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Importar</DropdownMenuLabel>
                  <DropdownMenuGroup aria-label="Importar">
                    <DropdownMenuItem onSelect={() => runAfterActionsClose(() => uploadTransactionsModal.onOpen())}>
                      <Upload aria-hidden="true" />
                      Subir transacciones
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Configuración</DropdownMenuLabel>
                  <DropdownMenuGroup aria-label="Configuración">
                    <DropdownMenuItem onSelect={() => runAfterActionsClose(() => setLocationsModalOpen(true))}>
                      <Settings2 aria-hidden="true" />
                      Configurar ubicaciones
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

          </div>

          {/* Search Bar */}
          <div className="mb-8 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-disabled-foreground h-5 w-5" />
              <Input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 rounded-none border-border-strong h-12"
              />
            </div>
            <Select
              value={locationFilter}
              onValueChange={(value) => setLocationFilter(value as LocationFilter)}
            >
              <SelectTrigger className="h-12 w-full rounded-none border-border-strong md:w-64">
                <SelectValue placeholder="Filtrar por ubicación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las ubicaciones</SelectItem>
                {(projectLocations || []).map((location) => (
                  <SelectItem key={location.key} value={location.key}>
                    {location.name}
                  </SelectItem>
                ))}
                <SelectItem value={NO_PROJECT_LOCATION}>
                  {NO_PROJECT_LOCATION_LABEL}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* Header */}


        {/* Table */}
        <div className="overflow-x-auto border border-border rounded-none">
          <Table mobileSummary={[0, 1, 3, 4, 5, 8, 9]} className="w-full min-w-[1200px]">
            <thead className=" border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Proyecto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Ubicación
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
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
                    Cargando proyectos...
                  </td>
                </tr>
              ) : filteredProjects && filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
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
                      <Link to={`/proyecto/${project._id}/presupuesto`} className="inline-flex min-h-11 items-center text-sm font-normal text-foreground hover:underline focus-visible:outline focus-visible:outline-ring lg:min-h-0">
                        {project.nombre}
                      </Link>
                    </td>
                    <td className="px-6 py-4 border-r border-border">
                      <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-normal">
                        {getProjectLocationLabel(project.ubicacion, projectLocations || [])}
                      </Badge>
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
                        {project.initial_budget_status === "incomplete" ? "Creación incompleta" : project.status || "Activo"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 border-r border-border">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Acciones de ${project.nombre}`}>
                            <MoreVertical className="h-4 w-4 text-disabled-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-48">
                          <DropdownMenuItem onSelect={() => editProyectoModal.onOpen(project._id)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => uploadProjectionsModal.onOpen(project._id)}>
                            <Upload className="h-3 w-3" />
                            Subir Proyecciones
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => openDeleteDialog(project._id)}>
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
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
      {currentUser?.role === "admin" && <BudgetOriginalDialog
        open={creationHistoryOpen}
        onOpenChange={setCreationHistoryOpen}
        hideTrigger
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          actionsTriggerRef.current?.focus();
        }}
      />}
      <ProjectLocationsModal
        open={locationsModalOpen}
        onOpenChange={setLocationsModalOpen}
      />
    </div>
  );
}
