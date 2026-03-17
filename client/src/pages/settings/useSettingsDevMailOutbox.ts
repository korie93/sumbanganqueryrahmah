import { useCallback, useRef, useState, type MutableRefObject } from "react";
import {
  clearDevMailOutboxPreviews,
  deleteDevMailOutboxPreview,
  getDevMailOutboxPreviews,
} from "@/lib/api";
import type { DevMailOutboxPreview } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsDevMailOutboxArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export function useSettingsDevMailOutbox({
  isMountedRef,
  toast,
}: UseSettingsDevMailOutboxArgs) {
  const devMailOutboxRequestIdRef = useRef(0);
  const deleteDevMailPreviewLocksRef = useRef<Set<string>>(new Set());

  const [devMailOutboxEntries, setDevMailOutboxEntries] = useState<DevMailOutboxPreview[]>([]);
  const [devMailOutboxEnabled, setDevMailOutboxEnabled] = useState(false);
  const [devMailOutboxLoading, setDevMailOutboxLoading] = useState(false);
  const [deletingDevMailOutboxId, setDeletingDevMailOutboxId] = useState<string | null>(null);
  const [clearingDevMailOutbox, setClearingDevMailOutbox] = useState(false);

  const loadDevMailOutbox = useCallback(async () => {
    const requestId = ++devMailOutboxRequestIdRef.current;
    setDevMailOutboxLoading(true);
    try {
      const response = await getDevMailOutboxPreviews();
      const nextEntries = Array.isArray(response?.previews) ? response.previews : [];
      const nextEnabled = Boolean(response?.enabled);
      if (!isMountedRef.current || requestId !== devMailOutboxRequestIdRef.current) {
        return { enabled: nextEnabled, previews: nextEntries };
      }
      setDevMailOutboxEnabled(nextEnabled);
      setDevMailOutboxEntries(nextEntries);
      return { enabled: nextEnabled, previews: nextEntries };
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== devMailOutboxRequestIdRef.current) {
        return { enabled: false, previews: [] as DevMailOutboxPreview[] };
      }
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Mail Outbox",
        description: parsed.message,
        variant: "destructive",
      });
      return { enabled: false, previews: [] as DevMailOutboxPreview[] };
    } finally {
      if (!isMountedRef.current || requestId !== devMailOutboxRequestIdRef.current) return;
      setDevMailOutboxLoading(false);
    }
  }, [isMountedRef, toast]);

  const refreshDevMailOutboxSection = useCallback(async () => {
    await loadDevMailOutbox();
  }, [loadDevMailOutbox]);

  const handleDeleteDevMailOutboxEntry = useCallback(async (previewId: string) => {
    const normalizedId = String(previewId || "").trim();
    if (!normalizedId || deleteDevMailPreviewLocksRef.current.has(normalizedId)) return;

    deleteDevMailPreviewLocksRef.current.add(normalizedId);
    setDeletingDevMailOutboxId(normalizedId);
    try {
      await deleteDevMailOutboxPreview(normalizedId);
      toast({
        title: "Email Preview Deleted",
        description: "The local mail preview has been removed.",
      });
      await loadDevMailOutbox();
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Delete Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      deleteDevMailPreviewLocksRef.current.delete(normalizedId);
      if (isMountedRef.current) {
        setDeletingDevMailOutboxId((current) => (current === normalizedId ? null : current));
      }
    }
  }, [isMountedRef, loadDevMailOutbox, toast]);

  const handleClearDevMailOutbox = useCallback(async () => {
    if (clearingDevMailOutbox) return;

    setClearingDevMailOutbox(true);
    try {
      const response = await clearDevMailOutboxPreviews();
      toast({
        title: "Mail Outbox Cleared",
        description: `${response?.deletedCount ?? 0} email preview(s) removed.`,
      });
      await loadDevMailOutbox();
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Clear Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setClearingDevMailOutbox(false);
      }
    }
  }, [clearingDevMailOutbox, isMountedRef, loadDevMailOutbox, toast]);

  return {
    clearingDevMailOutbox,
    deletingDevMailOutboxId,
    devMailOutboxEnabled,
    devMailOutboxEntries,
    devMailOutboxLoading,
    handleClearDevMailOutbox,
    handleDeleteDevMailOutboxEntry,
    loadDevMailOutbox,
    refreshDevMailOutboxSection,
  };
}
