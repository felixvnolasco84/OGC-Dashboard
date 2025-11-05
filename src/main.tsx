import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import WebsiteLayout from "./components/WebsiteLayout.tsx";
import ScrollToTop from "./components/ui/ScrollToTop.tsx";
import { HelmetProvider } from "react-helmet-async";

import { BrowserRouter, Routes, Route } from "react-router";
import Legales from "./pages/Legales.tsx";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import ControlPage from "./pages/Control/ControlPage.tsx";
import DocumentosPage from "./pages/Documentos/DocumentosPage.tsx";
import PresupuestoPage from "./pages/Presupuesto/PresupuestoPage.tsx";
import ProgramaObra from "./pages/Programa Obra/ProgramaObra.tsx";
import ProyectosTablePage from "./pages/ProyectosTable/ProyectosTablePage.tsx";
import TransaccionesTablePage from "./pages/TransaccionesTable/TransaccionesTablePage.tsx";
import ProveedoresTablePage from "./pages/ProveedoresTable/ProveedoresTablePage.tsx";
import PartidaDetails from "./pages/PartidaDetails/PartidaDetails.tsx";
import AvisoPrivacidad from "./pages/AvisoPrivacidad.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";
import AdminPage from "./pages/Admin/AdminPage.tsx";
import UserManagementPage from "./pages/UserManagement/UserManagementPage.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Get Clerk publishable key from environment
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  console.warn("Missing VITE_CLERK_PUBLISHABLE_KEY. Authentication will not work.");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY || ""}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <HelmetProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route element={<WebsiteLayout />}>
                <Route index element={<ProyectosTablePage />} />
                <Route path="/upload" element={<App />} />
                <Route path="/proyectos" element={<ProyectosTablePage />} />
                <Route path="/proyectos-tabla" element={<ProyectosTablePage />} />
                <Route path="/transacciones" element={<TransaccionesTablePage />} />
                <Route path="/proveedores" element={<ProveedoresTablePage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/documentos" element={<DocumentosPage />} />
                <Route path="/dashboard/partidas/:id" element={<PartidaDetails />} />
                <Route path="/dashboard/control" element={<ControlPage />} />
                <Route path="/dashboard/presupuesto" element={<PresupuestoPage />} />
                <Route path="/dashboard/programa-obra" element={<ProgramaObra />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/users" element={<UserManagementPage />} />
                <Route path="/legal" element={<Legales />} />
                <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </HelmetProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>
);
