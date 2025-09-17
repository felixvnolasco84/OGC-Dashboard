"use client";

import { useEffect, useState } from "react";
import SeePaymentDetailsModal from "../modals/see-payment-details-modal";
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
    {/* <EditCostModal /> */}
  </>;
};
