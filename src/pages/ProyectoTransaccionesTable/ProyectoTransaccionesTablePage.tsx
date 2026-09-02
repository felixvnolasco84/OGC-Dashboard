import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, FileText, Upload, RefreshCw, ArrowUp, ArrowDown, X, Filter, CalendarIcon, Eye, Files, UserCog, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableColumnPicker } from "@/components/Tables/TableColumnPicker";
import { useOptionalTableColumns } from "@/hooks/use-optional-table-columns";
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
import { InvoiceBackfillDialog } from "@/components/invoices/InvoiceBackfillDialog";
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
import { cn } from "@/lib/utils";

function searchDate(value: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatTransactionDate(value: string) {
    const parts = value.split("/").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value;
    const [day, month, year] = parts;
    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(year, month - 1, day));
}

const PAGE_SIZE_OPTIONS = [25, 50] as const;
const DEFAULT_PAGE_SIZE = 25;

function parseOptionalAmount(value: string) {
    if (!value.trim()) return undefined;
    const amount = Number.parseFloat(value);
    return Number.isFinite(amount) ? amount : undefined;
}

function getPaginationPages(page: number, totalPages: number) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages: Array<number | "ellipsis"> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) pages.push("ellipsis");
    for (let item = start; item <= end; item += 1) {
        pages.push(item);
    }
    if (end < totalPages - 1) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
}

function pendingChipClass(active: boolean) {
    return cn(
        "inline-flex items-center gap-2 rounded-none border px-3 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
        active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-foreground hover:bg-muted",
    );
}

function pendingHeaderCountClass(active: boolean) {
    return cn(
        "ml-2 inline-flex min-w-6 items-center justify-center rounded-none border px-1.5 py-0.5 text-xs font-medium transition-colors",
        active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-muted text-subtle-foreground hover:bg-background hover:text-foreground",
    );
}

function getSelectionScopeKey(parts: Array<string | number | undefined | null>) {
    return parts.map((part) => (part == null ? "" : String(part))).join("\0");
}

const EXTRA_COLUMNS = [
    { id: "tipoPago", label: "Tipo de pago" },
    { id: "moneda", label: "Moneda" },
    { id: "documentos", label: "Documentos" },
] as const;

