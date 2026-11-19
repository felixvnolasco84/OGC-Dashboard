import React from "react";
import { createRoot } from "react-dom/client";
import SalesDocumentosPage from "@/pages/Documentos/SalesDocumentosPage";
import { useUploadSalesDocumentsModal } from "@/hooks/upload-sales-documents-modal";
import "@/index.css";

function Fixture() {
  const { isOpen, onClose } = useUploadSalesDocumentsModal();
  return <>
    <SalesDocumentosPage />
    <aside className="border-t p-4 text-sm" aria-label="Diagnóstico del fixture">
      <p>Fixture seguro: componente real de P22 con datos ficticios; sin conexión al backend.</p>
      <output aria-label="Estado del acceso a carga">{isOpen ? "Carga solicitada" : "Carga cerrada"}</output>
      <button className="ml-4 underline" onClick={onClose}>Restablecer fixture</button>
      <p>El diagnóstico observa el store real. No representa ni sustituye un diálogo de carga.</p>
    </aside>
  </>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);
