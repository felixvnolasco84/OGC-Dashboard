import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import PlanosPage from "../../src/pages/Planos/PlanosPage";
import { fixture } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

Object.assign(window, { p15Fixture: fixture });
function Preview() {
  return <>
    <header className="flex h-12 items-center border-b px-6 text-xs text-muted-foreground">P15 · UI real · Datos ficticios sin conexión al backend</header>
    <div data-viewer-readonly={fixture.role === "viewer" ? "true" : undefined}>
      <Routes>
        <Route path="/proyecto/:proyectoId/planos" element={<PlanosPage />} />
        <Route path="/proyecto/:proyectoId/planos/:planoId" element={<PlanosPage />} />
      </Routes>
    </div>
    <nav aria-label="Controles de prueba" className="m-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <Link to="/proyecto/project/planos/plan">Plano de prueba</Link>
      <Link to="/proyecto/project/planos/other">Otro plano ficticio</Link>
    </nav>
    <Toaster />
  </>;
}
if (!location.pathname.startsWith("/proyecto/")) history.replaceState(null, "", `/proyecto/project/planos/plan${location.search}`);
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><Preview /></BrowserRouter></React.StrictMode>);
