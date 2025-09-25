import { useState } from "react";
// import { api } from "../../../convex/_generated/api";
// import { useQuery } from "convex/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";

// Mock data for the presupuesto page
const mockData = {
  project: {
    name: "Larena - Torre G",
    breadcrumb: "Presupuesto"
  },
  metrics: {
    presupuestoOriginal: {
      amount: 104225001.10,
      label: "Presupuesto Original"
    },
    presupuestoAprobado: {
      amount: 96563399.05,
      percentage: -4,
      label: "Presupuesto aprobado",
      badge: "Reducción 4%"
    },
    gastoTotal: {
      amount: 22759332.05,
      percentage: 23,
      label: "Gasto total",
      badge: "Avance 23%"
    },
    porGastar: {
      amount: 83495599.05,
      percentage: 77,
      label: "Por gastar",
      badge: "Pendiente 77%"
    }
  },
  filters: {
    partidas: ["Partida", "Cimentación", "Acero", "Cimbra"],
    familias: ["Familia", "Estructural", "Acabados", "Instalaciones"],
    fechas: ["Semana", "Mes", "Trimestre"]
  }
};

const formatNumber = (amount: number) => {
  return new Intl.NumberFormat('es-MX').format(amount);
};

export default function PresupuestoPage() {
  const [selectedPartida, setSelectedPartida] = useState("Partida");
  const [selectedFamilia, setSelectedFamilia] = useState("Familia");
  const [selectedFecha, setSelectedFecha] = useState("Semana");
  const [searchTerm, setSearchTerm] = useState("");

  // const data = useQuery(api.partida.getByFamily, { family: "ACERO" });

  // if (!data) return <p>No data available</p>;

  return (
    <div className="bg-white px-12 py-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-col text-left">
              <p className="text-sm text-gray-500 mb-1">{mockData.project.breadcrumb}</p>
              <h1 className="text-2xl text-gray-900">{mockData.project.name}</h1>
            </div>
          </div>
        </div>

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Presupuesto Original */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">{mockData.metrics.presupuestoOriginal.label}</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(mockData.metrics.presupuestoOriginal.amount)}
                    <span className="text-sm font-normal text-gray-500">.10</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Presupuesto Aprobado */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">{mockData.metrics.presupuestoAprobado.label}</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(mockData.metrics.presupuestoAprobado.amount)}
                    <span className="text-sm font-normal text-gray-500">.05</span>
                  </p>
                </div>
                <div className="text-lg text-gray-500">
                  <Badge variant="secondary" className="ml-0 bg-green-100 text-green-800 rounded-xl border-green-800 text-[10px] font-normal py-1.5 leading-none">
                    {mockData.metrics.presupuestoAprobado.badge}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gasto Total */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">{mockData.metrics.gastoTotal.label}</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(mockData.metrics.gastoTotal.amount)}
                    <span className="text-sm font-normal text-gray-500">.05</span>
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  {mockData.metrics.gastoTotal.badge}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Por Gastar */}
          <Card className="bg-transparent shadow-none border-none">
            <CardContent className="pl-0 text-left">
              <div className="space-y-2">
                <p className="text-xs text-gray-500">{mockData.metrics.porGastar.label}</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-2xl font-normal text-gray-900">
                    ${formatNumber(mockData.metrics.porGastar.amount)}
                    <span className="text-sm font-normal text-gray-500">.05</span>
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  {mockData.metrics.porGastar.badge}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="bg-white border-b border-gray-200 pb-4">
          <div className="grid grid-cols-4 items-center gap-6">
            {/* Search */}
            <div className="flex items-center space-x-3 text-left">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Partida Filter */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Partida</span>
              <Select value={selectedPartida} onValueChange={setSelectedPartida}>
                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockData.filters.partidas.map((partida) => (
                    <SelectItem key={partida} value={partida}>
                      {partida}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Familia Filter */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Familia</span>
              <Select value={selectedFamilia} onValueChange={setSelectedFamilia}>
                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockData.filters.familias.map((familia) => (
                    <SelectItem key={familia} value={familia}>
                      {familia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha Filter */}
            <div className="flex flex-col space-y-1 text-left">
              <span className="text-xs text-gray-500">Fecha</span>
              <Select value={selectedFecha} onValueChange={setSelectedFecha}>
                <SelectTrigger className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockData.filters.fechas.map((fecha) => (
                    <SelectItem key={fecha} value={fecha}>
                      {fecha}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Budget Table Component */}
        <PresupuestoTable />
      </div>
    </div>
  );
}
