import { useRequisicionHistoryModal } from "../../src/hooks/requisicion-history-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../src/components/ui/dialog";

export default function HistoryModalStub() {
    const modal = useRequisicionHistoryModal();
    return <Dialog open={modal.isOpen} onOpenChange={(open) => { if (!open) modal.close(); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
            <DialogHeader>
                <DialogTitle>Historial de prueba</DialogTitle>
                <DialogDescription>Modal simulado para observar el store de historial.</DialogDescription>
            </DialogHeader>
            <p data-testid="history-requisicion-id">{modal.requisicionId}</p>
            <p data-testid="history-project-id">{modal.proyectoId}</p>
            <p data-testid="history-mode">{modal.mode}</p>
        </DialogContent>
    </Dialog>;
}
