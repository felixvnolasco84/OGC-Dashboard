"use client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useAggregatedDetailsModal } from "@/hooks/aggregated-details-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, CheckCircle2 } from "lucide-react";

export default function AggregatedDetailsModal() {
    const context = useAggregatedDetailsModal((state) => state.context);
    const isOpen = useAggregatedDetailsModal((state) => state.isOpen);
    const onClose = useAggregatedDetailsModal((state) => state.onClose);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    };

    const formatPercentage = (value: number) => {
        return `${value.toFixed(1)}%`;
    };

    const getPorEjercer = () => {
        if (!context) return 0;
        return context.presupuestoAprobado - context.pagado;
    };

    if (!context) return null;

    const { name, levelLabel, presupuestoOriginal, presupuestoAprobado, pagado, avance } = context;
    const porEjercer = getPorEjercer();

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="hidden">Resumen de {levelLabel}</SheetTitle>
                    <SheetDescription className="hidden">
                        Información detallada del resumen agregado
                    </SheetDescription>
                </SheetHeader>

                {/* Header Card */}
                <Card className="mt-6 rounded-none border-none shadow-none">
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle className="text-2xl ">{name}</CardTitle>
                                <Badge variant="outline" className="mt-2">
                                    {levelLabel}
                                </Badge>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-medium text-muted-foreground">Avance</div>
                                <div className="text-2xl font-bold text-green-600">{formatPercentage(avance)}</div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Progress Bar */}
                        <div>
                            <Progress 
                                className="h-2" 
                                value={Math.min(avance, 100)} 
                            />
                        </div>

                        {/* Financial Summary Grid */}
                        <div className="grid grid-cols-1 gap-4">
                            {/* Presupuesto Original */}
                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <DollarSign className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm font-medium text-gray-600">Presupuesto Original</span>
                                </div>
                                <p className="text-2xl  text-gray-900">
                                    {formatCurrency(presupuestoOriginal)}
                                </p>
                            </div>

                            {/* Presupuesto Aprobado */}
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                                    <span className="text-sm font-medium text-blue-600">Presupuesto Aprobado</span>
                                </div>
                                <p className="text-2xl  text-blue-900">
                                    {formatCurrency(presupuestoAprobado)}
                                </p>
                            </div>

                            {/* Amount Paid */}
                            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="h-4 w-4 text-green-600" />
                                    <span className="text-sm font-medium text-green-600">Pagado</span>
                                </div>
                                <p className="text-2xl  text-green-900">
                                    {formatCurrency(pagado)}
                                </p>
                                <p className="text-sm text-green-700 mt-1">
                                    {formatPercentage((pagado / presupuestoAprobado) * 100)} del presupuesto aprobado
                                </p>
                            </div>

                            {/* Remaining Amount */}
                            <div className={`p-4 rounded-lg border ${
                                porEjercer > 0 
                                    ? 'bg-orange-50 border-orange-200' 
                                    : porEjercer < 0 
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-gray-50 border-gray-200'
                            }`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-sm font-medium ${
                                        porEjercer > 0 
                                            ? 'text-orange-600' 
                                            : porEjercer < 0 
                                            ? 'text-red-600'
                                            : 'text-gray-600'
                                    }`}>
                                        {porEjercer < 0 ? 'Sobrepago' : 'Por Ejercer'}
                                    </span>
                                </div>
                                <p className={`text-2xl  ${
                                    porEjercer > 0 
                                        ? 'text-orange-900' 
                                        : porEjercer < 0 
                                        ? 'text-red-900'
                                        : 'text-gray-900'
                                }`}>
                                    {formatCurrency(Math.abs(porEjercer))}
                                </p>
                            </div>
                        </div>

                        {/* Additional Info */}
                        <div className="pt-4 border-t border-gray-200">
                            <h3 className="text-sm font-medium text-gray-600 mb-3">Información Adicional</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Variación del presupuesto:</span>
                                    <span className={`font-medium ${
                                        presupuestoAprobado > presupuestoOriginal 
                                            ? 'text-orange-600' 
                                            : presupuestoAprobado < presupuestoOriginal
                                            ? 'text-green-600'
                                            : 'text-gray-600'
                                    }`}>
                                        {formatCurrency(presupuestoAprobado - presupuestoOriginal)}
                                        {presupuestoAprobado !== presupuestoOriginal && (
                                            <span className="ml-1">
                                                ({formatPercentage(((presupuestoAprobado - presupuestoOriginal) / presupuestoOriginal) * 100)})
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Estado:</span>
                                    <Badge variant={avance >= 100 ? "default" : avance >= 50 ? "secondary" : "outline"}>
                                        {avance >= 100 ? "Completado" : avance >= 50 ? "En progreso" : "Iniciado"}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

            </SheetContent>
        </Sheet>
    );
}
