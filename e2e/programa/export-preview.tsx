import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import ProgramaObra from "../../src/pages/Programa Obra/ProgramaObra";
import { SidebarProvider } from "../../src/components/ui/Sidebar";
import "../../src/index.css";

const viewer = new URLSearchParams(location.search).has("viewer");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={["/programa/project"]}>
      <SidebarProvider defaultOpen={false} className="block">
        <main data-viewer-readonly={viewer ? "true" : undefined}>
          <Routes><Route path="/programa/:proyectoId" element={<ProgramaObra />} /></Routes>
        </main>
        <Toaster />
      </SidebarProvider>
    </MemoryRouter>
  </React.StrictMode>,
);
