import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import RFIDetailPage from "../../src/pages/RFIs/RFIDetailPage";
import RFIListPage from "../../src/pages/RFIs/RFIListPage";
import RFINewPage from "../../src/pages/RFIs/RFINewPage";
import { fixtureState, fixtureChange, restoreFixture, subscribeFixture } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Controls() {
  subscribeFixture();
  const addFiles = () => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return;
    const transfer = new DataTransfer(); transfer.items.add(new File(["evidencia de prueba"], "Plano-de-cubierta.pdf", { type: "application/pdf" }));
    input.files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return <aside className="border-b border-border bg-background p-3 text-xs"><p>Validación local · {fixtureState.status}</p><div className="mt-2 flex flex-wrap gap-3"><button onClick={() => { fixtureState.status = "Cambio programado en 15 segundos"; setTimeout(fixtureChange, 15000); }}>Programar cambio concurrente</button><button onClick={restoreFixture}>Desactivar error simulado</button><button onClick={addFiles}>Preparar adjunto de prueba</button></div><output className="mt-2 block">Operaciones: {fixtureState.calls.join(", ") || "ninguna"}</output></aside>;
}
const params = new URLSearchParams(location.search);
const initial = params.has("embedded") ? "/proyecto/project/rfis" : params.has("new") ? "/proyecto/project/rfis/nueva" : params.has("edit") ? "/proyecto/project/rfis/rfi/editar" : "/proyecto/project/rfis/rfi";
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={[initial]}><Controls /><Routes>
  <Route path="/proyecto/:proyectoId/rfis" element={<RFIListPage />} />
  <Route path="/proyecto/:proyectoId/rfis/nueva" element={<RFINewPage />} />
  <Route path="/proyecto/:proyectoId/rfis/:rfiId/editar" element={<RFINewPage />} />
  <Route path="/proyecto/:proyectoId/rfis/:rfiId" element={<RFIDetailPage />} />
</Routes><Toaster /></MemoryRouter>);
