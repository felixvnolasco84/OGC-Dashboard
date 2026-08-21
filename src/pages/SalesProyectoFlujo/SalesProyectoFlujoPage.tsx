import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Calendar, TrendingUp, DollarSign, FileSpreadsheet } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Helper to convert Excel serial date to formatted string
const excelDateToString = (serial: number): string => {
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  const date = new Date(excelEpoch.getTime() + serial * msPerDay);
  
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
};

export default function SalesProyectoFlujoPage() {
  const { salesProyectoId } = useParams<{ salesProyectoId: string }>();
  const [selectedPartida, setSelectedPartida] = useState<string>("all");

  // Fetch sales project data
  const salesProyecto = useQuery(
    api.sales_projects.getById,
    salesProyectoId ? { id: salesProyectoId as Id<"sales_projects"> } : "skip"
  );

  // Fetch projected transactions
  const projections = useQuery(
    api.sales_projected_transactions_queries.getBySalesProject,
    salesProyectoId ? { sales_proyecto: salesProyectoId as Id<"sales_projects"> } : "skip"
  );

  // Fetch upload metadata
  const uploadMetadata = useQuery(
    api.sales_projected_transactions_queries.getUploadMetadata,
    salesProyectoId ? { sales_proyecto: salesProyectoId as Id<"sales_projects"> } : "skip"
  );

  // Get unique partidas for filter
  const uniquePartidas = useMemo(() => {
    if (!projections) return [];
    const partidas = new Set(projections.map(p => p.partida));
    return Array.from(partidas).sort();
  }, [projections]);

  // Filter projections by selected partida
  const filteredProjections = useMemo(() => {
    if (!projections || selectedPartida === "all") return projections;
    return projections.filter(p => p.partida === selectedPartida);
  }, [projections, selectedPartida]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!filteredProjections) return { total: 0, weeks: 0, partidas: 0 };
    
    const total = filteredProjections.reduce((sum, p) => sum + p.amount, 0);
    const weeks = new Set(filteredProjections.map(p => p.week_date)).size;
    const partidas = new Set(filteredProjections.map(p => p.partida)).size;
    
    return { total, weeks, partidas };
  }, [filteredProjections]);

  // Group by week for display
  const weeklyData = useMemo(() => {
    if (!filteredProjections) return [];
    
    const grouped = new Map<number, { date: number; partidas: Map<string, number>; total: number }>();
    
    filteredProjections.forEach(p => {
      if (!grouped.has(p.week_date)) {
        grouped.set(p.week_date, {
          date: p.week_date,
          partidas: new Map(),
          total: 0,
        });
      }
      
      const week = grouped.get(p.week_date)!;
      const currentPartidaAmount = week.partidas.get(p.partida) || 0;
      week.partidas.set(p.partida, currentPartidaAmount + p.amount);
      week.total += p.amount;
    });
    
    return Array.from(grouped.values()).sort((a, b) => a.date - b.date);
  }, [filteredProjections]);

  if (!salesProyecto || !projections) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-disabled-foreground animate-pulse" />
          <p className="text-subtle-foreground">Cargando proyecciones...</p>
        </div>
      </div>
    );
  }

  if (projections.length === 0) {
    return (
      <div className="bg-card px-12 py-6 min-h-screen">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="rounded-lg py-6 mb-6">
            <h1 className="text-2xl text-foreground mb-2">Flujo de Caja Proyectado</h1>
            <p className="text-sm text-subtle-foreground">{salesProyecto.nombre}</p>
          </div>

          {/* Empty State */}
          <Card>
            <CardContent className="py-12 text-center">
              <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-disabled-foreground" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No hay proyecciones cargadas
              </h3>
              <p className="text-sm text-subtle-foreground">
                El administrador debe cargar un archivo Excel con las proyecciones de flujo de caja.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card px-12 py-6 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <h1 className="text-2xl text-foreground mb-2">Flujo de Caja Proyectado</h1>
          <p className="text-sm text-subtle-foreground">{salesProyecto.nombre}</p>
        </div>

        {/* Upload Info */}
        {uploadMetadata && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-subtle-foreground" />
                  <span className="font-medium">Archivo:</span>
                  <span className="text-muted-foreground">{uploadMetadata.file_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-subtle-foreground" />
                  <span className="font-medium">Cargado:</span>
                  <span className="text-muted-foreground">
                    {new Date(uploadMetadata.uploaded_at).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-subtle-foreground mb-1">Total Proyectado</p>
                  <p className="text-2xl font-semibold">
                    ${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(stats.total)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-subtle-foreground mb-1">Semanas</p>
                  <p className="text-2xl font-semibold">{stats.weeks}</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-subtle-foreground mb-1">Partidas</p>
                  <p className="text-2xl font-semibold">{stats.partidas}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-subtle-foreground mb-1">Promedio Semanal</p>
                  <p className="text-2xl font-semibold">
                    ${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(
                      stats.weeks > 0 ? stats.total / stats.weeks : 0
                    )}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
            <CardDescription>Filtra las proyecciones por partida</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedPartida} onValueChange={setSelectedPartida}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Todas las partidas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las partidas</SelectItem>
                {uniquePartidas.map((partida) => (
                  <SelectItem key={partida} value={partida}>
                    {partida}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Weekly Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Desglose Semanal
            </CardTitle>
            <CardDescription>
              Proyecciones de flujo de caja por semana
              {selectedPartida !== "all" && ` - ${selectedPartida}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-subtle-foreground uppercase tracking-wider">
                      Semana
                    </th>
                    {selectedPartida === "all" ? (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-medium text-subtle-foreground uppercase tracking-wider">
                          Partidas
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-subtle-foreground uppercase tracking-wider">
                          Total
                        </th>
                      </>
                    ) : (
                      <th className="px-4 py-3 text-right text-xs font-medium text-subtle-foreground uppercase tracking-wider">
                        Monto
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {weeklyData.map((week, idx) => (
                    <tr key={week.date} className={idx % 2 === 0 ? 'bg-card' : 'bg-background'}>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {excelDateToString(week.date)}
                      </td>
                      {selectedPartida === "all" ? (
                        <>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            <div className="flex flex-wrap gap-1">
                              {Array.from(week.partidas.entries()).map(([partida]) => (
                                <span
                                  key={partida}
                                  className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                                >
                                  {partida}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                            ${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(week.total)}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                          ${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(week.total)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted border-t-2 border-border-strong">
                  <tr>
                    <td className="px-4 py-3 text-sm font-bold text-foreground">
                      Total
                    </td>
                    {selectedPartida === "all" && (
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {stats.partidas} partida{stats.partidas !== 1 ? 's' : ''}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-right font-bold text-foreground">
                      ${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(stats.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
