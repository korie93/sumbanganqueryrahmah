import { useCallback, useRef, useState } from "react";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  clearDevMailOutboxPreviews,
  deleteDevMailOutboxPreview,
} from "@/lib/api";
import type {
  DevMailOutboxQueryState,
  UseSettingsDevMailOutboxArgs,
} from "@/pages/settings/settings-dev-mail-outbox-shared";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type UseDevMailOutboxMutationStateArgs = UseSettingsDevMailOutboxArgs & {
  getCurrentDevMailOutboxQuery: () => DevMailOutboxQueryState;
  loadDevMailOutbox: (queryInput?: Partial<DevMailOutboxQueryState>) => Promise<unknown>;
};

export function useDevMailOutboxMutationState({
  getCurrentDevMailOutboxQuery,
  isMountedRef,
  loadDevMailOutbox,
  toast,
}: UseDevMailOutboxMutationStateArgs) {
  const deleteDevMailPreviewLocksRef = useRef<Set<string>>(new Set());

  const [deletingDevMailOutboxId, setDeletingDevMailOutboxId] = useState<string | null>(null);
  const [clearingDevMailOutbox, setClearingDevMailOutbox] = useState(false);

  const handleDeleteDevMailOutboxEntry = useCallback(async (previewId: string) => {
    const normalizedId = String(previewId || "").trim();
    if (!normalizedId || deleteDevMailPreviewLocksRef.current.has(normalizedId)) {
      return;
    }

    deleteDevMailPreviewLocksRef.current.add(normalizedId);
    setDeletingDevMailOutboxId(normalizedId);

    try {
      await deleteDevMailOutboxPreview(normalizedId);
      toast(buildMutationSuccessToast({
        title: "Email Preview Deleted",
        description: "The local mail preview has been removed.",
      }));
      await loadDevMailOutbox(getCurrentDevMailOutboxQuery());
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Delete Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      deleteDevMailPreviewLocksRef.current.delete(normalizedId);
      if (isMountedRef.current) {
        setDeletingDevMailOutboxId((current) => (current === normalizedId ? null : current));
      }
    }
  }, [getCurrentDevMailOutboxQuery, isMountedRef, loadDevMailOutbox, toast]);

  const handleClearDevMailOutbox = useCallback(async () => {
    if (clearingDevMailOutbox) {
      return;
    }

    setClearingDevMailOutbox(true);

    try {
      const response = await clearDevMailOutboxPreviews();
      toast(buildMutationSuccessToast({
        title: "Mail Outbox Cleared",
        description: `${response?.deletedCount ?? 0} email preview(s) removed.`,
      }));
      await loadDevMailOutbox(getCurrentDevMailOutboxQuery());
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Clear Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (isMountedRef.current) {
        setClearingDevMailOutbox(false);
      }
    }
  }, [clearingDevMailOutbox, getCurrentDevMailOutboxQuery, isMountedRef, loadDevMailOutbox, toast]);

  return {
    clearingDevMailOutbox,
    deletingDevMailOutboxId,
    handleClearDevMailOutbox,
    handleDeleteDevMailOutboxEntry,
  };
}
