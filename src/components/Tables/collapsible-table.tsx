"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import {
    Id,
    //  Doc
} from "convex/_generated/dataModel"
// import { useNavigate } from "react-router-dom"
// import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details"
// import { useQuery } from "convex/react"
// import { api } from "../../../convex/_generated/api"


type PartidaItem = {
    id: number;
    name: string;
    familias: {
        id: number;
        name: string;
        subpartidas: {
            _id: Id<"partidas">;
            description: string;
            specification: string;
        }[];
    }[];
}[] | undefined


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
