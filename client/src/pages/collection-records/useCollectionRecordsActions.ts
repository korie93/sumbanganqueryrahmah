import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  buildCollectionMutationFingerprint,
  createCollectionMutationIdempotencyKey,
  deleteCollectionRecord,
  getCollectionPurgeSummary,
  purgeOldCollectionRecords,
  type CollectionPurgeSummaryResponse,
  type CollectionRecord,
} from "@/lib/api";
import {
  emitCollectionDataChanged,
  parseApiError,
  parseCollectionApiErrorDetails,
} from "@/pages/collection/utils";

export type DeleteRecordErrorFeedback = {
  isVersionConflict: boolean;
  title: string;
  description: string;
};

type CollectionRecordsExportModule = typeof import("@/pages/collection-records/export");

let collectionRecordsExportModulePromise: Promise<CollectionRecordsExportModule> | null = null;

function loadCollectionRecordsExportModule() {
  if (!collectionRecordsExportModulePromise) {
    collectionRecordsExportModulePromise = import("@/pages/collection-records/export");
  }

  return collectionRecordsExportModulePromise;
}

export function buildDeleteRecordErrorFeedback(error: unknown): DeleteRecordErrorFeedback {
  const apiErrorDetails = parseCollectionApiErrorDetails(error);
  if (
    apiErrorDetails.status === 409
    && apiErrorDetails.code === "COLLECTION_RECORD_VERSION_CONFLICT"
  ) {
    return {
      isVersionConflict: true,
      title: "Record Updated Elsewhere",
      description:
        "This record changed in another session. The list has been refreshed. Reopen the record and try again.",
    };
  }

  return {
    isVersionConflict: false,
    title: "Failed to Delete Record",
    description: apiErrorDetails.message || parseApiError(error),
  };
}

export function resolveCollectionRecordsExportBlockReason(options: {
  totalRecords: number;
  exportingExcel: boolean;
  exportingPdf: boolean;
}) {
  if (options.totalRecords === 0) {
    return "no_data";
  }

  if (options.exportingExcel || options.exportingPdf) {
    return "busy";
  }

  return null;
}

type UseCollectionRecordsActionsArgs = {
  canPurgeOldRecords: boolean;
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  nicknameFilter: string;
  summary: { totalRecords: number; totalAmount: number };
  loadExportRecords: () => Promise<CollectionRecord[]>;
  onRefreshRecords: () => Promise<unknown>;
};

