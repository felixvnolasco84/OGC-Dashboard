import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Search, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

export default function ProyectoProveedoresTablePage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Fetch project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");
  
  // Fetch all transactions for this project
  const transacciones = useQuery(api.transacciones.getByProyecto, proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip");
  
  // Fetch all proveedores
  const allProveedores = useQuery(api.proveedores.getAll);

  // Get unique proveedores (bancos) from transactions in this project
  const proyectoProveedoresData = useMemo(() => {
    if (!transacciones || !allProveedores) return [];

    // Get unique banco names from transactions
    const bancosInProject = new Set(
      transacciones
        .filter(t => t.banco)
        .map(t => t.banco!)
    );

    // Match proveedores by banco name and calculate stats
    const proveedoresWithStats = allProveedores
      .filter(prov => bancosInProject.has(prov.banco))
      .map(proveedor => {
        // Count transactions and sum amounts for this proveedor
        const provTransacciones = transacciones.filter(t => t.banco === proveedor.banco);
        const totalAmount = provTransacciones.reduce((sum, t) => sum + t.monto_total, 0);
        
        return {
          ...proveedor,
          transaccionesCount: provTransacciones.length,
          totalAmount,
        };
      });

    return proveedoresWithStats;
  }, [transacciones, allProveedores]);

  const filteredProveedores = proyectoProveedoresData.filter((proveedor) =>
    proveedor.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proveedor.rfc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proveedor.nombre_contacto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proveedor.banco?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (!proyecto) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Proveedores</p>
              <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="rounded-none px-4 py-2 bg-gray-100">
                <span className="text-sm font-normal">
                  Total: {proyectoProveedoresData.length}
                </span>
              </Badge>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por razón social, RFC, contacto o banco..."
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
                  Razón Social
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  RFC
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Dirección
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Nombre Contacto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Teléfono Contacto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Cuenta
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  CLABE
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Banco
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Transacciones
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200">
                  Monto Total
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-gray-600 border-r border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!proyectoProveedoresData ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filteredProveedores.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron proveedores en este proyecto
                  </td>
                </tr>
              ) : (
                filteredProveedores.map((proveedor) => (
                  <tr
                    key={proveedor._id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 border-r border-gray-200">
                      <div className="text-sm font-normal text-gray-900">
                        {proveedor.razon_social}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {proveedor.rfc}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      <div className="max-w-xs truncate">
                        {proveedor.direccion}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {proveedor.nombre_contacto}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {proveedor.telefono_contacto}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {proveedor.cuenta}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {proveedor.clabe}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 border-r border-gray-200">
                      {proveedor.banco}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-900 border-r border-gray-200">
                      <Badge variant="outline" className="px-2 py-1 text-xs">
                        {proveedor.transaccionesCount}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 border-r border-gray-200">
                      {formatCurrency(proveedor.totalAmount)}
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
                          <DropdownMenuItem>Ver transacciones</DropdownMenuItem>
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
