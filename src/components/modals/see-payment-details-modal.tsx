"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
// import { informacion_facturacion_pago } from "@/lib/utils";
import PaymentCard from "../Cards/PaymentCard";
import { Button } from "../ui/button";
import {  Plus } from "lucide-react";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";


export default function SeePaymentDetailsModal() {
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

    // const calculatePaymentPercentage = (paymentAmount: string, totalAmount: number) => {
    //     const amount = parseFloat(paymentAmount);
    //     return totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
    // };

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

    // Don't return null before rendering Sheet - this breaks exit animation

    // TODO: IMPLEMENT THIS SOLUTION FOR THE REST OF THE MODALS
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
                                        {/* <Badge variant={getTotalPaidPercentage() >= 100 ? "default" : "secondary"}>
                                            {getTotalPaidPercentage().toFixed(1)}%
                                        </Badge> */}
                                    </div>
                                                   {/* Progress Bar */}
                                    <div className="w-full bg-green-200  h-2 mb-6">
                                        <div
                                            className="h-2  transition-all duration-300 bg-green-500"
                                            style={{ width: `${Math.min(getTotalPaidPercentage(), 100)}%` }}
                                        ></div>
                                    </div>
                                    {/* <Progress className="bg-green-600 h-1" value={Math.min(getTotalPaidPercentage(), 100)} /> */}
                                </div>

                                <div className="grid grid-cols-3 gap-24">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Presupuesto probado</p>
                                        <p className="text-lg">{formatCurrency(paymentContext.totalAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-500 text-left">Pagado</p>
                                        <p className="text-lg text-green-800 text-left">{formatCurrency(getTotalPaidAmount())}</p>
                                    </div>
                                    <div>
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
                                        <Badge variant={"outline"} className="">
                                            {getRemainingAmount() >= 0 ? `Pendiente ${ (getRemainingAmount() / paymentContext.totalAmount * 100).toFixed(0)}%` : `${ (getRemainingAmount() / paymentContext.totalAmount * 100).toFixed(0)}%`}
                                        </Badge>
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
                        {paymentContext.payments.map((payment, index) => {
                            return (
                                <PaymentCard
                                    key={payment._id || index}
                                    payment={payment}
                                    index={index}
                                    formatCurrency={formatCurrency}
                                />
                            );
                        })}
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
