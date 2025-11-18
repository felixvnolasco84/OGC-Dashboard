"use client"

import * as React from "react"
import {
    ColumnDef,
    ColumnFiltersState,
    // flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
    VisibilityState,
} from "@tanstack/react-table"
import { Search } from "lucide-react"

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
import { usePaginatedQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Doc, Id } from "../../../convex/_generated/dataModel"
import DropdownMenuComponentPartida from "@/components/DropdownMenu/DropdownMenuComponenPartida"

export const columns: ColumnDef<Doc<"partidas">>[] = [
    // {
    //     id: "select",
    //     header: ({ table }) => (
    //         <Checkbox
    //             checked={
    //                 table.getIsAllPageRowsSelected() ||
    //                 (table.getIsSomePageRowsSelected() && "indeterminate")
    //             }
    //             onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    //             aria-label="Select all"
    //             className="hidden"
    //         />
    //     ),
    //     cell: ({ row }) => (
    //         <Checkbox   
    //             checked={row.getIsSelected()}
    //             onCheckedChange={(value) => row.toggleSelected(!!value)}
    //             aria-label="Select row"                
    //             className="mr-6"
    //         />
    //     ),
    //     enableSorting: false,
    //     enableHiding: false,
    // },

    {
        accessorKey: "nombre",
        header: "Partida",
        cell: ({ row }) => <div className="lowercase">{row.getValue("nombre")}</div>,
    },
    {
        accessorKey: "familia",
        header: "Familia",
        cell: ({ row }) => <div className="flex flex-col text-left">
            <span className="capitalize">{row.getValue("familia")}</span>
        </div>,
    },
    {
        accessorKey: "sub_partida",
        header: "Sub Partida",
        cell: ({ row }) => <div className="lowercase">{row.getValue("sub_partida")}</div>,
    },
    // {
    //     accessorKey: "Cantidad",
    //     header: "Cantidad",
    //     cell: ({ row }) => <div className="lowercase">{row.getValue("Cantidad")}</div>,
    // },
    // {
    //     accessorKey: "PrecioUnitario",
    //     header: "Precio Unitario",
    //     cell: ({ row }) => {
    //         const value = row.getValue("PrecioUnitario") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    // {
    //     accessorKey: "Subtotal",
    //     header: "Subtotal",
    //     cell: ({ row }) => {
    //         const value = row.getValue("Subtotal") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    // {
    //     accessorKey: "Iva",
    //     header: "IVA",
    //     cell: ({ row }) => {
    //         const value = row.getValue("Iva") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    {
        accessorKey: "presupuesto_original",
        header: "Monto",
        cell: ({ row }) => {
            const value = row.getValue("presupuesto_original") as number;
            return <div className="uppercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)} MXN</div>
        },
    },
    {
        accessorKey: "presupuesto_aprobado",
        header: "Presupuesto",
        cell: ({ row }) => {
            const value = row.getValue("presupuesto_aprobado") as number;
            return <div className="uppercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)} MXN</div>
        },
    },
    {
        accessorKey: "pagado",
        header: "Avance",
        cell: ({ row }) => {
            const value = row.getValue("pagado") as number;
            const total = row.getValue("presupuesto_aprobado") as number;
            const percentage = (value / total) * 100;
            return <div>{percentage.toFixed(2)}%</div>
        },
    },

    {
        accessorKey: "fechaPago",
        header: "Fecha pago",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">-</div>
        },
    },
    {
        accessorKey: "proveedor",
        header: "Proveedor",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="capitalize">-</div>
        },
    },
    {
        accessorKey: "factura",
        header: "Factura",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">-</div>
        },
    },
    {
        accessorKey: "numeroPago",
        header: "#Pago",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">-</div>
        },
    },
    // {
    //     accessorKey: "actual",
    //     header: "Actual",
    //     cell: ({ row }) => {
    //         const value = row.getValue("actual") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    // {
    //     accessorKey: "fechaCarga",
    //     header: "Fecha Carga",
    //     cell: ({ row }) => {
    //         const date = new Date(row.getValue("fechaCarga") as string);
    //         return <div className="lowercase">{new Intl.DateTimeFormat('es-MX', { dateStyle: 'short' }).format(date)}</div>;
    //     },
    // },
    {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
            const partida = row.original

            // Construct rowData to match DropdownMenuComponentPartida requirements
            const rowData = {
                displayName: partida.sub_partida || partida.familia || partida.nombre,
                presupuestoOriginal: partida.presupuesto_aprobado || 0,
                presupuestoAprobado: partida.presupuesto_aprobado || 0,
                pagado: partida.pagado || 0,
                avance: partida.presupuesto_aprobado > 0
                    ? Math.round((partida.pagado / partida.presupuesto_aprobado) * 100)
                    : 0,
            };

            return (
                <DropdownMenuComponentPartida
                    partida={partida}
                    level={partida.nivel}
                    rowData={rowData}
                />
            )
        },
    },
]

