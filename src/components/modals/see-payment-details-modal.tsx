"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { informacion_facturacion_pago } from "@/lib/utils";

export default function SeePaymentDetailsModal() {
    const paymentContext = useSeePaymentDetailsModal((state) => state.paymentContext);
    const isOpen = useSeePaymentDetailsModal((state) => state.isOpen);
    const onClose = useSeePaymentDetailsModal((state) => state.onClose);

    const formatCurrency = (amount: string | number) => {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(numAmount);
    };

    const calculatePaymentPercentage = (paymentAmount: string, totalAmount: number) => {
        const amount = parseFloat(paymentAmount);
        return totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
    };

    const getTotalPaidAmount = () => {
        if (!paymentContext?.payments) return 0;
        return paymentContext.payments.reduce((total, payment) => {
            return total + parseFloat(payment.monto);
        }, 0);
    };

    const getTotalPaidPercentage = () => {
        const totalPaid = getTotalPaidAmount();
        return paymentContext?.totalAmount ? (totalPaid / paymentContext.totalAmount) * 100 : 0;
    };

    const getRemainingAmount = () => {
        const totalPaid = getTotalPaidAmount();
        return (paymentContext?.totalAmount || 0) - totalPaid;
    };

    if (!paymentContext) return null;

    const { payments, relatedCost, totalAmount } = paymentContext;
    const totalPaidPercentage = getTotalPaidPercentage();
    const remainingAmount = getRemainingAmount();

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Detalles de Pagos</SheetTitle>
                    <SheetDescription>
                        Información detallada de los pagos realizados
                    </SheetDescription>
                </SheetHeader>

                {/* Payment Summary */}
                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="text-lg">Resumen de Pagos</CardTitle>
                        <CardDescription>Estado general de los pagos</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Monto Total</p>
                                <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Total Pagado</p>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(getTotalPaidAmount())}</p>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-medium">Progreso de Pago</p>
                                <Badge variant={totalPaidPercentage >= 100 ? "default" : "secondary"}>
                                    {totalPaidPercentage.toFixed(1)}%
                                </Badge>
                            </div>
                            <Progress value={Math.min(totalPaidPercentage, 100)} className="h-2" />
                        </div>

                        {remainingAmount > 0 && (
                            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                                <p className="text-sm font-medium text-orange-800">Monto Pendiente</p>
                                <p className="text-lg font-bold text-orange-900">{formatCurrency(remainingAmount)}</p>
                            </div>
                        )}

                        {remainingAmount < 0 && (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm font-medium text-red-800">Sobrepago</p>
                                <p className="text-lg font-bold text-red-900">{formatCurrency(Math.abs(remainingAmount))}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Related Cost Information */}
                {relatedCost && (
                    <Card className="mt-4">
                        <CardHeader>
                            <CardTitle className="text-lg">Información del Costo</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="font-medium">Administración:</span>
                                    <p className="text-muted-foreground">{relatedCost.administracion}</p>
                                </div>
                                <div>
                                    <span className="font-medium">Partida:</span>
                                    <p className="text-muted-foreground">{relatedCost.partida}</p>
                                </div>
                                <div>
                                    <span className="font-medium">Familia:</span>
                                    <p className="text-muted-foreground">{relatedCost.familia}</p>
                                </div>
                                <div>
                                    <span className="font-medium">Sub Partida:</span>
                                    <p className="text-muted-foreground">{relatedCost.sub_partida}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Separator className="my-4" />

                {/* Individual Payments */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Pagos Individuales ({payments.length})</h3>

                    {payments.map((payment, index) => {
                        const paymentPercentage = calculatePaymentPercentage(payment.monto, totalAmount);

                        return (
                            <Card key={payment._id || index}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">Pago #{index + 1}</CardTitle>
                                        <div className="flex gap-2">
                                            <Badge variant="outline">
                                                {paymentPercentage.toFixed(1)}%
                                            </Badge>
                                            <Badge variant={paymentPercentage <= 100 ? "default" : "destructive"}>
                                                {formatCurrency(payment.monto)}
                                            </Badge>
                                        </div>
                                    </div>
                                    <CardDescription>
                                        Fecha: {payment.fecha} | Tipo: {payment.tipo_pago}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4 text-sm">

                                        <div>
                                            <span className="font-medium">Banco:</span>
                                            <div className="flex items-center gap-2">
                                                <p className="text-muted-foreground">{payment.banco}</p>
                                                {payment.banco ? (
                                                    <img
                                                        src={payment.logo_banco}
                                                        alt={payment.banco}
                                                        width={50}
                                                    />
                                                ) : (
                                                    <p className="text-muted-foreground">Efectivo</p>
                                                )}
                                            </div>
                                        </div>

                                        {payment.tarjeta && (
                                            <div>
                                                <span className="font-medium">Tarjeta:</span>
                                                <p className="text-muted-foreground">{payment.tarjeta}</p>
                                            </div>
                                        )}
                                        {payment.numero_cuenta && (
                                            <div>
                                                <span className="font-medium">Número de Cuenta:</span>
                                                <p className="text-muted-foreground">{payment.numero_cuenta}</p>
                                            </div>
                                        )}
                                        {payment.numero_transferencia && (
                                            <div>
                                                <span className="font-medium">Número de Transferencia:</span>
                                                <p className="text-muted-foreground">{payment.numero_transferencia}</p>
                                            </div>
                                        )}
                                        {payment.codigo_referencia && (
                                            <div>
                                                <span className="font-medium">Código de Referencia:</span>
                                                <p className="text-muted-foreground">{payment.codigo_referencia}</p>
                                            </div>
                                        )}
                                        {payment.factura && (
                                            <div>
                                                <span className="font-medium">Factura:</span>
                                                <p className="text-muted-foreground">{payment.factura}</p>
                                            </div>
                                        )}
                                        {payment.moneda && payment.moneda !== 'MXN' && (
                                            <div>
                                                <span className="font-medium">Moneda:</span>
                                                <p className="text-muted-foreground">{payment.moneda}</p>
                                            </div>
                                        )}
                                        {payment.tipo_cambio && payment.tipo_cambio !== '1' && (
                                            <div>
                                                <span className="font-medium">Tipo de Cambio:</span>
                                                <p className="text-muted-foreground">{payment.tipo_cambio}</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                                {

                                    informacion_facturacion_pago.filter((facturacion) => facturacion._id === payment.informacion_facturacion_pago)[0]
                                    && (
                                        <>
                                            <Separator />
                                            <div className="m-6 bg-gray-100 p-4 rounded-xl space-y-4">
                                                <h3 className="text-lg font-semibold">Información de Facturación</h3>
                                                <CardFooter className="px-0">
                                                    <div className="grid grid-cols-1 gap-2 text-sm w-full">
                                                        <div className="flex flex-row w-full justify-between">
                                                            <span className="font-semibold text-gray-700">Calle:</span>
                                                            <p className="text-muted-foreground">{informacion_facturacion_pago.filter((facturacion) => facturacion._id === payment.informacion_facturacion_pago)[0].calle}</p>
                                                        </div>
                                                        <div className="flex flex-row w-full justify-between">
                                                            <span className="font-semibold text-gray-700">Colonia:</span>
                                                            <p className="text-muted-foreground">{informacion_facturacion_pago.filter((facturacion) => facturacion._id === payment.informacion_facturacion_pago)[0].colonia}</p>
                                                        </div>
                                                        <div className="flex flex-row w-full justify-between">
                                                            <span className="font-semibold text-gray-700">Municipio:</span>
                                                            <p className="text-muted-foreground">{informacion_facturacion_pago.filter((facturacion) => facturacion._id === payment.informacion_facturacion_pago)[0].municipio}</p>
                                                        </div>
                                                        <div className="flex flex-row w-full justify-between">
                                                            <span className="font-semibold text-gray-700">Estado:</span>
                                                            <p className="text-muted-foreground">{informacion_facturacion_pago.filter((facturacion) => facturacion._id === payment.informacion_facturacion_pago)[0].estado}</p>
                                                        </div>
                                                        <div className="flex flex-row w-full justify-between">
                                                            <span className="font-semibold text-gray-700">Código Postal:</span>
                                                            <p className="text-muted-foreground">{informacion_facturacion_pago.filter((facturacion) => facturacion._id === payment.informacion_facturacion_pago)[0].codigo_postal}</p>
                                                        </div>
                                                    </div>
                                                </CardFooter>
                                            </div>
                                        </>
                                    )
                                }
                            </Card>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    )
}
