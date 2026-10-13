import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import { readRows, scenario, useRevision } from "./convex-stub";
import "@/index.css";
function Fixture() {
  useRevision();
  return <main className="p-4 space-y-4">
    <h1 className="text-xl font-medium">Presupuesto · datos de prueba</h1>
    <p className="text-sm text-muted-foreground">Vista {scenario === "filtered" ? "del periodo: pagos parciales" : "completa"}. Incluye una familia sin subpartidas y pagos directos a padres.</p>
    <PresupuestoTable data={readRows()} status="Exhausted" showPrecioUnitario loadMore={() => {}} onRequestDelete={() => {}}
      {...(scenario === "filtered" ? { filteredPayments: { leaf: 30, sibling: 0, family: 0, root: 10 }, filteredHonorarios: 8, filteredIndirectos: 2, dateFilterLabel: "Periodo de prueba" } : {})} />
    <Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
