import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProjectionTarget } from "../../../convex/projectionImportValidators";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectionImportForm } from "./ProjectionImportForm";
import { ProjectionImportHistory } from "./ProjectionImportHistory";

export function AdminProjectionUpload({ kind }: { kind: "expense" | "collection" }) {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const expense = useQuery(api.desarrollos.getAll, kind === "expense" ? {} : "skip");
  const collection = useQuery(api.sales_projects.getAll, kind === "collection" ? {} : "skip");
  const projects = kind === "expense" ? expense : collection;
  const project = projects?.find(item => item._id === selected);
  const target: ProjectionTarget | null = !project ? null : kind === "expense"
    ? { kind, project_id: project._id as Id<"desarrollos"> } : { kind, project_id: project._id as Id<"sales_projects"> };
  return <div className="min-h-screen bg-card px-4 py-6 sm:px-6 xl:px-12"><div className="mx-auto max-w-4xl space-y-6">
    <div><h1 className="text-2xl font-normal">Proyecciones de {kind === "expense" ? "gasto" : "cobro"}</h1><p className="mt-2 text-sm text-muted-foreground">Revisa el Excel antes de confirmar. Cada carga conservará su original y su resultado.</p></div>
    <Card><CardHeader><CardTitle className="text-lg">Seleccionar proyecto{kind === "collection" ? " de ventas" : ""}</CardTitle></CardHeader><CardContent>
      <Select value={selected || undefined} onValueChange={setSelected} disabled={busy}><SelectTrigger aria-label="Proyecto de proyecciones"><SelectValue placeholder="Selecciona un proyecto" /></SelectTrigger><SelectContent>{projects?.map(item => <SelectItem key={item._id} value={item._id}>{item.nombre}</SelectItem>)}</SelectContent></Select>
    </CardContent></Card>
    {target && project && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-lg">Cargar Excel</CardTitle><ProjectionImportHistory key={`history:${selected}`} target={target} /></div><CardDescription>{project.nombre}</CardDescription></CardHeader><CardContent>
      <ProjectionImportForm key={selected} target={target} format="flujo" projectName={project.nombre} onBusyChange={setBusy} />
    </CardContent></Card>}
  </div></div>;
}
