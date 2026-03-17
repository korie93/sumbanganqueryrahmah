import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  deleteCollectionRecord,
  getCollectionPurgeSummary,
  purgeOldCollectionRecords,
  type CollectionPurgeSummaryResponse,
  type CollectionRecord,
} from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";

type UseCollectionRecordsActionsArgs = {
  canPurgeOldRecords: boolean;
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  nicknameFilter: string;
  visibleRecords: CollectionRecord[];
  summary: { totalRecords: number; totalAmount: number };
  onRefreshRecords: () => Promise<unknown>;
};

export function useCollectionRecordsActions({
  canPurgeOldRecords,
  canUseNicknameFilter,
  fromDate,
  toDate,
  nicknameFilter,
  visibleRecords,
  summary,
  onRefreshRecords,
}: UseCollectionRecordsActionsArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const purgeSummaryRequestIdRef = useRef(0);

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
    if (!pendingDeleteRecord || deletingId) return;
    setDeletingId(pendingDeleteRecord.id);
    try {
      await deleteCollectionRecord(pendingDeleteRecord.id);
      toast({
        title: "Record Deleted",
        description: "Rekod collection berjaya dipadam.",
      });
      if (!isMountedRef.current) return;
      setPendingDeleteRecord(null);
      await Promise.all([
        onRefreshRecords(),
        canPurgeOldRecords ? loadPurgeSummary() : Promise.resolve(),
      ]);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      toast({
        title: "Failed to Delete Record",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
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
    if (!canPurgeOldRecords || purgingOldRecords) return;
    if (!purgePasswordInput) {
      toast({
        title: "Password Required",
        description: "Masukkan password login superuser untuk teruskan purge.",
        variant: "destructive",
      });
      return;
    }

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
    if (visibleRecords.length === 0 || exportingExcel) {
      toast({
        title: "Tiada Data",
        description: "Tiada rekod untuk diexport.",
        variant: "destructive",
      });
      return;
    }

    setExportingExcel(true);
    try {
      const { exportCollectionRecordsToExcel } = await import(
        "@/pages/collection-records/export"
      );
      await exportCollectionRecordsToExcel({
        visibleRecords,
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
      if (!isMountedRef.current) return;
      setExportingExcel(false);
    }
  }, [
    canUseNicknameFilter,
    exportingExcel,
    fromDate,
    nicknameFilter,
    summary,
    toDate,
    toast,
    visibleRecords,
  ]);

  const handleExportPdf = useCallback(async () => {
    if (visibleRecords.length === 0 || exportingPdf) {
      toast({
        title: "Tiada Data",
        description: "Tiada rekod untuk diexport.",
        variant: "destructive",
      });
      return;
    }

    setExportingPdf(true);
    try {
      const { exportCollectionRecordsToPdf } = await import(
        "@/pages/collection-records/export"
      );
      await exportCollectionRecordsToPdf({
        visibleRecords,
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
      if (!isMountedRef.current) return;
      setExportingPdf(false);
    }
  }, [
    canUseNicknameFilter,
    exportingPdf,
    fromDate,
    nicknameFilter,
    summary,
    toDate,
    toast,
    visibleRecords,
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
