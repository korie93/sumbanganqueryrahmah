import { useCallback, useEffect, useRef, useState } from "react";
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
import { buildSaveCollectionSuccessDescription } from "@/pages/collection/save-collection-ready-summary";
import {
  buildSaveCollectionRequestFailure,
  buildSaveCollectionValidationFailure,
  type SaveCollectionSubmitFailure,
} from "@/pages/collection/save-collection-submit-feedback";
import type { SaveCollectionSubmitPhase } from "@/pages/collection/save-collection-submit-progress";
import { emitCollectionDataChanged } from "@/pages/collection/utils";

type MutationFeedbackApi = {
  notifyMutationError: ReturnType<typeof useMutationFeedback>["notifyMutationError"];
  notifyMutationSuccess: ReturnType<typeof useMutationFeedback>["notifyMutationSuccess"];
};

type UseSaveCollectionSubmitStateOptions = {
  values: SaveCollectionFormValues;
  receiptFiles: File[];
  receiptDrafts: CollectionReceiptDraftInput[];
  onSaved?: (() => void) | undefined;
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
  const mountedRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const submitMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailure, setSubmitFailure] = useState<SaveCollectionSubmitFailure | null>(null);
  const [submitPhase, setSubmitPhase] = useState<SaveCollectionSubmitPhase>("idle");

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetSubmitMutationIntent = useCallback(() => {
    submitMutationIntentRef.current = null;
  }, []);

  const clearSubmitFailure = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    setSubmitFailure(null);
    setSubmitPhase((current) => (current === "processing" ? current : "idle"));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting || submitInFlightRef.current) {
      return;
    }

    const validationError = validateSaveCollectionForm(values);
    if (validationError) {
      if (mountedRef.current) {
        setSubmitPhase("failed");
        setSubmitFailure(
          buildSaveCollectionValidationFailure({
            message: validationError,
            receiptCount: receiptFiles.length,
          }),
        );
      }
      mutationFeedback.notifyMutationError({
        title: "Validation Error",
        description: validationError,
      });
      return;
    }

    submitInFlightRef.current = true;
    if (mountedRef.current) {
      setSubmitting(true);
      setSubmitFailure(null);
      setSubmitPhase("processing");
    }

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
        description: buildSaveCollectionSuccessDescription({
          values,
          receiptCount: receiptFiles.length,
        }),
      });
      emitCollectionDataChanged();
      resetSubmitMutationIntent();
      if (mountedRef.current) {
        setSubmitFailure(null);
        setSubmitPhase("saved");
      }
      clearPageState();
      onSaved?.();
    } catch (error: unknown) {
      if (mountedRef.current) {
        setSubmitPhase("failed");
        setSubmitFailure(
          buildSaveCollectionRequestFailure({
            error,
            receiptCount: receiptFiles.length,
            fallbackMessage: "Failed to save collection.",
          }),
        );
      }
      mutationFeedback.notifyMutationError({
        title: "Failed to Save Collection",
        error,
        fallbackDescription: "Failed to save collection.",
      });
    } finally {
      submitInFlightRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
      }
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
    submitFailure,
    submitPhase,
    clearSubmitFailure,
    handleSubmit,
    resetSubmitMutationIntent,
  };
}
