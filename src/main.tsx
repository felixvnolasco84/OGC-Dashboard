import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import WebsiteLayout from "./components/WebsiteLayout.tsx";
import ScrollToTop from "./components/ui/ScrollToTop.tsx";
import { HelmetProvider } from "react-helmet-async";

import { BrowserRouter, Routes, Route } from "react-router";
import Legales from "./pages/Legales.tsx";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import HomePage from "./pages/HomePage/HomePage.tsx";
import DocumentosPage from "./pages/Documentos/DocumentosPage.tsx";
import PresupuestoPage from "./pages/Presupuesto/PresupuestoPage.tsx";
import ProgramaObra from "./pages/Programa Obra/ProgramaObra.tsx";
import ProjectsPage from "./pages/Projects/ProjectsPage.tsx";
import ProyectosTablePage from "./pages/ProyectosTable/ProyectosTablePage.tsx";
import PagosTablePage from "./pages/PagosTable/PagosTablePage.tsx";
import ProveedoresTablePage from "./pages/ProveedoresTable/ProveedoresTablePage.tsx";
import PartidaDetails from "./pages/PartidaDetails/PartidaDetails.tsx";
import AvisoPrivacidad from "./pages/AvisoPrivacidad.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>

      <HelmetProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<WebsiteLayout />}>
              <Route index element={<ProyectosTablePage />} />
              <Route path="/upload" element={<App />} />
              <Route path="/proyectos" element={<ProjectsPage />} />
              <Route path="/proyectos-tabla" element={<ProyectosTablePage />} />
              <Route path="/pagos" element={<PagosTablePage />} />
              <Route path="/proveedores" element={<ProveedoresTablePage />} />
              <Route path="/dashboard" element={<Dashboard />} /> 
              <Route path="/dashboard/documentos" element={<DocumentosPage />} />
              <Route path="/dashboard/partidas/:id" element={<PartidaDetails />} />
              <Route path="/dashboard/control" element={<HomePage />} />
              <Route path="/dashboard/presupuesto" element={<PresupuestoPage />} />
              <Route path="/dashboard/programa-obra" element={<ProgramaObra />} />
              <Route path="/legal" element={<Legales />} />
              <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </HelmetProvider>

    </ConvexProvider>
  </StrictMode>
);
