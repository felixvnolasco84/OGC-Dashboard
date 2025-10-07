"use client";

import { useEffect, useState } from "react";
import SeePaymentDetailsModal from "../modals/see-payment-details-modal";
import AddPaymentModal from "../modals/add-payment-modal";
import EditPaymentModal from "../modals/edit-payment-modal";
import AddProjectModal from "../modals/add-project-modal";
import AggregatedDetailsModal from "../modals/aggregated-details-modal";
import AddPartidaModal from "../modals/add-partida-modal";

// import { EditCostModal } from "@/components/modals/edit-costos-modal";


export const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <>
    <SeePaymentDetailsModal />
    <AddPaymentModal />
    <EditPaymentModal />
    <AddProjectModal />
    <AggregatedDetailsModal />
    <AddPartidaModal />
  </>;
};