export default function ProyectoTransaccionesTablePage() {

    const uploadProjectTransactionsModal = useUploadProjectTransactionsModal();

    const { proyectoId } = useParams<{ proyectoId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialConcept = searchParams.get("concepto") || searchParams.get("factura") || searchParams.get("categoria_factura") || "";
    const initialStatus = searchParams.get("status") || "all";
    const initialCurrency = searchParams.get("moneda") || "all";
    const initialProvider = searchParams.get("proveedor") || "all";
    const initialDocuments = searchParams.get("documentos") === "sin"
        ? "missing"
        : searchParams.get("documentos") === "con" ? "with" : "all";
    const initialFrom = searchDate(searchParams.get("desde"));
    const initialTo = searchDate(searchParams.get("hasta"));
    const initialInvoiceFrom = searchDate(searchParams.get("fecha_factura_desde"));
    const initialInvoiceTo = searchDate(searchParams.get("fecha_factura_hasta"));
    const [searchTerm, setSearchTerm] = useState(initialConcept);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const isDeletingRef = useRef(false);
    const [transactionToDelete, setTransactionToDelete] = useState<{
        id: Id<"transacciones">;
        factura?: string;
        montoTotal: number;
        moneda?: string;
        proveedorNombre: string;
    } | null>(null);
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
    const [documentosFilter, setDocumentosFilter] = useState<"all" | "missing" | "with">(initialDocuments);
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<Id<"transacciones">>>(new Set());
    const [selectFilteredPending, setSelectFilteredPending] = useState(false);
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [bulkAssignConfirmOpen, setBulkAssignConfirmOpen] = useState(false);
    const [selectionScopeKey, setSelectionScopeKey] = useState(() => getSelectionScopeKey([
        proyectoId,
        initialConcept,
        "",
        "",
        initialFrom?.getTime(),
        initialTo?.getTime(),
        initialInvoiceFrom?.getTime(),
        initialInvoiceTo?.getTime(),
        initialStatus,
        "all",
        "all",
        initialCurrency,
        initialProvider,
        initialDocuments,
    ]));
    const [sortField, setSortField] = useState<"monto_total" | "fecha">("fecha");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
    const [debouncedSearch, setDebouncedSearch] = useState(initialConcept);
    const [showFilters, setShowFilters] = useState(
        Boolean(initialConcept || initialFrom || initialTo || initialInvoiceFrom || initialInvoiceTo || initialStatus !== "all" || initialCurrency !== "all" || initialProvider !== "all" || initialDocuments !== "all")
    );
    const extraColumns = useOptionalTableColumns(EXTRA_COLUMNS);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => window.clearTimeout(timeout);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, minAmount, maxAmount, dateRange?.from, dateRange?.to, statusFilter, tipoPagoFilter, categoriaFilter, monedaFilter, proveedorFilter, documentosFilter, sortField, sortDirection, pageSize]);

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    const transactionTotals = useQuery(
        api.transacciones.getTotalsByProyecto,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );
    const tableFilters = useMemo(() => {
        if (!proyectoId) return null;
        return {
            proyecto_id: proyectoId as Id<"desarrollos">,
            search: debouncedSearch.trim() || undefined,
            minAmount: parseOptionalAmount(minAmount),
            maxAmount: parseOptionalAmount(maxAmount),
            dateFrom: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
            dateTo: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
            invoiceDateFrom: initialInvoiceFrom ? format(initialInvoiceFrom, "yyyy-MM-dd") : undefined,
            invoiceDateTo: initialInvoiceTo ? format(initialInvoiceTo, "yyyy-MM-dd") : undefined,
            status: statusFilter === "all" ? undefined : statusFilter,
            tipoPago: tipoPagoFilter === "all" ? undefined : tipoPagoFilter,
            categoria: categoriaFilter === "all" ? undefined : categoriaFilter,
            moneda: monedaFilter === "all" ? undefined : monedaFilter,
            proveedorId: proveedorFilter === "all" ? undefined : proveedorFilter,
            missingDocuments: documentosFilter === "missing"
                ? true
                : documentosFilter === "with" ? false : undefined,
        };
    }, [
        proyectoId,
        debouncedSearch,
        minAmount,
        maxAmount,
        dateRange?.from,
        dateRange?.to,
        initialInvoiceFrom,
        initialInvoiceTo,
        statusFilter,
        tipoPagoFilter,
        categoriaFilter,
        monedaFilter,
        proveedorFilter,
        documentosFilter,
    ]);

    const transaccionesPage = useQuery(
        api.transacciones.listTableByProyecto,
        tableFilters
            ? {
                ...tableFilters,
                page,
                pageSize,
                sortField,
                sortDirection,
            }
            : "skip"
    );
    const filteredTransactionIds = useQuery(
        api.transacciones.listTableIdsByProyecto,
        selectFilteredPending && tableFilters ? tableFilters : "skip"
    );
    const proveedores = useQuery(
        api.proveedores.getByProyectoWithStats,
        proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    const deleteTransaction = useMutation(api.transacciones.deleteTransaction);
    const syncTransactionsWithDocuments = useMutation(api.sync.syncTransactionsWithDocuments);

    // Subscribe only to the stable actions. Subscribing this large table to the
    // complete modal stores caused every modal open/close to rerender all rows.
    const openDetailsModal = useTransactionDetailsModal((state) => state.onOpen);

    const transacciones = transaccionesPage?.items ?? [];
    const matchedCount = transaccionesPage?.total ?? 0;
    const currentPage = transaccionesPage?.page ?? page;
    const currentPageSize = transaccionesPage?.pageSize ?? pageSize;
    const totalPages = transaccionesPage?.totalPages ?? 1;
    const missingProviderActive = proveedorFilter === "unassigned";
    const missingDocumentsActive = documentosFilter === "missing";
    const withoutProviderCount = transactionTotals?.withoutProvider ?? 0;
    const withoutDocumentsCount = transactionTotals?.withoutDocuments ?? 0;

    const nextSelectionScopeKey = getSelectionScopeKey([
        proyectoId,
        debouncedSearch,
        minAmount,
        maxAmount,
        dateRange?.from?.getTime(),
        dateRange?.to?.getTime(),
        initialInvoiceFrom?.getTime(),
        initialInvoiceTo?.getTime(),
        statusFilter,
        tipoPagoFilter,
        categoriaFilter,
        monedaFilter,
        proveedorFilter,
        documentosFilter,
    ]);
    if (selectionScopeKey !== nextSelectionScopeKey) {
        setSelectionScopeKey(nextSelectionScopeKey);
        setSelectedTransactionIds(new Set());
        setSelectFilteredPending(false);
        setBulkAssignOpen(false);
        setBulkAssignConfirmOpen(false);
    }

    useEffect(() => {
        if (!selectFilteredPending || filteredTransactionIds === undefined) return;
        setSelectedTransactionIds(new Set(filteredTransactionIds));
        setSelectFilteredPending(false);
    }, [selectFilteredPending, filteredTransactionIds]);

    // Clear all filters
    const clearFilters = () => {
        setSearchTerm("");
        setDebouncedSearch("");
        setMinAmount("");
        setMaxAmount("");
        setDateRange(undefined);
        setStatusFilter("all");
        setTipoPagoFilter("all");
        setCategoriaFilter("all");
        setMonedaFilter("all");
        setProveedorFilter("all");
        setDocumentosFilter("all");
        setSortField("fecha");
        setSortDirection("desc");
        setPage(1);
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
    const hasActiveFilters = Boolean(
        searchTerm || minAmount || maxAmount || dateRange?.from || dateRange?.to ||
        initialInvoiceFrom || initialInvoiceTo ||
        statusFilter !== "all" || tipoPagoFilter !== "all" || categoriaFilter !== "all" ||
        monedaFilter !== "all" || proveedorFilter !== "all" || documentosFilter !== "all"
    );

    const toggleMissingProviderFilter = () => {
        const next = missingProviderActive ? "all" : "unassigned";
        setProveedorFilter(next);
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (next === "unassigned") params.set("proveedor", "unassigned");
            else if (params.get("proveedor") === "unassigned") params.delete("proveedor");
            return params;
        }, { replace: true });
    };

    const toggleMissingDocumentsFilter = () => {
        const next = missingDocumentsActive ? "all" : "missing";
        setDocumentosFilter(next);
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (next === "missing") params.set("documentos", "sin");
            else params.delete("documentos");
            return params;
        }, { replace: true });
    };


    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const handleDelete = async () => {
        if (!transactionToDelete || isDeletingRef.current) return;

        isDeletingRef.current = true;
        setIsDeleting(true);
        try {
            await deleteTransaction({ id: transactionToDelete.id });
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
        } finally {
            isDeletingRef.current = false;
            setIsDeleting(false);
        }
    };

    const openDeleteDialog = (transaccion: {
        _id: Id<"transacciones">;
        factura?: string;
        monto_total: number;
        moneda?: string;
        proveedor?: { razon_social: string } | null;
    }) => {
        setTransactionToDelete({
            id: transaccion._id,
            factura: transaccion.factura,
            montoTotal: transaccion.monto_total,
            moneda: transaccion.moneda,
            proveedorNombre: transaccion.proveedor?.razon_social || "Sin proveedor",
        });
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

    const visibleTransactionIds = transacciones.map((transaction) => transaction._id);
    const visibleSelectedCount = visibleTransactionIds.filter((id) => selectedTransactionIds.has(id)).length;
    const hiddenSelectedCount = selectedTransactionIds.size - visibleSelectedCount;
    const allVisibleSelected = visibleTransactionIds.length > 0 &&
        visibleTransactionIds.every((id) => selectedTransactionIds.has(id));
    const tableColSpan = 7 + extraColumns.visibleCount;
    const allFilteredSelected = hasActiveFilters && matchedCount > 0 && selectedTransactionIds.size === matchedCount;
    const showSelectAllFiltered = hasActiveFilters &&
        allVisibleSelected &&
        !allFilteredSelected &&
        matchedCount > visibleTransactionIds.length;
    const toggleAllVisible = (checked: boolean) => {
        if (!checked && allFilteredSelected) {
            setSelectedTransactionIds(new Set());
            return;
        }
        setSelectedTransactionIds((current) => {
            const next = new Set(current);
            for (const id of visibleTransactionIds) {
                if (checked) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    };

    const handleBulkAssignClick = () => {
        if (hiddenSelectedCount > 0) {
            setBulkAssignConfirmOpen(true);
            return;
        }
        setBulkAssignOpen(true);
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
            <div className="bg-card min-h-screen flex items-center justify-center">
                <p className="text-subtle-foreground">Cargando...</p>
            </div>
        );
    }




    return (
        <div className="flex h-[calc(100dvh-2.5rem)] flex-col bg-card">
            <div className="max-w-full mx-auto flex min-h-0 w-full flex-1 flex-col text-left">
                <div className="flex shrink-0 flex-col gap-4 px-4 pt-6 sm:px-6 lg:px-8">
                    <div className="mb-2 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm text-subtle-foreground mb-1">Transacciones</p>
                            <h1 className="break-words text-2xl text-foreground">{proyecto.nombre}</h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <InvoiceBackfillDialog projectId={proyectoId as Id<"desarrollos">} />
                            <Button
                                onClick={() => uploadProjectTransactionsModal.onOpen(proyectoId as Id<"desarrollos">, proyecto.nombre)}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none text-subtle-foreground py-6"
                            >
                                Subir Transacciones
                                <Upload className="h-6 w-6 rounded-full shadow-none" />
                            </Button>
                            <Button
                                onClick={handleSync}
                                disabled={isSyncing}
                                variant="outline"
                                size="lg"
                                className="flex items-center gap-2 rounded-none py-6  text-subtle-foreground"
                            >
                                {isSyncing ? "Sincronizando..." : "Sincronizar Docs"}
                                <RefreshCw className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
                            </Button>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                                <span className="text-sm font-normal">
                                    Total: {transactionTotals?.count ?? 0}
                                </span>
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                                <span className="text-sm font-normal">
                                    Monto total: {formatCurrency(transactionTotals?.amount ?? 0)}
                                </span>
                            </Badge>
                        </div>
                    </div>

                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-subtle-foreground">Pendientes</span>
                        <button
                            type="button"
                            aria-pressed={missingProviderActive}
                            onClick={toggleMissingProviderFilter}
                            disabled={!missingProviderActive && withoutProviderCount === 0 && transactionTotals != null}
                            className={pendingChipClass(missingProviderActive)}
                        >
                            <UserCog className="h-4 w-4" />
                            <span className="font-medium">{transactionTotals ? withoutProviderCount : "—"}</span>
                            sin proveedor
                        </button>
                        <button
                            type="button"
                            aria-pressed={missingDocumentsActive}
                            onClick={toggleMissingDocumentsFilter}
                            disabled={!missingDocumentsActive && withoutDocumentsCount === 0 && transactionTotals != null}
                            className={pendingChipClass(missingDocumentsActive)}
                        >
                            <Files className="h-4 w-4" />
                            <span className="font-medium">{transactionTotals ? withoutDocumentsCount : "—"}</span>
                            sin documentos
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative min-w-0 flex-1">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-disabled-foreground h-5 w-5" />
                            <Input
                                type="text"
                                placeholder="Buscar por factura, código, tipo de pago, categoría, banco..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-12 pr-24 rounded-none border-border-strong h-12"
                            />
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-2">
                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="h-8 px-2 text-subtle-foreground hover:text-foreground"
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
                        <TableColumnPicker
                            columns={EXTRA_COLUMNS}
                            isVisible={extraColumns.isVisible}
                            onToggle={extraColumns.toggle}
                            className="h-12"
                        />
                    </div>
                    
                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <div className="mb-6 p-4 border border-border bg-background space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {/* Amount Range */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Monto mínimo</label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={minAmount}
                                        onChange={(e) => setMinAmount(e.target.value)}
                                        className="rounded-none h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Monto máximo</label>
                                    <Input
                                        type="number"
                                        placeholder="999999.99"
                                        value={maxAmount}
                                        onChange={(e) => setMaxAmount(e.target.value)}
                                        className="rounded-none h-10"
                                    />
                                </div>
                                
                                {/* Date Range */}
                                <div className="space-y-2 sm:col-span-2">
                                    <label className="text-sm font-medium text-foreground">Rango de fechas</label>
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
                            
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {/* Status Filter */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Estado</label>
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
                                    <label className="text-sm font-medium text-foreground">Tipo de pago</label>
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
                                    <label className="text-sm font-medium text-foreground">Categoría</label>
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
                                    <label className="text-sm font-medium text-foreground">Moneda</label>
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

                            <div className="grid grid-cols-2 gap-4 max-w-2xl">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Proveedor</label>
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
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Documentos</label>
                                    <Select
                                        value={documentosFilter}
                                        onValueChange={(value) => {
                                            const next = value as "all" | "missing" | "with";
                                            setDocumentosFilter(next);
                                            setSearchParams((prev) => {
                                                const params = new URLSearchParams(prev);
                                                if (next === "missing") params.set("documentos", "sin");
                                                else if (next === "with") params.set("documentos", "con");
                                                else params.delete("documentos");
                                                return params;
                                            }, { replace: true });
                                        }}
                                    >
                                        <SelectTrigger className="rounded-none h-10">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="with">Con documentos</SelectItem>
                                            <SelectItem value="missing">Sin documentos</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            {/* Sort Controls */}
                            <div className="flex items-center gap-4 pt-2 border-t border-border">
                                <span className="text-sm font-medium text-foreground">Ordenar por:</span>
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
                                <span className="text-sm text-subtle-foreground ml-auto">
                                    {matchedCount} de {transactionTotals?.count ?? 0} transacciones
                                    {hasActiveFilters && transaccionesPage ? ` · ${formatCurrency(transaccionesPage.matchedAmount)}` : ""}
                                </span>
                            </div>
                        </div>
                    )}
                    {selectedTransactionIds.size > 0 && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border bg-background px-4 py-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-sm text-muted-foreground">
                                    {allFilteredSelected
                                        ? `${selectedTransactionIds.size} transacciones de este filtro seleccionadas`
                                        : `${selectedTransactionIds.size} transacción${selectedTransactionIds.size === 1 ? "" : "es"} seleccionada${selectedTransactionIds.size === 1 ? "" : "s"}`}
                                    {hiddenSelectedCount > 0
                                        ? ` · ${hiddenSelectedCount} selección${hiddenSelectedCount === 1 ? "" : "es"} oculta${hiddenSelectedCount === 1 ? "" : "s"}`
                                        : ""}
                                </span>
                                {hiddenSelectedCount > 0 && (
                                    <span className="text-xs text-subtle-foreground">
                                        {hiddenSelectedCount === 1
                                            ? "No está visible en esta página. Al asignar proveedor también se incluirá ese registro."
                                            : "No están visibles en esta página. Al asignar proveedor también se incluirán esos registros."}
                                    </span>
                                )}
                                {showSelectAllFiltered && (
                                    <button
                                        type="button"
                                        className="text-left text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
                                        onClick={() => setSelectFilteredPending(true)}
                                        disabled={selectFilteredPending}
                                    >
                                        {selectFilteredPending
                                            ? "Seleccionando resultados filtrados..."
                                            : `Seleccionar las ${matchedCount} de este filtro`}
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSelectedTransactionIds(new Set());
                                        setBulkAssignConfirmOpen(false);
                                    }}
                                >
                                    Limpiar
                                </Button>
                                <Button size="sm" onClick={handleBulkAssignClick}>
                                    Asignar proveedor
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Table */}
                <div className="min-h-0 flex-1 overflow-auto border-y border-border">
                    <table
                        className={cn(
                            "w-full border-separate border-spacing-0",
                            extraColumns.visibleCount > 0 ? "min-w-[80rem]" : "min-w-[56rem]",
                        )}
                    >
                        <thead className="sticky top-0 z-20 bg-card">
                            <tr>
                                <th className="sticky left-0 z-30 w-12 min-w-12 bg-card px-4 py-4 text-center border-b border-r border-border">
                                    <Checkbox
                                        aria-label={allFilteredSelected ? "Quitar selección de este filtro" : "Seleccionar transacciones visibles"}
                                        checked={allVisibleSelected}
                                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                                    />
                                </th>
                                <th className="sticky left-12 z-30 min-w-56 w-56 bg-card px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                    Factura
                                </th>
                                <th className="min-w-44 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                    <span className="inline-flex items-center">
                                        Proveedor
                                        {withoutProviderCount > 0 && (
                                            <button
                                                type="button"
                                                title="Filtrar sin proveedor"
                                                aria-pressed={missingProviderActive}
                                                onClick={toggleMissingProviderFilter}
                                                className={pendingHeaderCountClass(missingProviderActive)}
                                            >
                                                {withoutProviderCount}
                                            </button>
                                        )}
                                    </span>
                                </th>
                                <th className="min-w-32 whitespace-nowrap px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                    Monto Total
                                </th>
                                <th className="min-w-28 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                    Fecha
                                </th>
                                {extraColumns.isVisible("tipoPago") && (
                                    <th className="min-w-32 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                        Tipo de Pago
                                    </th>
                                )}
                                <th className="min-w-28 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                    Status
                                </th>
                                {extraColumns.isVisible("moneda") && (
                                    <th className="min-w-24 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                        Moneda
                                    </th>
                                )}
                                {extraColumns.isVisible("documentos") && (
                                    <th className="min-w-32 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-r border-border">
                                        <span className="inline-flex items-center">
                                            Documentos
                                            {withoutDocumentsCount > 0 && (
                                                <button
                                                    type="button"
                                                    title="Filtrar sin documentos"
                                                    aria-pressed={missingDocumentsActive}
                                                    onClick={toggleMissingDocumentsFilter}
                                                    className={pendingHeaderCountClass(missingDocumentsActive)}
                                                >
                                                    {withoutDocumentsCount}
                                                </button>
                                            )}
                                        </span>
                                    </th>
                                )}
                                <th className="w-14 min-w-14 px-6 py-4 text-left text-sm font-normal text-subtle-foreground border-b border-border"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!transaccionesPage ? (
                                <tr>
                                    <td colSpan={tableColSpan} className="px-6 py-12 text-center text-subtle-foreground">
                                        Cargando transacciones...
                                    </td>
                                </tr>
                            ) : transacciones.length === 0 ? (
                                <tr>
                                    <td colSpan={tableColSpan} className="px-6 py-12 text-center text-subtle-foreground">
                                        No se encontraron transacciones
                                    </td>
                                </tr>
                            ) : (
                                transacciones.map((transaccion) => (
                                    <tr
                                        key={transaccion._id}
                                        className="group hover:bg-background transition-colors"
                                    >
                                        <td className="sticky left-0 z-10 w-12 min-w-12 bg-card px-4 py-4 text-center border-b border-r border-border group-hover:bg-background">
                                            <Checkbox
                                                aria-label={`Seleccionar transacción ${transaccion.factura || transaccion._id}`}
                                                checked={selectedTransactionIds.has(transaccion._id)}
                                                onCheckedChange={(checked) => toggleSelectedTransaction(transaccion._id, checked === true)}
                                            />
                                        </td>
                                        <td className="sticky left-12 z-10 min-w-56 w-56 bg-card px-6 py-4 border-b border-r border-border group-hover:bg-background">
                                            {transaccion.factura ? (
                                                <button
                                                    type="button"
                                                    className="flex min-w-0 items-start gap-2 text-left text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                    onClick={() => openDetailsModal(transaccion._id)}
                                                    aria-label={`Ver detalle de la factura ${transaccion.factura}`}
                                                >
                                                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-disabled-foreground" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-medium">
                                                            {transaccion.factura}
                                                        </span>
                                                        {transaccion.fecha && (
                                                            <span className="block truncate text-xs text-disabled-foreground no-underline">
                                                                {formatTransactionDate(transaccion.fecha)}
                                                            </span>
                                                        )}
                                                    </span>
                                                </button>
                                            ) : (
                                                <span className="text-sm text-disabled-foreground">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 border-b border-r border-border">
                                            <div className="text-left">
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {transaccion.proveedor?.razon_social || "Sin proveedor"}
                                                </span>
                                                {transaccion.proveedor && (
                                                    <span className="block text-xs text-disabled-foreground">
                                                        {transaccion.proveedor.is_archived
                                                            ? "Archivado"
                                                            : transaccion.proveedor.tipo === "generico"
                                                            ? "Genérico"
                                                            : transaccion.proveedor.is_complete ? "Completo" : "Incompleto"}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground border-b border-r border-border">
                                            {formatCurrency(transaccion.monto_total)} {transaccion.moneda || "MXN"}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-foreground border-b border-r border-border">
                                            {transaccion.fecha ? formatTransactionDate(transaccion.fecha) : "-"}
                                        </td>
                                        {extraColumns.isVisible("tipoPago") && (
                                            <td className="px-6 py-4 text-sm text-foreground uppercase border-b border-r border-border">
                                                {transaccion.tipo_pago || "-"}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 border-b border-r border-border">
                                            <span className={`text-sm font-medium uppercase ${
                                                transaccion.status === "Pagado" ? "text-green-600" :
                                                transaccion.status === "Por pagar" ? "text-orange-600" : "text-muted-foreground"
                                            }`}>
                                                {transaccion.status || "-"}
                                            </span>
                                        </td>
                                        {extraColumns.isVisible("moneda") && (
                                            <td className="px-6 py-4 text-sm text-foreground border-b border-r border-border">
                                                {transaccion.moneda || "MXN"}
                                            </td>
                                        )}
                                        {extraColumns.isVisible("documentos") && (
                                            <td className="px-6 py-4 text-sm border-b border-r border-border">
                                                {(transaccion.documentsCount ?? 0) > 0 ? (
                                                    transaccion.documentsCount
                                                ) : (
                                                    <span className="text-subtle-foreground">Sin docs</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 border-b border-border">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-none"
                                                        aria-label={`Acciones para ${transaccion.factura || "la transacción"}`}
                                                    >
                                                        <MoreVertical className="h-4 w-4 text-subtle-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-64 rounded-none">
                                                    <DropdownMenuItem onClick={() => openDetailsModal(transaccion._id)}>
                                                        <Eye className="h-4 w-4" />
                                                        Ver detalles
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-red-600 focus:text-red-700"
                                                        onClick={() => openDeleteDialog(transaccion)}
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
                {transaccionesPage && (
                    <div className="flex shrink-0 flex-col gap-3 px-4 py-4 text-sm text-subtle-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
                        <div className="flex flex-wrap items-center gap-3">
                            <span>
                                {matchedCount === 0
                                    ? "Sin transacciones"
                                    : `Mostrando ${(currentPage - 1) * currentPageSize + 1}-${Math.min(currentPage * currentPageSize, matchedCount)} de ${matchedCount} transacciones`}
                            </span>
                            <Select
                                value={String(pageSize)}
                                onValueChange={(value) => setPageSize(Number(value))}
                            >
                                <SelectTrigger className="h-9 w-40 rounded-none">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZE_OPTIONS.map((size) => (
                                        <SelectItem key={size} value={String(size)}>
                                            {size} por página
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-none"
                                    aria-label="Página anterior"
                                    onClick={() => setPage(currentPage - 1)}
                                    disabled={currentPage <= 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                {getPaginationPages(currentPage, totalPages).map((item, index) =>
                                    item === "ellipsis" ? (
                                        <span key={`ellipsis-${index}`} className="px-2 text-disabled-foreground">
                                            ...
                                        </span>
                                    ) : (
                                        <Button
                                            key={item}
                                            type="button"
                                            variant={item === currentPage ? "default" : "ghost"}
                                            className="h-9 w-9 rounded-none px-0"
                                            onClick={() => setPage(item)}
                                        >
                                            {item}
                                        </Button>
                                    )
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-none"
                                    aria-label="Página siguiente"
                                    onClick={() => setPage(currentPage + 1)}
                                    disabled={currentPage >= totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>


            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    if (isDeleting) return;
                    setDeleteDialogOpen(open);
                    if (!open) setTransactionToDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {transactionToDelete && (
                                <span className="mb-3 block space-y-1 font-medium text-foreground">
                                    <span className="block">
                                        Factura: {transactionToDelete.factura || "Sin factura"}
                                    </span>
                                    <span className="block">
                                        Monto: {formatCurrency(transactionToDelete.montoTotal)} {transactionToDelete.moneda || "MXN"}
                                    </span>
                                    <span className="block">
                                        Proveedor: {transactionToDelete.proveedorNombre}
                                    </span>
                                </span>
                            )}
                            Esta acción no se puede deshacer. Se eliminará la transacción, todos sus conceptos y documentos asociados de forma permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                void handleDelete();
                            }}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Eliminando...
                                </>
                            ) : (
                                "Eliminar"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={bulkAssignConfirmOpen} onOpenChange={setBulkAssignConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hay selecciones ocultas</AlertDialogTitle>
                        <AlertDialogDescription>
                            {hiddenSelectedCount === 1
                                ? `1 selección no está visible en esta página. Si continúas, el proveedor se asignará a ${selectedTransactionIds.size} transacción${selectedTransactionIds.size === 1 ? "" : "es"}, incluida la que no ves.`
                                : `${hiddenSelectedCount} selecciones no están visibles en esta página. Si continúas, el proveedor se asignará a ${selectedTransactionIds.size} transacciones, incluidas las que no ves.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setBulkAssignConfirmOpen(false);
                                setBulkAssignOpen(true);
                            }}
                        >
                            Continuar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
