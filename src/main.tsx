import { StrictMode, Suspense } from "react";
import { lazyWithPreload } from "./lib/background-preload";
import { createRoot } from "react-dom/client";
import "./App.css";
import "./index.css";
import "./responsive.css";
import WebsiteLayout from "./components/WebsiteLayout.tsx";
import ScrollToTop from "./components/ui/ScrollToTop.tsx";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter, Routes, Route } from "react-router";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import ProtectedRoute from "./components/Auth/ProtectedRoute.tsx";
import RoleHomePage from "./components/Auth/RoleHomePage.tsx";
import { inspectOfflinePreparation } from "./lib/bitacora-offline/db.ts";
import { OfflineAccessBlocked, OfflineBitacoraApp } from "./pages/Bitacora/lazy-offline-app";
import PwaUpdatePrompt from "./components/pwa/PwaUpdatePrompt.tsx";
import BitacoraOnlineStartup from "./components/Bitacora/BitacoraOnlineStartup.tsx";

const App = lazyWithPreload(() => import("./App.tsx"));
const Legales = lazyWithPreload(() => import("./pages/Legales.tsx"));
const ControlPage = lazyWithPreload(() => import("./pages/Control/ControlPage.tsx"));
const DocumentosPage = lazyWithPreload(() => import("./pages/Documentos/DocumentosPage.tsx"));
const PresupuestoPage = lazyWithPreload(() => import("./pages/Presupuesto/PresupuestoPage.tsx"));
const ProgramaObra = lazyWithPreload(() => import("./pages/Programa Obra/ProgramaObra.tsx"));
const ProyectosTablePage = lazyWithPreload(() => import("./pages/ProyectosTable/ProyectosTablePage.tsx"));
const TransaccionesTablePage = lazyWithPreload(() => import("./pages/TransaccionesTable/TransaccionesTablePage.tsx"));
const ProveedoresTablePage = lazyWithPreload(() => import("./pages/ProveedoresTable/ProveedoresTablePage.tsx"));
const ProyectoTransaccionesTablePage = lazyWithPreload(() => import("./pages/ProyectoTransaccionesTable/ProyectoTransaccionesTablePage.tsx"));
const ProyectoProveedoresTablePage = lazyWithPreload(() => import("./pages/ProyectoProveedoresTable/ProyectoProveedoresTablePage.tsx"));
const ProyectoDocumentosPage = lazyWithPreload(() => import("./pages/ProyectoDocumentos/ProyectoDocumentosPage.tsx"));
const PartidaDetails = lazyWithPreload(() => import("./pages/PartidaDetails/PartidaDetails.tsx"));
const AvisoPrivacidad = lazyWithPreload(() => import("./pages/AvisoPrivacidad.tsx"));
const Dashboard = lazyWithPreload(() => import("./pages/Dashboard/Dashboard.tsx"));
const AdminPage = lazyWithPreload(() => import("./pages/Admin/AdminPage.tsx"));
const AdminFlujoPage = lazyWithPreload(() => import("./pages/AdminFlujo/AdminFlujoPage.tsx"));
const AdminSalesFlujoPage = lazyWithPreload(() => import("./pages/AdminSalesFlujo/AdminSalesFlujoPage.tsx"));
const ProyectoFlujoPage = lazyWithPreload(() => import("./pages/ProyectoFlujo/ProyectoFlujoPage.tsx"));
const UserManagementPage = lazyWithPreload(() => import("./pages/UserManagement/UserManagementPage.tsx"));
const NewUserPage = lazyWithPreload(() => import("./pages/UserManagement/NewUserPage.tsx"));
const ReportesPage = lazyWithPreload(() => import("./pages/Reportes/ReportesPage.tsx"));
const SalesProyectosTablePage = lazyWithPreload(() => import("./pages/SalesProyectosTable/SalesProyectosTablePage.tsx"));
const SalesProyectoDocumentosPage = lazyWithPreload(() => import("./pages/SalesProyectoDocumentos/SalesProyectoDocumentosPage.tsx"));
const SalesProyectoTransaccionesPage = lazyWithPreload(() => import("./pages/SalesProyectoTransacciones/SalesProyectoTransaccionesPage.tsx"));
const SalesProyectoFlujoPage = lazyWithPreload(() => import("./pages/SalesProyectoFlujo/SalesProyectoFlujoPage.tsx"));
const SalesPresupuestoTable = lazyWithPreload(() => import("./components/Tables/SalesPresupuestoTable.tsx"));
const ControlSalePage = lazyWithPreload(() => import("./pages/Control/ControlSalePage.tsx"));
const SalesTransaccionesTablePage = lazyWithPreload(() => import("./pages/TransaccionesTable/SalesTransaccionesTablePage.tsx"));
const SalesDocumentosPage = lazyWithPreload(() => import("./pages/Documentos/SalesDocumentosPage.tsx"));
const SignInPage = lazyWithPreload(() => import("./pages/SignIn/SignInPage.tsx"));
const SignUpPage = lazyWithPreload(() => import("./pages/SignUp/SignUpPage.tsx"));
const AcceptInvitationPage = lazyWithPreload(() => import("./pages/AcceptInvitation/AcceptInvitationPage.tsx"));
const SalesProjectManagementPage = lazyWithPreload(() => import("./pages/SalesProjectManagement/SalesProjectManagementPage.tsx"));
const SalesUserManagementPage = lazyWithPreload(() => import("./pages/SalesUserManagement/SalesUserManagementPage.tsx"));
const BitacoraPage = lazyWithPreload(() => import("./pages/Bitacora/BitacoraPage.tsx"));
const ProyectoRequisicionesPage = lazyWithPreload(() => import("./pages/ProyectoRequisiciones/ProyectoRequisicionesPage.tsx"));
const AutorizacionesObraPage = lazyWithPreload(() => import("./pages/AutorizacionesObra/AutorizacionesObraPage.tsx"));
const TareasPage = lazyWithPreload(() => import("./pages/Tareas/TareasPage.tsx"));
const ProyectoTareasPage = lazyWithPreload(() => import("./pages/Tareas/ProyectoTareasPage.tsx"));
const PlanosPage = lazyWithPreload(() => import("./pages/Planos/PlanosPage.tsx"));
const RFIListPage = lazyWithPreload(() => import("./pages/RFIs/RFIListPage.tsx"));
const RFINewPage = lazyWithPreload(() => import("./pages/RFIs/RFINewPage.tsx"));
const RFIDetailPage = lazyWithPreload(() => import("./pages/RFIs/RFIDetailPage.tsx"));
const ProfitAndLossPage = lazyWithPreload(() => import("./pages/ProfitAndLoss/ProfitAndLossPage.tsx"));

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Get Clerk publishable key from environment
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const BITACORA_OFFLINE_ENABLED = import.meta.env.VITE_BITACORA_OFFLINE_ENABLED !== "false";

