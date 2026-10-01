import { lazy, Suspense, useState } from "react";
const PlanCanvas = lazy(() => import("../../src/pages/Planos/PlanCanvas"));
const PartidaDetails = lazy(() => import("../../src/pages/PartidaDetails/PartidaDetails"));
const SalesTransactions = lazy(() => import("../../src/pages/TransaccionesTable/SalesTransaccionesTablePage"));
import { createRoot } from "react-dom/client";
import { MemoryRouter, Link, Route, Routes, useLocation } from "react-router";
import { SidebarProvider, Sidebar, SidebarContent, SidebarTrigger } from "@/components/ui/Sidebar";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveFields } from "@/components/ui/responsive-fields";
import { ResponsiveAside } from "@/components/ui/responsive-aside";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "../../src/index.css";
import "../../src/responsive.css";

const records = [
  { id: "obra-1", name: "Proyecto con nombre muy largo — instalaciones, estructura y acabados", amount: "$101,517,413.99", detail: "Detalle financiero completo en EUR, USD y MXN", status: "Activo" },
  { id: "obra-2", name: "Proveedor internacional con información bancaria completa", amount: "USD 43,994,322.00", detail: "Contrato y datos bancarios del segundo registro", status: "Pendiente" },
];

const noop = () => {};

function PlanPreview() {
  const [zoom, setZoom] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState("");
  return <main className="min-w-0 space-y-4 p-4">
    <h1>Plano local de prueba</h1>
    <div className="flex flex-wrap gap-2"><Button onClick={() => setZoom(zoom === 1 ? 2 : 1)}>Alternar zoom</Button><Button onClick={() => setDrawing(!drawing)}>{drawing ? "Seleccionar" : "Dibujar nube"}</Button></div>
    <div data-testid="plan-viewport" className="h-[max(16rem,calc(100dvh-20rem))] min-w-0 overflow-auto overscroll-contain border border-border">
      <Suspense fallback={<p>Cargando visor...</p>}><PlanCanvas url={new URL("./plan.svg", import.meta.url).href} mimeType="image/svg+xml" page={1} zoom={zoom} tool={drawing ? "cloud" : "select"} annotations={[]} onPageCountChange={noop} onDraft={(value) => setDraft(JSON.stringify(value))} onSelectAnnotation={() => {}} /></Suspense>
    </div>
    <output data-testid="plan-draft" className="block break-all text-xs">{draft}</output>
    <ResponsiveAside title="Anotaciones y comentarios"><div className="p-4"><p>Anotación de prueba</p><textarea aria-label="Comentario" className="w-full border border-border" /></div></ResponsiveAside>
  </main>;
}

function Preview() {
  const location = useLocation();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [wideDialog, setWideDialog] = useState(false);
  const [rowOpens, setRowOpens] = useState(0);
  const visible = records.filter((record) => record.name.toLowerCase().includes(search.toLowerCase()));
  const viewer = new URLSearchParams(window.location.search).has("viewer");
  if (new URLSearchParams(window.location.search).has("plan")) return <PlanPreview />;
  if (new URLSearchParams(window.location.search).has("sales-ledger")) return <main className="min-w-0"><Suspense fallback={<p>Cargando ventas...</p>}><SalesTransactions /></Suspense></main>;
  if (new URLSearchParams(window.location.search).has("partida")) return <main className="min-w-0"><Suspense fallback={<p>Cargando partida...</p>}><Routes><Route path="/proyecto/:proyectoId/partidas/:id" element={<PartidaDetails />} /></Routes></Suspense></main>;
  return <SidebarProvider>
    <Sidebar><SidebarContent className="p-4"><Link to="/operacion">Operación</Link></SidebarContent></Sidebar>
    <main data-testid="main" className="h-dvh min-w-0 flex-1 overflow-auto bg-card" data-viewer-readonly={viewer ? "true" : undefined}>
      <header className="flex min-h-11 items-center border-b border-border"><SidebarTrigger /><span>{location.pathname}</span></header>
      <div className="space-y-6 p-4 sm:p-6 xl:p-12">
        <div className="responsive-header"><h1 className="text-2xl">Operación de obra — datos de prueba</h1><Button onClick={() => setSheet(true)}>Crear proyecto de prueba</Button></div>
        <div className="responsive-metrics">{records.map((record) => <article key={record.id} data-testid="metric" className="border border-border p-4"><p>Presupuesto aprobado</p><p className="text-2xl tabular-nums">{record.amount}</p></article>)}</div>
        <Input aria-label="Buscar registros" value={search} onChange={(event) => setSearch(event.target.value)} />
        <p>Seleccionados: <output data-testid="selection">{selected.length}</output><output data-testid="row-opens">{rowOpens}</output></p>
        <Table mobileSummary={[0, 1, 2, 4]} className="min-w-[1100px]">
          <TableHeader><TableRow><TableHead><input type="checkbox" aria-label="Seleccionar visibles" checked={visible.length > 0 && visible.every((record) => selected.includes(record.id))} onChange={(event) => setSelected(event.target.checked ? visible.map((record) => record.id) : [])} /></TableHead><TableHead>Proyecto</TableHead><TableHead>Monto Total</TableHead><TableHead>Información completa</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>{visible.length ? visible.map((record) => <TableRow key={record.id} id={record.id} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setRowOpens((value) => value + 1); }}>
            <TableCell><input type="checkbox" aria-label={`Seleccionar ${record.id}`} checked={selected.includes(record.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...value, record.id] : value.filter((id) => id !== record.id))} /></TableCell>
            <TableCell>{record.name}</TableCell><TableCell>{record.amount}</TableCell><TableCell>{record.detail}</TableCell><TableCell>{record.status}</TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={5}>No hay registros</TableCell></TableRow>}</TableBody>
        </Table>
        <ResponsiveFields labels={["Proveedor", "Monto", "Contrato"]} summary={[0,1]} className="grid grid-cols-1 gap-4 border border-border p-4 lg:grid-cols-3"><p>Proveedor con nombre extenso</p><p>$53,360,866.40</p><a href="#contrato">Contrato completo.pdf</a></ResponsiveFields>
        <ResponsiveAside title="Anotaciones y comentarios"><div className="space-y-4 p-4"><p>Comentarios y anotaciones del plano de prueba</p><textarea aria-label="Comentario" className="w-full border border-border" /></div></ResponsiveAside>
        <Button onClick={() => { setWideDialog(false); setDialog(true); }}>Abrir diálogo de prueba</Button>
        <Button onClick={() => { setWideDialog(true); setDialog(true); }}>Abrir diálogo amplio</Button>
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}><SheetContent variant="paymentForm"><SheetHeader><SheetTitle>Crear proyecto de prueba</SheetTitle></SheetHeader><form className="mt-6 space-y-5" onSubmit={(event) => event.preventDefault()}>{Array.from({length:12},(_,index)=><label key={index} className="block">Campo {index+1}<Input aria-label={`Campo ${index+1}`} /></label>)}<SheetFooter><Button type="button" variant="outline" onClick={() => setSheet(false)}>Cancelar</Button><Button type="submit">Guardar prueba</Button></SheetFooter></form></SheetContent></Sheet>
      <Dialog open={dialog} onOpenChange={setDialog}><DialogContent variant={wideDialog ? "ledger" : "default"}><DialogTitle>Diálogo de prueba</DialogTitle><p>Contenido de prueba</p></DialogContent></Dialog>
    </main>
  </SidebarProvider>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={[new URLSearchParams(window.location.search).has("partida") ? "/proyecto/project/partidas/item" : "/"]}><Preview /></MemoryRouter>);
