import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
import { Search, MoreVertical, FileText } from "lucide-react";
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
import { useTransactionConceptosModal } from "@/hooks/transaction-conceptos-modal";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Popover } from "@radix-ui/react-popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AssignProviderDialog from "@/components/providers/AssignProviderDialog";

export default function TransaccionesTablePage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [transactionToDelete, setTransactionToDelete] = useState<Id<"transacciones"> | null>(null);
    const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("");
    const [selectedProveedor, setSelectedProveedor] = useState<Id<"proveedores"> | "all" | "unassigned">("all");
    const [assigningTransaction, setAssigningTransaction] = useState<{
        id: Id<"transacciones">;
        proveedorId?: Id<"proveedores">;
    } | null>(null);
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<Id<"transacciones">>>(new Set());
    const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

    // Queries
    const proyectos = useQuery(api.desarrollos.getAll);
    const transacciones = useQuery(api.transacciones.getAllWithDetails);
    const proveedores = useQuery(api.proveedores.getAllWithStats, { include_archived: true });
    const deleteTransaction = useMutation(api.transacciones.deleteTransaction);

    const detailsModal = useTransactionDetailsModal();
    const conceptosModal = useTransactionConceptosModal();
    const documentosModal = useTransactionDocumentosModal();

    const filteredTransacciones = transacciones?.filter((transaccion) => {
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

    const visibleTransactionIds = filteredTransacciones?.map((transaction) => transaction._id) || [];
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

    return (
        <div className="bg-card min-h-screen">
            <div className="max-w-full mx-auto py-8 text-left">
                <div className="flex flex-col gap-4 px-12">
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-normal text-foreground mb-2">Transacciones</h1>
                            <p className="text-sm text-subtle-foreground">
                                Consulta y gestiona todas las transacciones registradas en el sistema
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                                <span className="text-sm font-normal">
                                    Total: {transacciones?.length || 0}
                                </span>
                            </Badge>
                            <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted  ">
                                <span className="text-sm font-normal">
                                    Monto total: {formatCurrency(
                                        transacciones?.reduce((sum, t) => sum + t.monto_total, 0) || 0
                                    )}
                                </span>
                            </Badge>
                        </div>
                    </div>

                    {/* Search and Filter */}
                    <div className="mb-8 grid grid-cols-3 gap-4">
                        <div className="relative">
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
                    </div>
                    {selectedTransactionIds.size > 0 && (
                        <div className="mb-4 flex items-center justify-between border bg-background px-4 py-3">
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
                <div className="border border-border rounded-none">
                    <table className="w-full">
                        <thead className="border-b border-border">
                            <tr>
                                <th className="px-4 py-4 text-center border-r border-border">
                                    <input
                                        type="checkbox"
                                        aria-label="Seleccionar transacciones visibles"
                                        checked={allVisibleSelected}
                                        onChange={(event) => toggleAllVisible(event.target.checked)}
                                    />
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Proyecto
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Proveedor
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Factura
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Monto Total
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Fecha
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Tipo de pago
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Categoría
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Status
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Moneda
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Conceptos
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                                    Docs
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {!transacciones ? (
                                <tr>
                                    <td colSpan={13} className="px-6 py-12 text-center text-subtle-foreground">
                                        Cargando transacciones...
                                    </td>
                                </tr>
                            ) : filteredTransacciones && filteredTransacciones.length === 0 ? (
                                <tr>
                                    <td colSpan={13} className="px-6 py-12 text-center text-subtle-foreground">
                                        No se encontraron transacciones
                                    </td>
                                </tr>
                            ) : (
                                filteredTransacciones?.map((transaccion) => (
                                    <tr
                                        key={transaccion._id}
                                        className="hover:bg-background transition-colors"
                                    >
                                        <td className="px-4 py-4 text-center border-r border-border">
                                            <input
                                                type="checkbox"
                                                aria-label={`Seleccionar transacción ${transaccion.factura || transaccion._id}`}
                                                checked={selectedTransactionIds.has(transaccion._id)}
                                                onChange={(event) => toggleSelectedTransaction(transaccion._id, event.target.checked)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
                                            <div className="text-sm font-medium text-foreground">
                                                {transaccion.proyectoNombre || "-"}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
                                            <button
                                                type="button"
                                                className="text-left"
                                                onClick={() => setAssigningTransaction({
                                                    id: transaccion._id,
                                                    proveedorId: transaccion.proveedor_id,
                                                })}
                                            >
                                                <span className="block text-sm font-medium text-foreground">
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
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
                                            <div className="flex items-center gap-2">
                                                {transaccion.factura && (
                                                    <FileText className="h-4 w-4 text-disabled-foreground" />
                                                )}
                                                <span className="text-sm text-foreground font-medium">
                                                    {transaccion.factura || "-"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-semibold text-foreground border-r border-border">
                                            {formatCurrency(transaccion.monto_total)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-subtle-foreground border-r border-border">
                                            {transaccion.fecha
                                                ? new Date(transaccion.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                })
                                                : "-"}
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
                                            <Badge
                                                variant="outline"
                                                className={`${getTipoPagoColor(
                                                    transaccion.tipo_pago
                                                )}  px-3 py-1 text-xs font-normal capitalize rounded-none`}
                                            >
                                                {transaccion.tipo_pago || "-"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
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
                                        <td className="px-6 py-4 border-r border-border">
                                            <Badge
                                                variant="outline"
                                                className={`${getStatusColor(
                                                    transaccion.status
                                                )}  px-3 py-1 text-xs font-normal rounded-none`}
                                            >
                                                {transaccion.status || "-"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
                                            <Badge
                                                variant="outline"
                                                className={`${getMonedaBadge(
                                                    transaccion.moneda
                                                )}  px-2 py-1 text-xs font-medium rounded-none`}
                                            >
                                                {transaccion.moneda || "MXN"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-center text-foreground border-r border-border">
                                            <Badge variant="outline" className=" px-2 py-1 text-xs">
                                                {transaccion.lineItemsCount || 0}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-center text-foreground border-r border-border">
                                            <Badge variant="outline" className=" px-2 py-1 text-xs">
                                                {transaccion.documentsCount || 0}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 border-r border-border">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <MoreVertical className="h-4 w-4 text-disabled-foreground" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="flex flex-col space-y-1" align="end">
                                                    <Button variant={"ghost"} onClick={() => detailsModal.onOpen(transaccion._id)}>
                                                        Ver detalles
                                                    </Button>
                                                    <Button variant={"ghost"} onClick={() => conceptosModal.onOpen(transaccion._id)}>
                                                        Ver conceptos
                                                    </Button>
                                                    <Button variant={"ghost"} onClick={() => documentosModal.onOpen(transaccion._id)}>
                                                        Ver documentos
                                                    </Button>
                                                    <Button variant={"ghost"} onClick={() => setAssigningTransaction({
                                                        id: transaccion._id,
                                                        proveedorId: transaccion.proveedor_id,
                                                    })}>
                                                        Asignar / cambiar proveedor
                                                    </Button>
                                                    <Button variant={"ghost"} className="text-red-600" onClick={() => openDeleteDialog(transaccion._id)}>
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
