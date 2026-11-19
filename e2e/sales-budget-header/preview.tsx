import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { Toaster } from "sonner";
import SalesPresupuestoTable from "../../src/components/Tables/SalesPresupuestoTable";
import { fixture } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Preview() {
  const navigate = useNavigate();
  Object.assign(window, { p24Fixture: { ...fixture, navigate: (id: string) => navigate(`/sales-proyecto/${id}/presupuesto`) } });
  return <>
    <div className="border-b bg-muted px-4 py-2 text-xs text-muted-foreground">P24 · Componente real · Datos ficticios · Sin conexión a Convex</div>
    <Routes><Route path="/sales-proyecto/:salesProyectoId/presupuesto" element={<SalesPresupuestoTable />} /></Routes>
    <Toaster />
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><MemoryRouter initialEntries={["/sales-proyecto/fixture-a/presupuesto"]}><Preview /></MemoryRouter></React.StrictMode>);
