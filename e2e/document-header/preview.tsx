import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import ProtectedRoute from "../../src/components/Auth/ProtectedRoute";
import DocumentosPage from "../../src/pages/Documentos/DocumentosPage";
import ProyectoDocumentosPage from "../../src/pages/ProyectoDocumentos/ProyectoDocumentosPage";
import UploadDocumentsModal from "../../src/components/modals/upload-documents-modal";
import UploadProyectoDocumentsModal from "../../src/components/modals/upload-proyecto-documents-modal";
import { useUploadDocumentsModal } from "../../src/hooks/upload-documents-modal";
import { useUploadProyectoDocumentsModal } from "../../src/hooks/upload-proyecto-documents-modal";
import { fixture, refreshEvidence, snapshot, subscribe } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Preview() {
  useSyncExternalStore(subscribe, snapshot);
  const globalUpload = useUploadDocumentsModal();
  const projectUpload = useUploadProyectoDocumentsModal();
  const viewer = new URLSearchParams(location.search).get("role") === "viewer";
  return <>
    <header className="border-b px-4 py-3 text-xs text-muted-foreground">P16 · Páginas y modales reales · Datos ficticios · Sin conexión a Convex</header>
    <div data-viewer-readonly={viewer ? "true" : undefined}>
      <Routes>
        <Route path="/e2e/document-header/preview.html" element={<ProtectedRoute requiredRole="admin"><DocumentosPage /></ProtectedRoute>} />
        <Route path="/proyecto/:proyectoId/documentos" element={<ProtectedRoute requiredRole="user"><ProyectoDocumentosPage /></ProtectedRoute>} />
      </Routes>
    </div>
    {globalUpload.isOpen && <UploadDocumentsModal />}
    {projectUpload.isOpen && <UploadProyectoDocumentsModal />}
    <aside aria-label="Evidencia de prueba P16" className="space-y-2 border-t p-4 text-xs">
      <button className="border px-3 py-2" onClick={refreshEvidence}>Actualizar evidencia</button>
      <p>Mutaciones simuladas:</p><output className="block break-all" aria-label="Mutaciones simuladas">{JSON.stringify(fixture.calls)}</output>
      <p>Consulta de documentos:</p><output className="block break-all" aria-label="Consulta simulada">{JSON.stringify(fixture.queries.filter(q => q.name === "documentos:listFileManagerDocuments").at(-1)?.args)}</output>
      <p>Destino de carga:</p><output className="block break-all" aria-label="Destino de carga">{JSON.stringify({ global: globalUpload.isOpen, proyectoId: projectUpload.proyectoId, folderId: projectUpload.folderId })}</output>
    </aside>
    <Toaster />
  </>;
}
const initialPath = new URLSearchParams(location.search).get("context") === "project"
  ? "/proyecto/obra/documentos"
  : "/e2e/document-header/preview.html";
createRoot(document.getElementById("root")!).render(<React.StrictMode><MemoryRouter initialEntries={[initialPath]}><Preview /></MemoryRouter></React.StrictMode>);
