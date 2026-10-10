import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { useSaveCollectionDraftState } from "@/pages/collection/useSaveCollectionDraftState";
import { useSaveCollectionFormState } from "@/pages/collection/useSaveCollectionFormState";
import type { CollectionReceiptPendingStatus } from "@/pages/collection/collection-receipt-pending-status";
import { useSaveCollectionReceiptState } from "@/pages/collection/useSaveCollectionReceiptState";
import { useSaveCollectionSubmitState } from "@/pages/collection/useSaveCollectionSubmitState";
import { useCollectionSourceMatching } from "@/pages/collection/useCollectionSourceMatching";
import {
  getSaveCollectionResetDecision,
  hasSaveCollectionResettableWork,
} from "./save-collection-reset-guard";

type MutationFeedbackApi = {
  notifyMutationError: ReturnType<typeof useMutationFeedback>["notifyMutationError"];
  notifyMutationSuccess: ReturnType<typeof useMutationFeedback>["notifyMutationSuccess"];
};

type UseSaveCollectionPageStateOptions = {
  staffNickname: string;
  onSaved?: (() => void) | undefined;
  accessSuspended?: boolean | undefined;
  onReauthenticateNickname?: (() => void) | undefined;
  onSubmittingChange?: ((submitting: boolean) => void) | undefined;
  mutationFeedback: MutationFeedbackApi;
};

