import { type ChangeEvent, useCallback } from "react";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { useSaveCollectionDraftState } from "@/pages/collection/useSaveCollectionDraftState";
import { useSaveCollectionFormState } from "@/pages/collection/useSaveCollectionFormState";
import type { CollectionReceiptPendingStatus } from "@/pages/collection/collection-receipt-pending-status";
import { useSaveCollectionReceiptState } from "@/pages/collection/useSaveCollectionReceiptState";
import { useSaveCollectionSubmitState } from "@/pages/collection/useSaveCollectionSubmitState";

type MutationFeedbackApi = {
  notifyMutationError: ReturnType<typeof useMutationFeedback>["notifyMutationError"];
  notifyMutationSuccess: ReturnType<typeof useMutationFeedback>["notifyMutationSuccess"];
};

type UseSaveCollectionPageStateOptions = {
  staffNickname: string;
  onSaved?: (() => void) | undefined;
  mutationFeedback: MutationFeedbackApi;
};

export function useSaveCollectionPageState({
  staffNickname,
  onSaved,
  mutationFeedback,
}: UseSaveCollectionPageStateOptions) {
  const formState = useSaveCollectionFormState({ staffNickname });
  const receiptState = useSaveCollectionReceiptState({ mutationFeedback });
  const draftState = useSaveCollectionDraftState({
    staffNickname,
    values: formState.values,
    hasPendingReceipts: receiptState.receiptFiles.length > 0,
    applyRestoredFormValues: formState.applyRestoredFormValues,
  });

  const clearPageState = useCallback(() => {
    formState.clearFormValues();
    receiptState.clearReceiptState();
    draftState.clearDraftState();
  }, [draftState, formState, receiptState]);

  const submitState = useSaveCollectionSubmitState({
    values: formState.values,
    receiptFiles: receiptState.receiptFiles,
    receiptDrafts: receiptState.receiptDrafts,
    onSaved,
    mutationFeedback,
    clearPageState,
    applyFieldErrors: formState.applyFieldErrors,
  });
  const {
    clearLastSavedSummary,
    clearSubmitFailure,
    handleSubmit,
    lastSavedSummary,
    resetSubmitMutationIntent,
    submitFailure,
    submitPhase,
    submitting,
  } = submitState;
  const {
    clearReceiptState,
    handlePendingDraftChange,
    handleReceiptChange: applyReceiptChange,
    handleRemoveReceipt: applyRemoveReceipt,
  } = receiptState;
  const receiptPendingStatus: CollectionReceiptPendingStatus =
    submitting
      ? "saving"
      : submitFailure?.kind === "request" && receiptState.receiptFiles.length > 0
        ? "failed"
        : "pending";

  const handleReceiptChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      clearSubmitFailure();
      applyReceiptChange(event);
    },
    [applyReceiptChange, clearSubmitFailure],
  );

  const handleRemoveReceipt = useCallback(
    (index: number) => {
      clearSubmitFailure();
      applyRemoveReceipt(index);
    },
    [applyRemoveReceipt, clearSubmitFailure],
  );

  const handleClearPendingReceipts = useCallback(() => {
    clearSubmitFailure();
    clearReceiptState();
  }, [clearReceiptState, clearSubmitFailure]);

  const clearForm = useCallback(() => {
    clearLastSavedSummary();
    clearSubmitFailure();
    resetSubmitMutationIntent();
    clearPageState();
  }, [clearLastSavedSummary, clearPageState, clearSubmitFailure, resetSubmitMutationIntent]);

  return {
    fileInputRef: receiptState.fileInputRef,
    customerName: formState.customerName,
    icNumber: formState.icNumber,
    customerPhone: formState.customerPhone,
    accountNumber: formState.accountNumber,
    batch: formState.batch,
    paymentDate: formState.paymentDate,
    amount: formState.amount,
    receiptFiles: receiptState.receiptFiles,
    receiptDrafts: receiptState.receiptDrafts,
    submitting,
    submitFailure,
    submitPhase,
    receiptPendingStatus,
    lastSavedSummary,
    maxPaymentDate: formState.maxPaymentDate,
    isPaymentDateInFuture: formState.isPaymentDateInFuture,
    fieldErrors: formState.fieldErrors,
    draftRestoreNotice: draftState.draftRestoreNotice,
    restoreNoticeLabel: draftState.restoreNoticeLabel,
    setCustomerName: formState.setCustomerName,
    setIcNumber: formState.setIcNumber,
    setCustomerPhone: formState.setCustomerPhone,
    setAccountNumber: formState.setAccountNumber,
    setBatch: formState.setBatch,
    setPaymentDate: formState.setPaymentDate,
    setAmount: formState.setAmount,
    validateField: formState.validateField,
    clearForm,
    clearLastSavedSummary,
    clearSubmitFailure: submitState.clearSubmitFailure,
    handleReceiptChange,
    handleRemoveReceipt,
    handleClearPendingReceipts,
    handlePendingDraftChange,
    handleSubmit,
  };
}
