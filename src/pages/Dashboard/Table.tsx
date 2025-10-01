"use client"

import * as React from "react"
import {
    ColumnDef,
    ColumnFiltersState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
    VisibilityState,
} from "@tanstack/react-table"
import {
    
    // ArrowUpDown,
    // ChevronDown,
     MoreHorizontal, Search
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    DropdownMenu,
    // DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { partida } from "@/lib/utils"
// import { Badge } from "@/components/ui/badge"


// const getData = async () => {
//   const response = await fetch(`${API_BASE_URL}/partidastable`, {
//     method: 'GET',
//   });
//   const data = await response.json();
//   return data;
// };


export const columns: ColumnDef<partida>[] = [
    {
        id: "select",
        header: ({ table }) => (
            <Checkbox
                checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
                className="hidden"
            />
        ),
        cell: ({ row }) => (
            <Checkbox   
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"                
                className="mr-6"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },

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
            <span className="text-xs text-muted-foreground capitalize">{(row.getValue("sub_partida") as string).slice(0, 20)}...</span>
        </div>,
    },
    {
        accessorKey: "sub_partida",
        header: "Sub Partida",
        cell: ({ row }) => <div className="lowercase hidden">{row.getValue("sub_partida")}</div>,
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
        accessorKey: "Subtotal",
        header: "Monto",
        cell: ({ row }) => {
            const value = row.getValue("Subtotal") as number;
            return <div className="uppercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)} MXN</div>
        },
    },
    {
        accessorKey: "total",
        header: "Presupuesto",
        cell: ({ row }) => {
            const value = row.getValue("total") as number;
            return <div className="uppercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)} MXN</div>
        },
    },
    // {
    //     accessorKey: "aprobado",
    //     header: "Aprobado",
    //     cell: ({ row }) => {
    //         const value = row.getValue("aprobado") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    {
        accessorKey: "pagado",
        header: "Avance",
        cell: ({ row }) => {
            const value = row.getValue("pagado") as number;
            const total = row.getValue("total") as number;
            const percentage = (value / total) * 100;
            return   <div>{percentage.toFixed(2)}%</div> 
            
            // <div className="lowercase flex flex-col">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)} 
            {/* <Badge className={cn("w-fit text-[10px] font-normal py-1.5 leading-none text-white rounded-xl border-gray-400", percentage > 100 ? "bg-red-800" : "bg-green-800")}> */}
                // {percentage.toFixed(2)}%
            {/* </Badge> */}
            // </div>
        },
    },
    // {
    //     accessorKey: "por_liquidar",
    //     header: "Por Liquidar",
    //     cell: ({ row }) => {
    //         const value = row.getValue("por_liquidar") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    // {
    //     accessorKey: "avance",
    //     header: "Avance",
    //     cell: ({ row }) => {
            
    //         return <div className="lowercase">{(row.getValue("avance")) }</div>
    //     },
    // },
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
            const payment = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(payment.nombre)}
                        >
                            Copiar nombre
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Ver detalles de la partida</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]

export function DashboardTable({ data }: { data: partida[] }) {
    
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
        []
    )
    const [columnVisibility, setColumnVisibility] =
        React.useState<VisibilityState>({})
    const [rowSelection, setRowSelection] = React.useState({})
    const [activeTab, setActiveTab] = React.useState("ultimos-movimientos")

    const table = useReactTable({
        data,
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
        return data;
    }

    const renderTabContent = (tabValue: string) => {
        // const tabData = getTabData(tabValue);
        getTabData(tabValue);
        
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
                    {/* <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                Columns <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => {
                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={column.id}
                                            className="capitalize"
                                            checked={column.getIsVisible()}
                                            onCheckedChange={(value) =>
                                                column.toggleVisibility(!!value)
                                            }
                                        >
                                            {column.id}
                                        </DropdownMenuCheckboxItem>
                                    )
                                })}
                        </DropdownMenuContent>
                    </DropdownMenu> */}
                </div>
                <div className="bg-white border border-gray-200 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-gray-50">
                            {table.getHeaderGroups().map((headerGroup) => (
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
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
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
                            )}
                        </TableBody>
                    </Table>
                </div>
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
                    <TabsTrigger 
                        value="cuentas-por-pagar" 
                        className="relative h-auto rounded-none border-0 bg-transparent px-4 py-3 text-sm font-medium text-gray-600 shadow-none transition-none focus-visible:ring-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-900 data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-gray-600"
                    >
                        Cuentas por pagar
                    </TabsTrigger>
                    <TabsTrigger 
                        value="pago-estimaciones" 
                        className="relative h-auto rounded-none border-0 bg-transparent px-4 py-3 text-sm font-medium text-gray-600 shadow-none transition-none focus-visible:ring-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-900 data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-gray-600"
                    >
                        Pago de Estimaciones
                    </TabsTrigger>
                    <TabsTrigger 
                        value="pago-anticipos" 
                        className="relative h-auto rounded-none border-0 bg-transparent px-4 py-3 text-sm font-medium text-gray-600 shadow-none transition-none focus-visible:ring-0 data-[state=active]:bg-transparent data-[state=active]:text-gray-900 data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-gray-600"
                    >
                        Pago de Anticipos
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
