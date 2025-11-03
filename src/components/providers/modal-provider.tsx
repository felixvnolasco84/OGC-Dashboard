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
  </>;
};
