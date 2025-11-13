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

export const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <>
    <SeeTransactionsDetailsModal />
    <AddPaymentModal />
    <EditPaymentModal />
    <AggregatedDetailsModal />
    <AddPartidaModal />
    <UploadTransactionsModal />
    <TransactionDetailsModal />
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
  </>;
};
