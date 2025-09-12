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
    ChevronDown,
    // MoreHorizontal
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    // DropdownMenuItem,
    // DropdownMenuLabel,
    // DropdownMenuSeparator,
    // DropdownMenuItem,
    // DropdownMenuLabel,
    // DropdownMenuSeparator,
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
import { costo } from "@/lib/utils"
import { Doc } from "convex/_generated/dataModel"
import DropdownMenuComponentCosto from "@/components/DropdownMenu/DropdownMenuComponenCosto"
// import DropdownMenuComponentCosto from "@/components/DropdownMenu/DropdownMenuComponenCosto"
// import { Doc } from "convex/_generated/dataModel"


// const getData = async () => {
//   const response = await fetch(`${API_BASE_URL}/partidastable`, {
//     method: 'GET',
//   });
//   const data = await response.json();
//   return data;
// };


export const columns: ColumnDef<costo>[] = [
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
        accessorKey: "administracion",
        header: "Administracion",
        cell: ({ row }) => <div className="lowercase">{row.getValue("administracion")}</div>,
    },
    {
        accessorKey: "partida",
        header: "Partida",
        cell: ({ row }) => <div className="lowercase">{row.getValue("partida")}</div>,
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
        accessorKey: "monto",
        header: "Monto",
        cell: ({ row }) => <div className="lowercase">{row.getValue("monto")}</div>,
    },
    {
        accessorKey: "factura",
        header: "Factura",
        cell: ({ row }) => <div className="lowercase">{row.getValue("factura")}</div>,
    },
    {
        accessorKey: "fecha",
        header: "Fecha",
        cell: ({ row }) => {
            return <div className="lowercase">{row.getValue("fecha")}</div>;
        },
    },
    {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
            const payment = row.original

            return (
                <DropdownMenuComponentCosto costo={payment as Doc<"costos">} />
                // <DropdownMenu>
                //     <DropdownMenuTrigger asChild>
                //         <Button variant="ghost" className="h-8 w-8 p-0">
                //             <span className="sr-only">Open menu</span>
                //             <MoreHorizontal />
                //         </Button>
                //     </DropdownMenuTrigger>
                //     <DropdownMenuContent align="end">
                //         <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                //         <DropdownMenuItem
                //             onClick={() => navigator.clipboard.writeText(payment.administracion)}
                //         >
                //             Copiar administracion
                //         </DropdownMenuItem>
                //         <DropdownMenuSeparator />
                //         <DropdownMenuItem >Ver detalles </DropdownMenuItem>
                //     </DropdownMenuContent>
                // </DropdownMenu>
            )
        },
    },
]

export function DashboardTable({ data }: { data: costo[] }) {



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
                    value={(table.getColumn("partida")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("partida")?.setFilterValue(event.target.value)
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
