import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import ProyectoRequisicionesPage from "../../src/pages/ProyectoRequisiciones/ProyectoRequisicionesPage";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { updateHeaderFixture, useHeaderFixture } from "./header-convex-stub";
import { useRequisicionHistoryModal } from "../../src/hooks/requisicion-history-modal";
import "../../src/index.css";

function Controls() {
    const scenario = useHeaderFixture();
    const navigate = useNavigate();
    const history = useRequisicionHistoryModal();
    useEffect(() => {
        const change = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail.project) navigate(`/proyecto/${detail.project}/requisiciones`);
            if (detail.role || detail.unread) updateHeaderFixture(detail);
        };
        window.addEventListener("p10-fixture-change", change);
        return () => window.removeEventListener("p10-fixture-change", change);
    }, [navigate]);
    return <fieldset aria-label="Controles de prueba" className="flex flex-wrap gap-4 border-b p-2 text-xs">
        <label>Rol simulado <select aria-label="Rol simulado" value={scenario.role} onChange={e => updateHeaderFixture({ role: e.target.value })}>
            {["admin", "finance", "user", "contratista", "almacenista"].map(role => <option key={role}>{role}</option>)}
        </select></label>
        <label>Avisos simulados <select aria-label="Avisos simulados" value={scenario.unread} onChange={e => updateHeaderFixture({ unread: e.target.value })}>
            {["positive", "zero", "loading", "single"].map(unread => <option key={unread}>{unread}</option>)}
        </select></label>
        <button onClick={() => navigate("/proyecto/project-b/requisiciones")}>Proyecto B</button>
        <button onClick={() => navigate("/proyecto/project/requisiciones")}>Proyecto A</button>
        <output className="break-all" data-testid="history-context">{JSON.stringify({ isOpen: history.isOpen, mode: history.mode, proyectoId: history.proyectoId, requisicionId: history.requisicionId })}</output>
    </fieldset>;
}

createRoot(document.getElementById("root")!).render(
    <React.StrictMode><MemoryRouter initialEntries={["/proyecto/project/requisiciones"]}><TooltipProvider>
        <Controls />
        <main data-dashboard-scroll className="min-w-0 overflow-auto">
            <Routes><Route path="/proyecto/:proyectoId/requisiciones" element={<ProyectoRequisicionesPage />} /></Routes>
        </main>
    </TooltipProvider></MemoryRouter></React.StrictMode>,
);
