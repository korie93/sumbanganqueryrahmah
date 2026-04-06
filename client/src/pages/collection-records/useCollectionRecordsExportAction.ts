import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionRecord } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  loadCollectionRecordsExportModule,
  type CollectionRecordsSummary,
} from "@/pages/collection-records/collection-records-actions-shared";
import {
  resolveCollectionRecordsExportBlockReason,
} from "@/pages/collection-records/collection-records-actions-utils";
import { parseApiError } from "@/pages/collection/utils";

type UseCollectionRecordsExportActionArgs = {
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  nicknameFilter: string;
  summary: CollectionRecordsSummary;
  loadExportRecords: () => Promise<CollectionRecord[]>;
};

export function useCollectionRecordsExportAction({
  canUseNicknameFilter,
  fromDate,
  toDate,
  nicknameFilter,
  summary,
  loadExportRecords,
}: UseCollectionRecordsExportActionArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const exportMutationInFlightRef = useRef<"excel" | "pdf" | null>(null);

  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      if (!isMountedRef.current) {
        return;
      }
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
      if (!isMountedRef.current) {
        return;
      }
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
    exportingExcel,
    exportingPdf,
    onExportExcel: handleExportExcel,
    onExportPdf: handleExportPdf,
  };
}
