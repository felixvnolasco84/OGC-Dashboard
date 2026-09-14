import { useDeferredValue, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Edit2, FileSpreadsheet, Merge, MoreVertical, Plus, ReceiptText, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProviderFormDialog, {
  type ProviderWithMeta,
} from "@/components/providers/ProviderFormDialog";
import ProviderTransactionSyncDialog from "@/components/providers/ProviderTransactionSyncDialog";
import ProviderExcelBackfillDialog from "@/components/providers/ProviderExcelBackfillDialog";

type ProviderRow = ProviderWithMeta & {
  transaccionesCount: number;
  totalAmount: number;
  proyectosCount: number;
};

type StatusFilter = "all" | "active" | "archived" | "incomplete" | "generic";
type SortField = "name" | "transactions" | "projects" | "amount";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 25;

export default function ProveedoresTablePage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderRow | null>(null);
  const [mergeSource, setMergeSource] = useState<ProviderRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Id<"proveedores"> | "">("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [excelBackfillOpen, setExcelBackfillOpen] = useState(false);

  const deferredSearchTerm = useDeferredValue(searchTerm.trim());
  const {
    results: providerResults,
    status: providersStatus,
    loadMore: loadMoreProviders,
  } = usePaginatedQuery(api.proveedores.getPaginatedWithStats, {
    proyecto_id: selectedProyecto || undefined,
    search: deferredSearchTerm || undefined,
    status: statusFilter,
    sort: sortField,
    direction: sortDirection,
  }, { initialNumItems: PAGE_SIZE });
  const proyectos = useQuery(api.desarrollos.getAll);
  const mergeTargetProviders = useQuery(api.proveedores.getAll, mergeSource ? {} : "skip");
  const archiveProvider = useMutation(api.proveedores.archive);
  const reactivateProvider = useMutation(api.proveedores.reactivate);
  const mergeProviders = useMutation(api.proveedores.merge);

  const providers = providerResults as ProviderRow[];
  const isLoadingFirstPage = providersStatus === "LoadingFirstPage";
  const isLoadingMore = providersStatus === "LoadingMore";
  const canLoadMore = providersStatus === "CanLoadMore";

  const activeMergeTargets = ((mergeTargetProviders || []) as ProviderRow[]).filter(
    (provider) => !provider.is_archived && provider._id !== mergeSource?._id
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(field);
    setSortDirection(field === "name" ? "asc" : "desc");
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3.5 w-3.5" />
      : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(amount);

  const viewProviderTransactions = (provider: ProviderRow) => {
    navigate(`/transacciones?proveedor=${encodeURIComponent(provider._id)}`);
  };

  const handleArchive = async (provider: ProviderRow) => {
    try {
      await archiveProvider({ id: provider._id });
      toast.success("Proveedor archivado", {
        description: "Las relaciones históricas se conservaron.",
      });
    } catch (error) {
      toast.error("No se pudo archivar", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    }
  };

  const handleReactivate = async (provider: ProviderRow) => {
    try {
      await reactivateProvider({ id: provider._id });
      toast.success("Proveedor reactivado");
    } catch (error) {
      toast.error("No se pudo reactivar", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    }
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget) return;
    try {
      const result = await mergeProviders({
        source_id: mergeSource._id,
        target_id: mergeTarget,
      });
      toast.success("Proveedores fusionados", {
        description: `${result.transacciones_actualizadas} transacciones y ${result.requisiciones_actualizadas} requisiciones reasignadas.`,
      });
      setMergeSource(null);
      setMergeTarget("");
    } catch (error) {
      toast.error("No se pudieron fusionar", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    }
  };

  const renderProviderStatus = (provider: ProviderRow) => (
    <div className="flex flex-wrap justify-start gap-1">
      {provider.is_archived && <Badge variant="outline">Archivado</Badge>}
      <Badge variant="outline">
        {provider.tipo === "generico" ? "Genérico" : provider.is_complete ? "Completo" : "Incompleto"}
      </Badge>
    </div>
  );

  const renderProviderActions = (provider: ProviderRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Acciones para ${provider.razon_social}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => viewProviderTransactions(provider)}>
          <ReceiptText className="mr-2 h-4 w-4" /> Ver transacciones
        </DropdownMenuItem>
        {!provider.is_archived && (
          <DropdownMenuItem onClick={() => { setEditingProvider(provider); setFormOpen(true); }}>
            <Edit2 className="mr-2 h-4 w-4" /> Editar / completar
          </DropdownMenuItem>
        )}
        {!provider.is_archived && (
          <DropdownMenuItem onClick={() => { setMergeSource(provider); setMergeTarget(""); }}>
            <Merge className="mr-2 h-4 w-4" /> Fusionar
          </DropdownMenuItem>
        )}
        {provider.is_archived ? (
          <DropdownMenuItem onClick={() => handleReactivate(provider)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reactivar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="text-red-600" onClick={() => handleArchive(provider)}>
            <Archive className="mr-2 h-4 w-4" /> Archivar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen bg-card">
      <div className="flex flex-col gap-5 px-4 py-6 sm:px-6 lg:px-12 lg:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="text-left">
            <h1 className="mb-2 text-3xl font-normal text-foreground">Proveedores</h1>
            <p className="text-sm text-subtle-foreground">Catálogo global vinculado directamente a transacciones y requisiciones.</p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
            <Badge variant="outline" className="rounded-none px-4 py-2">
              Mostrando: {providers.length}{canLoadMore ? "+" : ""}
            </Badge>
            <Button variant="outline" onClick={() => setExcelBackfillOpen(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Actualizar desde Excel
            </Button>
            <Button variant="outline" onClick={() => setSyncOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Sincronizar transacciones
            </Button>
            <Button
              onClick={() => {
                setEditingProvider(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-disabled-foreground" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-12 rounded-none pl-12" placeholder="Buscar proveedor" />
          </div>
          <Select value={selectedProyecto || "all"} onValueChange={(value) => setSelectedProyecto(value === "all" ? "" : value as Id<"desarrollos">)}>
            <SelectTrigger className="h-12 rounded-none"><SelectValue placeholder="Todos los proyectos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {proyectos?.map((project) => <SelectItem key={project._id} value={project._id}>{project.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-12 rounded-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="archived">Archivados</SelectItem>
              <SelectItem value="incomplete">Incompletos</SelectItem>
              <SelectItem value="generic">Genéricos</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={`${sortField}:${sortDirection}`}
            onValueChange={(value) => {
              const [field, direction] = value.split(":") as [SortField, SortDirection];
              setSortField(field);
              setSortDirection(direction);
            }}
            disabled={Boolean(deferredSearchTerm)}
          >
            <SelectTrigger className="h-12 rounded-none" aria-label="Ordenar proveedores">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name:asc">Razón social: A–Z</SelectItem>
              <SelectItem value="name:desc">Razón social: Z–A</SelectItem>
              <SelectItem value="transactions:desc">Más transacciones</SelectItem>
              <SelectItem value="transactions:asc">Menos transacciones</SelectItem>
              <SelectItem value="projects:desc">Más proyectos</SelectItem>
              <SelectItem value="projects:asc">Menos proyectos</SelectItem>
              <SelectItem value="amount:desc">Mayor monto</SelectItem>
              <SelectItem value="amount:asc">Menor monto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {deferredSearchTerm && (
          <p className="text-left text-xs text-muted-foreground">La búsqueda ordena por relevancia de coincidencia.</p>
        )}
      </div>

      <div className="border-y border-border md:hidden">
        {isLoadingFirstPage ? (
          <p className="px-4 py-12 text-left text-sm text-subtle-foreground">Cargando proveedores...</p>
        ) : providers.length === 0 ? (
          <p className="px-4 py-12 text-left text-sm text-subtle-foreground">No se encontraron proveedores</p>
        ) : (
          <div className="divide-y divide-border">
            {providers.map((provider) => (
              <article key={provider._id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-medium text-foreground">{provider.razon_social}</h2>
                    {provider.rfc && <p className="mt-1 text-xs text-subtle-foreground">RFC: {provider.rfc}</p>}
                  </div>
                  <div className="shrink-0">{renderProviderActions(provider)}</div>
                </div>

                <div className="mt-3">{renderProviderStatus(provider)}</div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-left">
                  <div>
                    <dt className="text-xs text-muted-foreground">Transacciones</dt>
                    <dd>
                      <Button
                        variant="link"
                        className="-ml-2 h-9 px-2 text-left font-normal"
                        onClick={() => viewProviderTransactions(provider)}
                        aria-label={`Ver ${provider.transaccionesCount} transacciones de ${provider.razon_social}`}
                      >
                        {provider.transaccionesCount}
                      </Button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Proyectos</dt>
                    <dd className="mt-2 text-sm text-foreground">{provider.proyectosCount}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Monto total</dt>
                    <dd className="mt-2 text-sm font-semibold text-foreground">{formatCurrency(provider.totalAmount)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto border border-border md:block">
        <table className="w-full min-w-[1200px]">
          <thead className="border-b border-border bg-card">
            <tr>
              {[
                { label: "Razón social", sort: "name" as const },
                { label: "RFC" },
                { label: "Estado" },
                { label: "Contacto" },
                { label: "Banco" },
                { label: "Transacciones", sort: "transactions" as const },
                { label: "Proyectos", sort: "projects" as const },
                { label: "Monto total", sort: "amount" as const },
                { label: "" },
              ].map((header, index) => (
                <th
                  key={header.label || "actions"}
                  className={`border-r px-5 py-4 text-left text-sm font-normal text-muted-foreground ${
                    index === 0 ? "sticky left-0 z-20 w-72 min-w-72 max-w-72 bg-card" : ""
                  } ${index === 8 ? "sticky right-0 z-20 w-16 min-w-16 border-l bg-card" : ""}`}
                >
                  {header.sort ? (
                    <Button
                      variant="ghost"
                      className="-ml-3 h-8 justify-start gap-2 px-3 font-normal"
                      onClick={() => handleSort(header.sort!)}
                      disabled={Boolean(deferredSearchTerm)}
                    >
                      {header.label}
                      {renderSortIcon(header.sort)}
                    </Button>
                  ) : header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoadingFirstPage ? (
              <tr><td colSpan={9} className="px-6 py-12 text-left text-subtle-foreground">Cargando proveedores...</td></tr>
            ) : providers.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-12 text-left text-subtle-foreground">No se encontraron proveedores</td></tr>
            ) : providers.map((provider) => (
              <tr key={provider._id} className="group hover:bg-background">
                <td className="sticky left-0 z-10 w-72 min-w-72 max-w-72 break-words border-r bg-card px-5 py-4 text-left text-sm font-medium group-hover:bg-background">{provider.razon_social}</td>
                <td className="border-r px-5 py-4 text-left text-sm">{provider.rfc || "—"}</td>
                <td className="border-r px-5 py-4 text-left">
                  {renderProviderStatus(provider)}
                </td>
                <td className="border-r px-5 py-4 text-left text-sm">{provider.nombre_contacto || "—"}</td>
                <td className="border-r px-5 py-4 text-left text-sm">{provider.banco || "—"}</td>
                <td className="border-r px-5 py-4 text-left text-sm">
                  <Button
                    variant="link"
                    className="h-auto p-0 text-left font-normal"
                    onClick={() => viewProviderTransactions(provider)}
                    aria-label={`Ver ${provider.transaccionesCount} transacciones de ${provider.razon_social}`}
                  >
                    {provider.transaccionesCount}
                  </Button>
                </td>
                <td className="border-r px-5 py-4 text-left text-sm">{provider.proyectosCount}</td>
                <td className="border-r px-5 py-4 text-left text-sm font-semibold">{formatCurrency(provider.totalAmount)}</td>
                <td className="sticky right-0 z-10 w-16 min-w-16 border-l bg-card px-4 py-4 text-left group-hover:bg-background">
                  {renderProviderActions(provider)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(canLoadMore || isLoadingMore) && (
        <div className="flex justify-center border-b border-border px-4 py-5">
          <Button
            variant="outline"
            onClick={() => loadMoreProviders(PAGE_SIZE)}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Cargando…" : "Cargar más proveedores"}
          </Button>
        </div>
      )}

      <ProviderTransactionSyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        projects={(proyectos || []).map((project) => ({
          _id: project._id,
          nombre: project.nombre,
        }))}
        initialProjectId={selectedProyecto || undefined}
      />
      <ProviderExcelBackfillDialog
        open={excelBackfillOpen}
        onOpenChange={setExcelBackfillOpen}
        projects={(proyectos || []).map((project) => ({
          _id: project._id,
          nombre: project.nombre,
        }))}
        initialProjectId={selectedProyecto || undefined}
      />
      <ProviderFormDialog open={formOpen} onOpenChange={setFormOpen} provider={editingProvider} />
      <Dialog open={Boolean(mergeSource)} onOpenChange={(open) => !open && setMergeSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fusionar proveedor</DialogTitle>
            <DialogDescription>
              Las transacciones y requisiciones de {mergeSource?.razon_social} se moverán al proveedor destino. El origen quedará archivado.
            </DialogDescription>
          </DialogHeader>
          <Select value={mergeTarget || undefined} onValueChange={(value) => setMergeTarget(value as Id<"proveedores">)}>
            <SelectTrigger><SelectValue placeholder="Selecciona el proveedor destino" /></SelectTrigger>
            <SelectContent>
              {activeMergeTargets.map((provider) => <SelectItem key={provider._id} value={provider._id}>{provider.razon_social} {provider.rfc ? `· ${provider.rfc}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeSource(null)}>Cancelar</Button>
            <Button onClick={handleMerge} disabled={!mergeTarget}>Fusionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
