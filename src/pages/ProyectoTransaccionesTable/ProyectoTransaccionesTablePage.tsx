import { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, FileText, Upload, RefreshCw, ArrowUp, ArrowDown, X, Filter, CalendarIcon, Eye, Layers, Files, UserCog, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import { useTransactionConceptosModal } from "@/hooks/transaction-conceptos-modal";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";

import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Popover } from "@radix-ui/react-popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { type DateRange } from "react-day-picker";
import AssignProviderDialog from "@/components/providers/AssignProviderDialog";

function searchDate(value: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default function ProyectoTransaccionesTablePage() {

    const uploadProjectTransactionsModal = useUploadProjectTransactionsModal();

    const { proyectoId } = useParams<{ proyectoId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialConcept = searchParams.get("concepto") || "";
    const initialStatus = searchParams.get("status") || "all";
    const initialCurrency = searchParams.get("moneda") || "all";
    const initialProvider = searchParams.get("proveedor") || "all";
    const initialFrom = searchDate(searchParams.get("desde"));
    const initialTo = searchDate(searchParams.get("hasta"));
    const [searchTerm, setSearchTerm] = useState(initialConcept);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [transactionToDelete, setTransactionToDelete] = useState<Id<"transacciones"> | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    
    // Advanced search filters
    const [minAmount, setMinAmount] = useState<string>("");
    const [maxAmount, setMaxAmount] = useState<string>("");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        initialFrom || initialTo ? { from: initialFrom, to: initialTo } : undefined
    );
    const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
    const [tipoPagoFilter, setTipoPagoFilter] = useState<string>("all");
    const [categoriaFilter, setCategoriaFilter] = useState<string>("all");
    const [monedaFilter, setMonedaFilter] = useState<string>(initialCurrency);
    const [proveedorFilter, setProveedorFilter] = useState<string>(initialProvider);
    const [assigningTransaction, setAssigningTransaction] = useState<{
        id: Id<"transacciones">;
        proveedorId?: Id<"proveedores">;
    } | null>(null);
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<Id<"transacciones">>>(new Set());
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [sortField, setSortField] = useState<"monto_total" | "fecha">("fecha");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(
        Boolean(initialConcept || initialFrom || initialTo || initialStatus !== "all" || initialCurrency !== "all" || initialProvider !== "all")
    );

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch transactions for this specific project with details
    const transacciones = useQuery(api.transacciones.getByProyectoWithDetails, proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip");
    const proveedores = useQuery(
        api.proveedores.getByProyectoWithStats,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    const deleteTransaction = useMutation(api.transacciones.deleteTransaction);
    const syncTransactionsWithDocuments = useMutation(api.sync.syncTransactionsWithDocuments);

    // Subscribe only to the stable actions. Subscribing this large table to the
    // complete modal stores caused every modal open/close to rerender all rows.
    const openDetailsModal = useTransactionDetailsModal((state) => state.onOpen);
    const openConceptosModal = useTransactionConceptosModal((state) => state.onOpen);
    const openDocumentosModal = useTransactionDocumentosModal((state) => state.onOpen);

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
    const filteredTransacciones = useMemo(() => {
        if (!transacciones) return [];
        
        const filtered = transacciones.filter((transaccion) => {
            // Text search (factura, codigo_referencia, tipo_pago)
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm || 
                transaccion.factura?.toLowerCase().includes(searchLower) ||
                transaccion.codigo_referencia?.toLowerCase().includes(searchLower) ||
                transaccion.tipo_pago?.toLowerCase().includes(searchLower) ||
                transaccion.categoria?.toLowerCase().includes(searchLower) ||
                transaccion.banco?.toLowerCase().includes(searchLower) ||
                transaccion.proveedor?.razon_social.toLowerCase().includes(searchLower) ||
                transaccion.costConcepts?.some((concepto) => concepto.toLowerCase().includes(searchLower));
            
            // Amount range filter
            const minAmt = minAmount ? parseFloat(minAmount) : null;
            const maxAmt = maxAmount ? parseFloat(maxAmount) : null;
            const matchesMinAmount = minAmt === null || transaccion.monto_total >= minAmt;
            const matchesMaxAmount = maxAmt === null || transaccion.monto_total <= maxAmt;
            
            // Date range filter
            const txDate = parseDateForSort(transaccion.fecha);
            const startDateTs = dateRange?.from ? dateRange.from.getTime() : null;
            const endDateTs = dateRange?.to ? dateRange.to.getTime() + 86400000 : null; // Add 1 day for inclusive end
            const matchesStartDate = startDateTs === null || txDate >= startDateTs;
            const matchesEndDate = endDateTs === null || txDate <= endDateTs;
            
            // Status filter
            const matchesStatus = statusFilter === "all" || transaccion.status === statusFilter;
            
            // Tipo pago filter
            const matchesTipoPago = tipoPagoFilter === "all" || transaccion.tipo_pago?.toLowerCase() === tipoPagoFilter.toLowerCase();
            
            // Categoria filter
            const matchesCategoria = categoriaFilter === "all" || transaccion.categoria?.toLowerCase() === categoriaFilter.toLowerCase();
            
            // Moneda filter
            const matchesMoneda = monedaFilter === "all" || transaccion.moneda === monedaFilter;
            const matchesProveedor = proveedorFilter === "all" ||
                (proveedorFilter === "unassigned" && !transaccion.proveedor_id) ||
                transaccion.proveedor_id === proveedorFilter;
            
            return matchesSearch && matchesMinAmount && matchesMaxAmount && 
                   matchesStartDate && matchesEndDate && matchesStatus && 
                   matchesTipoPago && matchesCategoria && matchesMoneda && matchesProveedor;
        });
        
        // Sort results
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortField === "monto_total") {
                comparison = a.monto_total - b.monto_total;
            } else if (sortField === "fecha") {
                comparison = parseDateForSort(a.fecha) - parseDateForSort(b.fecha);
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });
        
        return filtered;
    }, [transacciones, searchTerm, minAmount, maxAmount, dateRange, statusFilter, tipoPagoFilter, categoriaFilter, monedaFilter, proveedorFilter, sortField, sortDirection]);
    
    // Clear all filters
    const clearFilters = () => {
        setSearchTerm("");
        setMinAmount("");
        setMaxAmount("");
        setDateRange(undefined);
        setStatusFilter("all");
        setTipoPagoFilter("all");
        setCategoriaFilter("all");
        setMonedaFilter("all");
        setProveedorFilter("all");
        setSortField("fecha");
        setSortDirection("desc");
        setSearchParams({});
    };
    
    // Toggle sort
    const toggleSort = (field: "monto_total" | "fecha") => {
        if (sortField === field) {
            setSortDirection(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };
    
    // Check if any filter is active
    const hasActiveFilters = searchTerm || minAmount || maxAmount || dateRange?.from || dateRange?.to || 
        statusFilter !== "all" || tipoPagoFilter !== "all" || categoriaFilter !== "all" || monedaFilter !== "all" || proveedorFilter !== "all";


    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const handleDelete = async () => {
        if (!transactionToDelete) return;

        try {
            await deleteTransaction({ id: transactionToDelete });
            toast.success("Transacción eliminada", {
                description: "La transacción y sus conceptos han sido eliminados exitosamente.",
            });
            setDeleteDialogOpen(false);
            setTransactionToDelete(null);
        } catch (error) {
            console.error("Error deleting transaction:", error);
            toast.error("Error al eliminar", {
                description: error instanceof Error ? error.message : "No se pudo eliminar la transacción.",
            });
        }
    };

    const openDeleteDialog = (transactionId: Id<"transacciones">) => {
        setTransactionToDelete(transactionId);
        setDeleteDialogOpen(true);
    };

    const toggleSelectedTransaction = (transactionId: Id<"transacciones">, checked: boolean) => {
        setSelectedTransactionIds((current) => {
            const next = new Set(current);
            if (checked) next.add(transactionId);
            else next.delete(transactionId);
            return next;
        });
    };

    const visibleTransactionIds = filteredTransacciones.map((transaction) => transaction._id);
    const allVisibleSelected = visibleTransactionIds.length > 0 &&
        visibleTransactionIds.every((id) => selectedTransactionIds.has(id));
    const toggleAllVisible = (checked: boolean) => {
        setSelectedTransactionIds((current) => {
            const next = new Set(current);
            for (const id of visibleTransactionIds) {
                if (checked) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    };

    const handleSync = async () => {
        if (!proyectoId) return;

        setIsSyncing(true);
        try {
            const result = await syncTransactionsWithDocuments({
                proyecto_id: proyectoId as Id<"desarrollos">,
            });

            if (result.success) {
                const { summary } = result;
                toast.success("Sincronización completada", {
                    description: `${summary.matched} documentos vinculados, ${summary.alreadyLinked} ya estaban vinculados, ${summary.unmatched} sin coincidencias.`,
                    duration: 5000,
                });

                // Show detailed info if there are unmatched documents
                if (summary.unmatched > 0) {
                    const unmatchedDocs = result.details
                        .filter(d => d.action === "no_match")
                        .slice(0, 5)
                        .map(d => d.documentoNombre)
                        .join(", ");

                    toast.info("Documentos sin coincidencias", {
                        description: `${unmatchedDocs}${summary.unmatched > 5 ? ` y ${summary.unmatched - 5} más...` : ""}`,
                        duration: 5000,
                    });
                }
            } else {
                toast.error("Error en la sincronización", {
                    description: "No se pudieron sincronizar los documentos.",
                });
            }
        } catch (error) {
            console.error("Error syncing:", error);
            toast.error("Error al sincronizar", {
                description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
            });
        } finally {
            setIsSyncing(false);
        }
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
                            <p className="text-sm text-gray-500 mb-1">Transacciones</p>
                            <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => uploadProjectTransactionsModal.onOpen(proyectoId as Id<"desarrollos">, proyecto.nombre)}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none text-gray-500 py-6"
                            >
                                Subir Transacciones
                                <Upload className="h-6 w-6 rounded-full shadow-none" />
                            </Button>
                            <Button
                                onClick={handleSync}
                                disabled={isSyncing}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none py-6  text-gray-500"
                            >
                                {isSyncing ? "Sincronizando..." : "Sincronizar Docs"}
                                <RefreshCw className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
                            </Button>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100">
                                <span className="text-sm font-normal">
                                    Total: {transacciones?.length || 0}
                                </span>
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100  ">
                                <span className="text-sm font-normal">
                                    Monto total: {formatCurrency(
                                        transacciones?.reduce((sum, t) => sum + t.monto_total, 0) || 0
                                    )}
                                </span>
                            </Badge>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                        <Input
                            type="text"
                            placeholder="Buscar por factura, código, tipo de pago, categoría, banco..."
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
                            <div className="grid grid-cols-4 gap-4">
                                {/* Amount Range */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Monto mínimo</label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={minAmount}
                                        onChange={(e) => setMinAmount(e.target.value)}
                                        className="rounded-none h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Monto máximo</label>
                                    <Input
                                        type="number"
                                        placeholder="999999.99"
                                        value={maxAmount}
                                        onChange={(e) => setMaxAmount(e.target.value)}
                                        className="rounded-none h-10"
                                    />
                                </div>
                                
                                {/* Date Range */}
                                <div className="space-y-2 col-span-2">
                                    <label className="text-sm font-medium text-gray-700">Rango de fechas</label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className="w-full justify-start text-left font-normal rounded-none h-10"
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRange?.from ? (
                                                    dateRange.to ? (
                                                        <>
                                                            {format(dateRange.from, "dd MMM yyyy", { locale: es })} - {format(dateRange.to, "dd MMM yyyy", { locale: es })}
                                                        </>
                                                    ) : (
                                                        format(dateRange.from, "dd MMM yyyy", { locale: es })
                                                    )
                                                ) : (
                                                    "Seleccionar rango"
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="range"
                                                defaultMonth={dateRange?.from}
                                                selected={dateRange}
                                                onSelect={setDateRange}
                                                numberOfMonths={2}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-4">
                                {/* Status Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Estado</label>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="Pagado">Pagado</SelectItem>
                                            <SelectItem value="Por pagar">Por pagar</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                {/* Tipo Pago Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Tipo de pago</label>
                                    <Select value={tipoPagoFilter} onValueChange={setTipoPagoFilter}>
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="efectivo">Efectivo</SelectItem>
                                            <SelectItem value="transferencia">Transferencia</SelectItem>
                                            <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                            <SelectItem value="cheque">Cheque</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                {/* Categoria Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Categoría</label>
                                    <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            <SelectItem value="anticipo">Anticipo</SelectItem>
                                            <SelectItem value="material">Material</SelectItem>
                                            <SelectItem value="estimacion">Estimación</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                {/* Moneda Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Moneda</label>
                                    <Select value={monedaFilter} onValueChange={setMonedaFilter}>
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            <SelectItem value="MXN">MXN</SelectItem>
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="EUR">EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="max-w-sm space-y-2">
                                <label className="text-sm font-medium text-gray-700">Proveedor</label>
                                <Select value={proveedorFilter} onValueChange={setProveedorFilter}>
                                    <SelectTrigger className="rounded-none h-10">
                                        <SelectValue placeholder="Todos los proveedores" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los proveedores</SelectItem>
                                        <SelectItem value="unassigned">Sin proveedor</SelectItem>
                                        {proveedores?.map((provider) => (
                                            <SelectItem key={provider._id} value={provider._id}>
                                                {provider.razon_social}{provider.is_archived ? " (Archivado)" : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            {/* Sort Controls */}
                            <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
                                <span className="text-sm font-medium text-gray-700">Ordenar por:</span>
                                <Button
                                    variant={sortField === "fecha" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSort("fecha")}
                                    className="rounded-none"
                                >
                                    Fecha
                                    {sortField === "fecha" && (
                                        sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                    )}
                                </Button>
                                <Button
                                    variant={sortField === "monto_total" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSort("monto_total")}
                                    className="rounded-none"
                                >
                                    Monto
                                    {sortField === "monto_total" && (
                                        sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                    )}
                                </Button>
                                <span className="text-sm text-gray-500 ml-auto">
                                    {filteredTransacciones.length} de {transacciones?.length || 0} transacciones
                                </span>
                            </div>
                        </div>
                    )}
                    {selectedTransactionIds.size > 0 && (
                        <div className="mb-4 flex items-center justify-between border bg-gray-50 px-4 py-3">
                            <span className="text-sm text-gray-600">
                                {selectedTransactionIds.size} transacciones seleccionadas
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setSelectedTransactionIds(new Set())}>
                                    Limpiar
                                </Button>
                                <Button size="sm" onClick={() => setBulkAssignOpen(true)}>
                                    Asignar proveedor
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Table */}
                <div className="border border-gray-200 rounded-none">
                    <table className="w-full">
                        <thead className="border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-4 text-center border-r border-gray-200">
                                    <Checkbox
                                        aria-label="Seleccionar transacciones visibles"
                                        checked={allVisibleSelected}
                                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                                    />
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Factura
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Proveedor
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Monto Total
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Fecha
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Tipo de Pago
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Status
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Moneda
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500 border-r border-gray-200">
                                    Docs
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-500"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {!transacciones ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                                        Cargando transacciones...
                                    </td>
                                </tr>
                            ) : filteredTransacciones && filteredTransacciones.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                                        No se encontraron transacciones
                                    </td>
                                </tr>
                            ) : (
                                filteredTransacciones?.map((transaccion) => (
                                    <tr
                                        key={transaccion._id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="px-4 py-4 text-center border-r border-gray-200">
                                            <Checkbox
                                                aria-label={`Seleccionar transacción ${transaccion.factura || transaccion._id}`}
                                                checked={selectedTransactionIds.has(transaccion._id)}
                                                onCheckedChange={(checked) => toggleSelectedTransaction(transaccion._id, checked === true)}
                                            />
                                        </td>
                                        {/* Factura */}
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <div className="flex items-start gap-2">
                                                <FileText className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                                <div className="flex flex-col">
                                                    <span className="text-sm text-gray-900 font-medium">
                                                        {transaccion.factura || "-"}
                                                    </span>
                                                    {transaccion.fecha && (
                                                        <span className="text-xs text-gray-400">
                                                            Subido el {(() => {
                                                                const parts = transaccion.fecha.split("/");
                                                                if (parts.length === 3) {
                                                                    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                                                                    return `${parts[0]} de ${months[parseInt(parts[1], 10) - 1]} de ${parts[2]}`;
                                                                }
                                                                return transaccion.fecha;
                                                            })()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        {/* Proveedor */}
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <button
                                                type="button"
                                                className="text-left"
                                                onClick={() => setAssigningTransaction({
                                                    id: transaccion._id,
                                                    proveedorId: transaccion.proveedor_id,
                                                })}
                                            >
                                                <span className="block text-sm font-medium text-gray-900">
                                                    {transaccion.proveedor?.razon_social || "Sin proveedor"}
                                                </span>
                                                {transaccion.proveedor && (
                                                    <span className="block text-xs text-gray-400">
                                                        {transaccion.proveedor.is_archived
                                                            ? "Archivado"
                                                            : transaccion.proveedor.tipo === "generico"
                                                            ? "Genérico"
                                                            : transaccion.proveedor.is_complete ? "Completo" : "Incompleto"}
                                                    </span>
                                                )}
                                            </button>
                                        </td>
                                        {/* Monto Total */}
                                        <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                                            {formatCurrency(transaccion.monto_total)} {transaccion.moneda || "MXN"}
                                        </td>
                                        {/* Fecha */}
                                        <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                                            {transaccion.fecha
                                                ? new Date(transaccion.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                })
                                                : "-"}
                                        </td>
                                        {/* Tipo de Pago */}
                                        <td className="px-6 py-4 text-sm text-gray-900 uppercase border-r border-gray-200">
                                            {transaccion.tipo_pago || "-"}
                                        </td>
                                        {/* Status */}
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <span className={`text-sm font-medium uppercase ${
                                                transaccion.status === "Pagado" ? "text-green-600" : 
                                                transaccion.status === "Por pagar" ? "text-orange-600" : "text-gray-600"
                                            }`}>
                                                {transaccion.status || "-"}
                                            </span>
                                        </td>
                                        {/* Moneda */}
                                        <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                                            {transaccion.moneda || "MXN"}
                                        </td>
                                        {/* Docs */}
                                        <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                                            {transaccion.documentsCount ?? 0}
                                        </td>
                                        {/* Actions */}
                                        <td className="px-6 py-4">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-none"
                                                        aria-label={`Acciones para ${transaccion.factura || "la transacción"}`}
                                                    >
                                                        <MoreVertical className="h-4 w-4 text-gray-500" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-64 rounded-none">
                                                    <DropdownMenuItem onClick={() => openDetailsModal(transaccion._id)}>
                                                        <Eye className="h-4 w-4" />
                                                        Ver detalles
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openConceptosModal(transaccion._id)}>
                                                        <Layers className="h-4 w-4" />
                                                        Ver conceptos
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openDocumentosModal(transaccion._id)}>
                                                        <Files className="h-4 w-4" />
                                                        Ver documentos
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setAssigningTransaction({
                                                        id: transaccion._id,
                                                        proveedorId: transaccion.proveedor_id,
                                                    })}>
                                                        <UserCog className="h-4 w-4" />
                                                        Asignar / cambiar proveedor
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-red-600 focus:text-red-700"
                                                        onClick={() => openDeleteDialog(transaccion._id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
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
                        <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará la transacción, todos sus conceptos (line items)
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
            <AssignProviderDialog
                open={Boolean(assigningTransaction)}
                onOpenChange={(open) => !open && setAssigningTransaction(null)}
                transactionId={assigningTransaction?.id || null}
                currentProviderId={assigningTransaction?.proveedorId}
            />
            <AssignProviderDialog
                open={bulkAssignOpen}
                onOpenChange={(open) => {
                    setBulkAssignOpen(open);
                    if (!open) setSelectedTransactionIds(new Set());
                }}
                transactionId={null}
                transactionIds={[...selectedTransactionIds]}
            />
        </div>
    );
}
