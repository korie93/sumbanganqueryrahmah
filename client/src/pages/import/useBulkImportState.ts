import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildImportMutationFingerprint,
  createImportFromFile,
  createImportMutationIdempotencyKey,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { waitForImportJobCompletion } from "@/pages/import/import-background-job";
import {
  buildBulkImportSelectionResults,
  filterSupportedImportFiles,
  getRetryableBulkImportIndexes,
  isImportAbortError,
  summarizeBulkImportResults,
} from "@/pages/import/import-page-state-utils";
import { stripImportExtension } from "@/pages/import/parsing";
import type { BulkFileResult } from "@/pages/import/types";

type UseBulkImportStateOptions = {
  importUploadLimitBytes: number;
  maxUploadSizeLabel: string;
};

export function useBulkImportState({
  importUploadLimitBytes,
  maxUploadSizeLabel,
}: UseBulkImportStateOptions) {
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkFileResult[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const bulkImportInFlightRef = useRef(false);
  const bulkImportAbortControllerRef = useRef<AbortController | null>(null);
  const bulkImportRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const bulkProcessingRef = useRef(false);
  const { toast } = useToast();

  const setBulkSelection = useCallback((files: File[]) => {
    setBulkFiles(files);
    setBulkProgress(0);
    setBulkResults(buildBulkImportSelectionResults(files, importUploadLimitBytes));
  }, [importUploadLimitBytes]);

  const handleBulkFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    setBulkSelection(filterSupportedImportFiles(Array.from(files)));
  }, [setBulkSelection]);

  const handleBulkDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
      return;
    }
    setBulkSelection(filterSupportedImportFiles(Array.from(files)));
  }, [setBulkSelection]);

  const handleBulkDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleClearBulk = useCallback(() => {
    setBulkFiles([]);
    setBulkResults([]);
    setBulkProgress(0);
    if (bulkInputRef.current) {
      bulkInputRef.current.value = "";
    }
  }, []);

  const clearBulkForInactiveTab = useCallback(() => {
    if (bulkProcessingRef.current) {
      return;
    }
    handleClearBulk();
  }, [handleClearBulk]);

  const handleBulkImport = useCallback(async () => {
    if (bulkFiles.length === 0 || bulkProcessingRef.current || bulkImportInFlightRef.current) {
      return;
    }

    const retryableIndexes = getRetryableBulkImportIndexes(bulkResults);
    const blockedCount = bulkResults.filter((result) => result.blocked).length;
    if (retryableIndexes.length === 0) {
      toast({
        title: blockedCount === bulkResults.length ? "No Importable Files" : "Nothing to Retry",
        description: blockedCount > 0
          && blockedCount === bulkResults.length
          ? `${blockedCount} selected file(s) exceed the ${maxUploadSizeLabel} upload limit.`
          : "All importable files have already completed successfully.",
        variant: blockedCount === bulkResults.length ? "destructive" : "default",
      });
      return;
    }

    const requestId = ++bulkImportRequestIdRef.current;
    bulkImportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    bulkImportAbortControllerRef.current = controller;
    bulkImportInFlightRef.current = true;
    bulkProcessingRef.current = true;
    setBulkProcessing(true);
    setBulkProgress(0);

    const workingResults = bulkResults.map((result) => ({ ...result }));
    let processedCount = 0;

    for (const index of retryableIndexes) {
      if (controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
        break;
      }
      const currentFile = bulkFiles[index];
      const existingResult = workingResults[index];
      const importName = stripImportExtension(currentFile.name);
      const idempotencyKey = existingResult?.idempotencyKey
        ?? createImportMutationIdempotencyKey();
      const idempotencyFingerprint = existingResult?.idempotencyFingerprint
        ?? buildImportMutationFingerprint(importName, currentFile);
      const nextPending: BulkFileResult = {
        id: existingResult?.id ?? `${currentFile.name}:${currentFile.size}:${currentFile.lastModified}:${index}`,
        filename: currentFile.name,
        sizeBytes: existingResult?.sizeBytes ?? currentFile.size,
        status: "processing",
        idempotencyKey,
        idempotencyFingerprint,
      };
      workingResults[index] = nextPending;

      if (isMountedRef.current) {
        setBulkResults(workingResults.map((result) => ({ ...result })));
      }

      try {
        const importResult = await createImportFromFile(
          importName,
          currentFile,
          {
            idempotencyFingerprint,
            idempotencyKey,
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
          break;
        }
        const importRecord = "job" in importResult
          ? await waitForImportJobCompletion(
            importResult.job,
            controller.signal,
            () => undefined,
          )
          : importResult;
        if ("status" in importRecord && importRecord.status !== "completed") {
          if (importRecord.status === "duplicate") {
            throw new Error(
              `File already imported as "${importRecord.duplicateImportName ?? "an existing import"}".`,
            );
          }
          if (importRecord.status === "cancelled") {
            throw new Error("Background import was cancelled.");
          }
          throw new Error(importRecord.error || "Background import failed.");
        }
        nextPending.status = "success";
        nextPending.rowCount = importRecord.rowCount ?? 0;
        delete nextPending.error;
      } catch (bulkError: unknown) {
        if (isImportAbortError(bulkError) || controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
          break;
        }
        nextPending.status = "error";
        nextPending.error = bulkError instanceof Error ? bulkError.message : "Failed to import";
      }

      workingResults[index] = nextPending;
      processedCount += 1;
      if (isMountedRef.current) {
        setBulkResults(workingResults.map((result) => ({ ...result })));
        setBulkProgress((processedCount / retryableIndexes.length) * 100);
      }
    }

    if (bulkImportAbortControllerRef.current === controller) {
      bulkImportAbortControllerRef.current = null;
    }
    bulkImportInFlightRef.current = false;
    bulkProcessingRef.current = false;

    if (!isMountedRef.current || controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
      if (isMountedRef.current) {
        setBulkProcessing(false);
      }
      return;
    }

    setBulkProcessing(false);
    setBulkResults(workingResults);
    const { successCount, errorCount, blockedErrorCount } = summarizeBulkImportResults(workingResults);

    toast({
      title: "Bulk Import Complete",
      description: blockedErrorCount > 0
        ? `${successCount} file(s) imported successfully, ${errorCount} file(s) failed, ${blockedErrorCount} file(s) were skipped for exceeding the upload limit.`
        : `${successCount} file(s) imported successfully, ${errorCount} file(s) failed.`,
      variant: errorCount > 0 || blockedErrorCount > 0 ? "destructive" : "default",
    });
  }, [bulkFiles, bulkResults, maxUploadSizeLabel, toast]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      bulkImportAbortControllerRef.current?.abort();
      bulkImportRequestIdRef.current += 1;
    };
  }, []);

  return {
    bulkFiles,
    bulkResults,
    bulkProcessing,
    bulkProgress,
    bulkInputRef,
    handleBulkFileSelect,
    handleBulkDrop,
    handleBulkDragOver,
    handleBulkImport,
    handleClearBulk,
    clearBulkForInactiveTab,
  };
}
