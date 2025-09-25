import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import WebsiteLayout from "./components/WebsiteLayout.tsx";
import ScrollToTop from "./components/ui/ScrollToTop.tsx";
import { HelmetProvider } from "react-helmet-async";
import DynamicMeta from "./components/DynamicMeta.tsx";
import { BrowserRouter, Routes, Route } from "react-router";
import Legales from "./pages/Legales.tsx";
import AvisoPrivacidad from "./pages/AvisoPrivacidad.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";
import DashboardCostos from "./pages/DashboardCostos/DashboardCostos.tsx";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { EdgeStoreProvider } from "./lib/edgestore";
import CostoDetails from "./pages/CostoDetails/CostoDetails.tsx";
import HomePage from "./pages/HomePage/HomePage.tsx";
import DocumentosPage from "./pages/Documentos/DocumentosPage.tsx";
import PresupuestoPage from "./pages/Presupuesto/PresupuestoPage.tsx";
import ProgramaObra from "./pages/Programa Obra/ProgramaObra.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <EdgeStoreProvider basePath="https://ogc-resend-api.vercel.app/api/edgestore">
        <HelmetProvider>
          <BrowserRouter>
            <ScrollToTop />
            <DynamicMeta />
            <Routes>
              <Route element={<WebsiteLayout />}>
                <Route index element={<HomePage />} />
                <Route path="/upload" element={<App />} />
                <Route path="/proyectos" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/documentos" element={<DocumentosPage />} />
                <Route path="/dashboard/costos" element={<DashboardCostos />} />
                <Route path="/dashboard/costos/:id" element={<CostoDetails />} />
                <Route path="/dashboard/presupuesto" element={<PresupuestoPage />} />
                <Route path="/dashboard/programa-obra" element={<ProgramaObra />} />
                <Route path="/legal" element={<Legales />} />
                <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </HelmetProvider>
      </EdgeStoreProvider>
    </ConvexProvider>
  </StrictMode>
);
