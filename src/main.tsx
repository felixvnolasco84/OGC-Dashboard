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
import AdminFlujoPage from "./pages/AdminFlujo/AdminFlujoPage.tsx";
import AdminSalesFlujoPage from "./pages/AdminSalesFlujo/AdminSalesFlujoPage.tsx";
import ProyectoFlujoPage from "./pages/ProyectoFlujo/ProyectoFlujoPage.tsx";
import UserManagementPage from "./pages/UserManagement/UserManagementPage.tsx";
import NewUserPage from "./pages/UserManagement/NewUserPage.tsx";
import ProtectedRoute from "./components/Auth/ProtectedRoute.tsx";
import SalesProyectosTablePage from "./pages/SalesProyectosTable/SalesProyectosTablePage.tsx";
import SalesProyectoDocumentosPage from "./pages/SalesProyectoDocumentos/SalesProyectoDocumentosPage.tsx";
import SalesProyectoTransaccionesPage from "./pages/SalesProyectoTransacciones/SalesProyectoTransaccionesPage.tsx";
import SalesProyectoFlujoPage from "./pages/SalesProyectoFlujo/SalesProyectoFlujoPage.tsx";
import SalesPresupuestoTable from "./components/Tables/SalesPresupuestoTable.tsx";
import ControlSalePage from "./pages/Control/ControlSalePage.tsx";
import SalesTransaccionesTablePage from "./pages/TransaccionesTable/SalesTransaccionesTablePage.tsx";
import SalesDocumentosPage from "./pages/Documentos/SalesDocumentosPage.tsx";
import SignInPage from "./pages/SignIn/SignInPage.tsx";
import SignUpPage from "./pages/SignUp/SignUpPage.tsx";
import AcceptInvitationPage from "./pages/AcceptInvitation/AcceptInvitationPage.tsx";
import SalesProjectManagementPage from "./pages/SalesProjectManagement/SalesProjectManagementPage.tsx";
import SalesUserManagementPage from "./pages/SalesUserManagement/SalesUserManagementPage.tsx";
import BitacoraPage from "./pages/Bitacora/BitacoraPage.tsx";
import ProyectoRequisicionesPage from "./pages/ProyectoRequisiciones/ProyectoRequisicionesPage.tsx";
import AutorizacionesObraPage from "./pages/AutorizacionesObra/AutorizacionesObraPage.tsx";
import TareasPage from "./pages/Tareas/TareasPage.tsx";
import ProyectoTareasPage from "./pages/Tareas/ProyectoTareasPage.tsx";

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
              {/* Public Authentication Routes - No Sidebar */}
              <Route path="/sign-in/*" element={<SignInPage />} />
              <Route path="/sign-up/*" element={<SignUpPage />} />
              <Route path="/accept-invitation/*" element={<AcceptInvitationPage />} />
              
              {/* Protected Routes with Sidebar */}
              <Route element={<WebsiteLayout />}>
                <Route index element={<ProtectedRoute requiredRole="admin">
                  <ProyectosTablePage />
                </ProtectedRoute>} />
                <Route path="/proyectos" element={
                  <ProtectedRoute requiredRole="admin">
                    <ProyectosTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/sales-proyectos" element={
                  <ProtectedRoute requiredRole="admin">
                    <SalesProyectosTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/transacciones" element={
                  <ProtectedRoute requiredRole="admin">
                    <TransaccionesTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/sales-transacciones" element={
                  <ProtectedRoute requiredRole="admin">
                    <SalesTransaccionesTablePage />
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
                <Route path="/sales-documentos" element={
                  <ProtectedRoute requiredRole="admin">
                    <SalesDocumentosPage />
                  </ProtectedRoute>
                } />
                <Route path="/tareas" element={
                  <ProtectedRoute requiredRole="contratista">
                    <TareasPage />
                  </ProtectedRoute>
                } />

                {/* Project-specific routes */}
                <Route path="/proyecto/:proyectoId/presupuesto" element={
                  <ProtectedRoute requiredRole="viewer">
                    <PresupuestoPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/control" element={
                  <ProtectedRoute requiredRole="viewer">
                    <ControlPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/proyecto/:proyectoId/programa" element={
                  <ProtectedRoute requiredRole="contratista">
                    <ProgramaObra />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/tareas" element={
                  <ProtectedRoute requiredRole="contratista">
                    <ProyectoTareasPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/documentos" element={
                  <ProtectedRoute requiredRole="user">
                    <ProyectoDocumentosPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/transacciones" element={
                  <ProtectedRoute requiredRole="user">
                    <ProyectoTransaccionesTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/proveedores" element={
                  <ProtectedRoute requiredRole="user">
                    <ProyectoProveedoresTablePage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/partidas/:id" element={
                  <ProtectedRoute requiredRole="user">
                    <PartidaDetails />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/flujo" element={
                  <ProtectedRoute requiredRole="user">
                    <ProyectoFlujoPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/bitacora" element={
                  <ProtectedRoute requiredRole="contratista">
                    <BitacoraPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/requisiciones" element={
                  <ProtectedRoute requiredRole="contratista">
                    <ProyectoRequisicionesPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/autorizaciones" element={
                  <ProtectedRoute requiredRole="user">
                    <AutorizacionesObraPage />
                  </ProtectedRoute>
                } />

                {/* Sales Project-specific routes */}
                <Route path="/sales-proyecto/:salesProyectoId/documentos" element={
                  <ProtectedRoute requiredRole="user">
                    <SalesProyectoDocumentosPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/sales-proyecto/:salesProyectoId/presupuesto" element={
                  <ProtectedRoute requiredRole="user">
                    <SalesPresupuestoTable />
                  </ProtectedRoute>
                } />
                <Route path="/sales-proyecto/:salesProyectoId/transacciones" element={
                  <ProtectedRoute requiredRole="user">
                    <SalesProyectoTransaccionesPage />
                  </ProtectedRoute>
                } />
                <Route path="/sales-proyecto/:salesProyectoId/control" element={
                  <ProtectedRoute requiredRole="user">
                    <ControlSalePage/>
                  </ProtectedRoute>
                } />
                <Route path="/sales-proyecto/:salesProyectoId/flujo" element={
                  <ProtectedRoute requiredRole="user">
                    <SalesProyectoFlujoPage />
                  </ProtectedRoute>
                } />

                {/* Admin routes */}
                <Route path="/admin" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/flujo" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminFlujoPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin/sales-flujo" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminSalesFlujoPage />
                  </ProtectedRoute>
                } />
                <Route path="/usuarios" element={
                  <ProtectedRoute requiredRole="admin">
                    <UserManagementPage />
                  </ProtectedRoute>
                } />
                <Route path="/usuarios/nuevo" element={
                  <ProtectedRoute requiredRole="admin">
                    <NewUserPage />
                  </ProtectedRoute>
                } />
                <Route path="/sales-gestion" element={
                  <ProtectedRoute requiredRole="admin">
                    <SalesProjectManagementPage />
                  </ProtectedRoute>
                } />
                <Route path="/sales-usuarios" element={
                  <ProtectedRoute requiredRole="admin">
                    <SalesUserManagementPage />
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
