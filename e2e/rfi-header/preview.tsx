import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import type { Id } from "../../convex/_generated/dataModel";
import RFIDetailPage from "../../src/pages/RFIs/RFIDetailPage";
import RFIListPage from "../../src/pages/RFIs/RFIListPage";
import { Button } from "../../src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../src/components/ui/sheet";
import { fixtureState, fixtureChange, restoreFixture, subscribeFixture, fixtureRevokeEdit, fixtureSnapshot } from "./convex-stub";
import "../../src/index.css";
import "../../src/responsive.css";

function Controls() {
  subscribeFixture();
  const location = useLocation();
  return <aside className="border-b border-border bg-background p-3 text-xs text-muted-foreground">
    <p>P13 · Datos simulados, sin conexión al servidor · {location.pathname}</p>
    <details><summary>Controles de prueba</summary><div className="flex flex-wrap gap-3 py-2">
      <button onClick={fixtureChange}>Simular cambio concurrente</button>
      <button onClick={() => setTimeout(fixtureChange, 10000)}>Programar cambio concurrente</button>
      <button onClick={restoreFixture}>Desactivar error simulado</button>
      <button onClick={fixtureRevokeEdit}>Revocar edición</button>
    </div></details>
    <output data-testid="rfi-calls" className="block">Operaciones: {fixtureState.calls.join(", ") || "ninguna"}</output>
    <details><summary>Solicitudes registradas</summary><output data-testid="rfi-requests" className="block break-all">{JSON.stringify(fixtureState.requests)}</output></details>
    <details><summary>Snapshot actual</summary><output data-testid="rfi-snapshot" className="block break-all">{fixtureSnapshot()}</output></details>
  </aside>;
}
function EmbeddedDetail() {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  return <main className="p-8"><h1>Contenedor embedded de prueba</h1><Button onClick={() => setOpen(true)}>Mostrar detalle</Button>
    <Sheet open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <SheetContent className="w-full bg-card p-0 sm:max-w-[632px]" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <SheetHeader className="sr-only"><SheetTitle>Detalle de RFI</SheetTitle><SheetDescription>Fixture de integración del detalle embedded.</SheetDescription></SheetHeader>
        {editing ? <div className="p-8"><h1 tabIndex={-1} ref={(node) => node?.focus()}>Editor embedded recibido</h1><Button onClick={() => setEditing(false)}>Volver al detalle</Button></div> : <RFIDetailPage embedded projectIdOverride={"project" as Id<"desarrollos">} rfiIdOverride={"rfi" as Id<"rfis">} onBusyChange={setBusy} onEdit={() => setEditing(true)} onDeleted={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  </main>;
}
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={["/proyecto/project/rfis/rfi"]}><Controls /><Routes>
  <Route path="/proyecto/:proyectoId/rfis/:rfiId" element={params.has("embedded") ? <EmbeddedDetail /> : params.has("list") ? <RFIListPage /> : <RFIDetailPage />} />
  <Route path="/proyecto/:proyectoId/rfis/:rfiId/editar" element={<h1 className="p-8">Ruta de edición recibida</h1>} />
  <Route path="/proyecto/:proyectoId/rfis" element={<h1 className="p-8">Registro recibido</h1>} />
</Routes><Toaster /></MemoryRouter>);
