import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import ProfitAndLossPage from "@/pages/ProfitAndLoss/ProfitAndLossPage";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import EditProyectoModal from "@/components/modals/edit-proyecto-modal";
import { useEditProyectoModal } from "@/hooks/edit-proyecto-modal";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { partidas } from "./convex-stub";
import "@/index.css";
import "@/responsive.css";

function Fixture() {
  const mode = new URLSearchParams(location.search).get("view");
  return <main className="p-4">
    {mode === "budget" ? <>
      <button onClick={() => useEditProyectoModal.getState().onOpen("project" as Id<"desarrollos">)}>Editar proyecto de prueba</button>
      <PresupuestoTable data={partidas as Doc<"partidas">[]} status="Exhausted" showPrecioUnitario={false} loadMore={() => {}} onRequestDelete={() => {}} />
      <EditProyectoModal />
    </> : <ProfitAndLossPage />}
    <Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><TooltipProvider><Fixture /></TooltipProvider></BrowserRouter>);
