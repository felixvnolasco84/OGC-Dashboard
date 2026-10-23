"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { lazyWithPreload } from "@/lib/background-preload";
import { useSeePaymentDetailsModal as useSeeTransactionsDetailsModalOpen } from "@/hooks/see-transactions-details";
import { useAddPaymentModal as useAddPaymentModalOpen } from "@/hooks/add-payment-modal";
import { useEditPaymentModal as useEditPaymentModalOpen } from "@/hooks/edit-payment-modal";
import { useAggregatedDetailsModal as useAggregatedDetailsModalOpen } from "@/hooks/aggregated-details-modal";
import { useAddPartidaModal as useAddPartidaModalOpen } from "@/hooks/add-partida-modal";
import { useUploadTransactionsModal as useUploadTransactionsModalOpen } from "@/hooks/upload-transactions-modal";
import { useTransactionDetailsModal as useTransactionDetailsModalOpen } from "@/hooks/transaction-details-modal";
import { useTransactionConceptosModal as useTransactionConceptosModalOpen } from "@/hooks/transaction-conceptos-modal";
import { useTransactionDocumentosModal as useTransactionDocumentosModalOpen } from "@/hooks/transaction-documentos-modal";
import { useUploadDocumentsModal as useUploadDocumentsModalOpen } from "@/hooks/upload-documents-modal";
import { useUploadProyectoDocumentsModal as useUploadProyectoDocumentsModalOpen } from "@/hooks/upload-proyecto-documents-modal";
import { useUploadProjectTransactionsModal as useUploadProjectTransactionsModalOpen } from "@/hooks/upload-project-transactions-modal";
import { useAddProyectoModal as useAddProyectoModalOpen } from "@/hooks/add-proyecto-modal";
import { useEditProyectoModal as useEditProyectoModalOpen } from "@/hooks/edit-proyecto-modal";
import { useUploadProjectionsModal as useUploadProjectionsModalOpen } from "@/hooks/upload-projections-modal";
import { useEditTransactionModal as useEditTransactionModalOpen } from "@/hooks/edit-transaction-modal";
import { useAddSalesProjectModal as useAddSalesProjectModalOpen } from "@/hooks/add-sales-project-modal";
import { useEditSalesProjectModal as useEditSalesProjectModalOpen } from "@/hooks/edit-sales-project-modal";
import { useUploadSalesProjectTransactionsModal as useUploadSalesProjectTransactionsModalOpen } from "@/hooks/upload-sales-project-transactions-modal";
import { useUploadSalesProyectoDocumentsModal as useUploadSalesProyectoDocumentsModalOpen } from "@/hooks/upload-sales-proyecto-documents-modal";
import { useSaleTransactionDetailsModal as useSaleTransactionDetailsModalOpen } from "@/hooks/sale-transaction-details-modal";
import { useSaleTransactionConceptosModal as useSaleTransactionConceptosModalOpen } from "@/hooks/sale-transaction-conceptos-modal";
import { useSaleTransactionDocumentosModal as useSaleTransactionDocumentosModalOpen } from "@/hooks/sale-transaction-documentos-modal";
import { useSeeSalesPaymentDetailsModal as useSeeSalesTransactionsDetailsModalOpen } from "@/hooks/see-sales-transactions-details";
import { useAddPaymentModal as useAddSalePaymentModalOpen } from "@/hooks/add-sale-payment-modal";
import { useBitacoraModal as useBitacoraModalOpen } from "@/hooks/use-bitacora-modal";
const SeeTransactionsDetailsModal = lazyWithPreload(() => import("../modals/see-transactions-details-modal"));
const AddPaymentModal = lazyWithPreload(() => import("../modals/add-payment-modal"));
const EditPaymentModal = lazyWithPreload(() => import("../modals/edit-payment-modal"));
const AggregatedDetailsModal = lazyWithPreload(() => import("../modals/aggregated-details-modal"));
const AddPartidaModal = lazyWithPreload(() => import("../modals/add-partida-modal"));
const UploadTransactionsModal = lazyWithPreload(() => import("../modals/upload-transactions-modal"));
const TransactionDetailsModal = lazyWithPreload(() => import("../modals/transaction-details-modal"));
const TransactionConceptosModal = lazyWithPreload(() => import("../modals/transaction-conceptos-modal"));
const TransactionDocumentosModal = lazyWithPreload(() => import("../modals/transaction-documentos-modal"));
const UploadDocumentsModal = lazyWithPreload(() => import("../modals/upload-documents-modal"));
const UploadProyectoDocumentsModal = lazyWithPreload(() => import("../modals/upload-proyecto-documents-modal"));
const UploadProjectTransactionsModal = lazyWithPreload(() => import("../modals/upload-project-transactions-modal"));
const AddProyectoModal = lazyWithPreload(() => import("../modals/add-proyecto-modal"));
const EditProyectoModal = lazyWithPreload(() => import("../modals/edit-proyecto-modal"));
const UploadProjectionsModal = lazyWithPreload(() => import("../modals/upload-projections-modal"));
const EditTransactionModal = lazyWithPreload(() => import("../modals/edit-transaction-modal"));
const AddSalesProjectModal = lazyWithPreload(() => import("../modals/add-sales-project-modal"));
const EditSalesProjectModal = lazyWithPreload(() => import("../modals/edit-sales-project-modal"));
const UploadSalesProjectTransactionsModal = lazyWithPreload(() => import("../modals/upload-sales-project-transactions-modal"));
const UploadSalesProyectoDocumentsModal = lazyWithPreload(() => import("../modals/upload-sales-proyecto-documents-modal"));
const SaleTransactionDetailsModal = lazyWithPreload(() => import("../modals/sale-transaction-details-modal"));
const SaleTransactionConceptosModal = lazyWithPreload(() => import("../modals/sale-transaction-conceptos-modal"));
const SaleTransactionDocumentosModal = lazyWithPreload(() => import("../modals/sale-transaction-documentos-modal"));
const SeeSalesTransactionsDetailsModal = lazyWithPreload(() => import("../modals/see-sales-transactions-details-modal"));
const AddSalePaymentModal = lazyWithPreload(() => import("../modals/add-sale-payment-modal"));
const BitacoraModal = lazyWithPreload(() => import("../Bitacora/BitacoraModal"));
import ModalErrorBoundary from "../ui/ModalErrorBoundary";
import { useBitacoraModal } from "@/hooks/use-bitacora-modal";

