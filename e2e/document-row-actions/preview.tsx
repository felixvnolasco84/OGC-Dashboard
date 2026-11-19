import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import DocumentosPage from "../../src/pages/Documentos/DocumentosPage";
import { fixture, snapshot, subscribe } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Preview() {
  useSyncExternalStore(subscribe, snapshot);
  return <>
    <header className="border-b px-6 py-3 text-xs text-muted-foreground">P17 · Implementación real con datos ficticios · Sin conexión a Convex</header>
    <DocumentosPage />
    <aside aria-label="Controles de prueba P17" className="space-y-3 border-t p-6 text-sm">
      <nav className="flex flex-wrap gap-4">
        <a href="?state=ready">Escenario con registros</a>
        <a href="?state=empty">Escenario vacío</a>
        <a href="?state=loading">Escenario de carga</a>
        <a href="?state=ready&fail=1">Escenario con error simulado</a>
      </nav>
      <button className="border px-3 py-2" onClick={() => fixture.resetCalls()}>Limpiar llamadas simuladas</button>
      <p>Mutaciones simuladas (no modifican registros):</p>
      <output aria-label="Mutaciones simuladas" className="block whitespace-pre-wrap break-all">{JSON.stringify(fixture.calls, null, 2)}</output>
      <p>Última consulta de documentos:</p>
      <output aria-label="Consulta simulada" className="block whitespace-pre-wrap break-all">{JSON.stringify(fixture.queries.filter((query) => query.name === "documentos:listFileManagerDocuments").at(-1)?.args)}</output>
    </aside>
    <Toaster />
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview /></React.StrictMode>);
