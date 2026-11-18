import { createRoot } from "react-dom/client";
import { HashRouter, Link, Route, Routes } from "react-router";
import { useEffect, useReducer } from "react";
import { Toaster } from "sonner";
import Page from "@/pages/ProyectoTransaccionesTable/ProyectoTransaccionesTablePage";
import { useAddPaymentModal } from "@/hooks/add-payment-modal";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
import { role, useVerification } from "./convex-stub";
import "@/index.css";

function Preview() {
  const verification = useVerification();
  const payment = useAddPaymentModal();
  const upload = useUploadProjectTransactionsModal();
  // Repaint the read-only query log after queries were rendered by the actual page.
  const [, repaint] = useReducer(value => value + 1, 0);
  useEffect(() => { const id = setInterval(repaint, 500); return () => clearInterval(id); }, []);
  return <>
    <aside className="border-b bg-muted p-3 text-xs" data-viewer-readonly-allow="true">
      <p>Verificación P06 · sin backend · rol {role}. La ruta protegida de producción permanece sin cambios.</p>
      <nav className="flex gap-4 py-2"><Link to="/proyecto/project-a/transacciones">Obra A</Link><Link to="/proyecto/project-b/transacciones">Obra B</Link></nav>
      <button onClick={verification.finishSync}>Completar sincronización ficticia</button>
      <output aria-label="Contexto de creación">Pago: {payment.paymentContext?.projectId || "cerrado"}; Excel: {upload.proyectoId || "cerrado"}</output>
      <details><summary>Registro de consultas y escrituras</summary><pre aria-label="Registro de verificación" className="whitespace-pre-wrap">{JSON.stringify({queries:verification.queries,mutations:verification.mutations},null,2)}</pre></details>
    </aside>
    <div data-viewer-readonly={role === "viewer" ? "true" : undefined}>
      <Routes><Route path="/proyecto/:proyectoId/transacciones" element={<Page />} /></Routes>
    </div>
    <Toaster />
  </>;
}
// Hash routing keeps this fixture on its own Vite entry and never reaches production URLs.
createRoot(document.getElementById("root")!).render(<HashRouter><Preview /></HashRouter>);
