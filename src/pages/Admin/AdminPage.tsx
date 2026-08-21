import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UploadWeeklyTotals } from "@/components/UploadWeeklyTotals";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Id } from "../../../convex/_generated/dataModel";

export default function AdminPage() {
  const [selectedProyectoId, setSelectedProyectoId] = useState<Id<"desarrollos"> | null>(null);
  
  // Fetch all projects
  const proyectos = useQuery(api.desarrollos.getAll);
  
  // Get selected project name
  const selectedProyecto = proyectos?.find(p => p._id === selectedProyectoId);

  return (
    <div className="bg-card px-12 py-6 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-lg py-6">
          <h1 className="text-2xl text-foreground mb-2">Administración</h1>
          <p className="text-sm text-subtle-foreground">
            Herramientas para cargar y gestionar datos del proyecto
          </p>
        </div>

        {/* Project Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Seleccionar Proyecto</label>
          <Select
            value={selectedProyectoId || undefined}
            onValueChange={(value) => setSelectedProyectoId(value as Id<"desarrollos">)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un proyecto" />
            </SelectTrigger>
            <SelectContent>
              {proyectos?.map((proyecto) => (
                <SelectItem key={proyecto._id} value={proyecto._id}>
                  {proyecto.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Upload Weekly Totals Section */}
        <div>
          <UploadWeeklyTotals 
            proyectoId={selectedProyectoId}
            proyectoNombre={selectedProyecto?.nombre || ''}
          />
        </div>
      </div>
    </div>
  );
}
