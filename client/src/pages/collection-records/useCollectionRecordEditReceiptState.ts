import { type ChangeEvent, useCallback, useRef, useState } from "react";
import type { CollectionRecord } from "@/lib/api";
import {
  createCollectionReceiptDraftFromReceipt,
  createEmptyCollectionReceiptDraft,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";
import { cloneReceiptIds } from "@/pages/collection-records/collection-record-edit-utils";
import { validateReceiptFile } from "@/pages/collection/utils";

type UseCollectionRecordEditReceiptStateArgs = {
  onValidationError: (description: string) => void;
};

export function useCollectionRecordEditReceiptState({
  onValidationError,
}: UseCollectionRecordEditReceiptStateArgs) {
  const editReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const [editNewReceiptFiles, setEditNewReceiptFiles] = useState<File[]>([]);
  const [editExistingReceiptDrafts, setEditExistingReceiptDrafts] =
    useState<CollectionReceiptDraftInput[]>([]);
  const [editPendingReceiptDrafts, setEditPendingReceiptDrafts] =
    useState<CollectionReceiptDraftInput[]>([]);
  const [editRemovedReceiptIds, setEditRemovedReceiptIds] = useState<string[]>([]);

  const resetReceiptState = useCallback(() => {
    setEditNewReceiptFiles([]);
    setEditExistingReceiptDrafts([]);
    setEditPendingReceiptDrafts([]);
    setEditRemovedReceiptIds([]);
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
  }, []);

  const populateReceiptStateFromRecord = useCallback((record: CollectionRecord) => {
    setEditNewReceiptFiles([]);
    setEditExistingReceiptDrafts(
      record.receipts.map((receipt) => createCollectionReceiptDraftFromReceipt(receipt)),
    );
    setEditPendingReceiptDrafts([]);
    setEditRemovedReceiptIds([]);
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
  }, []);

  const handleEditReceiptChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) {
      return;
    }

    const error = validateReceiptFile(file);
    if (error) {
      onValidationError(error);
      return;
    }

    const nextDraft = createEmptyCollectionReceiptDraft();
    setEditNewReceiptFiles((previous) => [...previous, file]);
    setEditPendingReceiptDrafts((previous) => [...previous, nextDraft]);
  }, [onValidationError]);

  const handleRemovePendingReceipt = useCallback((index: number) => {
    setEditNewReceiptFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setEditPendingReceiptDrafts((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleClearPendingReceipts = useCallback(() => {
    setEditNewReceiptFiles([]);
    setEditPendingReceiptDrafts([]);
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
  }, []);

  const handleExistingReceiptDraftChange = useCallback((
    receiptId: string,
    patch: Partial<CollectionReceiptDraftInput>,
  ) => {
    setEditExistingReceiptDrafts((previous) =>
      previous.map((draft) =>
        draft.receiptId === receiptId ? { ...draft, ...patch } : draft,
      ));
  }, []);

  const handlePendingReceiptDraftChange = useCallback((
    index: number,
    patch: Partial<CollectionReceiptDraftInput>,
  ) => {
    setEditPendingReceiptDrafts((previous) =>
      previous.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ));
  }, []);

  const handleToggleRemoveExistingReceipt = useCallback((receiptId: string) => {
    setEditRemovedReceiptIds((previous) => {
      const normalized = cloneReceiptIds(previous);
      return normalized.includes(receiptId)
        ? normalized.filter((value) => value !== receiptId)
        : [...normalized, receiptId];
    });
  }, []);

  return {
    editReceiptInputRef,
    editNewReceiptFiles,
    editExistingReceiptDrafts,
    editPendingReceiptDrafts,
    editRemovedReceiptIds,
    resetReceiptState,
    populateReceiptStateFromRecord,
    handleEditReceiptChange,
    handleRemovePendingReceipt,
    handleClearPendingReceipts,
    handleExistingReceiptDraftChange,
    handlePendingReceiptDraftChange,
    handleToggleRemoveExistingReceipt,
  };
}
