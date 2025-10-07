import { Check, Lock } from "lucide-react";
import { Doc } from "convex/_generated/dataModel";

export default function PaymentCard({ payment, index, formatCurrency }: {
    payment: Doc<"pagos">;
    index: number;
    formatCurrency: (amount: string | number) => string;
}) {
    // Use the status property, fallback to checking amount if not available
    const isPagado = payment.status === 'Pagado' || (!payment.status && parseFloat(payment.monto) > 0);

    return (
        <div className="bg-white overflow-hidden">
            {/* Payment Header */}
            <div className="p-4 border-b border-gray-400">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-md flex items-center justify-center ${isPagado ? 'bg-[#E0F0E2]' : 'bg-orange-100'
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
                                {payment.status || (isPagado ? 'Aprobado' : 'Pendiente')}
                            </p>
                            <p className="text-sm text-gray-600">
                                Pago #{String(index + 1).padStart(3, '0')}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xl text-gray-900">
                            {formatCurrency(payment.monto)} {payment.moneda || 'MXN'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Payment Details */}
            <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-[#777770]">Fecha</span>
                        <span className="text-muted-foreground">{payment.fecha}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[#777770]">Método de pago</span>
                        <span className="text-muted-foreground">{payment.tipo_pago}</span>
                    </div>
                    {payment.numero_cuenta && (
                        <div className="flex justify-between">
                            <span className="text-[#777770]">Cuenta cargo</span>
                            <span className="text-muted-foreground">{payment.numero_cuenta}</span>
                        </div>
                    )}
                    {payment.numero_transferencia && (
                        <div className="flex justify-between">
                            <span className="text-[#777770]">Cuenta abono</span>
                            <span className="text-muted-foreground">{payment.numero_transferencia}</span>
                        </div>
                    )}
                    {payment.codigo_referencia && (
                        <div className="flex justify-between">
                            <span className="text-[#777770]">Referencia</span>
                            <span className="text-muted-foreground">{payment.codigo_referencia}</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2">
                    {/* Additional Tags */}
                    <div className="space-y-2 pt-2 flex flex-wrap gap-2">
                        {payment.banco && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                {payment.banco}
                            </span>
                        )}
                        {payment.moneda && payment.moneda !== 'MXN' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                                {payment.moneda} {payment.tipo_cambio && `(TC: ${payment.tipo_cambio})`}
                            </span>
                        )}
                        {payment.tarjeta && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-700">
                                {payment.tarjeta}
                            </span>
                        )}
                    </div>
                    
                    {/* File Attachments */}
                    <div className="flex flex-col gap-2 pt-2 justify-end">
                        {payment.factura && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md justify-end">
                                <span className="text-sm text-gray-700">
                                    {payment.factura.includes('http') ? 'Factura' : payment.factura}
                                </span>
                                <div className="w-fit bg-green-800 rounded-full p-0.5">
                                    <Check className="w-4 h-4 text-white" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
