import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCollectionPurgeSummary,
  purgeOldCollectionRecords,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  toCollectionRecordsPurgeSummaryViewModel,
  type CollectionRecordsPurgeSummaryViewModel,
} from "@/pages/collection-records/collection-records-actions-shared";
import {
  emitCollectionDataChanged,
  parseApiError,
} from "@/pages/collection/utils";

type UseCollectionRecordsPurgeActionArgs = {
  canPurgeOldRecords: boolean;
  onRefreshRecords: () => Promise<unknown>;
};

export function useCollectionRecordsPurgeAction({
  canPurgeOldRecords,
  onRefreshRecords,
}: UseCollectionRecordsPurgeActionArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const purgeSummaryRequestIdRef = useRef(0);
  const purgeMutationInFlightRef = useRef(false);

  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeSummaryLoading, setPurgeSummaryLoading] = useState(false);
  const [purgingOldRecords, setPurgingOldRecords] = useState(false);
  const [purgeSummary, setPurgeSummary] =
    useState<CollectionRecordsPurgeSummaryViewModel | null>(null);
  const [purgePasswordInput, setPurgePasswordInput] = useState("");

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshPurgeSummary = useCallback(async () => {
    if (!canPurgeOldRecords) {
      return;
    }

    const requestId = ++purgeSummaryRequestIdRef.current;
    setPurgeSummaryLoading(true);
    try {
      const response = await getCollectionPurgeSummary();
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) {
        return;
      }
      setPurgeSummary(toCollectionRecordsPurgeSummaryViewModel(response));
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) {
        return;
      }
      toast({
        title: "Failed to Load Purge Summary",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) {
        return;
      }
      setPurgeSummaryLoading(false);
    }
  }, [canPurgeOldRecords, toast]);

  useEffect(() => {
    if (!canPurgeOldRecords) {
      return;
    }
    void refreshPurgeSummary();
  }, [canPurgeOldRecords, refreshPurgeSummary]);

  const handleOpenPurgeDialog = useCallback(() => {
    if (!canPurgeOldRecords || purgingOldRecords) {
      return;
    }

    void refreshPurgeSummary();
    setPurgePasswordInput("");
    setPurgeDialogOpen(true);
  }, [canPurgeOldRecords, purgingOldRecords, refreshPurgeSummary]);

  const handlePurgeDialogOpenChange = useCallback((open: boolean) => {
    setPurgeDialogOpen(open);
    if (!open) {
      setPurgePasswordInput("");
    }
  }, []);

  const handleConfirmPurgeOldRecords = useCallback(async () => {
    if (!canPurgeOldRecords || purgingOldRecords || purgeMutationInFlightRef.current) {
      return;
    }
    if (!purgePasswordInput) {
      toast({
        title: "Password Required",
        description: "Masukkan password login superuser untuk teruskan purge.",
        variant: "destructive",
      });
      return;
    }

    purgeMutationInFlightRef.current = true;
    setPurgingOldRecords(true);
    try {
      const response = await purgeOldCollectionRecords(purgePasswordInput);
      toast({
        title: response.deletedRecords > 0 ? "Purge Completed" : "No Old Records Found",
        description:
          response.deletedRecords > 0
            ? `${response.deletedRecords} rekod collection lama berjaya dipadam.`
            : "Tiada rekod collection melebihi enam bulan untuk dipurge.",
      });
      emitCollectionDataChanged();
      if (!isMountedRef.current) {
        return;
      }
      setPurgeDialogOpen(false);
      setPurgePasswordInput("");
      await Promise.all([onRefreshRecords(), refreshPurgeSummary()]);
    } catch (error: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      toast({
        title: "Failed to Purge Old Records",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      purgeMutationInFlightRef.current = false;
      if (!isMountedRef.current) {
        return;
      }
      setPurgingOldRecords(false);
    }
  }, [
    canPurgeOldRecords,
    onRefreshRecords,
    purgePasswordInput,
    purgingOldRecords,
    refreshPurgeSummary,
    toast,
  ]);

  return {
    refreshPurgeSummary,
    toolbar: {
      purgeSummaryLoading,
      purgingOldRecords,
      purgeSummary,
      onOpenPurgeDialog: handleOpenPurgeDialog,
    },
    purgeDialog: {
      open: purgeDialogOpen,
      loading: purgeSummaryLoading,
      purging: purgingOldRecords,
      passwordInput: purgePasswordInput,
      summary: purgeSummary,
      onOpenChange: handlePurgeDialogOpenChange,
      onPasswordInputChange: setPurgePasswordInput,
      onConfirm: handleConfirmPurgeOldRecords,
    },
  };
}
