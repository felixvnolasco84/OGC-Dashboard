import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { BarChart3, TrendingUp } from "lucide-react";
// import { Badge } from "@/components/ui/badge";

export default function SalesProyectoFlujoPage() {
  const { salesProyectoId } = useParams<{ salesProyectoId: string }>();

  // Fetch sales project
  const salesProyecto = useQuery(
    api.sales_projects.getById,
    salesProyectoId ? { id: salesProyectoId as Id<"sales_projects"> } : "skip"
  );

  // Fetch projected transactions
  // const projections = useQuery(
  //   api.sales_projected_transactions_queries.getBySalesProject,
  //   salesProyectoId ? { sales_proyecto: salesProyectoId as Id<"sales_projects"> } : "skip"
  // );

  // Fetch upload metadata
  // const uploadMetadata = useQuery(
  //   api.sales_projected_transactions_queries.getUploadMetadata,
  //   salesProyectoId ? { sales_proyecto: salesProyectoId as Id<"sales_projects"> } : "skip"
  // );

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("es-MX", {
  //     style: "currency",
  //     currency: "MXN",
  //     minimumFractionDigits: 0,
  //     maximumFractionDigits: 0,
  //   }).format(amount);
  // };

  // const formatDate = (timestamp: number) => {
  //   return new Date(timestamp).toLocaleDateString("es-MX", {
  //     day: "numeric",
  //     month: "long",
  //     year: "numeric",
  //   });
  // };

  if (!salesProyecto) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  // const totalProjected = projections?.reduce((sum, p) => sum + p.amount, 0) || 0;
  // const uniqueWeeks = new Set(projections?.map(p => p.week_date) || []).size;

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-full mx-auto py-8 text-left">
        <div className="flex flex-col gap-6 px-12">
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-1">Flujo de Caja Proyectado</p>
            <h1 className="text-2xl text-gray-900">{salesProyecto.nombre}</h1>
            La funcionalidad de flujo para proyectos de ventas estará disponible próximamente.
          </div>
        </div>
      </div>
    </div>

  );
}
