"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useSeePaymentDetailsModal } from "@/hooks/see-transactions-details";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import PaymentCard from "../Cards/PaymentCard";
import TransactionCardWithDocuments from "../Cards/TransactionCardWithDocuments";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { Doc } from "convex/_generated/dataModel";

export default function SeeTransactionsDetailsModal() {
    const paymentContext = useSeePaymentDetailsModal((state) => state.paymentContext);
    const isOpen = useSeePaymentDetailsModal((state) => state.isOpen);
    const onClose = useSeePaymentDetailsModal((state) => state.onClose);
    const addPaymentModal = useAddPaymentModal();

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
        if (paymentContext?.relatedPartida && paymentContext.relatedPartida.proyecto) {
            addPaymentModal.onOpen({
                projectId: paymentContext.relatedPartida.proyecto,
                relatedPartida: paymentContext.relatedPartida
            });
        }
    };

    // Group payments by transaction for nivel 1 and 2
    const getGroupedTransactions = () => {
        if (!paymentContext?.payments) return [];

        type PaymentType = typeof paymentContext.payments[number];

        const transactionMap = new Map<string, {
            transaction: Doc<"transacciones">;
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

    // Don't return null before rendering Sheet - this breaks exit animation

    // TODO: IMPLEMENT THIS SOLUTION FOR THE REST OF THE MODALS
    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                {paymentContext && (
                    <>
                        <div className="flex justify-end mt-4 items-end">
                            <Button size={"default"} variant="secondary" onClick={handleOpenAddPayment}>
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
                                        {paymentContext.relatedPartida?.nivel === 1 && 'Partida'}
                                        {paymentContext.relatedPartida?.nivel === 2 && 'Familia'}
                                        {paymentContext.relatedPartida?.nivel === 3 && 'Sub-partida'}
                                    </CardDescription>
                                    {/* <span className="text-muted-foreground text-right">
                                        Nivel {paymentContext.relatedPartida?.nivel}
                                    </span> */}
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
                                        <p className="text-sm font-medium text-gray-500">Presupuesto probado</p>
                                        <p className="text-lg">{formatCurrency(paymentContext.totalAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-500 text-left">Pagado</p>
                                        <p className="text-lg text-green-800 text-left">{formatCurrency(getTotalPaidAmount())}</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <p className="text-sm font-medium text-gray-500 text-right">Por ejercer</p>
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

                        {/* Show Transactions for nivel 1 and 2, Individual Payments for nivel 3 */}
                        {shouldShowTransactions ? (
                            // Show grouped transactions
                            groupedTransactions.map((group, index) => (
                                <TransactionCardWithDocuments
                                    key={group.transaction._id}
                                    transaction={group.transaction}
                                    lineItems={group.lineItems}
                                    index={index}
                                    formatCurrency={formatCurrency}
                                />
                            ))
                        ) : (
                            // Show individual payments for nivel 3
                            paymentContext.payments.map((payment, index) => (
                                <PaymentCard
                                    key={payment._id || index}
                                    payment={payment}
                                    index={index}
                                    formatCurrency={formatCurrency}
                                    relatedPartida={paymentContext.relatedPartida}
                                />
                            ))
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
