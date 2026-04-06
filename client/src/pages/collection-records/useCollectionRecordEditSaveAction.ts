import { useCallback, useEffect, useRef, useState } from "react";
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
  getCollectionRecordEditValidationError,
} from "@/pages/collection-records/collection-record-edit-utils";
import {
  emitCollectionDataChanged,
  parseCollectionApiErrorDetails,
} from "@/pages/collection/utils";

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

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resetEditMutationIntent = useCallback(() => {
    editMutationIntentRef.current = null;
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRecord || savingEdit || savingEditInFlightRef.current) {
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
      notifyMutationError({
        title: "Validation Error",
        description: validationError,
      });
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
        amount: Number(amount),
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
      if (!isMountedRef.current) {
        return;
      }
      setSavingEdit(false);
    }
  }, [
    accountNumber,
    amount,
    batch,
    closeDialog,
    customerName,
    customerPhone,
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
    savingEdit,
    resetEditMutationIntent,
    handleSaveEdit,
  };
}
