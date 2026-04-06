import { useCallback, useEffect, useRef, useState } from "react";
import { createImportFromFile } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  buildBulkImportSelectionResults,
  filterSupportedImportFiles,
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

    const blockedCount = bulkResults.filter((result) => result.blocked).length;
    const hasImportableFiles = bulkResults.some((result) => !result.blocked);
    if (!hasImportableFiles) {
      toast({
        title: "No Importable Files",
        description: blockedCount > 0
          ? `${blockedCount} selected file(s) exceed the ${maxUploadSizeLabel} upload limit.`
          : "Please select at least one supported file to import.",
        variant: "destructive",
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

    const results: BulkFileResult[] = [];

    for (let index = 0; index < bulkFiles.length; index += 1) {
      if (controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
        break;
      }
      const currentFile = bulkFiles[index];
      const existingResult = bulkResults[index];
      if (existingResult?.blocked) {
        results.push(existingResult);
        if (isMountedRef.current) {
          setBulkProgress(((index + 1) / bulkFiles.length) * 100);
        }
        continue;
      }
      const nextPending: BulkFileResult = { filename: currentFile.name, status: "processing" };

      if (isMountedRef.current) {
        setBulkResults((previous) => previous.map((result, resultIndex) => (
          resultIndex === index ? { ...result, status: "processing" } : result
        )));
      }

      try {
        await createImportFromFile(
          stripImportExtension(currentFile.name),
          currentFile,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
          break;
        }
        nextPending.status = "success";
      } catch (bulkError: unknown) {
        if (isImportAbortError(bulkError) || controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
          break;
        }
        nextPending.status = "error";
        nextPending.error = bulkError instanceof Error ? bulkError.message : "Failed to import";
      }

      results.push(nextPending);
      if (isMountedRef.current) {
        setBulkResults((previous) => previous.map((result, resultIndex) => (
          resultIndex === index ? nextPending : result
        )));
        setBulkProgress(((index + 1) / bulkFiles.length) * 100);
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
    const { successCount, errorCount, blockedErrorCount } = summarizeBulkImportResults(results);

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
