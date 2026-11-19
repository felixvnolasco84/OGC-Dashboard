import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import PlanosPage from "../../src/pages/Planos/PlanosPage";
import MentionNotificationCenter from "../../src/pages/Planos/MentionNotificationCenter";
import { fixture } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

Object.assign(window, { p14Fixture: fixture });
function Preview() {
  const location = useLocation();
  return <>
    <header className="flex h-12 items-center justify-between border-b px-6">
      <span className="text-xs text-muted-foreground">P14 · UI real con datos simulados</span>
      <MentionNotificationCenter iconOnly />
    </header>
    <div data-viewer-readonly={fixture.role === "viewer" ? "true" : undefined}>
      <Routes>
        <Route path="/proyecto/:proyectoId/planos" element={<PlanosPage />} />
        <Route path="/proyecto/:proyectoId/planos/:planoId" element={<PlanosPage />} />
      </Routes>
    </div>
    <nav aria-label="Controles de prueba" className="m-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <Link to="/proyecto/project/planos">Proyecto de prueba</Link>
      <Link to="/proyecto/other/planos">Proyecto alterno</Link>
      <output data-testid="fixture-location">{location.pathname + location.search}</output>
    </nav>
    <Toaster />
  </>;
}
// History supplies the real route parameters without modifying production routing.
if (!location.pathname.startsWith("/proyecto/")) history.replaceState(null, "", `/proyecto/project/planos${location.search}`);
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><Preview /></BrowserRouter></React.StrictMode>);
