import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Archive, Edit2, Merge, MoreVertical, Plus, RotateCcw, Search } from "lucide-react";
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

type ProviderRow = ProviderWithMeta & {
  transaccionesCount: number;
  totalAmount: number;
  proyectosCount: number;
};

type StatusFilter = "all" | "active" | "archived" | "incomplete" | "generic";

export default function ProveedoresTablePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderRow | null>(null);
  const [mergeSource, setMergeSource] = useState<ProviderRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Id<"proveedores"> | "">("");

  const providers = useQuery(api.proveedores.getAllWithStats, {
    include_archived: true,
    proyecto_id: selectedProyecto || undefined,
  });
  const proyectos = useQuery(api.desarrollos.getAll);
  const archiveProvider = useMutation(api.proveedores.archive);
  const reactivateProvider = useMutation(api.proveedores.reactivate);
  const mergeProviders = useMutation(api.proveedores.merge);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ((providers || []) as ProviderRow[]).filter((provider) => {
      const matchesSearch =
        !term ||
        provider.razon_social.toLowerCase().includes(term) ||
        provider.rfc?.toLowerCase().includes(term) ||
        provider.nombre_contacto?.toLowerCase().includes(term) ||
        provider.banco?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !provider.is_archived) ||
        (statusFilter === "archived" && provider.is_archived) ||
        (statusFilter === "incomplete" && !provider.is_complete && provider.tipo !== "generico") ||
        (statusFilter === "generic" && provider.tipo === "generico");
      return matchesSearch && matchesStatus;
    });
  }, [providers, searchTerm, statusFilter]);

  const activeMergeTargets = ((providers || []) as ProviderRow[]).filter(
    (provider) => !provider.is_archived && provider._id !== mergeSource?._id
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(amount);

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

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-5 px-12 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-normal text-gray-900">Proveedores</h1>
            <p className="text-sm text-gray-500">Catálogo global vinculado directamente a transacciones y requisiciones.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-none px-4 py-2">Total: {filtered.length}</Badge>
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

        <div className="grid grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-12 rounded-none pl-12" placeholder="Buscar razón social, RFC, contacto o banco" />
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
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200">
        <table className="w-full min-w-[1200px]">
          <thead className="border-b border-gray-200">
            <tr>
              {[
                "Razón social", "RFC", "Estado", "Contacto", "Banco", "Transacciones", "Proyectos", "Monto total", "",
              ].map((header) => <th key={header} className="border-r px-5 py-4 text-left text-sm font-normal text-gray-600">{header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {!providers ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">Cargando proveedores...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">No se encontraron proveedores</td></tr>
            ) : filtered.map((provider) => (
              <tr key={provider._id} className="hover:bg-gray-50">
                <td className="border-r px-5 py-4 text-sm font-medium">{provider.razon_social}</td>
                <td className="border-r px-5 py-4 text-sm">{provider.rfc || "—"}</td>
                <td className="border-r px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {provider.is_archived && <Badge variant="outline">Archivado</Badge>}
                    <Badge variant="outline">
                      {provider.tipo === "generico" ? "Genérico" : provider.is_complete ? "Completo" : "Incompleto"}
                    </Badge>
                  </div>
                </td>
                <td className="border-r px-5 py-4 text-sm">{provider.nombre_contacto || "—"}</td>
                <td className="border-r px-5 py-4 text-sm">{provider.banco || "—"}</td>
                <td className="border-r px-5 py-4 text-center text-sm">{provider.transaccionesCount}</td>
                <td className="border-r px-5 py-4 text-center text-sm">{provider.proyectosCount}</td>
                <td className="border-r px-5 py-4 text-sm font-semibold">{formatCurrency(provider.totalAmount)}</td>
                <td className="px-4 py-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
                        <DropdownMenuItem onClick={() => handleReactivate(provider)}><RotateCcw className="mr-2 h-4 w-4" /> Reactivar</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-red-600" onClick={() => handleArchive(provider)}><Archive className="mr-2 h-4 w-4" /> Archivar</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
