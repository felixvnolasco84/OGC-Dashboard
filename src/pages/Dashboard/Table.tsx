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
    ChevronDown, MoreHorizontal
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
        header: "Nombre",
        cell: ({ row }) => <div className="lowercase">{row.getValue("nombre")}</div>,
    },
    {
        accessorKey: "familia",
        header: "Familia",
        cell: ({ row }) => <div className="lowercase">{row.getValue("familia")}</div>,
    },
    {
        accessorKey: "sub_partida",
        header: "Sub Partida",
        cell: ({ row }) => <div className="lowercase">{row.getValue("sub_partida")}</div>,
    },
    {
        accessorKey: "Cantidad",
        header: "Cantidad",
        cell: ({ row }) => <div className="lowercase">{row.getValue("Cantidad")}</div>,
    },
    {
        accessorKey: "PrecioUnitario",
        header: "Precio Unitario",
        cell: ({ row }) => {
            const value = row.getValue("PrecioUnitario") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "Subtotal",
        header: "Subtotal",
        cell: ({ row }) => {
            const value = row.getValue("Subtotal") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "Iva",
        header: "IVA",
        cell: ({ row }) => {
            const value = row.getValue("Iva") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "total",
        header: "Total",
        cell: ({ row }) => {
            const value = row.getValue("total") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "aprobado",
        header: "Aprobado",
        cell: ({ row }) => {
            const value = row.getValue("aprobado") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "pagado",
        header: "Pagado",
        cell: ({ row }) => {
            const value = row.getValue("pagado") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "por_liquidar",
        header: "Por Liquidar",
        cell: ({ row }) => {
            const value = row.getValue("por_liquidar") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
    {
        accessorKey: "actual",
        header: "Actual",
        cell: ({ row }) => {
            const value = row.getValue("actual") as number;
            return <div className="lowercase">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)}</div>
        },
    },
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

    return (
        <div>
            <div className="flex items-center py-4">
                <Input
                    placeholder="Filter partidas..."
                    value={(table.getColumn("nombre")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("nombre")?.setFilterValue(event.target.value)
                    }
                    className="max-w-sm"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="ml-auto">
                            Columns <ChevronDown />
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
    )
}
