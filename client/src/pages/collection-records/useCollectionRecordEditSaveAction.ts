import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollectionBatch,
  CollectionRecord,
  CollectionStaffNickname,
} from "@/lib/api";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
  createCollectionMutationIdempotencyKey,
  updateCollectionRecord,
} from "@/lib/api/collection-records";
import {
  buildCollectionReceiptMetadataPayload,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";
import {
  cloneReceiptIds,
  confirmExistingReceiptRemoval,
  getCollectionRecordEditFieldErrors,
  getCollectionRecordEditValidationError,
  type CollectionRecordEditFieldErrors,
} from "@/pages/collection-records/collection-record-edit-utils";
import {
  emitCollectionDataChanged,
  parseCollectionApiErrorDetails,
} from "@/pages/collection/utils";
import { parseCollectionAmountMyrNumber } from "@shared/collection-amount-types";
import { buildCollectionRecordEditChanges } from "./collection-record-edit-changes";

const EMPTY_VALIDATION_ERRORS: CollectionRecordEditFieldErrors = {};

type UseCollectionRecordEditSaveActionArgs = {
  editingRecord: CollectionRecord | null;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  staffNickname: string;
  nicknameOptions: CollectionStaffNickname[];
  newReceiptFiles: File[];
  existingReceiptDrafts: CollectionReceiptDraftInput[];
  pendingReceiptDrafts: CollectionReceiptDraftInput[];
  removedReceiptIds: string[];
  onRefresh: () => Promise<unknown>;
  closeDialog: () => void;
  resetEditState: () => void;
  notifyMutationError: (options: {
    title: string;
    description?: string;
    error?: unknown;
    fallbackDescription?: string;
  }) => void;
  notifyMutationSuccess: (options: {
    title: string;
    description?: string;
  }) => void;
};

export function useCollectionRecordEditSaveAction({
  editingRecord,
  customerName,
  icNumber,
  customerPhone,
  accountNumber,
  batch,
  paymentDate,
  amount,
  staffNickname,
  nicknameOptions,
  newReceiptFiles,
  existingReceiptDrafts,
  pendingReceiptDrafts,
  removedReceiptIds,
  onRefresh,
  closeDialog,
  resetEditState,
  notifyMutationError,
  notifyMutationSuccess,
}: UseCollectionRecordEditSaveActionArgs) {
  const isMountedRef = useRef(true);
  const savingEditInFlightRef = useRef(false);
  const editMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const currentValidationErrors = useMemo(() => getCollectionRecordEditFieldErrors({
    customerName, icNumber, customerPhone, accountNumber, batch, paymentDate,
    amount, staffNickname, editingRecord, nicknameOptions,
  }), [
    customerName, icNumber, customerPhone, accountNumber, batch, paymentDate,
    amount, staffNickname, editingRecord, nicknameOptions,
  ]);
  // A failed Save enables live field feedback for this draft only. Deriving the
  // errors means corrected fields clear without stealing focus while typing.
  const validationErrors = validationAttempt > 0 ? currentValidationErrors : EMPTY_VALIDATION_ERRORS;
  // Share one comparison between the review UI and mutation guard. This is
  // page-local draft state; it does not replace backend validation or access checks.
  const changeReview = useMemo(() => buildCollectionRecordEditChanges({
    editingRecord, customerName, icNumber, customerPhone, accountNumber,
    batch, paymentDate, amount, staffNickname, newReceiptFiles,
    existingReceiptDrafts, pendingReceiptDrafts, removedReceiptIds,
  }), [
    editingRecord, customerName, icNumber, customerPhone, accountNumber,
    batch, paymentDate, amount, staffNickname, newReceiptFiles,
    existingReceiptDrafts, pendingReceiptDrafts, removedReceiptIds,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resetEditMutationIntent = useCallback(() => {
    editMutationIntentRef.current = null;
    setValidationAttempt(0);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRecord || !changeReview.hasChanges || savingEdit || savingEditInFlightRef.current) {
      return;
    }

    const validationError = getCollectionRecordEditValidationError({
      customerName,
      icNumber,
      customerPhone,
      accountNumber,
      batch,
      paymentDate,
      amount,
      staffNickname,
      editingRecord,
      nicknameOptions,
    });
    if (validationError) {
      setValidationAttempt((previousAttempt) => previousAttempt + 1);
      // Field descriptions and focus provide feedback without a duplicate toast.
      // Keep the generic fallback for validation errors without a field mapping.
      if (Object.keys(currentValidationErrors).length === 0) {
        notifyMutationError({
          title: "Validation Error",
          description: validationError,
        });
      }
      return;
    }

    savingEditInFlightRef.current = true;
    setSavingEdit(true);
    try {
      const normalizedEditNickname = staffNickname.trim();
      const staffNicknameChanged =
        normalizedEditNickname !== editingRecord.collectionStaffNickname;
      const removedExistingReceiptIds = new Set(removedReceiptIds);
      const existingReceiptMetadata = existingReceiptDrafts
        .filter((draft) => !removedExistingReceiptIds.has(String(draft.receiptId || "")))
        .map((draft) => buildCollectionReceiptMetadataPayload(draft));
      const newReceiptMetadata = pendingReceiptDrafts.map((draft) =>
        buildCollectionReceiptMetadataPayload(draft));
      const payload: Record<string, unknown> = {
        customerName: customerName.trim(),
        icNumber: icNumber.trim(),
        customerPhone: customerPhone.trim(),
        accountNumber: accountNumber.trim(),
        batch,
        paymentDate,
        amount: parseCollectionAmountMyrNumber(amount),
        expectedUpdatedAt: editingRecord.updatedAt || editingRecord.createdAt,
        existingReceiptMetadata,
        newReceiptMetadata,
      };

      if (staffNicknameChanged) {
        payload.collectionStaffNickname = normalizedEditNickname;
      }

      const removeReceiptIds = cloneReceiptIds(removedReceiptIds);
      if (!confirmExistingReceiptRemoval(removeReceiptIds.length)) {
        setSavingEdit(false);
        savingEditInFlightRef.current = false;
        return;
      }
      if (removeReceiptIds.length > 0) {
        payload.removeReceiptIds = removeReceiptIds;
      }
      if (
        (editingRecord.receipts?.length || 0) > 0
        && removeReceiptIds.length === (editingRecord.receipts?.length || 0)
      ) {
        payload.removeReceipt = true;
      }

      const mutationFingerprint = buildCollectionMutationFingerprint({
        operation: "update",
        payload,
        receiptFiles: newReceiptFiles,
        recordId: editingRecord.id,
      });
      if (editMutationIntentRef.current?.fingerprint !== mutationFingerprint) {
        editMutationIntentRef.current = {
          fingerprint: mutationFingerprint,
          key: createCollectionMutationIdempotencyKey(),
        };
      }

      await updateCollectionRecord(
        editingRecord.id,
        buildCollectionRecordFormData(payload, newReceiptFiles),
        {
          idempotencyFingerprint: editMutationIntentRef.current.fingerprint,
          idempotencyKey: editMutationIntentRef.current.key,
        },
      );
      notifyMutationSuccess({
        title: "Record Updated",
        description: "Rekod collection berjaya dikemaskini.",
      });
      emitCollectionDataChanged();
      if (!isMountedRef.current) {
        return;
      }
      closeDialog();
      resetEditState();
      resetEditMutationIntent();
      await onRefresh();
    } catch (error: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      const apiErrorDetails = parseCollectionApiErrorDetails(error);
      if (
        apiErrorDetails.status === 409
        && apiErrorDetails.code === "COLLECTION_RECORD_VERSION_CONFLICT"
      ) {
        notifyMutationError({
          title: "Record Updated Elsewhere",
          description:
            "This record changed in another session. The list has been refreshed. Reopen the record and apply your changes again.",
        });
        emitCollectionDataChanged();
        try {
          await onRefresh();
        } catch {
          // keep conflict UX deterministic even if refresh fails
        }
        if (!isMountedRef.current) {
          return;
        }
        closeDialog();
        resetEditState();
        resetEditMutationIntent();
        return;
      }

      notifyMutationError({
        title: "Failed to Update Record",
        description: apiErrorDetails.message,
        error,
        fallbackDescription: "Failed to update record.",
      });
    } finally {
      savingEditInFlightRef.current = false;
      if (isMountedRef.current) {
        setSavingEdit(false);
      }
    }
  }, [
    accountNumber,
    amount,
    batch,
    changeReview.hasChanges,
    closeDialog,
    customerName,
    customerPhone,
    currentValidationErrors,
    editingRecord,
    existingReceiptDrafts,
    icNumber,
    newReceiptFiles,
    nicknameOptions,
    notifyMutationError,
    notifyMutationSuccess,
    onRefresh,
    paymentDate,
    pendingReceiptDrafts,
    removedReceiptIds,
    resetEditMutationIntent,
    resetEditState,
    savingEdit,
    staffNickname,
  ]);

  return {
    changeReview,
    savingEdit,
    validationErrors,
    validationAttempt,
    resetEditMutationIntent,
    handleSaveEdit,
  };
}
