import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useQuery,
} from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DashboardTable } from "./Table";
import GanttChart from "@/components/Charts/GanttChart";
// import BarHorizontalChart from "./BarHorizontalChart";


export default function Dashboard() {

  const [selectedAdministracion, setSelectedAdministracion] = React.useState('')
  const [selectedPartida, setSelectedPartida] = React.useState('')
  const [selectedSubPartida, setSelectedSubPartida] = React.useState('')
  const [selectedFamily, setSelectedFamily] = React.useState('')

  const administraciones = useQuery(api.costos.getAllDiferentAdministracion)

  const partidas = useQuery(api.costos.getAllDiferentPartidaByAdministracion,
    selectedAdministracion ? { administracion: selectedAdministracion } : "skip"
  )

  const families = useQuery(api.costos.getAllDiferentFamiliaByPartida,
    selectedAdministracion && selectedPartida ? { administracion: selectedAdministracion, partida: selectedPartida } : "skip"
  )

  const subPartidas = useQuery(api.costos.getAllDiferentSubPartidaByPartida,
    selectedAdministracion && selectedPartida ? { administracion: selectedAdministracion, partida: selectedPartida, familia: selectedFamily } : "skip"
  )


  // Use getByDiferentFilters with all selected filters
  const data = useQuery(api.costos.getByDiferentFilters,
    selectedAdministracion ? {
      administracion: selectedAdministracion,
      family: selectedFamily || undefined,
      partida: selectedPartida || undefined,
      sub_partida: selectedSubPartida || undefined,
    } : "skip"
  )

  // Reset dependent filters when parent filter changes
  React.useEffect(() => {
    setSelectedPartida('')
    setSelectedFamily('')
    setSelectedSubPartida('')
  }, [selectedAdministracion])

  React.useEffect(() => {
    setSelectedFamily('')
    setSelectedSubPartida('')
  }, [selectedPartida])

  React.useEffect(() => {
    setSelectedSubPartida('')
  }, [selectedFamily])

  if (!administraciones) return <p>No administraciones available</p>
  if (!data && selectedAdministracion) return <p>Loading data...</p>

  return (
    <div className="flex flex-col gap-4 py-12">

      <nav className="flex justify-between">
        <div className="flex gap-4">

          <Select value={selectedAdministracion} onValueChange={(value: string) => setSelectedAdministracion(value)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue defaultValue={selectedAdministracion} placeholder="Seleccione una administracion" />
            </SelectTrigger>
            <SelectContent>
              {administraciones.map((administracion, index) => (
                <SelectItem key={index} value={administracion}>
                  {administracion}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPartida} onValueChange={(value: string) => setSelectedPartida(value)}>
            <SelectTrigger disabled={!selectedAdministracion} className="w-[240px]">
              <SelectValue placeholder="Seleccione una partida" />
            </SelectTrigger>
            <SelectContent>
              {partidas?.map((partida, index) => (
                <SelectItem key={index} value={partida}>
                  {partida}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedFamily} onValueChange={(value: string) => setSelectedFamily(value)}>
            <SelectTrigger disabled={!selectedAdministracion || !families} className="w-[240px]">
              <SelectValue placeholder="Seleccione una familia" />
            </SelectTrigger>
            <SelectContent>
              {families?.map((family, index) => (
                <SelectItem key={index} value={family}>
                  {family}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>



          <Select value={selectedSubPartida} onValueChange={(value: string) => setSelectedSubPartida(value)}>
            <SelectTrigger disabled={!selectedFamily} className="w-[240px]">
              <SelectValue placeholder="Seleccione una sub partida" />
            </SelectTrigger>
            <SelectContent>
              {subPartidas?.map((subPartida, index) => (
                <SelectItem key={index} value={subPartida}>
                  {subPartida}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
      </nav>

      <div className="flex flex-col gap-4">
        {data && <DashboardTable data={data} />}
        {data && <GanttChart data={data} />}
        {/* <BarHorizontalChart constructionData={data}/>  */}
      </div>
    </div>
  )
}
