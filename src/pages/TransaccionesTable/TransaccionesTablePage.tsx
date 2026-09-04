import { useRef, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Eye,
    FileText,
    Loader2,
    MoreVertical,
    Search,
    Trash2,
} from "lucide-react";
import { TableColumnPicker } from "@/components/Tables/TableColumnPicker";
import { useOptionalTableColumns } from "@/hooks/use-optional-table-columns";
import { cn } from "@/lib/utils";
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
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useUploadTransactionsModal } from "@/hooks/upload-transactions-modal";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import AssignProviderDialog from "@/components/providers/AssignProviderDialog";
import { InvoiceIntakeDialog } from "@/components/invoices/InvoiceIntakeDialog";
import { AddTransactionMenu } from "@/components/transactions/AddTransactionMenu";

const EXTRA_COLUMNS = [
    { id: "tipoPago", label: "Tipo de pago" },
    { id: "categoria", label: "Categoría" },
    { id: "moneda", label: "Moneda" },
    { id: "conceptos", label: "Conceptos" },
    { id: "docs", label: "Docs" },
] as const;

export default function TransaccionesTablePage() {
    const [searchTerm, setSearchTerm] = useState("");
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
    const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("");
    const [selectedProveedor, setSelectedProveedor] = useState<Id<"proveedores"> | "all" | "unassigned">("all");
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<Id<"transacciones">>>(new Set());
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
    const [invoiceOpen, setInvoiceOpen] = useState(false);
    const [paymentProjectPickerOpen, setPaymentProjectPickerOpen] = useState(false);
    const [paymentProjectId, setPaymentProjectId] = useState<Id<"desarrollos"> | "">("");
    const extraColumns = useOptionalTableColumns(EXTRA_COLUMNS);
    const addPaymentModal = useAddPaymentModal();
    const uploadTransactionsModal = useUploadTransactionsModal();
    const uploadProjectTransactionsModal = useUploadProjectTransactionsModal();

    // Queries
    const currentUser = useQuery(api.users.getCurrentUser);
    const proyectos = useQuery(api.desarrollos.getAll);
    const {
        results: transacciones,
        status: transaccionesStatus,
        loadMore: loadMoreTransacciones,
    } = usePaginatedQuery(api.transacciones.getAllWithDetails, {}, { initialNumItems: 50 });
    const proveedores = useQuery(api.proveedores.getAllWithStats, { include_archived: true });
    const deleteTransaction = useMutation(api.transacciones.deleteTransaction);
    const isLoadingFirstPage = transaccionesStatus === "LoadingFirstPage";
    const isLoadingMore = transaccionesStatus === "LoadingMore";
    const canLoadMore = transaccionesStatus === "CanLoadMore";
    const allTransactionsLoaded = transaccionesStatus === "Exhausted";

    const detailsModal = useTransactionDetailsModal();
    const canCreateTransactions = Boolean(currentUser && currentUser.role !== "viewer");

    const handleAddPayment = () => {
        if (selectedProyecto) {
            addPaymentModal.onOpen({ projectId: selectedProyecto });
            return;
        }
        setPaymentProjectId("");
        setPaymentProjectPickerOpen(true);
    };

    const handleUploadExcel = () => {
        if (selectedProyecto) {
            const proyecto = proyectos?.find((item) => item._id === selectedProyecto);
            if (proyecto) {
                uploadProjectTransactionsModal.onOpen(proyecto._id, proyecto.nombre);
                return;
            }
        }
        uploadTransactionsModal.onOpen();
    };

    const handleConfirmPaymentProject = () => {
        if (!paymentProjectId) return;
        addPaymentModal.onOpen({ projectId: paymentProjectId });
        setPaymentProjectPickerOpen(false);
        setPaymentProjectId("");
    };

    const filteredTransacciones = transacciones.filter((transaccion) => {
        const matchesSearch = transaccion.proyectoNombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaccion.factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaccion.codigo_referencia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaccion.tipo_pago?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaccion.proveedor?.razon_social.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesProyecto = !selectedProyecto || transaccion.proyecto === selectedProyecto;
        const matchesProveedor = selectedProveedor === "all" ||
            (selectedProveedor === "unassigned" && !transaccion.proveedor_id) ||
            transaccion.proveedor_id === selectedProveedor;
        
        return matchesSearch && matchesProyecto && matchesProveedor;
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case "Pagado":
                return "bg-green-50 text-green-700 border-green-200";
            case "Por pagar":
                return "bg-orange-50 text-orange-700 border-orange-200";
            default:
                return "bg-muted text-foreground border-border";
        }
    };

    const getTipoPagoColor = (tipoPago?: string) => {
        switch (tipoPago?.toLowerCase()) {
            case "efectivo":
                return "bg-blue-50 text-blue-700 border-blue-200 rounded-none";
            case "transferencia":
                return "bg-purple-50 text-purple-700 border-purple-200 rounded-none";
            case "tarjeta":
                return "bg-indigo-50 text-indigo-700 border-indigo-200 rounded-none";
            case "cheque":
                return "bg-background text-foreground border-border rounded-none";
            default:
                return "bg-muted text-foreground border-border rounded-none";
        }
    };

    const getCategoriaColor = (categoria?: string) => {
        switch (categoria?.toLowerCase()) {
            case "anticipo":
                return "bg-cyan-50 text-cyan-700 border-cyan-200 rounded-none";
            case "material":
                return "bg-amber-50 text-amber-700 border-amber-200 rounded-none";
            case "estimación":
            case "estimacion":
                return "bg-emerald-50 text-emerald-700 border-emerald-200 rounded-none";
            default:
                return "bg-muted text-foreground border-border rounded-none";
        }
    };

    const getMonedaBadge = (moneda?: string) => {
        if (moneda === "USD") {
            return "bg-green-100 text-green-800 border-green-300 rounded-none";
        }
        return "bg-muted text-foreground border-border-strong rounded-none";
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

    const visibleTransactionIds = filteredTransacciones.map((transaction) => transaction._id);
    const allVisibleSelected = visibleTransactionIds.length > 0 &&
        visibleTransactionIds.every((id) => selectedTransactionIds.has(id));
    const tableColSpan = 8 + extraColumns.visibleCount;
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

    return (
        <div className="flex h-[calc(100dvh-2.5rem)] flex-col bg-card">
            <div className="max-w-full mx-auto flex min-h-0 w-full flex-1 flex-col text-left">
                <div className="flex shrink-0 flex-col gap-4 px-4 pt-6 sm:px-6 lg:px-8">
                    <div className="mb-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <h1 className="mb-2 break-words text-3xl font-normal text-foreground">Transacciones</h1>
                            <p className="text-sm text-subtle-foreground">
                                Consulta y gestiona todas las transacciones registradas en el sistema
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <AddTransactionMenu
                                visible={canCreateTransactions}
                                onAddPayment={handleAddPayment}
                                onUploadExcel={handleUploadExcel}
                                onUploadInvoice={() => setInvoiceOpen(true)}
                            />
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                                <span className="text-sm font-normal">
                                    {allTransactionsLoaded ? "Total" : "Cargadas"}: {transacciones.length}
                                </span>
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                                <span className="text-sm font-normal">
                                    {allTransactionsLoaded ? "Monto total" : "Monto cargado"}: {formatCurrency(
                                        transacciones.reduce((sum, t) => sum + t.monto_total, 0)
                                    )}
                                </span>
                            </Badge>
                        </div>
                    </div>

                    {/* Search and Filter */}
                    <div className="mb-2 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="relative md:col-span-2 xl:col-span-1">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-disabled-foreground h-5 w-5" />
                            <Input
                                type="text"
                                placeholder="Buscar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-12 rounded-none border-border-strong h-12"
                            />
                        </div>

                        {/* Project Filter */}
                        <Select
                            value={selectedProyecto || undefined}
                            onValueChange={(value) => {
                                if (value === "clear") {
                                    setSelectedProyecto("");
                                } else {
                                    setSelectedProyecto(value as Id<"desarrollos">);
                                }
                            }}
                        >
                            <SelectTrigger className="rounded-none h-12">
                                <SelectValue placeholder="Todos los proyectos" />
                            </SelectTrigger>
                            <SelectContent>
                                {selectedProyecto && (
                                    <SelectItem value="clear">
                                        <span className="text-subtle-foreground">Limpiar filtro</span>
                                    </SelectItem>
                                )}
                                {proyectos?.map((proyecto) => (
                                    <SelectItem key={proyecto._id} value={proyecto._id}>
                                        {proyecto.nombre}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={selectedProveedor}
                            onValueChange={(value) => setSelectedProveedor(value as Id<"proveedores"> | "all" | "unassigned")}
                        >
                            <SelectTrigger className="rounded-none h-12">
                                <SelectValue placeholder="Todos los proveedores" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los proveedores</SelectItem>
                                <SelectItem value="unassigned">Sin proveedor</SelectItem>
                                {proveedores?.map((proveedor) => (
                                    <SelectItem key={proveedor._id} value={proveedor._id}>
                                        {proveedor.razon_social}{proveedor.is_archived ? " (Archivado)" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <TableColumnPicker
                            columns={EXTRA_COLUMNS}
                            isVisible={extraColumns.isVisible}
                            onToggle={extraColumns.toggle}
                            className="h-12 w-full"
                        />
                    </div>
                    {selectedTransactionIds.size > 0 && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border bg-background px-4 py-3">
                            <span className="text-sm text-muted-foreground">
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
                <div className="min-h-0 flex-1 overflow-auto border-y border-border">
                    <table
                        className={cn(
                            "w-full border-separate border-spacing-0",
                            extraColumns.visibleCount > 0 ? "min-w-[90rem]" : "min-w-[56rem]",
                        )}
                    >
                        <thead className="sticky top-0 z-20 bg-card">
                            <tr>
                                <th className="sticky left-0 z-30 w-12 min-w-12 bg-card px-4 py-4 text-center border-b border-r border-border">
                                    <input
                                        type="checkbox"
                                        aria-label="Seleccionar transacciones visibles"
                                        checked={allVisibleSelected}
                                        onChange={(event) => toggleAllVisible(event.target.checked)}
                                    />
                                </th>
                                <th className="sticky left-12 z-30 min-w-56 w-56 bg-card px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                    Proyecto
                                </th>
                                <th className="min-w-44 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                    Proveedor
                                </th>
                                <th className="min-w-40 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                    Factura
                                </th>
                                <th className="min-w-32 whitespace-nowrap px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                    Monto Total
                                </th>
                                <th className="min-w-28 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                    Fecha
                                </th>
                                {extraColumns.isVisible("tipoPago") && (
                                    <th className="min-w-32 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                        Tipo de pago
                                    </th>
                                )}
                                {extraColumns.isVisible("categoria") && (
                                    <th className="min-w-28 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                        Categoría
                                    </th>
                                )}
                                <th className="min-w-28 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                    Status
                                </th>
                                {extraColumns.isVisible("moneda") && (
                                    <th className="min-w-24 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                        Moneda
                                    </th>
                                )}
                                {extraColumns.isVisible("conceptos") && (
                                    <th className="min-w-24 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                        Conceptos
                                    </th>
                                )}
                                {extraColumns.isVisible("docs") && (
                                    <th className="min-w-20 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-r border-border">
                                        Docs
                                    </th>
                                )}
                                <th className="w-14 min-w-14 px-6 py-4 text-left text-sm font-normal text-muted-foreground border-b border-border"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoadingFirstPage ? (
                                <tr>
                                    <td colSpan={tableColSpan} className="px-6 py-12 text-center text-subtle-foreground">
                                        Cargando transacciones...
                                    </td>
                                </tr>
                            ) : filteredTransacciones.length === 0 ? (
                                <tr>
                                    <td colSpan={tableColSpan} className="px-6 py-12 text-center text-subtle-foreground">
                                        No se encontraron transacciones
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {filteredTransacciones.map((transaccion) => (
                                        <tr
                                            key={transaccion._id}
                                            className="group hover:bg-background transition-colors"
                                        >
                                        <td className="sticky left-0 z-10 w-12 min-w-12 bg-card px-4 py-4 text-center border-b border-r border-border group-hover:bg-background">
                                            <input
                                                type="checkbox"
                                                aria-label={`Seleccionar transacción ${transaccion.factura || transaccion._id}`}
                                                checked={selectedTransactionIds.has(transaccion._id)}
                                                onChange={(event) => toggleSelectedTransaction(transaccion._id, event.target.checked)}
                                            />
                                        </td>
                                        <td className="sticky left-12 z-10 min-w-56 w-56 bg-card px-6 py-4 border-b border-r border-border group-hover:bg-background">
                                            <div className="truncate text-sm font-medium text-foreground">
                                                {transaccion.proyectoNombre || "-"}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 border-b border-r border-border">
                                            <div className="text-left">
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {transaccion.proveedor?.razon_social || "Sin proveedor"}
                                                </span>
                                                {transaccion.proveedor && (
                                                    <span className="block text-xs text-subtle-foreground">
                                                        {transaccion.proveedor.is_archived
                                                            ? "Archivado"
                                                            : transaccion.proveedor.tipo === "generico"
                                                            ? "Genérico"
                                                        : transaccion.proveedor.is_complete ? "Completo" : "Incompleto"}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 border-b border-r border-border">
                                            {transaccion.factura ? (
                                                <button
                                                    type="button"
                                                    className="flex min-w-0 items-center gap-2 text-left text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                    onClick={() => detailsModal.onOpen(transaccion._id)}
                                                    aria-label={`Ver detalle de la factura ${transaccion.factura}`}
                                                >
                                                    <FileText className="h-4 w-4 shrink-0 text-disabled-foreground" />
                                                    <span className="truncate text-sm font-medium">
                                                        {transaccion.factura}
                                                    </span>
                                                </button>
                                            ) : (
                                                <span className="text-sm text-disabled-foreground">-</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-foreground border-b border-r border-border">
                                            {formatCurrency(transaccion.monto_total)}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-subtle-foreground border-b border-r border-border">
                                            {transaccion.fecha
                                                ? new Date(transaccion.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                })
                                                : "-"}
                                        </td>
                                        {extraColumns.isVisible("tipoPago") && (
                                            <td className="px-6 py-4 border-b border-r border-border">
                                                <Badge
                                                    variant="outline"
                                                    className={`${getTipoPagoColor(
                                                        transaccion.tipo_pago
                                                    )}  px-3 py-1 text-xs font-normal capitalize rounded-none`}
                                                >
                                                    {transaccion.tipo_pago || "-"}
                                                </Badge>
                                            </td>
                                        )}
                                        {extraColumns.isVisible("categoria") && (
                                            <td className="px-6 py-4 border-b border-r border-border">
                                                {transaccion.categoria ? (
                                                    <Badge
                                                        variant="outline"
                                                        className={`${getCategoriaColor(
                                                            transaccion.categoria
                                                        )}  px-3 py-1 text-xs font-normal capitalize rounded-none`}
                                                    >
                                                        {transaccion.categoria}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-sm text-disabled-foreground">-</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 border-b border-r border-border">
                                            <Badge
                                                variant="outline"
                                                className={`${getStatusColor(
                                                    transaccion.status
                                                )}  px-3 py-1 text-xs font-normal rounded-none`}
                                            >
                                                {transaccion.status || "-"}
                                            </Badge>
                                        </td>
                                        {extraColumns.isVisible("moneda") && (
                                            <td className="px-6 py-4 border-b border-r border-border">
                                                <Badge
                                                    variant="outline"
                                                    className={`${getMonedaBadge(
                                                        transaccion.moneda
                                                    )}  px-2 py-1 text-xs font-medium rounded-none`}
                                                >
                                                    {transaccion.moneda || "MXN"}
                                                </Badge>
                                            </td>
                                        )}
                                        {extraColumns.isVisible("conceptos") && (
                                            <td className="px-6 py-4 text-sm text-center text-foreground border-b border-r border-border">
                                                <Badge variant="outline" className=" px-2 py-1 text-xs">
                                                    {transaccion.lineItemsCount || 0}
                                                </Badge>
                                            </td>
                                        )}
                                        {extraColumns.isVisible("docs") && (
                                            <td className="px-6 py-4 text-sm text-center text-foreground border-b border-r border-border">
                                                <Badge variant="outline" className=" px-2 py-1 text-xs">
                                                    {transaccion.documentsCount || 0}
                                                </Badge>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 border-b border-border">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-subtle-foreground hover:text-foreground"
                                                        aria-label={`Acciones para ${transaccion.factura || "la transacción"}`}
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-60 rounded-none p-1.5">
                                                    <DropdownMenuItem className="h-9 rounded-none" onSelect={() => detailsModal.onOpen(transaccion._id)}>
                                                        <Eye />
                                                        Ver detalles
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="h-9 rounded-none text-red-600 focus:bg-red-50 focus:text-red-700"
                                                        onSelect={() => openDeleteDialog(transaccion)}
                                                    >
                                                        <Trash2 />
                                                        Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                        </tr>
                                    ))}
                                    {(canLoadMore || isLoadingMore) && (
                                        <tr>
                                            <td colSpan={tableColSpan} className="px-6 py-5 text-center">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-none"
                                                    onClick={() => loadMoreTransacciones(50)}
                                                    disabled={isLoadingMore}
                                                >
                                                    {isLoadingMore && <Loader2 className="animate-spin" />}
                                                    {isLoadingMore ? "Cargando..." : "Cargar más transacciones"}
                                                </Button>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
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
                <AlertDialogContent className="max-w-md gap-0 overflow-hidden rounded-none p-0">
                    <AlertDialogHeader className="border-b border-border px-6 py-5 pr-12">
                        <AlertDialogTitle className="text-lg font-medium">¿Eliminar transacción?</AlertDialogTitle>
                        <AlertDialogDescription className="pt-1 leading-6">
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
                    <AlertDialogFooter className="bg-muted/40 px-6 py-4">
                        <AlertDialogCancel
                            disabled={isDeleting}
                            className="h-9 border-0 bg-transparent px-3 shadow-none hover:bg-muted"
                        >
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                void handleDelete();
                            }}
                            disabled={isDeleting}
                            className="h-9 bg-red-600 px-4 shadow-none hover:bg-red-700"
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
            <AssignProviderDialog
                open={bulkAssignOpen}
                onOpenChange={(open) => {
                    setBulkAssignOpen(open);
                    if (!open) setSelectedTransactionIds(new Set());
                }}
                transactionId={null}
                transactionIds={[...selectedTransactionIds]}
            />
            <InvoiceIntakeDialog
                hideTrigger
                open={invoiceOpen}
                onOpenChange={setInvoiceOpen}
                defaultProjectId={selectedProyecto || undefined}
            />
            <Dialog
                open={paymentProjectPickerOpen}
                onOpenChange={(open) => {
                    setPaymentProjectPickerOpen(open);
                    if (!open) setPaymentProjectId("");
                }}
            >
                <DialogContent data-square-modal="" className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-normal">Agregar pago</DialogTitle>
                        <DialogDescription>
                            Selecciona el proyecto al que pertenece la transacción.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="payment-project">Proyecto *</Label>
                        <Select
                            value={paymentProjectId || undefined}
                            onValueChange={(value) => setPaymentProjectId(value as Id<"desarrollos">)}
                        >
                            <SelectTrigger id="payment-project" className="rounded-none h-11">
                                <SelectValue placeholder="Selecciona un proyecto" />
                            </SelectTrigger>
                            <SelectContent>
                                {proyectos?.map((proyecto) => (
                                    <SelectItem key={proyecto._id} value={proyecto._id}>
                                        {proyecto.nombre}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-none"
                            onClick={() => setPaymentProjectPickerOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            className="rounded-none"
                            onClick={handleConfirmPaymentProject}
                            disabled={!paymentProjectId}
                        >
                            Continuar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