function DeferredModal({ open, children }: { open: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(false);
  useEffect(() => { if (open) setVisited(true); }, [open]);
  // Once opened, retain local form state and the original close/reset effects.
  return open || visited ? <Suspense fallback={null}>{children}</Suspense> : null;
}

export const ModalProvider = ({ includeBitacora = false }: { includeBitacora?: boolean }) => {
  const SeeTransactionsDetailsModalOpen = useSeeTransactionsDetailsModalOpen(state => state.isOpen);
  const AddPaymentModalOpen = useAddPaymentModalOpen(state => state.isOpen);
  const EditPaymentModalOpen = useEditPaymentModalOpen(state => state.isOpen);
  const AggregatedDetailsModalOpen = useAggregatedDetailsModalOpen(state => state.isOpen);
  const AddPartidaModalOpen = useAddPartidaModalOpen(state => state.isOpen);
  const UploadTransactionsModalOpen = useUploadTransactionsModalOpen(state => state.isOpen);
  const TransactionDetailsModalOpen = useTransactionDetailsModalOpen(state => state.isOpen);
  const TransactionConceptosModalOpen = useTransactionConceptosModalOpen(state => state.isOpen);
  const TransactionDocumentosModalOpen = useTransactionDocumentosModalOpen(state => state.isOpen);
  const UploadDocumentsModalOpen = useUploadDocumentsModalOpen(state => state.isOpen);
  const UploadProyectoDocumentsModalOpen = useUploadProyectoDocumentsModalOpen(state => state.isOpen);
  const UploadProjectTransactionsModalOpen = useUploadProjectTransactionsModalOpen(state => state.isOpen);
  const AddProyectoModalOpen = useAddProyectoModalOpen(state => state.isOpen);
  const EditProyectoModalOpen = useEditProyectoModalOpen(state => state.isOpen);
  const UploadProjectionsModalOpen = useUploadProjectionsModalOpen(state => state.isOpen);
  const EditTransactionModalOpen = useEditTransactionModalOpen(state => state.isOpen);
  const AddSalesProjectModalOpen = useAddSalesProjectModalOpen(state => state.isOpen);
  const EditSalesProjectModalOpen = useEditSalesProjectModalOpen(state => state.isOpen);
  const UploadSalesProjectTransactionsModalOpen = useUploadSalesProjectTransactionsModalOpen(state => state.isOpen);
  const UploadSalesProyectoDocumentsModalOpen = useUploadSalesProyectoDocumentsModalOpen(state => state.isOpen);
  const SaleTransactionDetailsModalOpen = useSaleTransactionDetailsModalOpen(state => state.isOpen);
  const SaleTransactionConceptosModalOpen = useSaleTransactionConceptosModalOpen(state => state.isOpen);
  const SaleTransactionDocumentosModalOpen = useSaleTransactionDocumentosModalOpen(state => state.isOpen);
  const SeeSalesTransactionsDetailsModalOpen = useSeeSalesTransactionsDetailsModalOpen(state => state.isOpen);
  const AddSalePaymentModalOpen = useAddSalePaymentModalOpen(state => state.isOpen);
  const BitacoraModalOpen = useBitacoraModalOpen(state => state.isOpen);
  const [isMounted, setIsMounted] = useState(false);
  const closeBitacoraModal = useBitacoraModal((state) => state.onClose);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <>
    <DeferredModal open={SeeTransactionsDetailsModalOpen}><SeeTransactionsDetailsModal /></DeferredModal>
    <DeferredModal open={SeeSalesTransactionsDetailsModalOpen}><SeeSalesTransactionsDetailsModal /></DeferredModal>
    <DeferredModal open={AddPaymentModalOpen}><AddPaymentModal /></DeferredModal>
    <DeferredModal open={AddSalePaymentModalOpen}><AddSalePaymentModal /></DeferredModal>
    <DeferredModal open={EditPaymentModalOpen}><EditPaymentModal /></DeferredModal>
    <DeferredModal open={AggregatedDetailsModalOpen}><AggregatedDetailsModal /></DeferredModal>
    <DeferredModal open={AddPartidaModalOpen}><AddPartidaModal /></DeferredModal>
    <DeferredModal open={UploadTransactionsModalOpen}><UploadTransactionsModal /></DeferredModal>
    <DeferredModal open={TransactionDetailsModalOpen}><TransactionDetailsModal /></DeferredModal>
    <DeferredModal open={SaleTransactionDetailsModalOpen}><SaleTransactionDetailsModal /></DeferredModal>
    <DeferredModal open={SaleTransactionConceptosModalOpen}><SaleTransactionConceptosModal /></DeferredModal>
    <DeferredModal open={SaleTransactionDocumentosModalOpen}><SaleTransactionDocumentosModal /></DeferredModal>
    <DeferredModal open={TransactionConceptosModalOpen}><TransactionConceptosModal /></DeferredModal>
    <DeferredModal open={TransactionDocumentosModalOpen}><TransactionDocumentosModal /></DeferredModal>
    <DeferredModal open={UploadDocumentsModalOpen}><UploadDocumentsModal /></DeferredModal>
    <DeferredModal open={UploadProyectoDocumentsModalOpen}><UploadProyectoDocumentsModal /></DeferredModal>
    <DeferredModal open={UploadProjectTransactionsModalOpen}><UploadProjectTransactionsModal /></DeferredModal>
    <DeferredModal open={AddProyectoModalOpen}><AddProyectoModal /></DeferredModal>
    <DeferredModal open={EditProyectoModalOpen}><EditProyectoModal /></DeferredModal>
    <DeferredModal open={UploadProjectionsModalOpen}><UploadProjectionsModal /></DeferredModal>
    <DeferredModal open={EditTransactionModalOpen}><EditTransactionModal /></DeferredModal>
    <DeferredModal open={AddSalesProjectModalOpen}><AddSalesProjectModal /></DeferredModal>
    <DeferredModal open={EditSalesProjectModalOpen}><EditSalesProjectModal /></DeferredModal>
    <DeferredModal open={UploadSalesProjectTransactionsModalOpen}><UploadSalesProjectTransactionsModal /></DeferredModal>
    <DeferredModal open={UploadSalesProyectoDocumentsModalOpen}><UploadSalesProyectoDocumentsModal /></DeferredModal>
    {includeBitacora && (
      <ModalErrorBoundary modalName="BitacoraModal" onClose={closeBitacoraModal}>
        <DeferredModal open={BitacoraModalOpen}><BitacoraModal /></DeferredModal>
      </ModalErrorBoundary>
    )}
  </>;
};
