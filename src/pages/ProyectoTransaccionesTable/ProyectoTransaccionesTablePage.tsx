import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical, FileText, Upload, RefreshCw } from "lucide-react";
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
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";

import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Popover } from "@radix-ui/react-popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function ProyectoTransaccionesTablePage() {

    const uploadProjectTransactionsModal = useUploadProjectTransactionsModal();

    const { proyectoId } = useParams<{ proyectoId: string }>();
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [transactionToDelete, setTransactionToDelete] = useState<Id<"transacciones"> | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Fetch project
    const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

    // Fetch transactions for this specific project with details
    const transacciones = useQuery(api.transacciones.getByProyectoWithDetails, proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip");

    const deleteTransaction = useMutation(api.transacciones.deleteTransaction);
    const syncTransactionsWithDocuments = useMutation(api.sync.syncTransactionsWithDocuments);

    const detailsModal = useTransactionDetailsModal();
    const conceptosModal = useTransactionConceptosModal();
    const documentosModal = useTransactionDocumentosModal();

    const filteredTransacciones = transacciones?.filter((transaccion) =>
        transaccion.factura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaccion.codigo_referencia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaccion.tipo_pago?.toLowerCase().includes(searchTerm.toLowerCase())
    );


    console.log("transacciones", transacciones)

    console.log("filteredTransacciones", filteredTransacciones)


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
                return "bg-gray-100 text-gray-700 border-gray-200";
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
                return "bg-gray-50 text-gray-700 border-gray-200 rounded-none";
            default:
                return "bg-gray-100 text-gray-700 border-gray-200 rounded-none";
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
                return "bg-gray-100 text-gray-700 border-gray-200 rounded-none";
        }
    };

    const getMonedaBadge = (moneda?: string) => {
        if (moneda === "USD") {
            return "bg-green-100 text-green-800 border-green-300 rounded-none";
        }
        return "bg-gray-100 text-gray-700 border-gray-300 rounded-none";
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
                    <div className="mb-8 relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                        <Input
                            type="text"
                            placeholder="Buscar por factura, código de referencia o tipo de pago..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 rounded-none border-gray-300 h-12"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="border border-gray-200 rounded-none">
                    <table className="w-full">
                        <thead className="border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Factura
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Monto Total
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Fecha
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Tipo de pago
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Categoría
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Status
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Moneda
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Conceptos
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                                    Docs
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200"></th>
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
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <div className="flex items-center gap-2">
                                                {transaccion.factura && (
                                                    <FileText className="h-4 w-4 text-gray-400" />
                                                )}
                                                <span className="text-sm text-gray-900 font-medium">
                                                    {transaccion.factura || "-"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-semibold text-gray-900 border-r border-gray-200">
                                            {formatCurrency(transaccion.monto_total)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 border-r border-gray-200">
                                            {transaccion.fecha
                                                ? new Date(transaccion.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                })
                                                : "-"}
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <Badge
                                                variant="outline"
                                                className={`${getTipoPagoColor(
                                                    transaccion.tipo_pago
                                                )}  px-3 py-1 text-xs font-normal capitalize rounded-none`}
                                            >
                                                {transaccion.tipo_pago || "-"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-200">
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
                                                <span className="text-sm text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <Badge
                                                variant="outline"
                                                className={`${getStatusColor(
                                                    transaccion.status
                                                )}  px-3 py-1 text-xs font-normal rounded-none`}
                                            >
                                                {transaccion.status || "-"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <Badge
                                                variant="outline"
                                                className={`${getMonedaBadge(
                                                    transaccion.moneda
                                                )}  px-2 py-1 text-xs font-medium rounded-none`}
                                            >
                                                {transaccion.moneda || "MXN"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-center text-gray-900 border-r border-gray-200">
                                            <Badge variant="outline" className=" px-2 py-1 text-xs">
                                                {transaccion.lineItemsCount || 0}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-center text-gray-900 border-r border-gray-200">
                                            <Badge variant="outline" className=" px-2 py-1 text-xs">
                                                {transaccion.documentsCount || 0}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-200">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <MoreVertical className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </PopoverTrigger>
                                                {/* button actions */}
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
        </div>
    );
}
