import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router";
import { Toaster } from "sonner";
import ProveedoresTablePage from "../../src/pages/ProveedoresTable/ProveedoresTablePage";
import { fixture } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";
import "./preview.css";

Object.assign(window, { p18Fixture: fixture });
function Preview() {
  const location = useLocation();
  return <div className="min-h-screen bg-card">
    <aside className="p18-fixture-sidebar border-r bg-card p-6">
      <img src="/OGC-LOGO.svg" alt="OGC" className="h-8 w-auto" />
      <p className="mt-8 text-sm">Proveedores</p>
      <p className="mt-4 text-xs text-muted-foreground">P18 · UI real con datos simulados</p>
    </aside>
    <main className="p18-fixture-main">
      <header className="flex h-12 items-center border-b px-4 text-xs text-muted-foreground">Catálogo · Validación local sin conexión a Convex</header>
      <ProveedoresTablePage />
      <output data-testid="fixture-location" className="sr-only">{location.pathname + location.search}</output>
    </main>
    <Toaster />
  </div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><Preview /></BrowserRouter></React.StrictMode>);
