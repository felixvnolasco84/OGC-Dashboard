"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, MoreHorizontal, Pencil, CreditCard, MoreHorizontal as MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Id, Doc } from "convex/_generated/dataModel"
import { useNavigate } from "react-router-dom"
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"


type PartidaItem = {
    id: number;
    name: string;
    familias: {
        id: number;
        name: string;
        subpartidas: {
            _id: Id<"costos">;
            description: string;
            specification: string;
        }[];
    }[];
}[] | undefined

// Custom dropdown component for cost actions
function CostoActionsDropdown({ costoId }: { costoId: Id<"costos"> }) {
    const navigate = useNavigate();
    const seePaymentDetailsModal = useSeePaymentDetailsModal();

    // Fetch the full cost data using the ID
    const costo = useQuery(api.costos.getById, { id: costoId });

    const handleViewDetails = () => {
        navigate(`/dashboard/costos/${costoId}`);
    };

    const handleViewPayments = () => {
        if (!costo) return;

        // Create mock payments (same logic as DropdownMenuComponentCosto)
        const mockPayments: Doc<"pagos">[] = [
            {
                _id: "payment_1" as Id<"pagos">,
                _creationTime: Date.now(),
                administracion: costo.administracion,
                partida: costo.partida,
                familia: costo.familia,
                sub_partida: costo.sub_partida,
                monto: ((costo.monto_decimal || 0) * 0.6).toString(),
                fecha: "15/01/2024",
                tipo_pago: "Transferencia Bancaria",
                tarjeta: "",
                banco: "BBVA Bancomer",
                tipo_cambio: "1.0",
                moneda: "MXN",
                logo_banco: "https://www.bbva.com/wp-content/uploads/2019/04/Logo-BBVA.jpg",
                numero_cuenta: "1234567890123456",
                numero_transferencia: "TRF20240115001",
                codigo_referencia: costo.codigo_referencia,
                factura: costo.factura,
                informacion_facturacion_pago: "payment_1" as Id<"informacion_facturacion_pago">,
            },
            {
                _id: "payment_2" as Id<"pagos">,
                _creationTime: Date.now(),
                administracion: costo.administracion,
                partida: costo.partida,
                familia: costo.familia,
                sub_partida: costo.sub_partida,
                monto: ((costo.monto_decimal || 0) * 0.25).toString(),
                fecha: "22/01/2024",
                tipo_pago: "Tarjeta de Crédito",
                tarjeta: "**** **** **** 4532",
                banco: "Santander",
                tipo_cambio: "1.0",
                moneda: "MXN",
                logo_banco: "https://upload.wikimedia.org/wikipedia/commons/c/c4/Banco_Santander_Logotipo_%282007-2018%29.svg",
                numero_cuenta: "",
                numero_transferencia: "",
                codigo_referencia: "CC" + costo.codigo_referencia,
                factura: costo.factura,
                informacion_facturacion_pago: "payment_2" as Id<"informacion_facturacion_pago">,
            },
            {
                _id: "payment_3" as Id<"pagos">,
                _creationTime: Date.now(),
                administracion: costo.administracion,
                partida: costo.partida,
                familia: costo.familia,
                sub_partida: costo.sub_partida,
                monto: ((costo.monto_decimal || 0) * 0.10).toString(),
                fecha: "28/01/2024",
                tipo_pago: "Efectivo",
                tarjeta: "",
                banco: "",
                tipo_cambio: "1.0",
                moneda: "MXN",
                logo_banco: "",
                numero_cuenta: "",
                numero_transferencia: "",
                codigo_referencia: "EF" + costo.codigo_referencia,
                factura: costo.factura,
                informacion_facturacion_pago: "payment_3" as Id<"informacion_facturacion_pago">,
            }
        ];

        const paymentContext = {
            payments: mockPayments,
            relatedCost: costo,
            totalAmount: costo.monto_decimal || 0,
        };

        seePaymentDetailsModal.onOpen(paymentContext);
    };

    return (
        <Dialog>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1">
                    <div className="space-y-1">
                        <DialogTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-full justify-start flex items-center gap-2"
                            >
                                <Pencil className="h-4 w-4" />
                                Editar
                            </Button>
                        </DialogTrigger>
                        <Button
                            variant="ghost"
                            className="w-full justify-start flex items-center gap-2"
                            onClick={handleViewPayments}
                        >
                            <CreditCard className="h-4 w-4" />
                            Ver pagos
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full justify-start flex items-center gap-2"
                            onClick={handleViewDetails}
                        >
                            <MoreHorizontalIcon className="h-4 w-4" />
                            Ver detalles
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Costo</DialogTitle>
                    <DialogDescription>Actualiza la información del costo</DialogDescription>
                </DialogHeader>
                {costo && (
                    <div className="p-4">
                        <p>Funcionalidad de edición pendiente de implementar</p>
                        <p className="text-sm text-gray-600 mt-2">
                            <strong>ID:</strong> {costoId}<br />
                            <strong>Partida:</strong> {costo.partida}<br />
                            <strong>Familia:</strong> {costo.familia}<br />
                            <strong>Sub-partida:</strong> {costo.sub_partida}
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function CollapsibleTable({ data }: { data: PartidaItem }) {
    const [expandedPartidas, setExpandedPartidas] = useState<Set<number>>(new Set())
    const [expandedFamilias, setExpandedFamilias] = useState<Set<number>>(new Set())

    const togglePartida = (id: number) => {
        const newExpanded = new Set(expandedPartidas)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedPartidas(newExpanded)
    }

    const toggleFamilia = (id: number) => {
        const newExpanded = new Set(expandedFamilias)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedFamilias(newExpanded)
    }

    return (
        <Card className="w-full overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-5 gap-4 p-4 bg-gray-100 border-b font-semibold text-gray-700">
                <div>ID</div>
                <div>PARTIDA</div>
                <div>FAMILIA</div>
                <div>SUBPARTIDA</div>
                <div>---</div>
            </div>

            {/* Table Body */}
            <div className="max-h-96 overflow-y-auto">
                {data?.map((partida) => {
                    const isPartidaExpanded = expandedPartidas.has(partida.id)

                    return (
                        <div key={partida.id}>
                            {/* PARTIDA Row */}
                            <div className="grid grid-cols-5 gap-4 p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors bg-white">
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => togglePartida(partida.id)}>
                                        {isPartidaExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </Button>
                                    <span className="text-sm font-medium text-green-700">{partida.id}</span>
                                </div>
                                <div className="font-bold text-gray-900">{partida.name}</div>
                                <div></div>
                                <div></div>
                                <div></div>
                            </div>

                            {/* FAMILIA Rows */}
                            {isPartidaExpanded &&
                                partida.familias.map((familia) => {
                                    const isFamiliaExpanded = expandedFamilias.has(familia.id)

                                    return (
                                        <div key={familia.id}>
                                            {/* FAMILIA Row */}
                                            <div
                                                className="grid grid-cols-5 gap-4 p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors bg-gray-50"
                                                style={{ paddingLeft: "32px" }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0"
                                                        onClick={() => toggleFamilia(familia.id)}
                                                    >
                                                        {isFamiliaExpanded ? (
                                                            <ChevronDown className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                    <span className="text-sm font-medium text-blue-700">{familia.id}</span>
                                                </div>
                                                <div></div>
                                                <div className="font-semibold text-gray-800">{familia.name}</div>
                                                <div></div>
                                                <div></div>
                                            </div>

                                            {/* SUBPARTIDA Rows */}
                                            {isFamiliaExpanded &&
                                                familia.subpartidas.map((subpartida) => (
                                                    <div
                                                        key={subpartida._id}
                                                        className="grid grid-cols-5 gap-4 p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors bg-blue-50"
                                                        style={{ paddingLeft: "52px" }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6" />
                                                            <span className="text-sm font-medium text-purple-700">{subpartida._id}</span>
                                                        </div>
                                                        <div></div>
                                                        <div></div>
                                                        <div className="text-gray-700">
                                                            <div className="font-medium">{subpartida.description}</div>
                                                            <div className="text-sm text-gray-500">{subpartida.specification}</div>
                                                        </div>
                                                        <div className="flex justify-end">
                                                            <CostoActionsDropdown costoId={subpartida._id} />
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )
                                })}
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}