if (!CLERK_PUBLISHABLE_KEY) {
  console.warn("Missing VITE_CLERK_PUBLISHABLE_KEY. Authentication will not work.");
}

const root = createRoot(document.getElementById("root")!);
const initialBitacoraRoute = BITACORA_OFFLINE_ENABLED ? window.location.pathname.match(/^\/proyecto\/([^/]+)\/bitacora\/?$/) : null;

const onlineApplication = (
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY || ""}>
      <BitacoraOnlineStartup client={convex} projectId={initialBitacoraRoute ? decodeURIComponent(initialBitacoraRoute[1]) : undefined} routePath={initialBitacoraRoute ? `/proyecto/${initialBitacoraRoute[1]}/bitacora` : undefined}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <HelmetProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-card text-muted-foreground">Cargando...</div>}>
            <Routes>
              {/* Public Authentication Routes - No Sidebar */}
              <Route path="/sign-in/*" element={<SignInPage />} />
              <Route path="/sign-up/*" element={<SignUpPage />} />
              <Route path="/accept-invitation/*" element={<AcceptInvitationPage />} />
              
              {/* Protected Routes with Sidebar */}
              <Route element={<WebsiteLayout />}>
                <Route index element={<ProtectedRoute requiredRole="admin" allowedRoles={["almacenista"]}>
                  <RoleHomePage />
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
                <Route path="/pnl" element={
                  <ProtectedRoute requiredRole="admin">
                    <ProfitAndLossPage />
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
                <Route path="/proyecto/:proyectoId/reportes" element={
                  <ProtectedRoute requiredRole="admin">
                    <ReportesPage />
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
                <Route path="/proyecto/:proyectoId/planos/:planoId" element={
                  <ProtectedRoute requiredRole="contratista">
                    <PlanosPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/planos" element={
                  <ProtectedRoute requiredRole="contratista">
                    <PlanosPage />
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
                  <ProtectedRoute requiredRole="contratista" allowedRoles={["almacenista"]}>
                    <ProyectoRequisicionesPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/rfis/nueva" element={
                  <ProtectedRoute requiredRole="contratista">
                    <RFINewPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/rfis/:rfiId/editar" element={
                  <ProtectedRoute requiredRole="contratista">
                    <RFINewPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/rfis/:rfiId" element={
                  <ProtectedRoute requiredRole="contratista">
                    <RFIDetailPage />
                  </ProtectedRoute>
                } />
                <Route path="/proyecto/:proyectoId/rfis" element={
                  <ProtectedRoute requiredRole="contratista">
                    <RFIListPage />
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
            </Suspense>
          </BrowserRouter>
        </HelmetProvider>
      </ConvexProviderWithClerk>
      </BitacoraOnlineStartup>
    </ClerkProvider>
  </StrictMode>
);

async function bootstrapApplication() {
  const match = window.location.pathname.match(/^\/proyecto\/([^/]+)\/bitacora\/?$/);
  if (navigator.onLine) {
    root.render(<>{onlineApplication}<PwaUpdatePrompt /></>);
    return;
  }

  if (!match || !BITACORA_OFFLINE_ENABLED) {
    root.render(<StrictMode><Suspense fallback={null}><OfflineAccessBlocked /><PwaUpdatePrompt /></Suspense></StrictMode>);
    return;
  }

  const projectId = decodeURIComponent(match[1]);
  const { profile, reason } = await inspectOfflinePreparation(projectId);
  if (!profile) {
    root.render(<StrictMode><Suspense fallback={null}><OfflineAccessBlocked reason={reason} /><PwaUpdatePrompt /></Suspense></StrictMode>);
    return;
  }

  root.render(<StrictMode><Suspense fallback={null}><OfflineBitacoraApp projectId={projectId} profile={profile} client={convex} /><PwaUpdatePrompt /></Suspense></StrictMode>);
}

void bootstrapApplication();
