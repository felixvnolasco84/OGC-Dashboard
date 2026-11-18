import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import PresupuestoPage from "@/pages/Presupuesto/PresupuestoPage";
import { BudgetOriginalDialog } from "@/components/Presupuesto/BudgetOriginal";
import "@/index.css";
import "@/responsive.css";

const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  <div data-viewer-readonly={params.get("role") === "viewer" ? "true" : undefined}>
    <p className="border-b p-2 text-xs">Verificación aislada · componente real · datos locales ficticios · sin conexión al backend</p>
    {params.has("legacy") ? <BudgetOriginalDialog /> : <MemoryRouter initialEntries={["/proyecto/project/presupuesto"]}>
      <Routes><Route path="/proyecto/:proyectoId/presupuesto" element={<PresupuestoPage />} /></Routes>
    </MemoryRouter>}
  </div>
);
