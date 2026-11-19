import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import PresupuestoPage from "@/pages/Presupuesto/PresupuestoPage";
import "@/index.css";
import "@/responsive.css";
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  <div data-viewer-readonly={params.get("role") === "viewer" ? "true" : undefined}>
    <p className="border-b p-2 text-xs">P02 · Componente real · Datos locales ficticios · Escrituras bloqueadas · Rol {params.get("role") || "admin"}</p>
    <MemoryRouter initialEntries={["/proyecto/project/presupuesto"]}>
      <Routes><Route path="/proyecto/:proyectoId/presupuesto" element={<PresupuestoPage />} /></Routes>
    </MemoryRouter>
    <p className="break-all border-t p-2 text-xs">Consulta de fechas: <output id="date-query" aria-label="Consulta de fechas" /></p>
  </div>
);
