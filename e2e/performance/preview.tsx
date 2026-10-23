import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ModalProvider } from "@/components/providers/modal-provider";
import { useUploadTransactionsModal } from "@/hooks/upload-transactions-modal";
import { warmOptionalCode } from "@/lib/background-preload";
import MentionNotificationCenter from "@/pages/Planos/MentionNotificationCenter";
import "@/App.css";
import "@/index.css";

function Fixture() {
  useEffect(warmOptionalCode, []);
  return <>
    <button onClick={() => useUploadTransactionsModal.getState().onOpen()}>Abrir importador</button>
    <MentionNotificationCenter iconOnly />
    <ModalProvider />
  </>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
