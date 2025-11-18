"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useSeeSalesPaymentDetailsModal } from "@/hooks/see-sales-transactions-details";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Doc } from "convex/_generated/dataModel";

export default function SeeSalesTransactionsDetailsModal() {
    const paymentContext = useSeeSalesPaymentDetailsModal((state) => state.paymentContext);
    const isOpen = useSeeSalesPaymentDetailsModal((state) => state.isOpen);
    const onClose = useSeeSalesPaymentDetailsModal((state) => state.onClose);

    const formatCurrency = (amount: string | number) => {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(numAmount);
    };

    const getTotalPaidAmount = () => {
        if (!paymentContext?.payments) return 0;
        // Only count payments with status "Pagado" or legacy payments without status
        return paymentContext.payments.reduce((total, payment) => {
            const isPagado = payment.status === 'Pagado' || !payment.status;
            return isPagado ? total + payment.monto : total;
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

    // Group payments by transaction for nivel 1 and 2
    const getGroupedTransactions = () => {
        if (!paymentContext?.payments) return [];
        
        type PaymentType = typeof paymentContext.payments[number];
        
        const transactionMap = new Map<string, {
            transaction: Doc<"sales_transacciones">;
            lineItems: PaymentType[];
        }>();
        
        paymentContext.payments.forEach(payment => {
            if (payment.transaction && payment.transaction._id) {
                const txId = payment.transaction._id;
                if (!transactionMap.has(txId)) {
                    transactionMap.set(txId, {
                        transaction: payment.transaction,
                        lineItems: []
                    });
                }
                transactionMap.get(txId)!.lineItems.push(payment);
            }
        });
        
        return Array.from(transactionMap.values());
    };
    
    // Determine if we should show transactions or individual payments
    const shouldShowTransactions = paymentContext?.relatedPartida?.nivel === 1 || 
                                    paymentContext?.relatedPartida?.nivel === 2;
    const groupedTransactions = shouldShowTransactions ? getGroupedTransactions() : [];

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                {paymentContext && (
                    <>
                        <SheetHeader>
                            <SheetTitle className="hidden">Detalles de Pagos</SheetTitle>
                            <SheetDescription className="hidden">
                                Información detallada de los pagos realizados
                            </SheetDescription>
                        </SheetHeader>

                        {/* Payment Summary */}
                        <Card className="mt-4 rounded-none border-none shadow-none">
                            <CardHeader>
                                <div className="flex justify-between items-end">
                                    <div>
                                        {paymentContext.relatedPartida?.nivel === 1 &&
                                            <>
                                                <h3>{paymentContext.relatedPartida.nombre}</h3>
                                            </>}
                                        {paymentContext.relatedPartida?.nivel === 2 &&
                                            <>
                                                <h3>{paymentContext.relatedPartida.partida_nombre || paymentContext.relatedPartida.nombre}</h3>
                                                <h4 className="text-gray-600">{paymentContext.relatedPartida.familia}</h4>
                                            </>}
                                        {paymentContext.relatedPartida?.nivel === 3 &&
                                            <>
                                                <h3>{paymentContext.relatedPartida.partida_nombre || paymentContext.relatedPartida.nombre}</h3>
                                                <h4 className="text-gray-600">{paymentContext.relatedPartida.familia}</h4>
                                                <h5 className="text-gray-500">{paymentContext.relatedPartida.sub_partida || paymentContext.relatedPartida.nombre}</h5>
                                            </>}
                                    </div>
                                    <CardDescription className="text-gray-400 text-right text-base">
                                        {paymentContext.relatedPartida?.nivel === 1 && 'Unidad'}
                                        {paymentContext.relatedPartida?.nivel === 2 && 'Familia'}
                                        {paymentContext.relatedPartida?.nivel === 3 && 'Sub-partida'}
                                    </CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-8">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        {getTotalPaidPercentage() > 100 && (
                                            <Badge variant="destructive" className="text-xs">
                                                Sobrepasado {getTotalPaidPercentage().toFixed(1)}%
                                            </Badge>
                                        )}
                                    </div>
                                    {/* Progress Bar with Over 100% handling */}
                                    <div className={`w-full h-2 mb-6 ${getTotalPaidPercentage() > 100 ? 'bg-red-200' : 'bg-green-200'}`}>
                                        <div
                                            className={`h-2 transition-all duration-300 ${getTotalPaidPercentage() > 100 ? 'bg-red-500' : 'bg-green-500'}`}
                                            style={{ width: `${Math.min(getTotalPaidPercentage(), 100)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-20 justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Presupuesto aprobado</p>
                                        <p className="text-lg">{formatCurrency(paymentContext.totalAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-500 text-left">Pagado</p>
                                        <p className="text-lg text-green-800 text-left">{formatCurrency(getTotalPaidAmount())}</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <p className="text-sm font-medium text-gray-500 text-right">Por cobrar</p>
                                        {getRemainingAmount() > 0 && (
                                            <p className="text-lg text-orange-800 text-right mb-1">{formatCurrency(getRemainingAmount())}</p>
                                        )}
                                        {getRemainingAmount() <= 0 && getRemainingAmount() > -0.01 && (
                                            <p className="text-lg text-green-800 text-right mb-1">{formatCurrency(0)}</p>
                                        )}
                                        {getRemainingAmount() < -0.01 && (
                                            <p className="text-lg text-red-800 text-right mb-1">{formatCurrency(getRemainingAmount())}</p>
                                        )}
                                        <Badge variant={"outline"} className="w-fit">
                                            {getRemainingAmount() >= 0 ? `Pendiente ${(getRemainingAmount() / paymentContext.totalAmount * 100).toFixed(0)}%` : `${(getRemainingAmount() / paymentContext.totalAmount * 100).toFixed(0)}%`}
                                        </Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Separator className="my-4" />

                        {/* Transactions/Payments List */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">
                                {shouldShowTransactions ? 'Transacciones' : 'Pagos'}
                                <Badge variant="secondary" className="ml-2">
                                    {shouldShowTransactions ? groupedTransactions.length : paymentContext.payments.length}
                                </Badge>
                            </h3>

                            {shouldShowTransactions ? (
                                // Show grouped transactions
                                groupedTransactions.map((group) => (
                                    <Card key={group.transaction._id} className="p-4">
                                        <div className="space-y-3">
                                            {/* Transaction Header */}
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-medium">
                                                        {group.transaction.nombre_cliente || 'Cliente no especificado'}
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {group.transaction.fecha || 'Fecha no especificada'}
                                                    </p>
                                                </div>
                                                <Badge variant={
                                                    group.transaction.status === 'Pagado' ? 'default' : 
                                                    group.transaction.status === 'Pendiente' ? 'secondary' : 
                                                    'outline'
                                                }>
                                                    {group.transaction.status || 'Sin estado'}
                                                </Badge>
                                            </div>

                                            {/* Transaction Details */}
                                            <div className="text-sm space-y-1">
                                                {group.transaction.tipo_pago && (
                                                    <p><span className="text-gray-600">Tipo:</span> {group.transaction.tipo_pago}</p>
                                                )}
                                                {group.transaction.codigo_referencia && (
                                                    <p><span className="text-gray-600">Referencia:</span> {group.transaction.codigo_referencia}</p>
                                                )}
                                                {group.transaction.moneda && group.transaction.moneda !== 'MXN' && (
                                                    <p><span className="text-gray-600">Moneda:</span> {group.transaction.moneda}</p>
                                                )}
                                            </div>

                                            {/* Line Items */}
                                            <div className="border-t pt-3 space-y-2">
                                                <p className="text-sm font-medium text-gray-600">Conceptos:</p>
                                                {group.lineItems.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm pl-4">
                                                        <span className="text-gray-600">
                                                            {item.partida || item.familia || item.sub_partida || 'Concepto'}
                                                        </span>
                                                        <span className="font-medium">
                                                            {formatCurrency(item.monto)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Total */}
                                            <div className="border-t pt-2 flex justify-between font-semibold">
                                                <span>Total:</span>
                                                <span>{formatCurrency(group.transaction.monto_total || 0)}</span>
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            ) : (
                                // Show individual payments for nivel 3
                                paymentContext.payments.map((payment, index) => (
                                    <Card key={payment._id || index} className="p-4">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-medium">
                                                        {payment.transaction?.nombre_cliente || 'Cliente no especificado'}
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {payment.fecha || payment.transaction?.fecha || 'Fecha no especificada'}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-lg">
                                                        {formatCurrency(payment.monto)}
                                                    </p>
                                                    <Badge variant={
                                                        payment.status === 'Pagado' ? 'default' : 
                                                        payment.status === 'Pendiente' ? 'secondary' : 
                                                        'outline'
                                                    }>
                                                        {payment.status || 'Sin estado'}
                                                    </Badge>
                                                </div>
                                            </div>
                                            
                                            {/* Payment Details */}
                                            <div className="text-sm space-y-1 text-gray-600">
                                                {payment.tipo_pago && (
                                                    <p><span className="font-medium">Tipo:</span> {payment.tipo_pago}</p>
                                                )}
                                                {payment.codigo_referencia && (
                                                    <p><span className="font-medium">Referencia:</span> {payment.codigo_referencia}</p>
                                                )}
                                                {payment.moneda && payment.moneda !== 'MXN' && (
                                                    <p><span className="font-medium">Moneda:</span> {payment.moneda}</p>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            )}

                            {/* Empty State */}
                            {paymentContext.payments.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <p>No hay pagos registrados</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
