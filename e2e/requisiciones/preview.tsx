import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import ProyectoRequisicionesPage from "../../src/pages/ProyectoRequisiciones/ProyectoRequisicionesPage";
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from "../../src/components/ui/Sidebar";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import "../../src/index.css";
import { Toaster } from "sonner";

createRoot(document.getElementById("root")!).render(
    <React.StrictMode><MemoryRouter initialEntries={["/proyecto/project/requisiciones"]}>
        <TooltipProvider><SidebarProvider defaultOpen className="bg-card overflow-x-hidden">
            <Sidebar><SidebarContent><span className="p-4">Proyecto de prueba</span></SidebarContent></Sidebar>
            <main data-dashboard-scroll="true" className="h-svh min-w-0 flex-1 overflow-auto overscroll-contain">
                <div className="sticky top-0 z-10 flex h-10 items-center border-b bg-card px-2"><SidebarTrigger /></div>
                <Routes><Route path="/proyecto/:proyectoId/requisiciones" element={<ProyectoRequisicionesPage />} /></Routes>
            </main>
        </SidebarProvider><Toaster /></TooltipProvider>
    </MemoryRouter></React.StrictMode>,
);
