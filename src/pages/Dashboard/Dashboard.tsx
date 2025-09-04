import { DashboardTable } from "./Table";
import { useQuery } from "@tanstack/react-query";
import BarHorizontalChart from "./BarHorizontalChart";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils";

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

  const { isPending, error, data } = useQuery({
    queryKey: ['partidas', selectedFamily],
    queryFn: () =>
      fetch(`http://localhost:5069/api/partidastable?familia=${encodeURIComponent(selectedFamily)}`).then((res) =>
        res.json(),
      ),
    enabled: selectedFamily !== undefined,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  if (isPending) return 'Loading...'

  if (error) return 'An error has occurred: ' + error.message

  console.log(data) 

  


 if (!data || data.length === 0) return <p>No data available</p>

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
              className={cn("px-4 py-2 rounded-md hover:bg-gray-100", selectedDevelopment === desarrollo.id ? "bg-gray-100" : "")}
              
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
      <DashboardTable data={data}/>
      <BarHorizontalChart constructionData={data}/>
    </div>
    </div>
  )
}
