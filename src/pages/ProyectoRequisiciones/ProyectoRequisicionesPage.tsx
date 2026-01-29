import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, Plus, ArrowUp, ArrowDown, X, Filter, FileText, ExternalLink, Building2, Loader2, Eye, Edit2, ChevronLeft, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useRequisicionModal } from "@/hooks/nueva-requisicion-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Popover } from "@radix-ui/react-popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import RequisicionModal from "@/components/modals/RequisicionModal";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function ProyectoRequisicionesPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [requisicionToDelete, setRequisicionToDelete] = useState<Id<"requisiciones"> | null>(null);

    // Advanced search filters
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [tipoFilter, setTipoFilter] = useState<string>("all");
    const [sortField, setSortField] = useState<"fecha_solicitud" | "tipo">("fecha_solicitud");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(false);

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch requisiciones for this project
    const requisiciones = useQuery(api.requisiciones.getByProyecto, proyectoId ? { proyecto: proyectoId as Id<"desarrollos"> } : "skip");

    const deleteRequisicion = useMutation(api.requisiciones.deleteRequisicion);
    const updateStatus = useMutation(api.requisiciones.updateStatus);
    const updateStatusEntrega = useMutation(api.requisiciones.updateStatusEntrega);
    const updateRequisicionProveedor = useMutation(api.requisiciones.update);
    const createProveedor = useMutation(api.proveedores.create);

    // Fetch all proveedores
    const proveedores = useQuery(api.proveedores.getAll);

    // Provider dialog state
    const [providerDialogOpen, setProviderDialogOpen] = useState(false);
    const [selectedRequisicionForProvider, setSelectedRequisicionForProvider] = useState<Id<"requisiciones"> | null>(null);
    const [providerMode, setProviderMode] = useState<"select" | "create">("select");
    const [selectedProviderId, setSelectedProviderId] = useState<string>("");
    const [isSubmittingProvider, setIsSubmittingProvider] = useState(false);
    const [newProviderData, setNewProviderData] = useState({
        razon_social: "",
        rfc: "",
        direccion: "",
        nombre_contacto: "",
        telefono_contacto: "",
        cuenta: "",
        clabe: "",
        banco: "",
    });

    // Provider view/edit state
    const [providerSearchTerm, setProviderSearchTerm] = useState("");
    const [selectedProviderForView, setSelectedProviderForView] = useState<string | null>(null);
    const [isEditingProvider, setIsEditingProvider] = useState(false);
    const [editProviderData, setEditProviderData] = useState({
        razon_social: "",
        rfc: "",
        direccion: "",
        nombre_contacto: "",
        telefono_contacto: "",
        cuenta: "",
        clabe: "",
        banco: "",
    });

    // Get current user info for permission check
    const currentUser = useQuery(api.users.getCurrentUser);
    const updateProveedor = useMutation(api.proveedores.update);

    const requisicionModal = useRequisicionModal();

    // Parse date from DD/MM/YYYY format to comparable value
    const parseDateForSort = (dateStr: string): number => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return 0;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day).getTime();
    };

    // Advanced filtering and sorting
    const filteredRequisiciones = useMemo(() => {
        if (!requisiciones) return [];

        const filtered = requisiciones.filter((req) => {
            // Text search (solicitante, descripcion, partida, familia)
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                req.solicitante_nombre?.toLowerCase().includes(searchLower) ||
                req.descripcion?.toLowerCase().includes(searchLower) ||
                req.items?.some(item =>
                    item.familia?.toLowerCase().includes(searchLower) ||
                    item.sub_partida?.toLowerCase().includes(searchLower)
                );

            // Status filter
            const matchesStatus = statusFilter === "all" || req.status === statusFilter;

            // Tipo filter
            const matchesTipo = tipoFilter === "all" || req.tipo === tipoFilter;

            return matchesSearch && matchesStatus && matchesTipo;
        });

        // Sort results
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortField === "fecha_solicitud") {
                comparison = parseDateForSort(a.fecha_solicitud) - parseDateForSort(b.fecha_solicitud);
            } else if (sortField === "tipo") {
                comparison = a.tipo.localeCompare(b.tipo);
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });

        return filtered;
    }, [requisiciones, searchTerm, statusFilter, tipoFilter, sortField, sortDirection]);

    // Clear all filters
    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
        setTipoFilter("all");
        setSortField("fecha_solicitud");
        setSortDirection("desc");
    };

    // Toggle sort
    const toggleSort = (field: "fecha_solicitud" | "tipo") => {
        if (sortField === field) {
            setSortDirection(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };

    // Check if any filter is active
    const hasActiveFilters = searchTerm || statusFilter !== "all" || tipoFilter !== "all";

    const handleDelete = async () => {
        if (!requisicionToDelete) return;

        try {
            await deleteRequisicion({ id: requisicionToDelete });
            toast.success("Requisición eliminada", {
                description: "La requisición ha sido eliminada exitosamente.",
            });
            setDeleteDialogOpen(false);
            setRequisicionToDelete(null);
        } catch (error) {
            console.error("Error deleting requisicion:", error);
            toast.error("Error al eliminar", {
                description: error instanceof Error ? error.message : "No se pudo eliminar la requisición.",
            });
        }
    };

    const openDeleteDialog = (requisicionId: Id<"requisiciones">) => {
        setRequisicionToDelete(requisicionId);
        setDeleteDialogOpen(true);
    };

    const handleStatusChange = async (requisicionId: Id<"requisiciones">, newStatus: string) => {
        try {
            await updateStatus({ id: requisicionId, status: newStatus });
            toast.success("Estado de pago actualizado", {
                description: `La requisición ahora está "${newStatus}".`,
            });
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("Error al actualizar", {
                description: "No se pudo actualizar el estado de pago.",
            });
        }
    };

    const handleStatusEntregaChange = async (requisicionId: Id<"requisiciones">, newStatus: string) => {
        try {
            await updateStatusEntrega({ id: requisicionId, status_entrega: newStatus });
            toast.success("Estado de entrega actualizado", {
                description: `La entrega ahora está "${newStatus}".`,
            });
        } catch (error) {
            console.error("Error updating delivery status:", error);
            toast.error("Error al actualizar", {
                description: "No se pudo actualizar el estado de entrega.",
            });
        }
    };

    // const getStatusColor = (status: string) => {
    //     switch (status) {
    //         case "En proceso": return "bg-blue-50 text-blue-700 border border-blue-200";
    //         case "Cancelado": return "bg-red-50 text-red-700 border border-red-200";
    //         case "Pagado": return "bg-green-50 text-green-700 border border-green-200";
    //         default: return "bg-gray-50 text-gray-700 border border-gray-200";
    //     }
    // };

    const getStatusEntregaColor = (status: string | undefined) => {
        switch (status) {
            case "Pendiente": return "bg-gray-50 text-gray-700 border border-gray-200";
            case "Parcial": return "bg-yellow-50 text-yellow-700 border border-yellow-200";
            case "Completo": return "bg-emerald-50 text-emerald-700 border border-emerald-200";
            default: return "bg-gray-50 text-gray-700 border border-gray-200";
        }
    };

    // Open provider dialog
    const openProviderDialog = (requisicionId: Id<"requisiciones">) => {
        setSelectedRequisicionForProvider(requisicionId);
        setProviderDialogOpen(true);
        setProviderMode("select");
        setSelectedProviderId("");
        setNewProviderData({
            razon_social: "",
            rfc: "",
            direccion: "",
            nombre_contacto: "",
            telefono_contacto: "",
            cuenta: "",
            clabe: "",
            banco: "",
        });
    };

    // Handle provider assignment
    const handleAssignProvider = async () => {
        if (!selectedRequisicionForProvider || !selectedProviderId) return;

        setIsSubmittingProvider(true);
        try {
            await updateRequisicionProveedor({
                id: selectedRequisicionForProvider,
                proveedor_id: selectedProviderId as Id<"proveedores">,
            });
            toast.success("Proveedor asignado", {
                description: "El proveedor ha sido asignado a la requisición.",
            });
            setProviderDialogOpen(false);
        } catch (error) {
            console.error("Error assigning provider:", error);
            toast.error("Error al asignar proveedor");
        } finally {
            setIsSubmittingProvider(false);
        }
    };

    // Handle create new provider
    const handleCreateProvider = async () => {
        if (!selectedRequisicionForProvider || !newProviderData.razon_social || !newProviderData.rfc) return;

        setIsSubmittingProvider(true);
        try {
            const newProviderId = await createProveedor(newProviderData);
            await updateRequisicionProveedor({
                id: selectedRequisicionForProvider,
                proveedor_id: newProviderId,
            });
            toast.success("Proveedor creado y asignado", {
                description: "El nuevo proveedor ha sido creado y asignado a la requisición.",
            });
            setProviderDialogOpen(false);
        } catch (error) {
            console.error("Error creating provider:", error);
            toast.error("Error al crear proveedor");
        } finally {
            setIsSubmittingProvider(false);
        }
    };

    // Filter providers by search term
    const filteredProviders = useMemo(() => {
        if (!proveedores) return [];
        if (!providerSearchTerm) return proveedores;
        const searchLower = providerSearchTerm.toLowerCase();
        return proveedores.filter(p =>
            p.razon_social.toLowerCase().includes(searchLower) ||
            p.rfc.toLowerCase().includes(searchLower) ||
            p.nombre_contacto?.toLowerCase().includes(searchLower)
        );
    }, [proveedores, providerSearchTerm]);

    // Get selected provider for view/edit
    const viewingProvider = useMemo(() => {
        if (!selectedProviderForView || !proveedores) return null;
        return proveedores.find(p => p._id === selectedProviderForView);
    }, [selectedProviderForView, proveedores]);

    // Check if user can edit provider (creator or admin)
    const canEditProvider = (provider: typeof viewingProvider) => {
        if (!provider || !currentUser) return false;
        if (currentUser.role === "admin") return true;
        if (provider.created_by === currentUser._id) return true;
        return false;
    };

    // Open provider details view
    const openProviderView = (providerId: string) => {
        const provider = proveedores?.find(p => p._id === providerId);
        if (provider) {
            setSelectedProviderForView(providerId);
            setIsEditingProvider(false);
            setEditProviderData({
                razon_social: provider.razon_social,
                rfc: provider.rfc,
                direccion: provider.direccion,
                nombre_contacto: provider.nombre_contacto,
                telefono_contacto: provider.telefono_contacto,
                cuenta: provider.cuenta,
                clabe: provider.clabe,
                banco: provider.banco,
            });
        }
    };

    // Start editing provider
    const startEditingProvider = () => {
        if (viewingProvider && canEditProvider(viewingProvider)) {
            setIsEditingProvider(true);
        }
    };

    // Save provider edits
    const handleSaveProviderEdit = async () => {
        if (!selectedProviderForView) return;

        setIsSubmittingProvider(true);
        try {
            await updateProveedor({
                id: selectedProviderForView as Id<"proveedores">,
                ...editProviderData,
            });
            toast.success("Proveedor actualizado", {
                description: "Los datos del proveedor han sido actualizados.",
            });
            setIsEditingProvider(false);
        } catch (error) {
            console.error("Error updating provider:", error);
            toast.error("Error al actualizar proveedor");
        } finally {
            setIsSubmittingProvider(false);
        }
    };

    // Go back to provider list from view
    const backToProviderList = () => {
        setSelectedProviderForView(null);
        setIsEditingProvider(false);
    };

    if (!proyecto) {
        return (
            <div className="bg-white min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="bg-white min-h-screen">
            <div className="max-w-full mx-auto py-8 text-left">
                <div className="flex flex-col gap-4 px-12">
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Requisiciones</p>
                            <h1 className="text-2xl text-gray-700">{proyecto.nombre}</h1>
                        </div>
                        <div className="flex gap-2">
                            {/* Nueva Requisición - admin, user, or contratista (contratista can create their own) */}
                            {(currentUser?.role === "admin" || currentUser?.role === "user" || currentUser?.role === "contratista") && (
                                <Button
                                    onClick={() => requisicionModal.onOpen({ projectId: proyectoId as Id<"desarrollos"> }, "create")}
                                    variant="outline"
                                    size="lg"
                                    className="flex items-center gap-2 rounded-none text-gray-500 py-6"
                                >
                                    Nueva Requisición
                                    <Plus className="h-5 w-5" />
                                </Button>
                            )}
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100">
                                <span className="text-sm font-normal">
                                    Total: {requisiciones?.length || 0}
                                </span>
                            </Badge>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                        <Input
                            type="text"
                            placeholder="Buscar por solicitante, descripción, familia, material..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 pr-24 rounded-none border-gray-300 h-12"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-2">
                            {hasActiveFilters && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFilters}
                                    className="h-8 px-2 text-gray-500 hover:text-gray-700"
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Limpiar
                                </Button>
                            )}
                            <Button
                                variant={showFilters ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowFilters(!showFilters)}
                                className="h-8 rounded-none"
                            >
                                <Filter className="h-4 w-4 mr-1" />
                                Filtros
                            </Button>
                        </div>
                    </div>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <div className="mb-6 p-4 border border-gray-200 bg-gray-50 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Status Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm  text-gray-700">Estado</label>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="En proceso">En proceso</SelectItem>
                                            <SelectItem value="Cancelado">Cancelado</SelectItem>
                                            <SelectItem value="Pagado">Pagado</SelectItem>
                                            <SelectItem value="Recibido">Recibido</SelectItem>
                                            <SelectItem value="Parcial">Parcial</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Tipo Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm  text-gray-700">Tipo</label>
                                    <Select value={tipoFilter} onValueChange={setTipoFilter}>
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="material">Material</SelectItem>
                                            <SelectItem value="equipo">Equipo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Sort Controls */}
                            <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
                                <span className="text-sm  text-gray-700">Ordenar por:</span>
                                <Button
                                    variant={sortField === "fecha_solicitud" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSort("fecha_solicitud")}
                                    className="rounded-none"
                                >
                                    Fecha
                                    {sortField === "fecha_solicitud" && (
                                        sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                    )}
                                </Button>
                                <Button
                                    variant={sortField === "tipo" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSort("tipo")}
                                    className="rounded-none"
                                >
                                    Tipo
                                    {sortField === "tipo" && (
                                        sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                    )}
                                </Button>
                                <span className="text-sm text-gray-500 ml-auto">
                                    {filteredRequisiciones.length} de {requisiciones?.length || 0} requisiciones
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Table */}
                <div className="border border-gray-200 rounded-none">
                    <table className="w-full">
                        <thead className="border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Solicitante
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Tipo
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Fecha Solicitud
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Materiales
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Estado
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Proveedor
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Documento
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {!requisiciones ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        Cargando requisiciones...
                                    </td>
                                </tr>
                            ) : filteredRequisiciones && filteredRequisiciones.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        No se encontraron requisiciones
                                    </td>
                                </tr>
                            ) : (
                                filteredRequisiciones?.map((req) => (
                                    <tr
                                        key={req._id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        {/* Solicitante */}
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-[#dddcd8] flex items-center justify-center text-xs text-gray-700">
                                                    {req.solicitante_nombre?.charAt(0).toUpperCase() || "?"}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm text-gray-700 ">
                                                        {req.solicitante_nombre || "-"}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Tipo */}
                                        <td className="px-6 py-4 text-sm border-r border-gray-200">
                                            <Badge variant="outline" className={`capitalize font-normal ${req.tipo === "material" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200"
                                                }`}>
                                                {req.tipo}
                                            </Badge>
                                        </td>
                                        {/* Fecha */}
                                        <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                                            <span className="text-gray-700">{req.fecha_solicitud || "-"}</span>
                                        </td>
                                        {/* Materiales */}
                                        <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                                            <div className="flex flex-col">
                                                {req.items && req.items.length > 0 ? (
                                                    <>
                                                        <span className="text-gray-900 uppercase">
                                                            {req.items[0]?.familia || 'SIN FAMILIA'}
                                                        </span>
                                                        <span className="text-xs text-gray-500 uppercase truncate max-w-[150px]">
                                                            {[...new Set(req.items.map(item => item.sub_partida).filter(Boolean))].join(', ') || '-'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-gray-400">Sin materiales</span>
                                                )}
                                            </div>
                                        </td>
                                        {/* Status */}
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <div className="flex flex-col gap-1.5">
                                                {/* Payment Status */}
                                                <div className="flex items-center space-x-2">
                                                    <div className={cn("rounded-full p-1", req.status === "Pagado" ? "bg-green-800 text-white" : "text-muted-foreground bg-gray-200")}>
                                                        <Check className="w-3 h-3" />
                                                    </div>
                                                                   {/* Delivery Status */}
                                                <span className={`px-2 py-1 rounded-full text-xs w-fit ${getStatusEntregaColor(req.status_entrega)}`}>
                                                    {req.status_entrega || "Pendiente"}
                                                </span>
                                                    {/* <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(req.status)}`}>
                                                        {req.status}
                                                    </span> */}
                                                </div>
                                 
                                            </div>
                                        </td>
                                        {/* Proveedor */}
                                        <td className="px-6 py-4 text-sm text-gray-700 border-r border-gray-200">
                                            {req.proveedor?.razon_social || "-"}
                                        </td>
                                        {/* Documento */}
                                        <td className="px-6 py-4 text-sm border-r border-gray-200">
                                            {req.documentos && req.documentos.length > 0 ? (
                                                <div
                                                    className="flex items-center gap-2 cursor-pointer hover:text-gray-600 group"
                                                    onClick={() => req.documentos[0]?.url && window.open(req.documentos[0].url, '_blank')}
                                                >
                                                    <FileText className="w-4 h-4 text-gray-500 group-hover:text-gray-600" />
                                                    <span className="text-sm text-gray-700 group-hover:text-gray-600 truncate max-w-[100px]">
                                                        {req.documentos[0]?.nombre || "Documento"}
                                                    </span>
                                                    <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-gray-600" />
                                                    {req.documentos.length > 1 && (
                                                        <span className="text-sm text-gray-400">+{req.documentos.length - 1}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        {/* Actions */}
                                        <td className="px-6 py-4">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <MoreVertical className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="flex flex-col space-y-1 w-56" align="end">
                                                    {/* View details - available to all roles */}
                                                    <Button
                                                        variant="ghost"
                                                        className="justify-start"
                                                        onClick={() => requisicionModal.onOpen({
                                                            projectId: proyectoId as Id<"desarrollos">,
                                                            requisicionId: req._id
                                                        }, "view")}
                                                    >
                                                        Ver detalles
                                                    </Button>

                                                    {/* Edit - admin, user, or contratista (own requisiciones only) */}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <Button
                                                                variant="ghost"
                                                                className="justify-start"
                                                                onClick={() => requisicionModal.onOpen({
                                                                    projectId: proyectoId as Id<"desarrollos">,
                                                                    requisicionId: req._id
                                                                }, "edit")}
                                                            >
                                                                Editar
                                                            </Button>
                                                        )}

                                                    {/* Add provider - admin, user, or contratista (own requisiciones only) */}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <Button
                                                                variant="ghost"
                                                                className="justify-start"
                                                                onClick={() => openProviderDialog(req._id)}
                                                            >
                                                                Agregar proveedor
                                                            </Button>
                                                        )}

                                                    {/* Payment Status change options - role-based filtering */}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "finance") && (
                                                            <div className="border-t border-gray-100 pt-1 mt-1">
                                                                <p className="text-xs text-gray-500 px-2 py-1">Estado de pago:</p>
                                                                {(currentUser?.role === "finance"
                                                                    ? ["Pagado", "Cancelado"]
                                                                    : ["En proceso", "Pagado", "Cancelado"]
                                                                ).map(s => (
                                                                    s !== req.status && (
                                                                        <Button
                                                                            key={s}
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="justify-start w-full text-xs"
                                                                            onClick={() => handleStatusChange(req._id, s)}
                                                                        >
                                                                            → {s}
                                                                        </Button>
                                                                    )
                                                                ))}
                                                            </div>
                                                        )}

                                                    {/* Delivery Status change options */}
                                                    {(currentUser?.role === "admin" || currentUser?.role === "user" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <div className="border-t border-gray-100 pt-1 mt-1">
                                                                <p className="text-xs text-gray-500 px-2 py-1">Estado de entrega:</p>
                                                                {["Pendiente", "Parcial", "Completo"].map(s => (
                                                                    s !== (req.status_entrega || "Pendiente") && (
                                                                        <Button
                                                                            key={s}
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="justify-start w-full text-xs"
                                                                            onClick={() => handleStatusEntregaChange(req._id, s)}
                                                                        >
                                                                            → {s}
                                                                        </Button>
                                                                    )
                                                                ))}
                                                            </div>
                                                        )}

                                                    {/* Delete - admin or contratista (own requisiciones only) */}
                                                    {(currentUser?.role === "admin" ||
                                                        (currentUser?.role === "contratista" && req.solicitante_id === currentUser?._id)) && (
                                                            <div className="border-t border-gray-100 pt-1 mt-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    className="text-red-600 justify-start w-full"
                                                                    onClick={() => openDeleteDialog(req._id)}
                                                                >
                                                                    Eliminar
                                                                </Button>
                                                            </div>
                                                        )}
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
                        <AlertDialogTitle>¿Eliminar requisición?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará la requisición, todos sus items
                            y documentos asociados de forma permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Provider Selection Dialog */}
            <Dialog open={providerDialogOpen} onOpenChange={(open) => {
                setProviderDialogOpen(open);
                if (!open) {
                    setSelectedProviderForView(null);
                    setIsEditingProvider(false);
                    setProviderSearchTerm("");
                }
            }}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                    {/* Show provider details/edit view */}
                    {selectedProviderForView && viewingProvider ? (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={backToProviderList}
                                        className="p-1 hover:bg-gray-100 rounded"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <div>
                                        <DialogTitle>
                                            {isEditingProvider ? "Editar Proveedor" : "Detalles del Proveedor"}
                                        </DialogTitle>
                                        <DialogDescription>
                                            {isEditingProvider
                                                ? "Modifica los datos del proveedor"
                                                : viewingProvider.razon_social}
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>

                            {isEditingProvider ? (
                                <div className="space-y-4 overflow-y-auto flex-1">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Razón Social *</Label>
                                            <Input
                                                value={editProviderData.razon_social}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, razon_social: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>RFC *</Label>
                                            <Input
                                                value={editProviderData.rfc}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, rfc: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Dirección</Label>
                                        <Input
                                            value={editProviderData.direccion}
                                            onChange={(e) => setEditProviderData(prev => ({ ...prev, direccion: e.target.value }))}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Contacto</Label>
                                            <Input
                                                value={editProviderData.nombre_contacto}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, nombre_contacto: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Teléfono</Label>
                                            <Input
                                                value={editProviderData.telefono_contacto}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, telefono_contacto: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label>Banco</Label>
                                            <Input
                                                value={editProviderData.banco}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, banco: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Cuenta</Label>
                                            <Input
                                                value={editProviderData.cuenta}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, cuenta: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>CLABE</Label>
                                            <Input
                                                value={editProviderData.clabe}
                                                onChange={(e) => setEditProviderData(prev => ({ ...prev, clabe: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button variant="outline" onClick={() => setIsEditingProvider(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleSaveProviderEdit}
                                            disabled={!editProviderData.razon_social || !editProviderData.rfc || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Guardar Cambios
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 overflow-y-auto flex-1">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Razón Social</Label>
                                            <p className="font-medium">{viewingProvider.razon_social}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">RFC</Label>
                                            <p className="font-medium">{viewingProvider.rfc}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Dirección</Label>
                                        <p>{viewingProvider.direccion || "No especificada"}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Contacto</Label>
                                            <p>{viewingProvider.nombre_contacto || "No especificado"}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500">Teléfono</Label>
                                            <p>{viewingProvider.telefono_contacto || "No especificado"}</p>
                                        </div>
                                    </div>
                                    <div className="border-t pt-4">
                                        <Label className="text-xs text-gray-500 block mb-2">Información Bancaria</Label>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-400">Banco</Label>
                                                <p className="text-sm">{viewingProvider.banco || "-"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-400">Cuenta</Label>
                                                <p className="text-sm">{viewingProvider.cuenta || "-"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-gray-400">CLABE</Label>
                                                <p className="text-sm">{viewingProvider.clabe || "-"}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {viewingProvider.creator_name && (
                                        <div className="border-t pt-4">
                                            <p className="text-xs text-gray-400">
                                                Creado por: {viewingProvider.creator_name}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex justify-between gap-2 pt-4">
                                        <div>
                                            {canEditProvider(viewingProvider) && (
                                                <Button variant="outline" onClick={startEditingProvider}>
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Editar
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={backToProviderList}>
                                                Volver
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    setSelectedProviderId(viewingProvider._id);
                                                    handleAssignProvider();
                                                }}
                                                disabled={isSubmittingProvider}
                                            >
                                                {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Asignar este Proveedor
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Asignar Proveedor</DialogTitle>
                                <DialogDescription>
                                    Selecciona un proveedor existente o crea uno nuevo.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Mode Toggle */}
                            <div className="flex gap-2 border-b border-gray-200 pb-4">
                                <Button
                                    variant={providerMode === "select" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setProviderMode("select")}
                                    className="flex-1 rounded-none"
                                >
                                    <Building2 className="h-4 w-4 mr-2" />
                                    Seleccionar existente
                                </Button>
                                <Button
                                    variant={providerMode === "create" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setProviderMode("create")}
                                    className="flex-1 rounded-none"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Crear nuevo
                                </Button>
                            </div>

                            {providerMode === "select" ? (
                                <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                                    {/* Search */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Buscar por nombre, RFC o contacto..."
                                            value={providerSearchTerm}
                                            onChange={(e) => setProviderSearchTerm(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>

                                    {/* Provider List */}
                                    <div className="flex-1 overflow-y-auto border rounded-lg max-h-[300px]">
                                        {filteredProviders.length === 0 ? (
                                            <div className="p-8 text-center text-gray-500">
                                                {providerSearchTerm ? "No se encontraron proveedores" : "No hay proveedores registrados"}
                                            </div>
                                        ) : (
                                            <div className="divide-y">
                                                {filteredProviders.map((proveedor) => (
                                                    <div
                                                        key={proveedor._id}
                                                        className={`p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between ${selectedProviderId === proveedor._id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                                                            }`}
                                                        onClick={() => setSelectedProviderId(proveedor._id)}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate">{proveedor.razon_social}</p>
                                                            <p className="text-sm text-gray-500">{proveedor.rfc}</p>
                                                            {proveedor.nombre_contacto && (
                                                                <p className="text-xs text-gray-400">{proveedor.nombre_contacto}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openProviderView(proveedor._id);
                                                                }}
                                                                className="p-1.5 hover:bg-gray-200 rounded"
                                                                title="Ver detalles"
                                                            >
                                                                <Eye className="h-4 w-4 text-gray-500" />
                                                            </button>
                                                            {canEditProvider(proveedor) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openProviderView(proveedor._id);
                                                                        setTimeout(() => setIsEditingProvider(true), 100);
                                                                    }}
                                                                    className="p-1.5 hover:bg-gray-200 rounded"
                                                                    title="Editar"
                                                                >
                                                                    <Edit2 className="h-4 w-4 text-gray-500" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleAssignProvider}
                                            disabled={!selectedProviderId || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Asignar
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Razón Social *</Label>
                                            <Input
                                                value={newProviderData.razon_social}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, razon_social: e.target.value }))}
                                                placeholder="Nombre de la empresa"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>RFC *</Label>
                                            <Input
                                                value={newProviderData.rfc}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, rfc: e.target.value }))}
                                                placeholder="RFC"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Dirección</Label>
                                        <Input
                                            value={newProviderData.direccion}
                                            onChange={(e) => setNewProviderData(prev => ({ ...prev, direccion: e.target.value }))}
                                            placeholder="Dirección"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Contacto</Label>
                                            <Input
                                                value={newProviderData.nombre_contacto}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, nombre_contacto: e.target.value }))}
                                                placeholder="Nombre del contacto"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Teléfono</Label>
                                            <Input
                                                value={newProviderData.telefono_contacto}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, telefono_contacto: e.target.value }))}
                                                placeholder="Teléfono"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label>Banco</Label>
                                            <Input
                                                value={newProviderData.banco}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, banco: e.target.value }))}
                                                placeholder="Banco"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Cuenta</Label>
                                            <Input
                                                value={newProviderData.cuenta}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, cuenta: e.target.value }))}
                                                placeholder="No. Cuenta"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>CLABE</Label>
                                            <Input
                                                value={newProviderData.clabe}
                                                onChange={(e) => setNewProviderData(prev => ({ ...prev, clabe: e.target.value }))}
                                                placeholder="CLABE"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            onClick={handleCreateProvider}
                                            disabled={!newProviderData.razon_social || !newProviderData.rfc || isSubmittingProvider}
                                        >
                                            {isSubmittingProvider && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Crear y Asignar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Requisicion Modal */}
            <RequisicionModal />
        </div>
    );
}