export function useSaveCollectionPageState({
  staffNickname,
  onSaved,
  accessSuspended,
  onReauthenticateNickname,
  onSubmittingChange,
  mutationFeedback,
}: UseSaveCollectionPageStateOptions) {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetConfirmPendingRef = useRef(false);
  const submitActionInFlightRef = useRef(false);
  const formState = useSaveCollectionFormState({ staffNickname });
  const receiptState = useSaveCollectionReceiptState({ mutationFeedback });
  const sourceMatchState = useCollectionSourceMatching({
    customerName: formState.customerName,
    icNumber: formState.icNumber,
    customerPhone: formState.customerPhone,
    accountNumber: formState.accountNumber,
    cardNumber: formState.cardNumber,
    paymentDate: formState.paymentDate,
    amount: formState.amount,
  }, formState.applyFieldErrors);
  const draftState = useSaveCollectionDraftState({
    staffNickname,
    values: formState.values,
    hasPendingReceipts: receiptState.receiptFiles.length > 0,
    applyRestoredFormValues: formState.applyRestoredFormValues,
  });
  const clearFormValues = formState.clearFormValues;
  const clearReceiptState = receiptState.clearReceiptState;
  const resetSourceMatches = sourceMatchState.resetMatches;
  const clearDraftState = draftState.clearDraftState;

  const clearPageState = useCallback(() => {
    clearFormValues();
    clearReceiptState();
    resetSourceMatches();
    clearDraftState();
  }, [clearDraftState, clearFormValues, clearReceiptState, resetSourceMatches]);

  const submitState = useSaveCollectionSubmitState({
    values: formState.values,
    receiptFiles: receiptState.receiptFiles,
    receiptDrafts: receiptState.receiptDrafts,
    onSaved,
    accessSuspended,
    onReauthenticateNickname,
    onSubmittingChange,
    mutationFeedback,
    clearPageState,
    applyFieldErrors: formState.applyFieldErrors,
  });
  const {
    clearLastSavedSummary,
    clearSubmitFailure,
    handleSubmit: submitCollection,
    lastSavedSummary,
    resetSubmitMutationIntent,
    submitFailure,
    submitPhase,
    submitting,
  } = submitState;
  const {
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

  const resetForm = useCallback(() => {
    clearLastSavedSummary();
    clearSubmitFailure();
    resetSubmitMutationIntent();
    clearPageState();
  }, [clearLastSavedSummary, clearPageState, clearSubmitFailure, resetSubmitMutationIntent]);

  const hasResettableWork = hasSaveCollectionResettableWork({
    values: formState.values,
    receiptFileCount: receiptState.receiptFiles.length,
    receiptDrafts: receiptState.receiptDrafts,
    draftRestoreNotice: draftState.draftRestoreNotice,
  });

  const clearForm = useCallback(() => {
    if (resetConfirmPendingRef.current) return;
    const decision = getSaveCollectionResetDecision({
      hasWork: hasResettableWork,
      submitting: submitting || submitActionInFlightRef.current,
      accessSuspended: Boolean(accessSuspended),
    });
    if (decision === "ignore") return;
    if (decision === "confirm") {
      resetConfirmPendingRef.current = true;
      setResetConfirmOpen(true);
      return;
    }
    resetForm();
  }, [accessSuspended, hasResettableWork, resetForm, submitting]);

  const onResetConfirmOpenChange = useCallback((open: boolean) => {
    if (open || submitting || submitActionInFlightRef.current || accessSuspended) return;
    // Cancel/Escape only closes the confirmation. Drafts, receipt previews,
    // matching, feedback and the current mutation intent remain untouched.
    resetConfirmPendingRef.current = false;
    setResetConfirmOpen(false);
  }, [accessSuspended, submitting]);

  const confirmReset = useCallback(() => {
    if (!resetConfirmPendingRef.current) return;
    const decision = getSaveCollectionResetDecision({
      hasWork: hasResettableWork,
      submitting: submitting || submitActionInFlightRef.current,
      accessSuspended: Boolean(accessSuspended),
      confirmed: true,
    });
    if (decision !== "reset") return;
    // Consume synchronously so a repeated click cannot clear a new draft.
    resetConfirmPendingRef.current = false;
    setResetConfirmOpen(false);
    resetForm();
  }, [accessSuspended, hasResettableWork, resetForm, submitting]);

  const handleSubmit = useCallback(async () => {
    if (resetConfirmPendingRef.current || submitActionInFlightRef.current) return;
    submitActionInFlightRef.current = true;
    try {
      await submitCollection();
    } finally {
      submitActionInFlightRef.current = false;
    }
  }, [submitCollection]);

  return {
    fileInputRef: receiptState.fileInputRef,
    customerName: formState.customerName,
    icNumber: formState.icNumber,
    customerPhone: formState.customerPhone,
    accountNumber: formState.accountNumber,
    cardNumber: formState.cardNumber,
    isCardNumberInputVisible: formState.isCardNumberInputVisible,
    isCardNumberReviewVisible: formState.isCardNumberReviewVisible,
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
    readiness: formState.readiness,
    draftRestoreNotice: draftState.draftRestoreNotice,
    restoreNoticeLabel: draftState.restoreNoticeLabel,
    setCustomerName: formState.setCustomerName,
    setIcNumber: formState.setIcNumber,
    setCustomerPhone: formState.setCustomerPhone,
    setAccountNumber: formState.setAccountNumber,
    setCardNumber: formState.setCardNumber,
    toggleCardNumberInputVisibility: formState.toggleCardNumberInputVisibility,
    toggleCardNumberReviewVisibility: formState.toggleCardNumberReviewVisibility,
    setBatch: formState.setBatch,
    setPaymentDate: formState.setPaymentDate,
    setAmount: formState.setAmount,
    validateField: formState.validateField,
    clearForm,
    resetConfirmOpen,
    onResetConfirmOpenChange,
    confirmReset,
    clearLastSavedSummary,
    clearSubmitFailure: submitState.clearSubmitFailure,
    handleReceiptChange,
    handleRemoveReceipt,
    handleClearPendingReceipts,
    handlePendingDraftChange,
    sourceMatching: {
      error: sourceMatchState.error,
      hasSearched: sourceMatchState.hasSearched,
      loading: sourceMatchState.loading,
      matches: sourceMatchState.matches,
      selectedMatch: sourceMatchState.selectedMatch,
      runMatching: sourceMatchState.runMatching,
    },
    handleSubmit,
  };
}
