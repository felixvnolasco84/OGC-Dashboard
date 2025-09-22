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
    ChevronDown, MoreHorizontal, Search
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
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
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
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
            <span className="text-xs text-muted-foreground capitalize">{row.getValue("sub_partida")}</span>
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
        accessorKey: "total",
        header: "Monto",
        cell: ({ row }) => {
            const value = row.getValue("total") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
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
    // {
    //     accessorKey: "pagado",
    //     header: "Pagado",
    //     cell: ({ row }) => {
    //         const value = row.getValue("pagado") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    // {
    //     accessorKey: "por_liquidar",
    //     header: "Por Liquidar",
    //     cell: ({ row }) => {
    //         const value = row.getValue("por_liquidar") as number;
    //         return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
    //     },
    // },
    {
        accessorKey: "avance",
        header: "Avance",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">15%</div>
        },
    },
    {
        accessorKey: "fechaPago",
        header: "Fecha pago",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">12 Sep 2025</div>
        },
    },
    {
        accessorKey: "proveedor",
        header: "Proveedor",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="capitalize">Aceros Cabo Sa de CV</div>
        },
    },
    {
        accessorKey: "factura",
        header: "Factura",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">050333.pdf</div>
        },
    },
    {
        accessorKey: "numeroPago",
        header: "#Pago",
        // cell: ({ row }) => {
        cell: () => {
            // const value = row.getValue("avance") as number;            
            return <div className="lowercase">01</div>
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
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input
                            placeholder="Filtrar por..."
                            value={(table.getColumn("nombre")?.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                                table.getColumn("nombre")?.setFilterValue(event.target.value)
                            }
                            className="pl-10"
                        />
                    </div>
                    <DropdownMenu>
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
                    </DropdownMenu>
                </div>
                <div className="overflow-hidden rounded-md border">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id}>
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
                                        data-state={row.getIsSelected() && "selected"}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
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
                                        className="h-24 text-center"
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
                <TabsList className="grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="ultimos-movimientos" className="text-sm">
                        Últimos movimientos
                    </TabsTrigger>
                    <TabsTrigger value="cuentas-por-pagar" className="text-sm">
                        Cuentas por pagar
                    </TabsTrigger>
                    <TabsTrigger value="pago-estimaciones" className="text-sm">
                        Pago de Estimaciones
                    </TabsTrigger>
                    <TabsTrigger value="pago-anticipos" className="text-sm">
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
