import { useCallback, useRef, useState } from "react";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
  createCollectionMutationIdempotencyKey,
  createCollectionRecord,
} from "@/lib/api/collection-records";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  buildSaveCollectionMutationPayload,
  type SaveCollectionFormValues,
  validateSaveCollectionForm,
} from "@/pages/collection/save-collection-page-utils";
import { emitCollectionDataChanged } from "@/pages/collection/utils";

type MutationFeedbackApi = {
  notifyMutationError: ReturnType<typeof useMutationFeedback>["notifyMutationError"];
  notifyMutationSuccess: ReturnType<typeof useMutationFeedback>["notifyMutationSuccess"];
};

type UseSaveCollectionSubmitStateOptions = {
  values: SaveCollectionFormValues;
  receiptFiles: File[];
  receiptDrafts: CollectionReceiptDraftInput[];
  onSaved?: () => void;
  mutationFeedback: MutationFeedbackApi;
  clearPageState: () => void;
};

export function useSaveCollectionSubmitState({
  values,
  receiptFiles,
  receiptDrafts,
  onSaved,
  mutationFeedback,
  clearPageState,
}: UseSaveCollectionSubmitStateOptions) {
  const submitInFlightRef = useRef(false);
  const submitMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetSubmitMutationIntent = useCallback(() => {
    submitMutationIntentRef.current = null;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting || submitInFlightRef.current) {
      return;
    }

    const validationError = validateSaveCollectionForm(values);
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
        values,
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
      resetSubmitMutationIntent();
      clearPageState();
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
    clearPageState,
    mutationFeedback,
    onSaved,
    receiptDrafts,
    receiptFiles,
    resetSubmitMutationIntent,
    submitting,
    values,
  ]);

  return {
    submitting,
    handleSubmit,
    resetSubmitMutationIntent,
  };
}