export function useCollectionRecordsActions({
  canPurgeOldRecords,
  canUseNicknameFilter,
  fromDate,
  toDate,
  nicknameFilter,
  summary,
  loadExportRecords,
  onRefreshRecords,
}: UseCollectionRecordsActionsArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const purgeSummaryRequestIdRef = useRef(0);
  const deleteMutationInFlightRef = useRef(false);
  const purgeMutationInFlightRef = useRef(false);
  const exportMutationInFlightRef = useRef<"excel" | "pdf" | null>(null);
  const deleteMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pendingDeleteRecord, setPendingDeleteRecord] =
    useState<CollectionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeSummaryLoading, setPurgeSummaryLoading] = useState(false);
  const [purgingOldRecords, setPurgingOldRecords] = useState(false);
  const [purgeSummary, setPurgeSummary] =
    useState<CollectionPurgeSummaryResponse | null>(null);
  const [purgePasswordInput, setPurgePasswordInput] = useState("");

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPurgeSummary = useCallback(async () => {
    if (!canPurgeOldRecords) return;

    const requestId = ++purgeSummaryRequestIdRef.current;
    setPurgeSummaryLoading(true);
    try {
      const response = await getCollectionPurgeSummary();
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) return;
      setPurgeSummary(response);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) return;
      toast({
        title: "Failed to Load Purge Summary",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) return;
      setPurgeSummaryLoading(false);
    }
  }, [canPurgeOldRecords, toast]);

  useEffect(() => {
    if (!canPurgeOldRecords) return;
    void loadPurgeSummary();
  }, [canPurgeOldRecords, loadPurgeSummary]);

  const handleOpenPurgeDialog = useCallback(() => {
    if (!canPurgeOldRecords || purgingOldRecords) return;
    void loadPurgeSummary();
    setPurgePasswordInput("");
    setPurgeDialogOpen(true);
  }, [canPurgeOldRecords, loadPurgeSummary, purgingOldRecords]);

  const handlePurgeDialogOpenChange = useCallback((open: boolean) => {
    setPurgeDialogOpen(open);
    if (!open) {
      setPurgePasswordInput("");
    }
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteRecord || deletingId || deleteMutationInFlightRef.current) return;
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

      await deleteCollectionRecord(pendingDeleteRecord.id, {
        expectedUpdatedAt: pendingDeleteRecord.updatedAt || pendingDeleteRecord.createdAt,
      }, {
        idempotencyFingerprint: deleteMutationIntentRef.current.fingerprint,
        idempotencyKey: deleteMutationIntentRef.current.key,
      });
      toast({
        title: "Record Deleted",
        description: "Rekod collection berjaya dipadam.",
      });
      emitCollectionDataChanged();
      if (!isMountedRef.current) return;
      setPendingDeleteRecord(null);
      deleteMutationIntentRef.current = null;
      await Promise.all([
        onRefreshRecords(),
        canPurgeOldRecords ? loadPurgeSummary() : Promise.resolve(),
      ]);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
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
          await Promise.all([
            onRefreshRecords(),
            canPurgeOldRecords ? loadPurgeSummary() : Promise.resolve(),
          ]);
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
      if (!isMountedRef.current) return;
      setDeletingId(null);
    }
  }, [
    canPurgeOldRecords,
    deletingId,
    loadPurgeSummary,
    onRefreshRecords,
    pendingDeleteRecord,
    toast,
  ]);

  const handleConfirmPurgeOldRecords = useCallback(async () => {
    if (!canPurgeOldRecords || purgingOldRecords || purgeMutationInFlightRef.current) return;
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
      if (!isMountedRef.current) return;
      setPurgeDialogOpen(false);
      setPurgePasswordInput("");
      await Promise.all([onRefreshRecords(), loadPurgeSummary()]);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      toast({
        title: "Failed to Purge Old Records",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      purgeMutationInFlightRef.current = false;
      if (!isMountedRef.current) return;
      setPurgingOldRecords(false);
    }
  }, [
    canPurgeOldRecords,
    loadPurgeSummary,
    onRefreshRecords,
    purgePasswordInput,
    purgingOldRecords,
    toast,
  ]);

  const handleExportExcel = useCallback(async () => {
    const blockReason = resolveCollectionRecordsExportBlockReason({
      totalRecords: summary.totalRecords,
      exportingExcel,
      exportingPdf,
    });

    if (blockReason === "busy" || exportMutationInFlightRef.current) {
      return;
    }

    if (blockReason === "no_data") {
      toast({
        title: "Tiada Data",
        description: "Tiada rekod untuk diexport.",
        variant: "destructive",
      });
      return;
    }

    exportMutationInFlightRef.current = "excel";
    setExportingExcel(true);
    try {
      const exportRecords = await loadExportRecords();
      if (exportRecords.length === 0) {
        toast({
          title: "Tiada Data",
          description: "Tiada rekod untuk diexport.",
          variant: "destructive",
        });
        return;
      }
      const { exportCollectionRecordsToExcel } = await loadCollectionRecordsExportModule();
      await exportCollectionRecordsToExcel({
        visibleRecords: exportRecords,
        fromDate,
        toDate,
        summary,
        canUseNicknameFilter,
        nicknameFilter,
      });
    } catch (error: unknown) {
      toast({
        title: "Export Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      exportMutationInFlightRef.current = null;
      if (!isMountedRef.current) return;
      setExportingExcel(false);
    }
  }, [
    canUseNicknameFilter,
    exportingExcel,
    exportingPdf,
    fromDate,
    loadExportRecords,
    nicknameFilter,
    summary,
    toDate,
    toast,
  ]);

  const handleExportPdf = useCallback(async () => {
    const blockReason = resolveCollectionRecordsExportBlockReason({
      totalRecords: summary.totalRecords,
      exportingExcel,
      exportingPdf,
    });

    if (blockReason === "busy" || exportMutationInFlightRef.current) {
      return;
    }

    if (blockReason === "no_data") {
      toast({
        title: "Tiada Data",
        description: "Tiada rekod untuk diexport.",
        variant: "destructive",
      });
      return;
    }

    exportMutationInFlightRef.current = "pdf";
    setExportingPdf(true);
    try {
      const exportRecords = await loadExportRecords();
      if (exportRecords.length === 0) {
        toast({
          title: "Tiada Data",
          description: "Tiada rekod untuk diexport.",
          variant: "destructive",
        });
        return;
      }
      const { exportCollectionRecordsToPdf } = await loadCollectionRecordsExportModule();
      await exportCollectionRecordsToPdf({
        visibleRecords: exportRecords,
        fromDate,
        toDate,
        summary,
        canUseNicknameFilter,
        nicknameFilter,
      });
    } catch (error: unknown) {
      toast({
        title: "Export Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      exportMutationInFlightRef.current = null;
      if (!isMountedRef.current) return;
      setExportingPdf(false);
    }
  }, [
    canUseNicknameFilter,
    exportingExcel,
    exportingPdf,
    fromDate,
    loadExportRecords,
    nicknameFilter,
    summary,
    toDate,
    toast,
  ]);

  return {
    refreshPurgeSummary: loadPurgeSummary,
    requestDelete: setPendingDeleteRecord,
    toolbar: {
      exportingExcel,
      exportingPdf,
      purgeSummaryLoading,
      purgingOldRecords,
      purgeSummary: purgeSummary
        ? {
            cutoffDate: purgeSummary.cutoffDate,
            eligibleRecords: purgeSummary.eligibleRecords,
            totalAmount: purgeSummary.totalAmount,
          }
        : null,
      onOpenPurgeDialog: handleOpenPurgeDialog,
      onExportExcel: handleExportExcel,
      onExportPdf: handleExportPdf,
    },
    deleteDialog: {
      open: Boolean(pendingDeleteRecord),
      deleting: deletingId !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPendingDeleteRecord(null);
      },
      onConfirm: handleConfirmDelete,
    },
    purgeDialog: {
      open: purgeDialogOpen,
      loading: purgeSummaryLoading,
      purging: purgingOldRecords,
      passwordInput: purgePasswordInput,
      summary: purgeSummary
        ? {
            cutoffDate: purgeSummary.cutoffDate,
            eligibleRecords: purgeSummary.eligibleRecords,
            totalAmount: purgeSummary.totalAmount,
          }
        : null,
      onOpenChange: handlePurgeDialogOpenChange,
      onPasswordInputChange: setPurgePasswordInput,
      onConfirm: handleConfirmPurgeOldRecords,
    },
  };
}
