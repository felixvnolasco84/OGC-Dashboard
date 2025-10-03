"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
// import { informacion_facturacion_pago } from "@/lib/utils";
import PaymentCard from "../Cards/PaymentCard";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import { useManageCostModal } from "@/hooks/manage-cost-modal";


export default function SeePaymentDetailsModal() {
    const paymentContext = useSeePaymentDetailsModal((state) => state.paymentContext);
    const isOpen = useSeePaymentDetailsModal((state) => state.isOpen);
    const onClose = useSeePaymentDetailsModal((state) => state.onClose);
    const openManageCostModal = useManageCostModal();

    const formatCurrency = (amount: string | number) => {
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(numAmount);
    };

    // const calculatePaymentPercentage = (paymentAmount: string, totalAmount: number) => {
    //     const amount = parseFloat(paymentAmount);
    //     return totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
    // };

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

    const { payments,
        // relatedCost,
        totalAmount } = paymentContext;
    const totalPaidPercentage = getTotalPaidPercentage();
    const remainingAmount = getRemainingAmount();

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <div className="flex justify-end mt-4">
                    <Button variant="default" onClick={() => {openManageCostModal.onOpen({cost: paymentContext.relatedPartida, mode: "create"})}}>
                        <span>Nuevo Pago</span>
                        <Plus className="h-4 w-4" />    
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
                        <CardTitle className="text-lg font-normal">{paymentContext?.relatedPartida?.nombre}</CardTitle>
                        <div className="grid grid-cols-2">
                            <CardDescription className="text-muted-foreground">{(paymentContext?.relatedPartida?.sub_partida)}</CardDescription>
                            <span className="text-muted-foreground text-right">Sub Partida</span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                {/* <Badge variant={totalPaidPercentage >= 100 ? "default" : "secondary"}>
                                    {totalPaidPercentage.toFixed(1)}%
                                </Badge> */}
                            </div>
                            <Progress className="bg-green-600 h-1" value={Math.min(totalPaidPercentage, 100)} />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Presupuesto Aprobado</p>
                                <p className="text-lg">{formatCurrency(totalAmount)} MXN</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground text-center">Total Pagado</p>
                                <p className="text-lg text-green-800 text-center">{formatCurrency(getTotalPaidAmount())} MXN</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground text-right">Por Ejercer</p>
                                {remainingAmount > 0 && (
                                    <p className="text-lg text-orange-800 text-right">{formatCurrency(totalAmount - getTotalPaidAmount())} MXN</p>
                                )}
                                {remainingAmount < 0 && (
                                    <p className="text-lg text-red-800 text-right">{formatCurrency(totalAmount - getTotalPaidAmount())} MXN</p>
                                )}
                            </div>
                        </div>

                        {/* {remainingAmount > 0 && (
                            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                                <p className="text-sm font-medium text-orange-800">Monto Pendiente</p>
                                <p className="text-lg text-orange-900">{formatCurrency(remainingAmount)} MXN</p>
                            </div>
                        )} */}

                        {/* {remainingAmount < 0 && (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm font-medium text-red-800">Sobrepago</p>
                                <p className="text-lg text-red-900">{formatCurrency(Math.abs(remainingAmount))} MXN</p>
                            </div>
                        )} */}
                    </CardContent>
                </Card>

                {/* Related Cost Information */}
                {/* {relatedCost && (
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
                )} */}

                <Separator className="my-4" />

                {/* Individual Payments */}

                {payments.map((payment, index) => {
                    return (
                        <PaymentCard
                            key={payment._id || index}
                            payment={payment}
                            index={index}
                            formatCurrency={formatCurrency}
                        />
                    );
                })}

            </SheetContent>
        </Sheet>
    )
}
