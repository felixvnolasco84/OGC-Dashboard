import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils";
import {
  useQuery
} from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DashboardTable } from "./DashboardTable";
import BarHorizontalChart from "./BarHorizontalChart";
import { Id } from "convex/_generated/dataModel";


export default function Dashboard() {

  const desarrollos = [
    {
      id: "torre-i",
      nombre: 'Torre I',
    },
    {
      id: "torre-h",
      nombre: 'Torre H',
    },
    {
      id: "torre-j",
      nombre: 'Torre J',
    },
  ]

  const [selectedFamily, setSelectedFamily] = React.useState('ACERO')
  const [selectedDevelopment, setSelectedDevelopment] = React.useState('torre-i')


  const data = useQuery(api.partida.getByFamily, { family: selectedFamily })

  if (!data) return <p>No data available</p>

  const families: string[] = [
    'ACERO',
    'AGREGADOS',
    'AIRE_ACONDICIONADO',
    'CANCELERÍA',
    'CARPINTERÍA',
    'CEMENTANTES',
    'CIMBRA',
    'COCINA',
    'CONCRETOS',
    'CONSUMIBLES'
  ]

  return (
    <div className="flex flex-col gap-4 py-12">
      <nav className="flex justify-between">
        <h1>Dashboard</h1>
        <div className="flex gap-4">
          {desarrollos.map((desarrollo) => (
            <button
              key={desarrollo.id}
              onClick={() => setSelectedDevelopment(desarrollo.id)}
              className={cn("px-4 py-2 rounded-md hover:bg-muted", selectedDevelopment === desarrollo.id ? "bg-muted" : "")}

            >
              {desarrollo.nombre}
            </button>
          ))}
        </div>
      </nav>
      <div className="flex justify-end">
        <Select value={selectedFamily} onValueChange={(value: string) => setSelectedFamily(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a family" />
          </SelectTrigger>
          <SelectContent>
            {families.map((family) => (
              <SelectItem key={family} value={family}>
                {family}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4">
        <DashboardTable proyectoId={selectedDevelopment as Id<"desarrollos">} />
        <BarHorizontalChart constructionData={data} />
      </div>
    </div>
  )
}
