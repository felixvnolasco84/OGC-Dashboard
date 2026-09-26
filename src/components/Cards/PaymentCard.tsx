import { Check, Lock, Edit } from "lucide-react";
import { Doc } from "convex/_generated/dataModel";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useEditPaymentModal } from "@/hooks/edit-payment-modal";

// Type for enriched payment with transaction data
type EnrichedPayment = Doc<"pagos"> & {
    transaction?: Doc<"transacciones"> | null;
    // For backward compatibility
    status?: string;
    fecha?: string;
    tipo_pago?: string;
    moneda?: string;
    tipo_cambio?: string;
    banco?: string;
    tarjeta?: string;
    numero_cuenta?: string;
    numero_transferencia?: string;
    codigo_referencia?: string;
    factura?: string;
    partida?: string;
    familia?: string;
    sub_partida?: string;
};

interface PaymentCardProps {
    payment: EnrichedPayment;
    index: number;
    formatCurrency: (amount: string | number) => string;
    relatedPartida?: Doc<"partidas">;
}

export default function PaymentCard({ payment, index, formatCurrency, relatedPartida }: PaymentCardProps) {
    const editPaymentModal = useEditPaymentModal();

    // Get status from transaction or enriched payment
    const status = payment.transaction?.status || payment.status;
    const isPagado = status === 'Pagado' || (!status && payment.monto > 0);

    const handleEdit = () => {
        if (!relatedPartida) return;

        editPaymentModal.onOpen({
            payment,
            relatedCost: relatedPartida,
            totalAmount: payment.monto,
        });
    };

    return (
        <div className="bg-card overflow-hidden">
            {/* Payment Header */}
            <div className="p-4 border-b border-border-strong">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                        <div className={`w-12 h-12 rounded-md flex items-center justify-center ${isPagado ? 'bg-success-muted' : 'bg-warning-muted'
                            }`}>
                            {isPagado ? (
                                <div className="w-fit bg-success rounded-full p-0.5">
                                    <Check className="w-4 h-4 text-on-color" />
                                </div>
                            ) : (
                                <div className="w-fit bg-warning rounded-full p-0.5">
                                    <Lock className="w-4 h-4 text-on-color" />
                                </div>
                            )}
                        </div>
                        <div>
                            <p className="font-medium text-foreground">
                                {status || (isPagado ? 'Aprobado' : 'Pendiente')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Pago #{String(index + 1).padStart(3, '0')}
                            </p>
                        </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                        <p className="text-xl text-foreground">
                            {formatCurrency(payment.monto)} {payment.transaction?.moneda || payment.moneda || 'MXN'}
                        </p>



                    </div>
                </div>
            </div>

            {/* Payment Details */}
            <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Fecha</span>
                        <span className="text-muted-foreground">{payment.transaction?.fecha || payment.fecha}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Método de pago</span>
                        <span className="text-muted-foreground">{payment.transaction?.tipo_pago || payment.tipo_pago}</span>
                    </div>
                    {(payment.transaction?.numero_cuenta || payment.numero_cuenta) && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Cuenta cargo</span>
                            <span className="text-muted-foreground">{payment.transaction?.numero_cuenta || payment.numero_cuenta}</span>
                        </div>
                    )}
                    {(payment.transaction?.numero_transferencia || payment.numero_transferencia) && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Cuenta abono</span>
                            <span className="text-muted-foreground">{payment.transaction?.numero_transferencia || payment.numero_transferencia}</span>
                        </div>
                    )}
                    {(payment.transaction?.codigo_referencia || payment.codigo_referencia) && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Referencia</span>
                            <span className="text-muted-foreground">{payment.transaction?.codigo_referencia || payment.codigo_referencia}</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2">
                    {/* Additional Tags */}
                    <div className="space-y-2 pt-2 flex flex-wrap gap-2">
                        {(payment.transaction?.banco || payment.banco) && (
                            <Badge variant="neutral">
                                {payment.transaction?.banco || payment.banco}
                            </Badge>
                        )}
                        {(payment.transaction?.moneda || payment.moneda) && (payment.transaction?.moneda || payment.moneda) !== 'MXN' && (
                            <Badge variant="info">
                                {payment.transaction?.moneda || payment.moneda} {(payment.transaction?.tipo_cambio || payment.tipo_cambio) && `(TC: ${payment.transaction?.tipo_cambio || payment.tipo_cambio})`}
                            </Badge>
                        )}
                        {(payment.transaction?.tarjeta || payment.tarjeta) && (
                            <Badge variant="secondary">
                                {payment.transaction?.tarjeta || payment.tarjeta}
                            </Badge>
                        )}
                    </div>

                    {/* File Attachments */}
                    <div className="flex flex-col gap-2 pt-2 justify-end">
                        {(payment.transaction?.factura || payment.factura) && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-md justify-end">
                                <span className="text-sm text-foreground">
                                    {(payment.transaction?.factura || payment.factura)?.includes('http') ? 'Factura' : (payment.transaction?.factura || payment.factura)}
                                </span>
                                <div className="w-fit bg-success rounded-full p-0.5">
                                    <Check className="w-4 h-4 text-on-color" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-2 flex justify-end">
                    <Button
                        onClick={handleEdit}
                        variant="ghost"
                        size="sm"
                    >
                        <Edit className="h-4 w-4" />
                        Editar pago
                    </Button>
                </div>
            </div>
        </div>
    )
}
