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
import ProyectoTransaccionesTablePage from "./pages/ProyectoTransaccionesTable/ProyectoTransaccionesTablePage.tsx";
import ProyectoProveedoresTablePage from "./pages/ProyectoProveedoresTable/ProyectoProveedoresTablePage.tsx";
import ProyectoDocumentosPage from "./pages/ProyectoDocumentos/ProyectoDocumentosPage.tsx";
import PartidaDetails from "./pages/PartidaDetails/PartidaDetails.tsx";
import AvisoPrivacidad from "./pages/AvisoPrivacidad.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";
import AdminPage from "./pages/Admin/AdminPage.tsx";
import UserManagementPage from "./pages/UserManagement/UserManagementPage.tsx";
import ProtectedRoute from "./components/Auth/ProtectedRoute.tsx";

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
                <Route index element={<ProtectedRoute requiredRole="admin">
                  <ProyectosTablePage />
                </ProtectedRoute>} />
                <Route path="/proyectos" element={
                  <ProtectedRoute requiredRole="admin">
                    <ProyectosTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/transacciones" element={
                  <ProtectedRoute requiredRole="admin">
                    <TransaccionesTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/proveedores" element={
                  <ProtectedRoute requiredRole="admin">
                    <ProveedoresTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/documentos" element={
                  <ProtectedRoute requiredRole="admin">
                    <DocumentosPage />
                  </ProtectedRoute>
                } />

                {/* Project-specific routes */}
                <Route path="/proyecto/:proyectoId/presupuesto" element={<PresupuestoPage />} />
                <Route path="/proyecto/:proyectoId/control" element={<ControlPage />} />
                <Route path="/proyecto/:proyectoId/programa" element={<ProgramaObra />} />
                <Route path="/proyecto/:proyectoId/documentos" element={<ProyectoDocumentosPage />} />
                <Route path="/proyecto/:proyectoId/transacciones" element={<ProyectoTransaccionesTablePage />} />
                <Route path="/proyecto/:proyectoId/proveedores" element={<ProyectoProveedoresTablePage />} />
                <Route path="/proyecto/:proyectoId/partidas/:id" element={<PartidaDetails />} />

                {/* Admin routes */}
                <Route path="/admin" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminPage />
                  </ProtectedRoute>
                } />
                <Route path="/usuarios" element={
                  <ProtectedRoute requiredRole="admin">
                    <UserManagementPage />
                  </ProtectedRoute>
                } />

                {/* Legacy routes - kept for backward compatibility */}
                <Route path="/upload" element={<App />} />
                <Route path="/dashboard" element={<Dashboard />} />
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
