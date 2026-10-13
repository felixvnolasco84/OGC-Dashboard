import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import RequisicionModal from "../../src/components/modals/RequisicionModal";
import { useRequisicionModal } from "../../src/hooks/nueva-requisicion-modal";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { Toaster } from "sonner";
import "../../src/index.css";

function Preview() {
  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode") === "view" ? "view" : "create";
    useRequisicionModal.getState().onOpen({ projectId: "project", ...(mode === "view" ? { requisicionId: "req" } : {}) } as never, mode);
  }, []);
  return <TooltipProvider><RequisicionModal /><Toaster /></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
