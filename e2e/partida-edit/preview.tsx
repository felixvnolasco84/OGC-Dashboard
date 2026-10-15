import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import AddPartidaModal from "@/components/modals/add-partida-modal";
import { useAddPartidaModal } from "@/hooks/add-partida-modal";
import { Button } from "@/components/ui/button";
import type { Id } from "../../convex/_generated/dataModel";
import { readRows, scenario, useRevision } from "./convex-stub";
import "@/index.css";
function Fixture() {
  useRevision();
  return <main className="p-4 space-y-4">
    <h1 className="text-xl font-medium">Presupuesto · datos de prueba</h1>
    <Button onClick={() => useAddPartidaModal.getState().onOpen({ proyecto: "project" as Id<"desarrollos">, projectName: "Obra de prueba" })}>Nueva partida de prueba</Button>
    <p className="text-sm text-muted-foreground">Vista {scenario === "filtered" ? "del periodo: pagos parciales" : "completa"}. Incluye una familia sin subpartidas y pagos directos a padres.</p>
    <PresupuestoTable data={readRows()} status="Exhausted" showPrecioUnitario loadMore={() => {}} onRequestDelete={() => {}}
      {...(scenario === "filtered" ? { filteredPayments: { leaf: 30, sibling: 0, family: 0, root: 10 }, filteredHonorarios: 8, filteredIndirectos: 2, dateFilterLabel: "Periodo de prueba" } : {})} />
    <Toaster />
    <AddPartidaModal />
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
