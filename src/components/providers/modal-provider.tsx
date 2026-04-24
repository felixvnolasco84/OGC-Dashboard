"use client";

import { useEffect, useState } from "react";
import SeeTransactionsDetailsModal from "../modals/see-transactions-details-modal";
import AddPaymentModal from "../modals/add-payment-modal";
import EditPaymentModal from "../modals/edit-payment-modal";
import AggregatedDetailsModal from "../modals/aggregated-details-modal";
import AddPartidaModal from "../modals/add-partida-modal";
import UploadTransactionsModal from "../modals/upload-transactions-modal";
import TransactionDetailsModal from "../modals/transaction-details-modal";
import TransactionConceptosModal from "../modals/transaction-conceptos-modal";
import TransactionDocumentosModal from "../modals/transaction-documentos-modal";
import UploadDocumentsModal from "../modals/upload-documents-modal";
import UploadProyectoDocumentsModal from "../modals/upload-proyecto-documents-modal";
import UploadProjectTransactionsModal from "../modals/upload-project-transactions-modal";
import AddProyectoModal from "../modals/add-proyecto-modal";
import EditProyectoModal from "../modals/edit-proyecto-modal";
import UploadProjectionsModal from "../modals/upload-projections-modal";
import EditTransactionModal from "../modals/edit-transaction-modal";
import AddSalesProjectModal from "../modals/add-sales-project-modal";
import EditSalesProjectModal from "../modals/edit-sales-project-modal";
import UploadSalesProjectTransactionsModal from "../modals/upload-sales-project-transactions-modal";
import UploadSalesProyectoDocumentsModal from "../modals/upload-sales-proyecto-documents-modal";
import SaleTransactionDetailsModal from "../modals/sale-transaction-details-modal";
import SaleTransactionConceptosModal from "../modals/sale-transaction-conceptos-modal";
import SaleTransactionDocumentosModal from "../modals/sale-transaction-documentos-modal";
import SeeSalesTransactionsDetailsModal from "../modals/see-sales-transactions-details-modal";
import AddSalePaymentModal from "../modals/add-sale-payment-modal";
import BitacoraModal from "../Bitacora/BitacoraModal";
import ModalErrorBoundary from "../ui/ModalErrorBoundary";
import { useBitacoraModal } from "@/hooks/use-bitacora-modal";

export const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);
  const closeBitacoraModal = useBitacoraModal((state) => state.onClose);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <>
    <SeeTransactionsDetailsModal />
    <SeeSalesTransactionsDetailsModal />
    <AddPaymentModal />
    <AddSalePaymentModal />
    <EditPaymentModal />
    <AggregatedDetailsModal />
    <AddPartidaModal />
    <UploadTransactionsModal />
    <TransactionDetailsModal />
    <SaleTransactionDetailsModal />
    <SaleTransactionConceptosModal />
    <SaleTransactionDocumentosModal />
    <TransactionConceptosModal />
    <TransactionDocumentosModal />
    <UploadDocumentsModal />
    <UploadProyectoDocumentsModal />
    <UploadProjectTransactionsModal />
    <AddProyectoModal />
    <EditProyectoModal />
    <UploadProjectionsModal />
    <EditTransactionModal />
    <AddSalesProjectModal />
    <EditSalesProjectModal />
    <UploadSalesProjectTransactionsModal />
    <UploadSalesProyectoDocumentsModal />
    <ModalErrorBoundary modalName="BitacoraModal" onClose={closeBitacoraModal}>
      <BitacoraModal />
    </ModalErrorBoundary>
  </>;
};
