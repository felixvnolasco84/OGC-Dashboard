"use client"

import * as React from "react"
import { Search, FileText, ExternalLink, Download, Trash2 } from "lucide-react"

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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { toast } from "sonner"


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

    // Delete mutations
    const deleteRegularTransaction = useMutation(api.transacciones.deleteTransaction);
    const deleteSalesTransaction = useMutation(api.sales_transacciones.deleteTransaction);

    // Use the appropriate result set
    const transactions = isSalesProject ? salesTransactions : regularTransactions;
    const isLoading = transactions === undefined;

    const [activeTab, setActiveTab] = React.useState("ultimos-movimientos")
    const [searchFilter, setSearchFilter] = React.useState("")
    const [displayCount, setDisplayCount] = React.useState(50)
    const [deletingId, setDeletingId] = React.useState<string | null>(null)

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

    const handleDeleteTransaction = async (transactionId: string) => {
        setDeletingId(transactionId);
        try {
            if (isSalesProject) {
                await deleteSalesTransaction({ id: transactionId as Id<"sales_transacciones"> });
            } else {
                await deleteRegularTransaction({ id: transactionId as Id<"transacciones"> });
            }
            toast.success("Transacción eliminada correctamente");
        } catch (error) {
            console.error("Error deleting transaction:", error);
            toast.error("Error al eliminar la transacción");
        } finally {
            setDeletingId(null);
        }
    };

    
    const formatDateDisplay = (dateStr: string | undefined): string => {
        if (!dateStr) return '-';
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const day = parts[0];
            const monthIdx = parseInt(parts[1], 10) - 1;
            const year = parts[2];
            return `${day} de ${months[monthIdx]} de ${year}`;
        }
        return dateStr;
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
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
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
                <div className="bg-card border border-border overflow-hidden overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-border">
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[180px]">Partida</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[120px]">Monto Total</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[120px]">Fecha</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[140px]">Tipo de Pago</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[180px]">Proveedor</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[200px]">Factura</TableHead>
                                <TableHead className="px-4 py-3 text-left text-sm font-normal text-subtle-foreground bg-card min-w-[100px]">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTransactions.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="h-24 text-center text-subtle-foreground"
                                    >
                                        No hay transacciones registradas
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTransactions.map((transaction) => (
                                    <TableRow
                                        key={transaction._id}
                                        className="border-b border-border hover:bg-background"
                                    >
                                        {/* Partida Column */}
                                        <TableCell className="px-4 py-4 text-sm text-left">
                                            <div className="flex flex-col">
                                                {transaction.partidaNames && transaction.partidaNames.length > 0 ? (
                                                    <>
                                                        <span className="font-medium text-foreground uppercase">
                                                            {transaction.partidaNames[0]?.split(' ')[0] || 'SIN PARTIDA'}
                                                        </span>
                                                        <span className="text-xs text-subtle-foreground uppercase">
                                                            {transaction.partidaNames[0] || ''}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-disabled-foreground">Sin partida</span>
                                                )}
                                            </div>
                                        </TableCell>

                                        {/* Monto Total Column */}
                                        <TableCell className="px-4 py-4 text-sm text-foreground text-left">
                                            {formatCurrency(transaction.monto_total || 0)} MXN
                                        </TableCell>

                                        {/* Fecha Column */}
                                        <TableCell className="px-4 py-4 text-sm text-foreground text-left">
                                            {formatDateDisplay(transaction.fecha)}
                                        </TableCell>

                                        {/* Tipo de Pago Column */}
                                        <TableCell className="px-4 py-4 text-sm text-foreground uppercase text-left">
                                            {transaction.tipo_pago || "-"}
                                        </TableCell>

                                        {/* Proveedor Column (empty for now) */}
                                        <TableCell className="px-4 py-4 text-sm text-foreground">
                                            {""}
                                        </TableCell>

                                        {/* Factura Column */}
                                        <TableCell className="px-4 py-4 text-sm">
                                            {transaction.documentUrl || transaction.factura ? (
                                                <div className="flex items-start gap-2 text-left">
                                                    <FileText className="w-4 h-4 text-disabled-foreground mt-0.5 flex-shrink-0" />
                                                    <div className="flex flex-col">
                                                        <span className="text-foreground font-medium">
                                                            {transaction.factura || 'Documento'}
                                                        </span>
                                                        <span className="text-xs text-disabled-foreground">
                                                            {transaction.fecha ? `Subido el ${formatDateDisplay(transaction.fecha)}` : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-disabled-foreground">-</span>
                                            )}
                                        </TableCell>

                                        {/* Acciones Column */}
                                        <TableCell className="px-4 py-4 text-sm">
                                            <div className="flex items-center gap-1">
                                                {/* Open Document */}
                                                {transaction.documentUrl && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-foreground hover:text-foreground"
                                                        onClick={() => window.open(transaction.documentUrl!, '_blank')}
                                                        title="Abrir documento"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                )}

                                                {/* Download Document */}
                                                {transaction.documentUrl && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-foreground hover:text-foreground"
                                                        onClick={() => {
                                                            const link = document.createElement('a');
                                                            link.href = transaction.documentUrl!;
                                                            link.download = transaction.factura || 'documento';
                                                            link.target = '_blank';
                                                            link.click();
                                                        }}
                                                        title="Descargar documento"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                )}

                                                {/* Delete Transaction */}
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-subtle-foreground hover:text-red-600"
                                                            title="Eliminar transacción"
                                                            disabled={deletingId === transaction._id}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta acción no se puede deshacer. Se eliminará la transacción
                                                                junto con todos sus pagos y documentos asociados.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                className="bg-red-600 hover:bg-red-700"
                                                                onClick={() => handleDeleteTransaction(transaction._id)}
                                                            >
                                                                Eliminar
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
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
                <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0 mb-0">
                    <TabsTrigger
                        value="ultimos-movimientos"
                        className="relative h-auto rounded-none border-0 bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground shadow-none transition-none focus-visible:ring-0 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-muted-foreground"
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
