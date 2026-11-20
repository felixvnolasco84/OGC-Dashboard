import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, Link, useLocation } from "react-router";
import { Toaster } from "sonner";
import SidebarComponent from "../../src/components/ui/SidebarComponent";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../src/components/ui/Sidebar";
import ProyectoDocumentosPage from "../../src/pages/ProyectoDocumentos/ProyectoDocumentosPage";
import { fixture, refreshEvidence, snapshot, subscribe } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Layout() {
  useSyncExternalStore(subscribe, snapshot);
  const location = useLocation();
  return <SidebarProvider defaultOpen>
    <SidebarComponent />
    <SidebarInset className="min-w-0">
      <header className="flex items-center gap-3 border-b p-3"><SidebarTrigger aria-label="Mostrar u ocultar navegación" /><span className="text-xs text-muted-foreground">Sidebar y página reales · Datos ficticios · Sin conexión a Convex</span></header>
      {location.pathname.endsWith("/documentos") ? <ProyectoDocumentosPage /> : <p className="p-6">Otra sección de prueba</p>}
      <aside aria-label="Evidencia de prueba" className="space-y-3 border-t p-4 text-xs">
        <nav className="flex flex-wrap gap-3"><Link to="/proyecto/obra/documentos">Proyecto de prueba</Link><Link to="/proyecto/other/documentos">Otro proyecto</Link><a href="?role=user">Usuario</a><a href="?role=viewer">Lector</a><a href="?denied">Sin acceso</a><a href="?empty">Vacío</a><a href="?loading">Carga</a><a href="?fail">Error simulado</a></nav>
        <button className="border p-2" onClick={refreshEvidence}>Actualizar evidencia</button>
        <output aria-label="Ruta actual" className="block">{location.pathname}</output>
        <output aria-label="Mutaciones simuladas" className="block whitespace-pre-wrap break-all">{JSON.stringify(fixture.calls, null, 2)}</output>
        <output aria-label="Consulta de documentos" className="block break-all">{JSON.stringify(fixture.queries.filter(q => q.name === "documentos:listFileManagerDocuments").at(-1)?.args)}</output>
      </aside>
      <Toaster />
    </SidebarInset>
  </SidebarProvider>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><MemoryRouter initialEntries={["/proyecto/obra/documentos"]}><Routes><Route path="/proyecto/:proyectoId/*" element={<Layout />} /></Routes></MemoryRouter></React.StrictMode>);
