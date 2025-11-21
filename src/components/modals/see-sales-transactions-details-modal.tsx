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
import { Check, Lock, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { useAddPaymentModal } from "@/hooks/add-sale-payment-modal";

export default function SeeSalesTransactionsDetailsModal() {
    const paymentContext = useSeeSalesPaymentDetailsModal((state) => state.paymentContext);
    const isOpen = useSeeSalesPaymentDetailsModal((state) => state.isOpen);
    const onClose = useSeeSalesPaymentDetailsModal((state) => state.onClose);
    const addPaymentModal = useAddPaymentModal((state) => state);

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

    const handleOpenAddPayment = () => {
        if (paymentContext?.relatedPartida && paymentContext.relatedPartida.sales_proyecto) {
            addPaymentModal.onOpen({
                projectId: paymentContext.relatedPartida.sales_proyecto,
                relatedPartida: paymentContext.relatedPartida
            });
        }
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
    
    // Always show grouped transactions for sales (all niveles)
    // This prevents showing duplicate line items from the same transaction
    const shouldShowTransactions = true;
    const groupedTransactions = shouldShowTransactions ? getGroupedTransactions() : [];

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                {paymentContext && (
                    <>

                                            <div className="flex justify-end mt-4 items-end">
                            <Button size={"md"} variant="secondary" onClick={handleOpenAddPayment}>
                                Nuevo Pago
                                <Plus className="h-3 w-3 bg-gray-600 text-white p-0.5 rounded-full" />
                            </Button>
                        </div>
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
                                Transacciones
                                <Badge variant="secondary" className="ml-2">
                                    {groupedTransactions.length}
                                </Badge>
                            </h3>

                            {/* Show grouped transactions */}
                            {groupedTransactions.map((group) => {
                                    const isPagado = group.transaction.status === 'Pagado';
                                    const lineItemsCount = group.lineItems.length;
                                    
                                    return (
                                        <div key={group.transaction._id} className="bg-white overflow-hidden">
                                            {/* Transaction Header */}
                                            <div className="p-4 border-b border-gray-400 leading-none">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <div className={`w-12 h-12 rounded-md flex items-center justify-center ${
                                                            isPagado ? 'bg-[#E0F0E2]' : 'bg-orange-100'
                                                        }`}>
                                                            {isPagado ? (
                                                                <div className="w-fit bg-green-800 rounded-full p-0.5">
                                                                    <Check className="w-4 h-4 text-white" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-fit bg-orange-800 rounded-full p-0.5">
                                                                    <Lock className="w-4 h-4 text-white" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900">
                                                                {group.transaction.status || (isPagado ? 'Aprobado' : 'Pendiente')}
                                                            </p>
                                                            <p className="text-sm text-gray-600">
                                                                {group.transaction.nombre_cliente || 'Cliente no especificado'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center gap-3">
                                                        <p className="text-xl text-gray-900">
                                                            {formatCurrency(group.transaction.monto_total || 0)} {group.transaction.moneda || 'MXN'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Transaction Details */}
                                            <div className="p-4 space-y-3">
                                                <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-[#777770]">Fecha</span>
                                                        <span className="text-muted-foreground">{group.transaction.fecha || 'No especificada'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-[#777770]">Método de pago</span>
                                                        <span className="text-muted-foreground">{group.transaction.tipo_pago || 'No especificado'}</span>
                                                    </div>
                                                    {group.transaction.codigo_referencia && (
                                                        <div className="flex justify-between">
                                                            <span className="text-[#777770]">Referencia</span>
                                                            <span className="text-muted-foreground">{group.transaction.codigo_referencia}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Line Items Summary */}
                                                {lineItemsCount > 0 && (
                                                    <div className="mt-4 pt-3 border-t border-gray-200">
                                                        <p className="text-xs font-medium text-gray-500 mb-2">
                                                            Conceptos incluidos:
                                                        </p>
                                                        <div className="space-y-1">
                                                            {group.lineItems.map((item, idx) => (
                                                                <div key={idx} className="flex justify-between text-sm">
                                                                    <span className="text-gray-600 truncate">
                                                                        {item.partida && item.familia && item.sub_partida
                                                                            ? `${item.partida} › ${item.familia} › ${item.sub_partida}`
                                                                            : item.partida && item.familia
                                                                            ? `${item.partida} › ${item.familia}`
                                                                            : item.partida || 'Concepto'}
                                                                    </span>
                                                                    <span className="text-gray-900 ml-2 whitespace-nowrap">
                                                                        {formatCurrency(item.monto)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2">
                                                    {/* Additional Tags */}
                                                    <div className="space-y-2 pt-2 flex flex-wrap gap-2">
                                                        {group.transaction.moneda && group.transaction.moneda !== 'MXN' && (
                                                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                                                                {group.transaction.moneda}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                            {/* Empty State */}
                            {groupedTransactions.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <p>No hay transacciones registradas</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
