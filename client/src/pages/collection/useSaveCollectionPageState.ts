import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CollectionBatch } from "@/lib/api";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
  createCollectionMutationIdempotencyKey,
  createCollectionRecord,
} from "@/lib/api/collection-records";
import {
  createEmptyCollectionReceiptDraft,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";
import {
  clearSaveCollectionDraft,
  persistSaveCollectionDraft,
  readSaveCollectionDraft,
} from "@/pages/collection/save-collection-draft";
import {
  buildSaveCollectionMutationPayload,
  formatSaveCollectionRestoreNoticeLabel,
  removeSaveCollectionReceiptAtIndex,
  type SaveCollectionDraftRestoreNotice,
  validateSaveCollectionForm,
} from "@/pages/collection/save-collection-page-utils";
import {
  emitCollectionDataChanged,
  getTodayIsoDate,
  isFutureDate,
  validateReceiptFile,
} from "@/pages/collection/utils";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitInFlightRef = useRef(false);
  const submitMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftRestoreNotice, setDraftRestoreNotice] = useState<SaveCollectionDraftRestoreNotice | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptDrafts, setReceiptDrafts] = useState<CollectionReceiptDraftInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const maxPaymentDate = getTodayIsoDate();
  const isPaymentDateInFuture = paymentDate ? isFutureDate(paymentDate) : false;

  useEffect(() => {
    const restoredDraft = readSaveCollectionDraft(staffNickname);
    if (restoredDraft) {
      setCustomerName(restoredDraft.customerName);
      setIcNumber(restoredDraft.icNumber);
      setCustomerPhone(restoredDraft.customerPhone);
      setAccountNumber(restoredDraft.accountNumber);
      setBatch(restoredDraft.batch);
      setPaymentDate(restoredDraft.paymentDate);
      setAmount(restoredDraft.amount);
      setDraftRestoreNotice({
        restoredAt: restoredDraft.savedAt,
        hadPendingReceipts: restoredDraft.hadPendingReceipts,
      });
    } else {
      setDraftRestoreNotice(null);
    }
    setDraftHydrated(true);
  }, [staffNickname]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timer = window.setTimeout(() => {
      persistSaveCollectionDraft(staffNickname, {
        customerName,
        icNumber,
        customerPhone,
        accountNumber,
        batch,
        paymentDate,
        amount,
        hadPendingReceipts: receiptFiles.length > 0,
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    accountNumber,
    amount,
    batch,
    customerName,
    draftHydrated,
    icNumber,
    paymentDate,
    receiptFiles.length,
    staffNickname,
    customerPhone,
  ]);

  const restoreNoticeLabel = useMemo(
    () => formatSaveCollectionRestoreNoticeLabel(draftRestoreNotice?.restoredAt),
    [draftRestoreNotice?.restoredAt],
  );

  const clearForm = useCallback(() => {
    setCustomerName("");
    setIcNumber("");
    setCustomerPhone("");
    setAccountNumber("");
    setBatch("P10");
    setPaymentDate("");
    setAmount("");
    setReceiptFiles([]);
    setReceiptDrafts([]);
    clearSaveCollectionDraft(staffNickname);
    setDraftRestoreNotice(null);
    submitMutationIntentRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [staffNickname]);

  const handleReceiptChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) {
      return;
    }

    const error = validateReceiptFile(file);
    if (error) {
      mutationFeedback.notifyMutationError({
        title: "Validation Error",
        description: error,
      });
      return;
    }

    setReceiptFiles((previous) => [...previous, file]);
    setReceiptDrafts((previous) => [...previous, createEmptyCollectionReceiptDraft()]);
  }, [mutationFeedback]);

  const handleRemoveReceipt = useCallback((index: number) => {
    setReceiptFiles((previous) => removeSaveCollectionReceiptAtIndex(previous, index));
    setReceiptDrafts((previous) => removeSaveCollectionReceiptAtIndex(previous, index));
  }, []);

  const handleClearPendingReceipts = useCallback(() => {
    setReceiptFiles([]);
    setReceiptDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handlePendingDraftChange = useCallback((index: number, patch: Partial<CollectionReceiptDraftInput>) => {
    setReceiptDrafts((previous) =>
      previous.map((draft, draftIndex) => (
        draftIndex === index ? { ...draft, ...patch } : draft
      )),
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting || submitInFlightRef.current) return;

    const validationError = validateSaveCollectionForm({
      staffNickname,
      customerName,
      icNumber,
      customerPhone,
      accountNumber,
      batch,
      paymentDate,
      amount,
    });
    if (validationError) {
      mutationFeedback.notifyMutationError({
        title: "Validation Error",
        description: validationError,
      });
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const mutationPayload = buildSaveCollectionMutationPayload({
        values: {
          staffNickname,
          customerName,
          icNumber,
          customerPhone,
          accountNumber,
          batch,
          paymentDate,
          amount,
        },
        receiptDrafts,
      });
      const mutationFingerprint = buildCollectionMutationFingerprint({
        operation: "create",
        payload: mutationPayload,
        receiptFiles,
      });

      if (submitMutationIntentRef.current?.fingerprint !== mutationFingerprint) {
        submitMutationIntentRef.current = {
          fingerprint: mutationFingerprint,
          key: createCollectionMutationIdempotencyKey(),
        };
      }

      await createCollectionRecord(
        buildCollectionRecordFormData(mutationPayload, receiptFiles),
        {
          idempotencyFingerprint: submitMutationIntentRef.current.fingerprint,
          idempotencyKey: submitMutationIntentRef.current.key,
        },
      );

      mutationFeedback.notifyMutationSuccess({
        title: "Collection Saved",
        description: "Rekod collection berjaya disimpan.",
      });
      emitCollectionDataChanged();
      clearForm();
      onSaved?.();
    } catch (error: unknown) {
      mutationFeedback.notifyMutationError({
        title: "Failed to Save Collection",
        error,
        fallbackDescription: "Failed to save collection.",
      });
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }, [
    accountNumber,
    amount,
    batch,
    clearForm,
    customerName,
    customerPhone,
    icNumber,
    mutationFeedback,
    onSaved,
    paymentDate,
    receiptDrafts,
    receiptFiles,
    staffNickname,
    submitting,
  ]);

  return {
    fileInputRef,
    customerName,
    icNumber,
    customerPhone,
    accountNumber,
    batch,
    paymentDate,
    amount,
    receiptFiles,
    receiptDrafts,
    submitting,
    maxPaymentDate,
    isPaymentDateInFuture,
    draftRestoreNotice,
    restoreNoticeLabel,
    setCustomerName,
    setIcNumber,
    setCustomerPhone,
    setAccountNumber,
    setBatch,
    setPaymentDate,
    setAmount,
    clearForm,
    handleReceiptChange,
    handleRemoveReceipt,
    handleClearPendingReceipts,
    handlePendingDraftChange,
    handleSubmit,
  };
}
