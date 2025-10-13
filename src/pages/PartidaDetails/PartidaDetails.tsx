import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "convex/_generated/dataModel";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useEditPaymentModal } from "@/hooks/edit-payment-modal";
import { EllipsisVerticalIcon, Edit, Trash2, X, Check, Lock, FileText, Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useMutation } from "convex/react";
// Type for payment with populated billing information from getById query

export default function PartidaDetails() {
    const navigate = useNavigate();
    const params = useParams();
    const id = params.id;
    const partida = useQuery(api.partida.getById, { id: id as Id<"partidas"> });

    // Query all documents to filter by pago_id
    const allDocuments = useQuery(api.documentos.getAll);

    const deletePayment = useMutation(api.pagos.deletePayment);

    const addPaymentModal = useAddPaymentModal();
    const editPaymentModal = useEditPaymentModal();

    if (!partida) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Cargando detalles de la partida...</p>
                </div>
            </div>
        );
    }

    const formatCurrency = (amount: string) => {
        const num = parseFloat(amount);
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(num);
    };

    // Only count payments with status "Pagado" or legacy payments without status
    const totalPagado = partida.pagos?.reduce((sum, pago) => {
        const isPagado = pago.status === 'Pagado' || !pago.status;
        return isPagado ? sum + pago.monto || 0 : sum;
    }, 0) || 0;

    const montoTotal = partida.total || 0;
    const porcentajePagado = montoTotal > 0 ? (totalPagado / montoTotal) * 100 : 0;

    const handleEditPayment = (pago: Doc<"pagos">) => {

        editPaymentModal.onOpen({
            payment: pago,
            relatedCost: partida,
            totalAmount: montoTotal
        });
    };


    const presupuestoAprobado = partida.aprobado || 0;
    const porEjercer = presupuestoAprobado - totalPagado;

    // Helper function to get documents for a specific pago
    const getDocumentsForPago = (pagoId: Id<"pagos">) => {
        return allDocuments?.filter(doc => doc.pago_ids.includes(pagoId)) || [];
    };

    // Helper function to get file view URL
    const getFileUrl = (fileId: string) => {
        return `${import.meta.env.VITE_APPWRITE_ENDPOINT}/storage/buckets/${import.meta.env.VITE_APPWRITE_BUCKET_ID}/files/${fileId}/view?project=${import.meta.env.VITE_APPWRITE_PROJECT_ID}`;
    };

    // Helper function to get file download URL
    const getFileDownloadUrl = (fileId: string) => {
        return `${import.meta.env.VITE_APPWRITE_ENDPOINT}/storage/buckets/${import.meta.env.VITE_APPWRITE_BUCKET_ID}/files/${fileId}/download?project=${import.meta.env.VITE_APPWRITE_PROJECT_ID}`;
    };

    return (
        <div className="min-h-screen  p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="bg-white  shadow-sm -6 mb-4 relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4"
                        onClick={() => navigate(-1)}
                    >
                        <X className="h-5 w-5" />
                    </Button>

                    <div className="pr-12">
                        <h1 className="text-xl text-gray-900 mb-1">{partida.nombre}</h1>
                        <p className="text-sm text-gray-500 mb-3">
                            {partida.sub_partida}
                        </p>
                        <div className="flex justify-end">
                            <span className="text-sm text-gray-500">Sub Partida</span>
                        </div>
                    </div>

                    <Button
                        onClick={() => {
                            if (partida.proyecto) {
                                addPaymentModal.onOpen({
                                    projectId: partida.proyecto
                                });
                            }
                        }}
                        className="bg-black hover:bg-gray-800 text-white text-sm px-4 py-2"
                    >
                        Nuevo Pago +
                    </Button>
                </div>

                {/* Progress Bar and Summary */}
                <div className="bg-white  shadow-smp-6 mb-4">
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
                        <div
                            className="h-2 rounded-full transition-all duration-300 bg-green-500"
                            style={{ width: `${Math.min(porcentajePagado, 100)}%` }}
                        ></div>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Presupuesto Aprobado</p>
                            <p className="text-base  text-gray-900">{formatCurrency(presupuestoAprobado.toString())}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Total Pagado</p>
                            <p className="text-base  text-green-600">{formatCurrency(totalPagado.toString())}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Por Ejercer</p>
                            <p className="text-base  text-orange-600">{formatCurrency(porEjercer.toString())}</p>
                        </div>
                    </div>
                </div>

                {/* Payment Cards */}
                {partida.pagos && partida.pagos.length > 0 ? (
                    <div className="space-y-8">
                        {partida.pagos.map((pago, index) => (
                            <div key={index} className="bg-white">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4 border-b border-gray-400 pb-4">
                                    <div className="flex items-center gap-3">
                                        {(() => {
                                            const isPagado = pago.status === 'Pagado' || (!pago.status && pago.monto > 0);
                                            return (
                                                <div className={`w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${isPagado ? 'bg-green-100' : 'bg-orange-100'
                                                    }`}>
                                                    {isPagado ? (
                                                        <Check className="h-6 w-6 text-green-600" />
                                                    ) : (
                                                        <Lock className="h-6 w-6 text-orange-600" />
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div>
                                            <p className="text-base  text-gray-900">
                                                {pago.status || (pago.monto > 0 ? 'Aprobado' : 'Pendiente')}
                                            </p>
                                            <p className="text-left text-sm text-gray-500">Pago #{String(index + 1).padStart(3, '0')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xl text-gray-900">
                                            {formatCurrency(pago.monto.toString())} {pago.moneda || 'MXN'}
                                        </p>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <EllipsisVerticalIcon className="h-4 w-4" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-40" align="end">
                                                <div className="space-y-1">
                                                    <Button
                                                        variant="ghost"
                                                        className="w-full justify-start text-sm"
                                                        onClick={() => handleEditPayment(pago as Doc<"pagos">)}
                                                    >
                                                        <Edit className="h-4 w-4 mr-2" />
                                                        Editar
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" className="w-full justify-start text-sm text-red-600 hover:text-red-700">
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                Eliminar
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Esta acción no puede ser deshecha. El pago será eliminado permanentemente.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => deletePayment({ id: pago._id })}>
                                                                    Eliminar
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>

                                {/* Details */}
                                <div className="flex flex-col space-y-2 text-sm mb-4 p-4">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Fecha</span>
                                        <p className="text-gray-900 text-right">{pago.fecha}</p>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Método de pago</span>
                                        <p className="text-gray-900 text-right">{pago.tipo_pago || 'N/A'}</p>
                                    </div>
                                    {pago.banco && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Banco</span>
                                            <p className="text-gray-900 text-right">{pago.banco}</p>
                                        </div>
                                    )}
                                    {pago.numero_cuenta && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Cuenta cargo</span>
                                            <p className="text-gray-900 text-right">{pago.numero_cuenta}</p>
                                        </div>
                                    )}
                                    {pago.numero_transferencia && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Cuenta abono</span>
                                            <p className="text-gray-900 text-right">{pago.numero_transferencia}</p>
                                        </div>
                                    )}
                                    {pago.codigo_referencia && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Referencia</span>
                                            <p className="text-gray-900 text-right font-mono text-xs">{pago.codigo_referencia}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Badges */}
                                <div className="flex items-center gap-2 flex-wrap mb-4">
                                    {pago.banco && (
                                        <Badge variant="outline" className="text-xs px-3 py-1">
                                            {pago.banco}
                                        </Badge>
                                    )}
                                    {pago.tipo_pago && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 capitalize">
                                            {pago.tipo_pago === 'transferencia' ? 'Transferencia' :
                                                pago.tipo_pago === 'tarjeta' ? 'Tarjeta' :
                                                    pago.tipo_pago}
                                        </Badge>
                                    )}
                                    {pago.moneda && pago.moneda !== 'MXN' && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 bg-blue-50">
                                            {pago.moneda} {pago.tipo_cambio && `(TC: ${pago.tipo_cambio})`}
                                        </Badge>
                                    )}
                                    {pago.tarjeta && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 bg-purple-50">
                                            {pago.tarjeta}
                                        </Badge>
                                    )}
                                    {pago.factura && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 flex items-center gap-1">
                                            {pago.factura.includes('http') ? 'Factura' : pago.factura}
                                            <Check className="h-3 w-3 text-green-600" />
                                        </Badge>
                                    )}
                                </div>

                                {/* Documents Section */}
                                {(() => {
                                    const pagoDocuments = getDocumentsForPago(pago._id);
                                    if (pagoDocuments.length > 0) {
                                        return (
                                            <div className="mt-4 pt-4 border-t border-gray-200">
                                                <p className="text-xs font-medium text-gray-700 mb-3">Documentos adjuntos ({pagoDocuments.length})</p>
                                                <div className="space-y-2">
                                                    {pagoDocuments.map((doc) => (
                                                        <div key={doc._id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-sm font-medium text-gray-900 truncate">{doc.nombre}</p>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <Badge variant="outline" className="text-xs px-2 py-0.5">
                                                                            {doc.type}
                                                                        </Badge>
                                                                        {doc.descripcion && (
                                                                            <p className="text-xs text-gray-500 truncate">{doc.descripcion}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 ml-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8 p-0"
                                                                    onClick={() => window.open(getFileUrl(doc.image), '_blank')}
                                                                >
                                                                    <FileText className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8 p-0"
                                                                    onClick={() => window.open(getFileDownloadUrl(doc.image), '_blank')}
                                                                >
                                                                    <Download className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white  shadow-smp-8 text-center">
                        <p className="text-gray-500">No hay pagos registrados</p>
                    </div>
                )}
            </div>
        </div>
    );
}
