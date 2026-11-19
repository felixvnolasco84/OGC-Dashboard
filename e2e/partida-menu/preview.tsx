import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import { DeletePartidaDialog } from "@/components/Presupuesto/DeletePartidaDialog";
import { useSeePaymentDetailsModal } from "@/hooks/see-transactions-details";
import type { Doc } from "../../convex/_generated/dataModel";
import { readRows, recorded } from "./convex-stub";
import "@/index.css";
import "@/responsive.css";

Object.assign(window, { partidaMenuPaymentState: () => useSeePaymentDetailsModal.getState() });
const params = new URLSearchParams(location.search);
const rows = readRows().filter(row => ["root", "family", "leaf"].includes(row._id));
if (params.has("temp")) rows[2]._id = "temp-leaf" as Doc<"partidas">["_id"];
if (params.has("no-project")) rows.forEach(row => { row.proyecto = undefined; });

function Fixture() {
  const [target, setTarget] = useState<Doc<"partidas"> | null>(null);
  return <main className="space-y-4 p-4 sm:p-8" data-viewer-readonly={params.get("role") === "viewer" ? "true" : undefined}>
    <header><h1 className="text-xl font-medium">Presupuesto · Menú de partida</h1><p className="text-sm text-muted-foreground">P27 · Componentes reales con datos ficticios y sin conexión al backend.</p></header>
    <PresupuestoTable data={rows} status="Exhausted" showPrecioUnitario={false} loadMore={() => {}}
      onRequestDelete={partida => { recorded.deletes.push(partida._id); setTarget(partida); }} />
    <DeletePartidaDialog target={target} currency="MXN" onClose={() => setTarget(null)} onDeleted={() => {}} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
