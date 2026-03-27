import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PermisosYLegalTab from "./PermisosYLegalTab";
import PresupuestosContratosTab from "./PresupuestosContratosTab";
import ImssYSirocTab from "./ImssYSirocTab";

export default function AutorizacionesObraPage({ embedded = false }: { embedded?: boolean }) {
  const { proyectoId } = useParams<{ proyectoId: string }>();

  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  if (!proyecto) {
    return (
      <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-gray-500">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-white", !embedded && "min-h-screen")}>
      <div className={cn(!embedded && "px-12", "pt-6")}>
        <Tabs defaultValue="permisos">
          <TabsList className="bg-transparent border-b border-gray-200 rounded-none w-full justify-start p-0 h-auto">
            <TabsTrigger
              value="permisos"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900"
            >
              Permisos y legal
            </TabsTrigger>
            <TabsTrigger
              value="presupuestos"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900"
            >
              Presupuestos y contratos
            </TabsTrigger>
            <TabsTrigger
              value="imss"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900"
            >
              IMSS y SIROC
            </TabsTrigger>
          </TabsList>

          <TabsContent value="permisos">
            <PermisosYLegalTab proyectoId={proyectoId!} />
          </TabsContent>

          <TabsContent value="presupuestos">
            <PresupuestosContratosTab proyectoId={proyectoId!} />
          </TabsContent>

          <TabsContent value="imss">
            <ImssYSirocTab proyectoId={proyectoId!} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

