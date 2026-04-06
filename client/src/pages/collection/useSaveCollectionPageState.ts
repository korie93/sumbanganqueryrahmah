import { useCallback } from "react";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { useSaveCollectionDraftState } from "@/pages/collection/useSaveCollectionDraftState";
import { useSaveCollectionFormState } from "@/pages/collection/useSaveCollectionFormState";
import { useSaveCollectionReceiptState } from "@/pages/collection/useSaveCollectionReceiptState";
import { useSaveCollectionSubmitState } from "@/pages/collection/useSaveCollectionSubmitState";

type MutationFeedbackApi = {
  notifyMutationError: ReturnType<typeof useMutationFeedback>["notifyMutationError"];
  notifyMutationSuccess: ReturnType<typeof useMutationFeedback>["notifyMutationSuccess"];
};

type UseSaveCollectionPageStateOptions = {
  staffNickname: string;
  onSaved?: () => void;
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
  });

  const clearForm = useCallback(() => {
    submitState.resetSubmitMutationIntent();
    clearPageState();
  }, [clearPageState, submitState]);

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
    submitting: submitState.submitting,
    maxPaymentDate: formState.maxPaymentDate,
    isPaymentDateInFuture: formState.isPaymentDateInFuture,
    draftRestoreNotice: draftState.draftRestoreNotice,
    restoreNoticeLabel: draftState.restoreNoticeLabel,
    setCustomerName: formState.setCustomerName,
    setIcNumber: formState.setIcNumber,
    setCustomerPhone: formState.setCustomerPhone,
    setAccountNumber: formState.setAccountNumber,
    setBatch: formState.setBatch,
    setPaymentDate: formState.setPaymentDate,
    setAmount: formState.setAmount,
    clearForm,
    handleReceiptChange: receiptState.handleReceiptChange,
    handleRemoveReceipt: receiptState.handleRemoveReceipt,
    handleClearPendingReceipts: receiptState.clearReceiptState,
    handlePendingDraftChange: receiptState.handlePendingDraftChange,
    handleSubmit: submitState.handleSubmit,
  };
}
