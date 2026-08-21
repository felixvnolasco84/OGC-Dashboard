import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

export default function ProyectoProveedoresTablePage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Fetch project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");
  
  const proyectoProveedoresQuery = useQuery(
    api.proveedores.getByProyectoWithStats,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const proyectoProveedoresData = proyectoProveedoresQuery || [];

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
      <div className="bg-card min-h-screen flex items-center justify-center">
        <p className="text-subtle-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="bg-card min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-4 px-12">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-sm text-subtle-foreground mb-1">Proveedores</p>
              <h1 className="text-2xl text-foreground">{proyecto.nombre}</h1>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="rounded-none px-4 py-2 bg-muted">
                <span className="text-sm font-normal">
                  Total: {proyectoProveedoresData.length}
                </span>
              </Badge>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-8 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-disabled-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por razón social, RFC, contacto o banco..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 rounded-none border-border-strong h-12"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-none">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Razón Social
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  RFC
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Dirección
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Nombre Contacto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Teléfono Contacto
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Cuenta
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  CLABE
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Banco
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Transacciones
                </th>
                <th className="px-6 py-4 text-left text-sm font-normal text-muted-foreground border-r border-border">
                  Monto Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!proyectoProveedoresData ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-subtle-foreground">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : filteredProveedores.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-subtle-foreground">
                    No se encontraron proveedores en este proyecto
                  </td>
                </tr>
              ) : (
                filteredProveedores.map((proveedor) => (
                  <tr
                    key={proveedor._id}
                    className="hover:bg-background transition-colors"
                  >
                    <td className="px-6 py-4 border-r border-border">
                      <div className="text-sm font-normal text-foreground">
                        {proveedor.razon_social}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {proveedor.rfc}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      <div className="max-w-xs truncate">
                        {proveedor.direccion}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {proveedor.nombre_contacto}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {proveedor.telefono_contacto}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {proveedor.cuenta}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {proveedor.clabe}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground border-r border-border">
                      {proveedor.banco}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-foreground border-r border-border">
                      <Badge variant="outline" className="px-2 py-1 text-xs">
                        {proveedor.transaccionesCount}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-foreground border-r border-border">
                      {formatCurrency(proveedor.totalAmount)}
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
