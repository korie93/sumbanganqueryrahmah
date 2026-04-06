import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import {
  createEmptyCollectionReceiptDraft,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";
import { applySaveCollectionReceiptDraftPatch } from "@/pages/collection/save-collection-state-utils";
import {
  validateReceiptFile,
} from "@/pages/collection/utils";
import { removeSaveCollectionReceiptAtIndex } from "./save-collection-page-utils";

type MutationFeedbackApi = {
  notifyMutationError: ReturnType<typeof useMutationFeedback>["notifyMutationError"];
};

type UseSaveCollectionReceiptStateOptions = {
  mutationFeedback: MutationFeedbackApi;
};

export function useSaveCollectionReceiptState({
  mutationFeedback,
}: UseSaveCollectionReceiptStateOptions) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptDrafts, setReceiptDrafts] = useState<CollectionReceiptDraftInput[]>([]);

  const resetReceiptInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

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

  const clearReceiptState = useCallback(() => {
    setReceiptFiles([]);
    setReceiptDrafts([]);
    resetReceiptInput();
  }, [resetReceiptInput]);

  const handlePendingDraftChange = useCallback((
    index: number,
    patch: Partial<CollectionReceiptDraftInput>,
  ) => {
    setReceiptDrafts((previous) => applySaveCollectionReceiptDraftPatch(previous, index, patch));
  }, []);

  return {
    fileInputRef,
    receiptFiles,
    receiptDrafts,
    handleReceiptChange,
    handleRemoveReceipt,
    handlePendingDraftChange,
    clearReceiptState,
  };
}
