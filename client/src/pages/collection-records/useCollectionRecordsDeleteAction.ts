import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCollectionMutationFingerprint,
  createCollectionMutationIdempotencyKey,
  deleteCollectionRecord,
  type CollectionRecord,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  buildDeleteRecordErrorFeedback,
} from "@/pages/collection-records/collection-records-actions-utils";
import { emitCollectionDataChanged } from "@/pages/collection/utils";

type UseCollectionRecordsDeleteActionArgs = {
  onAfterDelete: () => Promise<unknown>;
};

export function useCollectionRecordsDeleteAction({
  onAfterDelete,
}: UseCollectionRecordsDeleteActionArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const deleteMutationInFlightRef = useRef(false);
  const deleteMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const [pendingDeleteRecord, setPendingDeleteRecord] =
    useState<CollectionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteRecord || deletingId || deleteMutationInFlightRef.current) {
      return;
    }

    deleteMutationInFlightRef.current = true;
    setDeletingId(pendingDeleteRecord.id);
    try {
      const deletePayload = {
        expectedUpdatedAt: pendingDeleteRecord.updatedAt || pendingDeleteRecord.createdAt,
      };
      const mutationFingerprint = buildCollectionMutationFingerprint({
        operation: "delete",
        payload: deletePayload,
        recordId: pendingDeleteRecord.id,
      });
      if (deleteMutationIntentRef.current?.fingerprint !== mutationFingerprint) {
        deleteMutationIntentRef.current = {
          fingerprint: mutationFingerprint,
          key: createCollectionMutationIdempotencyKey(),
        };
      }

      await deleteCollectionRecord(
        pendingDeleteRecord.id,
        {
          expectedUpdatedAt: pendingDeleteRecord.updatedAt || pendingDeleteRecord.createdAt,
        },
        {
          idempotencyFingerprint: deleteMutationIntentRef.current.fingerprint,
          idempotencyKey: deleteMutationIntentRef.current.key,
        },
      );
      toast({
        title: "Record Deleted",
        description: "Rekod collection berjaya dipadam.",
      });
      emitCollectionDataChanged();
      if (!isMountedRef.current) {
        return;
      }
      setPendingDeleteRecord(null);
      deleteMutationIntentRef.current = null;
      await onAfterDelete();
    } catch (error: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      const feedback = buildDeleteRecordErrorFeedback(error);
      if (feedback.isVersionConflict) {
        toast({
          title: feedback.title,
          description: feedback.description,
          variant: "destructive",
        });
        emitCollectionDataChanged();
        setPendingDeleteRecord(null);
        deleteMutationIntentRef.current = null;
        try {
          await onAfterDelete();
        } catch {
          // keep conflict UX deterministic even if refresh fails
        }
        return;
      }

      toast({
        title: feedback.title,
        description: feedback.description,
        variant: "destructive",
      });
    } finally {
      deleteMutationInFlightRef.current = false;
      if (!isMountedRef.current) {
        return;
      }
      setDeletingId(null);
    }
  }, [deletingId, onAfterDelete, pendingDeleteRecord, toast]);

  return {
    requestDelete: setPendingDeleteRecord,
    deleteDialog: {
      open: Boolean(pendingDeleteRecord),
      deleting: deletingId !== null,
      onOpenChange: (open: boolean) => {
        if (!open) {
          setPendingDeleteRecord(null);
        }
      },
      onConfirm: handleConfirmDelete,
    },
  };
}
