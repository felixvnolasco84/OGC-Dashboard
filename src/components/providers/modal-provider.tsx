"use client";

import { useEffect, useState } from "react";
import SeeTransactionsDetailsModal from "../modals/see-transactions-details-modal";
import AddPaymentModal from "../modals/add-payment-modal";
import EditPaymentModal from "../modals/edit-payment-modal";
import EditTransactionModal from "../modals/edit-transaction-modal";
import AddProjectModal from "../modals/add-project-modal";
import AggregatedDetailsModal from "../modals/aggregated-details-modal";
import AddPartidaModal from "../modals/add-partida-modal";
import UploadTransactionsModal from "../modals/upload-transactions-modal";

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
    <EditTransactionModal />
    <AddProjectModal />
    <AggregatedDetailsModal />
    <AddPartidaModal />
    <UploadTransactionsModal />
  </>;
};