export function DashboardTable({ proyectoId, isSalesProject = false }: { proyectoId: Id<"desarrollos"> | Id<"sales_projects">, isSalesProject?: boolean }) {

    // Use the appropriate query based on project type
    const regularResults = usePaginatedQuery(
        api.partida.list,
        !isSalesProject ? { proyectoId: proyectoId as Id<"desarrollos"> } : "skip",
        { initialNumItems: 50 },
    );
    
    const salesResults = usePaginatedQuery(
        api.sales_partidas.list,
        isSalesProject ? { proyectoId: proyectoId as Id<"sales_projects"> } : "skip",
        { initialNumItems: 50 },
    );
    
    // Use the appropriate result set
    const { results, status, loadMore } = isSalesProject ? salesResults : regularResults;

    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
        []
    )
    const [columnVisibility, setColumnVisibility] =
        React.useState<VisibilityState>({})
    const [rowSelection, setRowSelection] = React.useState({})
    const [activeTab, setActiveTab] = React.useState("ultimos-movimientos")

    const table = useReactTable({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (results ?? []) as any, // Type assertion needed for union types (partidas vs sales_partidas)
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
    })

    // Mock data for different tabs - you can replace this with actual data
    const getTabData = (tabValue: string) => {
        // For now, return the same data for all tabs
        // In a real implementation, you would filter or fetch different data based on the tab
        console.log(tabValue)
        return results ?? [];
    }

    const renderTabContent = (tabValue: string) => {
        // const tabData = getTabData(tabValue);
        getTabData(tabValue);

        // Show loading state on initial load
        if (status === "LoadingFirstPage") {
            return (
                <div className="flex justify-center items-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                        <p className="text-sm text-muted-foreground">Cargando partidas...</p>
                    </div>
                </div>
            );
        }

        const formatNumber = (amount: number) => {
            return new Intl.NumberFormat('es-MX').format(amount);
        };

        return (
            <div>
                <div className="flex items-center py-4 gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Filtrar por..."
                            value={(table.getColumn("nombre")?.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                                table.getColumn("nombre")?.setFilterValue(event.target.value)
                            }
                            className="pl-10 border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                        />
                    </div>
                </div>
                <div className="bg-white border border-gray-200 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-gray-50">
                            <TableRow>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">{proyectoId === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Unidad" : "Partida"}</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">{proyectoId === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Codigo" : "Familia"}</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">{proyectoId === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Cliente" : "Sub Partida"}</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">{proyectoId === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Cliente" : "Familia"}</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">{proyectoId === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Vendido" : "Presupuesto Original"}</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">{proyectoId === "jh7bxaf0h29hsh7hgyfbcea22h7v90hz" ? "Pagado" : "Presupuesto Aprobado"}</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">Avance</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">Factura</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">#Pago</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">Fecha Carga</TableHead>
                                <TableHead className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">Actual</TableHead>
                            </TableRow>
                            {/* {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id} className="border-b border-gray-200">
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id} className="px-6 py-4 text-left text-sm font-medium text-muted-foreground border-r border-gray-200 last:border-r-0 bg-white">
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        )
                                    })}
                                </TableRow>
                            ))} */}
                        </TableHeader>
                        <TableBody>
                            {/* {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        className="border-b border-gray-100 hover:bg-gray-50"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-24 text-center text-gray-500"
                                    >
                                        No results.
                                    </TableCell>
                                </TableRow>
                            )} */}
                            {results?.map((partida) => (
                                <TableRow
                                    key={partida._id}
                                    className="border-b border-gray-100 hover:bg-gray-50"
                                >
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {partida.partida_nombre}
                                        <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                            {partida.unidad}
                                        </TableCell>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {partida.familia}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {partida.sub_partida}
                                    </TableCell>

                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        ${formatNumber(Math.round(partida.presupuesto_original || 0))}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        ${formatNumber(Math.round(partida.presupuesto_aprobado || 0))}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {partida.presupuesto_aprobado > 0 ? (partida.pagado / partida.presupuesto_aprobado * 100).toFixed(2) : 0}%
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        ${formatNumber(Math.round(partida.pagado || 0))}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {/* {partida.pago} */} -
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {new Date(partida._creationTime).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 text-left">
                                        {/* {partida.actual} */} -
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Load More Section */}
                {status === "CanLoadMore" && (
                    <div className="flex justify-start py-4">
                        <Button
                            variant="outline"
                            onClick={() => loadMore(100)}
                            className="rounded-none"
                            disabled={status !== "CanLoadMore"}
                        >
                            Cargar más
                        </Button>
                    </div>
                )}

                {status === "LoadingMore" && (
                    <div className="flex justify-center py-4">
                        <p className="text-sm text-muted-foreground">Cargando más...</p>
                    </div>
                )}

                <div className="flex items-center justify-end space-x-2 py-4">
                    <div className="text-muted-foreground flex-1 text-sm">
                        {table.getFilteredSelectedRowModel().rows.length} of{" "}
                        {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
                    <div className="space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            Next
                        </Button>
                    </div>
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
                    {renderTabContent("ultimos-movimientos")}
                </TabsContent>

                <TabsContent value="cuentas-por-pagar" className="space-y-4">
                    {renderTabContent("cuentas-por-pagar")}
                </TabsContent>

                <TabsContent value="pago-estimaciones" className="space-y-4">
                    {renderTabContent("pago-estimaciones")}
                </TabsContent>

                <TabsContent value="pago-anticipos" className="space-y-4">
                    {renderTabContent("pago-anticipos")}
                </TabsContent>
            </Tabs>
        </div>
    )
}
