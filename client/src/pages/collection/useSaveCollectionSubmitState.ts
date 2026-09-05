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
  validateSaveCollectionFormFields,
  type SaveCollectionFieldErrors,
  type SaveCollectionFormValues,
  validateSaveCollectionForm,
} from "@/pages/collection/save-collection-page-utils";
import {
  buildSaveCollectionLastSavedSummary,
  type SaveCollectionLastSavedSummary,
} from "@/pages/collection/save-collection-post-save";
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
  accessSuspended?: boolean | undefined;
  onReauthenticateNickname?: (() => void) | undefined;
  onSubmittingChange?: ((submitting: boolean) => void) | undefined;
  mutationFeedback: MutationFeedbackApi;
  clearPageState: () => void;
  applyFieldErrors?: ((errors: SaveCollectionFieldErrors) => void) | undefined;
};

export function useSaveCollectionSubmitState({
  values,
  receiptFiles,
  receiptDrafts,
  onSaved,
  accessSuspended = false,
  onReauthenticateNickname,
  onSubmittingChange,
  mutationFeedback,
  clearPageState,
  applyFieldErrors,
}: UseSaveCollectionSubmitStateOptions) {
  const mountedRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const submitMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSavedSummary, setLastSavedSummary] = useState<SaveCollectionLastSavedSummary | null>(null);
  const [submitFailure, setSubmitFailure] = useState<SaveCollectionSubmitFailure | null>(null);
  const [submitPhase, setSubmitPhase] = useState<SaveCollectionSubmitPhase>("idle");

  useEffect(() => {
    mountedRef.current = true;
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

  const clearLastSavedSummary = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    setLastSavedSummary(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (accessSuspended || submitting || submitInFlightRef.current) {
      return;
    }

    const validationError = validateSaveCollectionForm(values);
    if (validationError) {
      applyFieldErrors?.(validateSaveCollectionFormFields(values));
      clearLastSavedSummary();
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
    onSubmittingChange?.(true);
    if (mountedRef.current) {
      setLastSavedSummary(null);
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

      const result = await createCollectionRecord(
        buildCollectionRecordFormData(mutationPayload, receiptFiles),
        {
          idempotencyFingerprint: submitMutationIntentRef.current.fingerprint,
          idempotencyKey: submitMutationIntentRef.current.key,
        },
      );

      if (!mountedRef.current) {
        resetSubmitMutationIntent();
        return;
      }

      const sourceLabel = result.record.sourceImportName || result.record.sourceFilename || null;
      mutationFeedback.notifyMutationSuccess({
        title: "Collection Saved",
        description: buildSaveCollectionSuccessDescription({
          values,
          receiptCount: receiptFiles.length,
          sourceLabel,
        }),
      });
      emitCollectionDataChanged();
      resetSubmitMutationIntent();
      setLastSavedSummary(
        buildSaveCollectionLastSavedSummary({
          values,
          receiptCount: receiptFiles.length,
          sourceLabel,
        }),
      );
      setSubmitFailure(null);
      setSubmitPhase("saved");
      clearPageState();
      onSaved?.();
    } catch (error: unknown) {
      if (!mountedRef.current) {
        return;
      }
      setSubmitPhase("failed");
      const failure = buildSaveCollectionRequestFailure({
        error,
        receiptCount: receiptFiles.length,
        fallbackMessage: "Failed to save collection.",
      });
      setSubmitFailure(failure);
      if (failure.requiresNicknameAuthentication) onReauthenticateNickname?.();
      mutationFeedback.notifyMutationError({
        title: "Failed to Save Collection",
        error,
        fallbackDescription: "Failed to save collection.",
      });
    } finally {
      submitInFlightRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
        onSubmittingChange?.(false);
      }
    }
  }, [
    accessSuspended,
    clearPageState,
    clearLastSavedSummary,
    applyFieldErrors,
    mutationFeedback,
    onSaved,
    onReauthenticateNickname,
    onSubmittingChange,
    receiptDrafts,
    receiptFiles,
    resetSubmitMutationIntent,
    submitting,
    values,
  ]);

  return {
    submitting,
    lastSavedSummary,
    submitFailure,
    submitPhase,
    clearLastSavedSummary,
    clearSubmitFailure,
    handleSubmit,
    resetSubmitMutationIntent,
  };
}
