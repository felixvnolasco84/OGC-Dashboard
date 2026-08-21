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

// Type for enriched payment with transaction data
type EnrichedPayment = Doc<"pagos"> & {
    fecha?: string;
    tipo_pago?: string;
    moneda?: string;
    tipo_cambio?: string;
    status?: string;
    banco?: string;
    tarjeta?: string;
    numero_cuenta?: string;
    numero_transferencia?: string;
    codigo_referencia?: string;
    factura?: string;
    comprobante?: string;
    categoria?: string;
    transaction?: Doc<"transacciones"> | null;
};

export default function PartidaDetails() {
    const navigate = useNavigate();
    const params = useParams();
    const id = params.id;
    const partida = useQuery(api.partida.getById, { id: id as Id<"partidas"> });

    // Query documents by proyecto to filter by transaccion_id
    const allDocuments = useQuery(
        api.documentos.getByProyecto,
        partida?.proyecto ? { proyecto_id: partida.proyecto } : "skip"
    );

    const deleteTransaction = useMutation(api.transacciones.deleteTransaction);

    const addPaymentModal = useAddPaymentModal();
    const editPaymentModal = useEditPaymentModal();

    if (!partida) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-muted-foreground">Cargando detalles...</p>
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
        const status = pago.status || pago.transaction?.status;
        const isPagado = status === 'Pagado' || !status;
        return isPagado ? sum + pago.monto || 0 : sum;
    }, 0) || 0;

    const montoTotal = partida.presupuesto_aprobado || 0;
    const porcentajePagado = montoTotal > 0 ? (totalPagado / montoTotal) * 100 : 0;

    const handleEditPayment = (pago: Doc<"pagos">) => {

        editPaymentModal.onOpen({
            payment: pago,
            relatedCost: partida,
            totalAmount: montoTotal
        });
    };


    const presupuestoAprobado = partida.presupuesto_aprobado || 0;
    const porEjercer = presupuestoAprobado - totalPagado;

    // Helper function to get documents for a specific pago's transaction
    const getDocumentsForPago = (pago: EnrichedPayment) => {
        if (!pago.transaction?._id) return [];
        return allDocuments?.filter(doc => doc.transaccion_id === pago.transaction!._id) || [];
    };

    // Helper functions to open file URLs directly
    const getFileUrl = (fileUrl: string) => {
        return fileUrl;
    };

    const getFileDownloadUrl = (fileUrl: string) => {
        return fileUrl;
    };

    return (
        <div className="min-h-screen  p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="bg-card  shadow-sm -6 mb-4 relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4"
                        onClick={() => navigate(-1)}
                    >
                        <X className="h-5 w-5" />
                    </Button>

                    <div className="pr-12">
                        {/* Dynamic header based on nivel */}
                        {partida.nivel === 3 ? (
                            // Sub-partida (nivel 3)
                            <>
                                <h1 className="text-xl text-foreground mb-1">{partida.nombre}</h1>
                                <p className="text-sm text-subtle-foreground mb-3">
                                    {partida.sub_partida}
                                </p>
                                <div className="flex justify-end">
                                    <span className="text-sm text-subtle-foreground">Sub Partida</span>
                                </div>
                            </>
                        ) : partida.nivel === 2 ? (
                            // Familia without sub-partidas (nivel 2)
                            <>
                                <h1 className="text-xl text-foreground mb-1">{partida.nombre}</h1>
                                <p className="text-sm text-subtle-foreground mb-3">
                                    {partida.familia}
                                </p>
                                <div className="flex justify-end">
                                    <span className="text-sm text-subtle-foreground">Familia</span>
                                </div>
                            </>
                        ) : (
                            // Fallback for other niveles
                            <>
                                <h1 className="text-xl text-foreground mb-1">{partida.nombre}</h1>
                                <p className="text-sm text-subtle-foreground mb-3">
                                    {partida.familia || partida.sub_partida}
                                </p>
                                <div className="flex justify-end">
                                    <span className="text-sm text-subtle-foreground">Partida</span>
                                </div>
                            </>
                        )}
                    </div>

                    <Button
                        onClick={() => {
                            if (partida.proyecto) {
                                addPaymentModal.onOpen({
                                    projectId: partida.proyecto
                                });
                            }
                        }}
                        className="bg-inverse hover:bg-inverse text-on-color text-sm px-4 py-2"
                    >
                        Nuevo Pago +
                    </Button>
                </div>

                {/* Progress Bar and Summary */}
                <div className="bg-card  shadow-smp-6 mb-4">
                    {/* Progress Bar */}
                    <div className="w-full bg-disabled rounded-full h-2 mb-6">
                        <div
                            className="h-2 rounded-full transition-all duration-300 bg-green-500"
                            style={{ width: `${Math.min(porcentajePagado, 100)}%` }}
                        ></div>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-xs text-subtle-foreground mb-1">Presupuesto Aprobado</p>
                            <p className="text-base  text-foreground">{formatCurrency(presupuestoAprobado.toString())}</p>
                        </div>
                        <div>
                            <p className="text-xs text-subtle-foreground mb-1">Total Pagado</p>
                            <p className="text-base  text-green-600">{formatCurrency(totalPagado.toString())}</p>
                        </div>
                        <div>
                            <p className="text-xs text-subtle-foreground mb-1">Por Ejercer</p>
                            <p className="text-base  text-orange-600">{formatCurrency(porEjercer.toString())}</p>
                        </div>
                    </div>
                </div>

                {/* Payment Cards */}
                {partida.pagos && partida.pagos.length > 0 ? (
                    <div className="space-y-8">
                        {partida.pagos.map((pago, index) => (
                            <div key={index} className="bg-card">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4 border-b border-border-strong pb-4">
                                    <div className="flex items-center gap-3">
                                        {(() => {
                                            const status = pago.status || pago.transaction?.status;
                                            const isPagado = status === 'Pagado' || (!status && pago.monto > 0);
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
                                            <p className="text-base  text-foreground">
                                                {pago.status || pago.transaction?.status || (pago.monto > 0 ? 'Aprobado' : 'Pendiente')}
                                            </p>
                                            <p className="text-left text-sm text-subtle-foreground">Pago #{String(index + 1).padStart(3, '0')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xl text-foreground">
                                            {formatCurrency(pago.monto.toString())} {pago.moneda || pago.transaction?.moneda || 'MXN'}
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
                                                                <AlertDialogAction onClick={() => {
                                                                    if (pago.transaction?._id) {
                                                                        deleteTransaction({ id: pago.transaction._id });
                                                                    }
                                                                }}>
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
                                    {/* Show transaction ID if available */}
                                    {pago.transaction?._id && (
                                        <div className="flex justify-between pb-2 mb-2 border-b border-border">
                                            <span className="text-subtle-foreground text-xs">Transacción</span>
                                            <p className="text-foreground text-right text-xs font-mono">
                                                #{pago.transaction._id.slice(-8)}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-subtle-foreground">Fecha</span>
                                        <p className="text-foreground text-right">{pago.fecha || pago.transaction?.fecha || 'N/A'}</p>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-subtle-foreground">Método de pago</span>
                                        <p className="text-foreground text-right">{pago.tipo_pago || pago.transaction?.tipo_pago || 'N/A'}</p>
                                    </div>
                                    {(pago.banco || pago.transaction?.banco) && (
                                        <div className="flex justify-between">
                                            <span className="text-subtle-foreground">Banco</span>
                                            <p className="text-foreground text-right">{pago.banco || pago.transaction?.banco}</p>
                                        </div>
                                    )}
                                    {(pago.numero_cuenta || pago.transaction?.numero_cuenta) && (
                                        <div className="flex justify-between">
                                            <span className="text-subtle-foreground">Cuenta cargo</span>
                                            <p className="text-foreground text-right">{pago.numero_cuenta || pago.transaction?.numero_cuenta}</p>
                                        </div>
                                    )}
                                    {(pago.numero_transferencia || pago.transaction?.numero_transferencia) && (
                                        <div className="flex justify-between">
                                            <span className="text-subtle-foreground">Cuenta abono</span>
                                            <p className="text-foreground text-right">{pago.numero_transferencia || pago.transaction?.numero_transferencia}</p>
                                        </div>
                                    )}
                                    {(pago.codigo_referencia || pago.transaction?.codigo_referencia) && (
                                        <div className="flex justify-between">
                                            <span className="text-subtle-foreground">Referencia</span>
                                            <p className="text-foreground text-right font-mono text-xs">{pago.codigo_referencia || pago.transaction?.codigo_referencia}</p>
                                        </div>
                                    )}
                                    {/* Show warning if no transaction data */}
                                    {!pago.transaction && (
                                        <div className="flex justify-center pt-2">
                                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                                                ⚠️ Sin datos de transacción
                                            </Badge>
                                        </div>
                                    )}
                                </div>

                                {/* Badges */}
                                <div className="flex items-center gap-2 flex-wrap mb-4">
                                    {(pago.banco || pago.transaction?.banco) && (
                                        <Badge variant="outline" className="text-xs px-3 py-1">
                                            {pago.banco || pago.transaction?.banco}
                                        </Badge>
                                    )}
                                    {(pago.tipo_pago || pago.transaction?.tipo_pago) && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 capitalize">
                                            {(pago.tipo_pago || pago.transaction?.tipo_pago) === 'transferencia' ? 'Transferencia' :
                                                (pago.tipo_pago || pago.transaction?.tipo_pago) === 'tarjeta' ? 'Tarjeta' :
                                                    (pago.tipo_pago || pago.transaction?.tipo_pago)}
                                        </Badge>
                                    )}
                                    {(pago.moneda || pago.transaction?.moneda) && (pago.moneda || pago.transaction?.moneda) !== 'MXN' && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 bg-blue-50">
                                            {pago.moneda || pago.transaction?.moneda} {(pago.tipo_cambio || pago.transaction?.tipo_cambio) && `(TC: ${pago.tipo_cambio || pago.transaction?.tipo_cambio})`}
                                        </Badge>
                                    )}
                                    {(pago.tarjeta || pago.transaction?.tarjeta) && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 bg-purple-50">
                                            {pago.tarjeta || pago.transaction?.tarjeta}
                                        </Badge>
                                    )}
                                    {(pago.factura || pago.transaction?.factura) && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 flex items-center gap-1">
                                            {(pago.factura || pago.transaction?.factura)?.includes('http') ? 'Factura' : (pago.factura || pago.transaction?.factura)}
                                            <Check className="h-3 w-3 text-green-600" />
                                        </Badge>
                                    )}
                                    {(pago.transaction?.categoria) && (
                                        <Badge variant="outline" className="text-xs px-3 py-1 bg-indigo-50">
                                            {pago.transaction.categoria}
                                        </Badge>
                                    )}
                                </div>

                                {/* Documents Section */}
                                {(() => {
                                    const pagoDocuments = getDocumentsForPago(pago as EnrichedPayment);
                                    if (pagoDocuments.length > 0) {
                                        return (
                                            <div className="mt-4 pt-4 border-t border-border">
                                                <p className="text-xs font-medium text-foreground mb-3">Documentos adjuntos ({pagoDocuments.length})</p>
                                                <div className="space-y-2">
                                                    {pagoDocuments.map((doc) => (
                                                        <div key={doc._id} className="flex items-center justify-between p-2 bg-background rounded-md hover:bg-muted transition-colors">
                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-sm font-medium text-foreground truncate">{doc.nombre}</p>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <Badge variant="outline" className="text-xs px-2 py-0.5">
                                                                            {doc.type}
                                                                        </Badge>
                                                                        {doc.descripcion && (
                                                                            <p className="text-xs text-subtle-foreground truncate">{doc.descripcion}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 ml-2">
                                                                {doc.image && (
                                                                    <>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-8 w-8 p-0"
                                                                            onClick={() => window.open(getFileUrl(doc.image!), '_blank')}
                                                                        >
                                                                            <FileText className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-8 w-8 p-0"
                                                                            onClick={() => window.open(getFileDownloadUrl(doc.image!), '_blank')}
                                                                        >
                                                                            <Download className="h-4 w-4" />
                                                                        </Button>
                                                                    </>
                                                                )}
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
                    <div className="bg-card shadow-sm p-8 text-center rounded-lg border border-border">
                        <p className="text-subtle-foreground mb-4">
                            No hay pagos registrados para esta {partida.nivel === 3 ? 'sub-partida' : partida.nivel === 2 ? 'familia' : 'partida'}
                        </p>
                        {partida.pagado > 0 && (
                            <div className="bg-orange-50 border border-orange-200 rounded p-4 mt-4">
                                <p className="text-sm text-orange-800">
                                    ⚠️ Nota: El campo "pagado" muestra {formatCurrency(partida.pagado.toString())}, pero no hay transacciones registradas.
                                </p>
                                <p className="text-xs text-orange-600 mt-2">
                                    Esto puede ser datos heredados del Excel. Usa "Nuevo Pago +" para crear transacciones.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
