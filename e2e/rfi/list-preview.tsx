import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { Toaster } from "sonner";
import RFIListPage from "../../src/pages/RFIs/RFIListPage";
import { fixtureState, fixtureSetCreatePermission, restoreFixture, subscribeFixture } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Controls() {
  subscribeFixture();
  const navigate = useNavigate();
  return <aside className="border-b border-border bg-background p-3 text-xs text-muted-foreground">
    <p>P12 · Datos simulados, sin conexión al servidor</p>
    <details><summary>Controles de prueba</summary>
      <div className="flex flex-wrap gap-3 py-2">
        <button onClick={() => navigate("/proyecto/other/rfis")}>Cambiar proyecto</button>
        <button onClick={() => navigate("/proyecto/project/rfis")}>Volver al proyecto</button>
        <button onClick={() => navigate("/rfis")}>Sin proyecto</button>
        <button onClick={() => fixtureSetCreatePermission(false)}>Revocar creación</button>
        <button onClick={() => fixtureSetCreatePermission(true)}>Permitir creación</button>
        <button onClick={restoreFixture}>Desactivar error simulado</button>
      </div>
      <output data-testid="rfi-requests" className="block break-all">{JSON.stringify(fixtureState.requests)}</output>
    </details>
  </aside>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><MemoryRouter initialEntries={["/proyecto/project/rfis"]}>
  <Controls />
  <Routes>
    <Route path="/proyecto/:proyectoId/rfis" element={<RFIListPage />} />
    <Route path="/rfis" element={<RFIListPage />} />
  </Routes>
  <Toaster />
</MemoryRouter></StrictMode>);
