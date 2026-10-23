import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { Button } from "@/components/ui/button";
import UploadProjectionsModal from "@/components/modals/upload-projections-modal";
import { useUploadProjectionsModal } from "@/hooks/upload-projections-modal";
import AdminFlujoPage from "@/pages/AdminFlujo/AdminFlujoPage";
import AdminSalesFlujoPage from "@/pages/AdminSalesFlujo/AdminSalesFlujoPage";
import ProyectoFlujoPage from "@/pages/ProyectoFlujo/ProyectoFlujoPage";
import SalesProyectoFlujoPage from "@/pages/SalesProyectoFlujo/SalesProyectoFlujoPage";
import { UploadWeeklyTotals } from "@/components/UploadWeeklyTotals";
import type { Id } from "../../convex/_generated/dataModel";
import "@/index.css";
const screen = new URLSearchParams(location.search).get("screen") || "modal";
export function Preview() {
  const modal = useUploadProjectionsModal();
  return <MemoryRouter initialEntries={[screen === "collection-page" ? "/sales/sales-project" : "/projects/project"]}>
    <div className="border-b border-border bg-background px-4 py-3 text-xs text-muted-foreground">Prueba local · datos ficticios · sin conexión al backend</div>
    {screen === "modal" ? <main className="p-4"><Button onClick={() => modal.onOpen("project" as Id<"desarrollos">)}>Subir Excel de prueba</Button><UploadProjectionsModal /></main>
      : screen === "expense-admin" ? <AdminFlujoPage /> : screen === "collection-admin" ? <AdminSalesFlujoPage />
      : screen === "legacy" ? <UploadWeeklyTotals proyectoId={"project" as Id<"desarrollos">} proyectoNombre="Obra de prueba" />
      : <Routes><Route path="/projects/:proyectoId" element={<ProyectoFlujoPage />} /><Route path="/sales/:salesProyectoId" element={<SalesProyectoFlujoPage />} /></Routes>}
  </MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
