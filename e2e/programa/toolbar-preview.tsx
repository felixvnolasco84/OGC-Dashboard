import React from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";
import ProgramaObra from "../../src/pages/Programa Obra/ProgramaObra";
import { SidebarProvider, useSidebar } from "../../src/components/ui/Sidebar";
import "../../src/index.css";

function Fixture() {
  const { open } = useSidebar();
  const navigate = useNavigate();
  React.useEffect(() => { Object.assign(window, { toolbarNavigate: navigate }); }, [navigate]);
  return <>
    <nav aria-label="Prueba local" className="flex gap-4 p-2">
      <Link to="/programa/project">Proyecto inicial</Link>
      <Link to="/programa/other">Otro proyecto</Link>
      <span data-testid="sidebar-state">{open ? "abierto" : "cerrado"}</span>
    </nav>
    <main data-viewer-readonly={new URLSearchParams(location.search).has("viewer") ? "true" : undefined}>
      <Routes><Route path="/programa/:proyectoId" element={<ProgramaObra />} /></Routes>
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><MemoryRouter initialEntries={["/programa/project"]}>
    <SidebarProvider defaultOpen className="block"><Fixture /></SidebarProvider>
  </MemoryRouter></React.StrictMode>,
);
