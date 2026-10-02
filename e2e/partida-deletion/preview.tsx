import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { BrowserRouter } from "react-router";
import PresupuestoTable from "@/components/Tables/PresupuestoTable";
import { DeletePartidaDialog } from "@/components/Presupuesto/DeletePartidaDialog";
import type { Doc } from "../../convex/_generated/dataModel";
import "@/index.css";

const base = { proyecto: "project", presupuesto_original: 100, presupuesto_aprobado: 120, pagado: 0, por_gastar: 120, familia: "", sub_partida: "", unidad: "m", cantidad: 1, precio_unitario: 120, archivo_origen: "test", _creationTime: 1 };
const rows = [
  { ...base, _id: "root", nivel: 1, nombre: "OBRA" },
  { ...base, _id: "family", nivel: 2, nombre: "OBRA", partida_nombre: "OBRA", familia: "ACERO" },
  { ...base, _id: "leaf", nivel: 3, nombre: "OBRA", partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA" },
] as Doc<"partidas">[];

function Fixture() {
  const [data, setData] = useState(rows);
  const [target, setTarget] = useState<Doc<"partidas"> | null>(null);
  const [filters, setFilters] = useState("OBRA, ACERO");
  useEffect(() => {
    const publish = (event: Event) => {
      const id = (event as CustomEvent).detail;
      setData(current => current.filter(p => id === "root" ? false : id === "family" ? p.nivel === 1 : p._id !== id));
    };
    window.addEventListener("deletion-publish", publish);
    return () => window.removeEventListener("deletion-publish", publish);
  }, []);
  return <main className="p-4">
    <h1>Presupuesto de prueba</h1>
    <output data-testid="remaining-records">{data.length}</output>
    <output data-testid="filters">{filters}</output>
    <PresupuestoTable data={data} status="Exhausted" showPrecioUnitario={false} loadMore={() => {}} onRequestDelete={setTarget} />
    <DeletePartidaDialog target={target} currency="MXN" onClose={() => setTarget(null)} onDeleted={removed => setFilters(removed.partidas.length ? "" : "OBRA")} />
    <Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
