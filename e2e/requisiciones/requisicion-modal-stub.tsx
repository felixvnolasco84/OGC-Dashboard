import { useRequisicionModal } from "../../src/hooks/nueva-requisicion-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../src/components/ui/dialog";

// Observe the real modal store without requesting requisition data from a backend.
export default function RequisicionModalStub() {
    const modal = useRequisicionModal();
    return <Dialog open={modal.isOpen} onOpenChange={(open) => { if (!open) modal.onClose(); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
            <DialogHeader>
                <DialogTitle>Requisición de prueba</DialogTitle>
                <DialogDescription>Modal simulado para comprobar el contexto de apertura.</DialogDescription>
            </DialogHeader>
            <p data-testid="modal-requisicion-id">{modal.context?.requisicionId}</p>
            <p data-testid="modal-project-id">{modal.context?.projectId}</p>
            <p data-testid="modal-mode">{modal.mode}</p>
        </DialogContent>
    </Dialog>;
}
