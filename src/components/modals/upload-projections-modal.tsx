import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUploadProjectionsModal } from "@/hooks/upload-projections-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectionImportForm } from "@/components/projections/ProjectionImportForm";
import { ProjectionImportHistory } from "@/components/projections/ProjectionImportHistory";

export default function UploadProjectionsModal() {
  const { isOpen, onClose, proyectoId } = useUploadProjectionsModal();
  const [busy, setBusy] = useState(false);
  const project = useQuery(api.desarrollos.getById, isOpen && proyectoId ? { id: proyectoId } : "skip");
  return <Dialog open={isOpen} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent variant="upload"><DialogHeader><DialogTitle>Subir proyecciones de gasto</DialogTitle>
      <DialogDescription>Revisa el Excel de {project?.nombre || "este proyecto"} antes de reemplazar las proyecciones vigentes.</DialogDescription></DialogHeader>
      {isOpen && proyectoId && <div className="min-w-0 space-y-4">
        <ProjectionImportHistory target={{ kind: "expense", project_id: proyectoId }} />
        <ProjectionImportForm key={proyectoId} target={{ kind: "expense", project_id: proyectoId }} format="projections" projectName={project?.nombre || "Proyecto"} onBusyChange={setBusy} />
      </div>}
    </DialogContent>
  </Dialog>;
}
