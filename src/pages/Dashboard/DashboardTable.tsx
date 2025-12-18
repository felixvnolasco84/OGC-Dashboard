"use client"

import * as React from "react"
import { Search, FileText, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"

const getTipoPagoColor = (tipoPago?: string) => {
    switch (tipoPago?.toLowerCase()) {
        case "efectivo":
            return "bg-blue-50 text-blue-700 border-blue-200 rounded-none";
        case "transferencia":
            return "bg-purple-50 text-purple-700 border-purple-200 rounded-none";
        case "tarjeta":
            return "bg-indigo-50 text-indigo-700 border-indigo-200 rounded-none";
        case "cheque":
            return "bg-gray-50 text-gray-700 border-gray-200 rounded-none";
        default:
            return "bg-gray-100 text-gray-700 border-gray-200 rounded-none";
    }
};


export function DashboardTable({ proyectoId, isSalesProject = false }: { proyectoId: Id<"desarrollos"> | Id<"sales_projects">, isSalesProject?: boolean }) {

    // Use the appropriate query based on project type
    const regularTransactions = useQuery(
        api.transacciones.getByProyectoWithDetails,
        !isSalesProject ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    const salesTransactions = useQuery(
        api.sales_transacciones.getByProyectoWithDetails,
        isSalesProject ? { proyecto_id: proyectoId as Id<"sales_projects"> } : "skip"
    );

    // Use the appropriate result set
    const transactions = isSalesProject ? salesTransactions : regularTransactions;
    const isLoading = transactions === undefined;

    const [activeTab, setActiveTab] = React.useState("ultimos-movimientos")
    const [searchFilter, setSearchFilter] = React.useState("")
    const [displayCount, setDisplayCount] = React.useState(50)

    // Parse date string to Date object for sorting
    const parseDate = (dateStr: string | undefined): Date => {
        if (!dateStr) return new Date(0);
        // Try parsing common formats
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) return parsed;

        // Try DD/MM/YYYY format
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
        return new Date(0);
    };

    // Sort and filter transactions
    const filteredTransactions = React.useMemo(() => {
        if (!transactions) return [];

        // Sort by date (most recent first)
        const sorted = [...transactions].sort((a, b) => {
            const dateA = parseDate(a.fecha);
            const dateB = parseDate(b.fecha);
            return dateB.getTime() - dateA.getTime();
        });

        // Apply search filter if present
        let filtered = sorted;
        if (searchFilter) {
            const lowerFilter = searchFilter.toLowerCase();
            filtered = sorted.filter(t =>
                t.fecha?.toLowerCase().includes(lowerFilter) ||
                t.tipo_pago?.toLowerCase().includes(lowerFilter) ||
                t.status?.toLowerCase().includes(lowerFilter) ||
                t.factura?.toLowerCase().includes(lowerFilter) ||
                t.banco?.toLowerCase().includes(lowerFilter) ||
                t.partidaNames?.some(name => name.toLowerCase().includes(lowerFilter))
            );
        }

        return filtered.slice(0, displayCount);
    }, [transactions, searchFilter, displayCount]);

    // Check if there are more transactions to load
    const hasMore = React.useMemo(() => {
        if (!transactions) return false;
        const totalFiltered = searchFilter
            ? transactions.filter(t =>
                t.fecha?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                t.tipo_pago?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                t.status?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                t.factura?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                t.banco?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                t.partidaNames?.some(name => name.toLowerCase().includes(searchFilter.toLowerCase()))
            ).length
            : transactions.length;
        return displayCount < totalFiltered;
    }, [transactions, searchFilter, displayCount]);

    const loadMore = () => {
        setDisplayCount(prev => prev + 50);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const renderTabContent = () => {
        // Show loading state
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                        <p className="text-sm text-muted-foreground">Cargando transacciones...</p>
                    </div>
                </div>
            );
        }

        return (
            <div>
                <div className="flex items-center py-4 gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Buscar por fecha, tipo, status, factura..."
                            value={searchFilter}
                            onChange={(event) => setSearchFilter(event.target.value)}
                            className="pl-10 border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                        />
                    </div>
                </div>
                <div className="bg-white border border-gray-200 overflow-hidden overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-gray-50">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[100px]">Factura</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[120px]">Monto</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[100px]">Fecha</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[100px]">Tipo de Pago</TableHead>
                                {/* <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[100px]">Tipo Pago</TableHead> */}
                                <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[200px]">Partidas</TableHead>
                                {/* <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[100px]">Banco</TableHead> */}
                                {/* <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 bg-white min-w-[80px]">Conceptos</TableHead> */}
                                {/* <TableHead className="px-4 py-3 text-left text-sm font-medium text-muted-foreground bg-white min-w-[80px]">Docs</TableHead> */}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTransactions.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={9}
                                        className="h-24 text-center text-gray-500"
                                    >
                                        No hay transacciones registradas
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTransactions.map((transaction) => (
                                    <TableRow
                                        key={transaction._id}
                                        className="border-b border-gray-100 hover:bg-gray-50"
                                    >
                                        <TableCell className="px-4 py-3 text-sm text-gray-900 border-r border-gray-100">
                                            {transaction.documentUrl ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => window.open(transaction.documentUrl!, '_blank')}
                                                    className="flex items-center gap-2 px-2 py-1 h-auto bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
                                                    title="Ver documento"
                                                >
                                                    <FileText className="w-3.5 h-3.5 text-gray-600" />
                                                    <span className="text-xs text-gray-700 font-medium">
                                                        {transaction.factura || 'Documento'}
                                                    </span>
                                                    <ExternalLink className="w-3 h-3 text-gray-500" />
                                                </Button>
                                            ) : transaction.factura ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700">
                                                    <FileText className="w-3.5 h-3.5 text-gray-500" />
                                                    {transaction.factura}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-sm text-gray-900 border-r border-gray-100">
                                            {formatCurrency(transaction.monto_total || 0)}
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-sm text-gray-900 border-r border-gray-100">
                                            {transaction.fecha || '-'}
                                        </TableCell>

                                        {/* <TableCell className="px-4 py-3 text-sm border-r border-gray-100">
                                            <Badge className={`${getStatusColor(transaction.status)} border-0 font-normal`}>
                                                {transaction.status || 'Sin status'}
                                            </Badge>
                                        </TableCell> */}
                                        <TableCell className="px-4 py-3 text-sm text-gray-900 border-r border-gray-100">
                                            <Badge
                                                variant="outline"
                                                className={`${getTipoPagoColor(
                                                    transaction.tipo_pago
                                                )}  px-3 py-1 text-xs font-normal capitalize rounded-none`}
                                            >
                                                {transaction.tipo_pago || "-"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-sm text-gray-600 border-r border-gray-100">
                                            <div className="flex flex-col gap-1">
                                                {transaction.partidaNames && transaction.partidaNames.length > 0 ? (
                                                    <>
                                                        {transaction.partidaNames.map((name, idx) => (
                                                            <div key={idx} className="flex items-center gap-1">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 max-w-[250px] truncate" title={name}>
                                                                    {name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {transaction.lineItemsCount > 3 && (
                                                            <span className="text-xs text-blue-600 font-medium">
                                                                +{transaction.lineItemsCount - 3} concepto{transaction.lineItemsCount - 3 !== 1 ? 's' : ''} más
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">Sin partidas</span>
                                                )}
                                            </div>
                                        </TableCell>

                                        {/* <TableCell className="px-4 py-3 text-sm text-gray-900 border-r border-gray-100">
                                            {transaction.banco || '-'}
                                        </TableCell> */}
                                        {/* <TableCell className="px-4 py-3 text-sm text-gray-600 border-r border-gray-100 text-center">
                                            {transaction.lineItemsCount || 0}
                                        </TableCell> */}
                                        {/* <TableCell className="px-4 py-3 text-sm text-gray-600 text-center">
                                            {transaction.documentsCount || 0}
                                        </TableCell> */}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex items-center justify-between py-4">
                    <div className="text-muted-foreground text-sm">
                        Mostrando {filteredTransactions.length} de {transactions?.length || 0} transacciones
                    </div>
                    {hasMore && (
                        <Button
                            variant="outline"
                            onClick={loadMore}
                            className="text-sm"
                        >
                            Cargar más
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="h-auto w-full justify-start rounded-none border-b border-gray-200 bg-transparent p-0 mb-0">
                    <TabsTrigger
                        value="ultimos-movimientos"
                        className="relative h-auto rounded-none border-0 bg-transparent px-4 py-3 text-sm font-medium text-gray-600 shadow-none transition-none focus-visible:ring-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-900 data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-gray-600"
                    >
                        Últimos movimientos
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="ultimos-movimientos" className="space-y-4">
                    {renderTabContent()}
                </TabsContent>
            </Tabs>
        </div>
    )
}
