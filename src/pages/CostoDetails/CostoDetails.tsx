import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "convex/_generated/dataModel";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useEditPaymentModal } from "@/hooks/edit-payment-modal";
import { EllipsisVerticalIcon, Edit, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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
type PaymentWithBilling = Omit<Doc<"pagos">, "informacion_facturacion_pago"> & {
    informacion_facturacion_pago?: Doc<"informacion_facturacion_pago"> | null;
};

export default function CostoDetails() {

    const params = useParams();
    const id = params.id;
    const costo = useQuery(api.costos.getById, { id: id as Id<"costos"> });


    const deletePayment = useMutation(api.pagos.deletePayment);

    console.log(costo);

    const addPaymentModal = useAddPaymentModal();
    const editPaymentModal = useEditPaymentModal();

    if (!costo) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Cargando detalles del costo...</p>
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

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        const [day, month, year] = dateStr.split('/');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const totalPagado = costo.pagos?.reduce((sum, pago) => {
        return sum + parseFloat(pago.monto || '0');
    }, 0) || 0;

    const montoTotal = parseFloat(costo.monto_decimal?.toString() || '0');
    const saldoPendiente = montoTotal - totalPagado;
    const porcentajePagado = montoTotal > 0 ? (totalPagado / montoTotal) * 100 : 0;

    const handleEditPayment = (pago: PaymentWithBilling) => {

        editPaymentModal.onOpen({
            payment: pago,
            relatedCost: costo,
            totalAmount: montoTotal
        });
    };


    return (
        <div className=" py-8 m-4 rounded-lg min-h-screen">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Detalles del Costo</h1>
                    <p className="mt-2 text-gray-600">Información completa del costo y sus pagos asociados</p>
                </div>

                {/* Cost Summary Card */}
                <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-500">Monto Total</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(costo.monto_decimal?.toString() || '0')}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-500">Total Pagado</p>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado.toString())}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-500">Saldo Pendiente</p>
                            <p className={`text-2xl font-bold ${saldoPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(saldoPendiente.toString())}
                            </p>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-6">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                            <span>Progreso de Pago</span>
                            <span>{porcentajePagado.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                                className={`h-3 rounded-full transition-all duration-300 ${porcentajePagado >= 100 ? 'bg-green-500' :
                                    porcentajePagado >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                style={{ width: `${Math.min(porcentajePagado, 100)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Cost Information */}
                    <div className="bg-white rounded-lg shadow-lg p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Información del Costo</h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Administración</label>
                                    <p className="mt-1 text-sm text-gray-900">{costo.administracion}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Partida</label>
                                    <p className="mt-1 text-sm text-gray-900">{costo.partida}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Familia</label>
                                    <p className="mt-1 text-sm text-gray-900">{costo.familia}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Sub Partida</label>
                                    <p className="mt-1 text-sm text-gray-900">{costo.sub_partida}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Fecha</label>
                                    <p className="mt-1 text-sm text-gray-900">{formatDate(costo.fecha)}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Monto</label>
                                    <p className="mt-1 text-sm font-bold text-gray-900">{formatCurrency(costo.monto_decimal?.toString() || '0')}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Código de Referencia</label>
                                    <p className="mt-1 text-sm text-gray-900">{costo.codigo_referencia}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500">Factura</label>
                                    <p className="mt-1 text-sm text-gray-900">{costo.factura}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payments Section */}
                    <div className="bg-white rounded-lg shadow-lg p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold text-gray-900">Pagos Asociados</h2>
                            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                {costo.pagos?.length || 0} pago(s)
                            </span>
                        </div>

                        <Button
                            onClick={() => addPaymentModal.onOpen({ relatedCost: costo, totalAmount: costo.monto_decimal || 0, remainingAmount: (costo.monto_decimal || 0) - totalPagado })}
                            className="m-4"
                        >
                            Agregar Pago
                        </Button>

                        {costo.pagos && costo.pagos.length > 0 ? (
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                                {costo.pagos.map((pago, index) => {
                                    const porcentajePago = montoTotal > 0 ? (parseFloat(pago.monto) / montoTotal) * 100 : 0;

                                    return (
                                        <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <p className="font-semibold text-gray-900">{formatCurrency(pago.monto)}</p>
                                                    <p className="text-sm text-gray-500">{porcentajePago.toFixed(1)}% del total</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${pago.tipo_pago === 'efectivo' ? 'bg-green-100 text-green-800' :
                                                        pago.tipo_pago === 'transferencia' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-purple-100 text-purple-800'
                                                        }`}>
                                                        {pago.tipo_pago}
                                                    </span>

                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="outline" size="sm">
                                                                <EllipsisVerticalIcon className="h-4 w-4" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-fit" align="end">
                                                            <div className="grid space-y-2">
                                                                <Button variant={"ghost"} onClick={() => handleEditPayment(pago as PaymentWithBilling)}>
                                                                    <Edit className="h-4 w-4 mr-2" />
                                                                    Editar
                                                                </Button>
                                                                <Separator />
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger>
                                                                        <Button variant={"ghost"} className="text-red-600">
                                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                                            Eliminar
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Esta acción no puede ser deshecha.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => deletePayment({ id: pago._id })}>Eliminar</AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span className="text-gray-500">Fecha:</span>
                                                    <span className="ml-1 text-gray-900">{pago.fecha}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Moneda:</span>
                                                    <span className="ml-1 text-gray-900">{pago.moneda || 'MXN'}</span>
                                                </div>

                                                {pago.banco && (
                                                    <div>
                                                        <span className="text-gray-500">Banco:</span>
                                                        <span className="ml-1 text-gray-900">{pago.banco}</span>
                                                    </div>
                                                )}

                                                {pago.numero_cuenta && (
                                                    <div>
                                                        <span className="text-gray-500">Cuenta:</span>
                                                        <span className="ml-1 text-gray-900">{pago.numero_cuenta}</span>
                                                    </div>
                                                )}

                                                {pago.numero_transferencia && (
                                                    <div className="col-span-2">
                                                        <span className="text-gray-500">No. Transferencia:</span>
                                                        <span className="ml-1 text-gray-900">{pago.numero_transferencia}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Billing Information */}
                                            {pago.informacion_facturacion_pago && typeof pago.informacion_facturacion_pago === 'object' && (
                                                <div className="mt-3 pt-3 border-t border-gray-100">
                                                    <p className="text-sm font-medium text-gray-700 mb-2">Información de Facturación</p>
                                                    <div className="grid grid-cols-1 gap-1 text-xs text-gray-600">
                                                        <p><strong>Razón Social:</strong> {pago.informacion_facturacion_pago.razon_social}</p>
                                                        <p><strong>RFC:</strong> {pago.informacion_facturacion_pago.rfc}</p>
                                                        <p><strong>Dirección:</strong> {pago.informacion_facturacion_pago.calle}, {pago.informacion_facturacion_pago.colonia}</p>
                                                        <p><strong>Municipio:</strong> {pago.informacion_facturacion_pago.municipio}, {pago.informacion_facturacion_pago.estado}</p>
                                                        <p><strong>CP:</strong> {pago.informacion_facturacion_pago.codigo_postal}</p>
                                                        {pago.informacion_facturacion_pago.telefono && (
                                                            <p><strong>Teléfono:</strong> {pago.informacion_facturacion_pago.telefono}</p>
                                                        )}
                                                        {pago.informacion_facturacion_pago.correo && (
                                                            <p><strong>Email:</strong> {pago.informacion_facturacion_pago.correo}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <div className="mx-auto h-12 w-12 text-gray-400">
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                    </svg>
                                </div>
                                <h3 className="mt-2 text-sm font-medium text-gray-900">Sin pagos registrados</h3>
                                <p className="mt-1 text-sm text-gray-500">No hay pagos asociados a este costo.</p>

                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
