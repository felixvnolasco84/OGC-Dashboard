import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PagosTablePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const pagos = useQuery(api.pagos.getAll);

  const filteredPagos = pagos?.filter((pago) =>
    pago.proyectoNombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.partida?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.familia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.sub_partida?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.codigo_referencia?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Pagado":
        return "bg-green-50 text-green-700 border-green-200";
      case "Por pagar":
        return "bg-orange-50 text-orange-700 border-orange-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getTipoPagoColor = (tipoPago?: string) => {
    switch (tipoPago?.toLowerCase()) {
      case "efectivo":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "transferencia":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "tarjeta":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "cheque":
        return "bg-gray-50 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8">
            <h1 className="text-3xl font-normal text-gray-900 mb-2">Pagos</h1>
            <p className="text-sm text-gray-500">
              Consulta y gestiona todos los pagos registrados en el sistema
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por proyecto, partida, familia, sub-partida o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 rounded-none border-gray-300 h-12"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-none">
          <table className="w-full">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Proyecto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Partida
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Familia
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Sub-partida
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Monto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Fecha
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Tipo de pago
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Código ref.
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!pagos ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    Cargando pagos...
                  </td>
                </tr>
              ) : filteredPagos && filteredPagos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron pagos
                  </td>
                </tr>
              ) : (
                filteredPagos?.map((pago) => (
                  <tr
                    key={pago._id}
                    className="hover: transition-colors"
                  >
                    <td className="px-6 py-4 border-r border-gray-200">
                      <div className="text-sm font-normal text-gray-900">
                        {pago.proyectoNombre || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {pago.partida || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {pago.familia || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {pago.sub_partida || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {formatCurrency(pago.monto)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 border-r border-gray-200">
                      {pago.fecha
                        ? new Date(pago.fecha.split("/").reverse().join("-")).toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    <td className="px-6 py-4 border-r border-gray-200">
                      <Badge
                        variant="outline"
                        className={`${getTipoPagoColor(
                          pago.tipo_pago
                        )} rounded-full px-3 py-1 text-xs font-normal capitalize`}
                      >
                        {pago.tipo_pago || "-"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 border-r border-gray-200">
                      <Badge
                        variant="outline"
                        className={`${getStatusColor(
                          pago.status
                        )} rounded-full px-3 py-1 text-xs font-normal`}
                      >
                        {pago.status || "-"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 border-r border-gray-200">
                      {pago.codigo_referencia || "-"}
                    </td>
                    <td className="px-6 py-4 border-r border-gray-200">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4 text-gray-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Ver detalles</DropdownMenuItem>
                          <DropdownMenuItem>Ver transacción</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
