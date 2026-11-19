import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import TareasPage, { TareasBoard } from "../../src/pages/Tareas/TareasPage";
import ProyectoTareasPage from "../../src/pages/Tareas/ProyectoTareasPage";
import "../../src/index.css";
import "../../src/responsive.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <header className="border-b px-4 py-2 text-xs text-muted-foreground">P26 · Componente real · Datos ficticios · Sin conexión a Convex</header>
      <Routes>
        <Route path="/proyecto/:proyectoId/tareas" element={<ProyectoTareasPage />} />
        <Route path="/board-scoped" element={<TareasBoard proyectoId="obra" />} />
        <Route path="*" element={<TareasPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
