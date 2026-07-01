import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildImportMutationFingerprint,
  cancelImportJob,
  createImport,
  createImportFromFile,
  createImportMutationIdempotencyKey,
  getImportJob,
  resumeImportJob,
} from "@/lib/api";
import {
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";
import { waitForImportJobCompletion } from "@/pages/import/import-background-job";
import {
  isImportAbortError,
  resolveNextImportName,
  shouldSaveSingleImportFromOriginalFile,
} from "@/pages/import/import-page-state-utils";
import {
  parseImportPreview,
  readDeferredCsvHeaders,
  shouldDeferImportPreview,
} from "@/pages/import/parsing";
import type {
  ImportBackgroundJobContract,
  ImportColumnMappingEntry,
  ImportRow,
} from "@/pages/import/types";
import {
  buildImportFileTooLargeMessage,
  isImportFileTooLarge,
} from "@/pages/import/upload-limits";

type UseSingleImportStateOptions = {
  importUploadLimitBytes: number;
  onNavigate: (page: string) => void;
};

const ACTIVE_IMPORT_JOB_STORAGE_KEY = "sqr-active-import-job-id";

function persistActiveImportJobId(jobId: string | null): void {
  const storage = getBrowserSessionStorage();
  if (jobId) {
    safeSetStorageItem(storage, ACTIVE_IMPORT_JOB_STORAGE_KEY, jobId);
    return;
  }
  safeRemoveStorageItem(storage, ACTIVE_IMPORT_JOB_STORAGE_KEY);
}

function readActiveImportJobId(): string | null {
  return safeGetStorageItem(getBrowserSessionStorage(), ACTIVE_IMPORT_JOB_STORAGE_KEY);
}

function buildIdentityColumnMapping(headers: string[]): ImportColumnMappingEntry[] {
  return headers.map((header) => ({ source: header, target: header }));
}

function validateColumnMapping(mapping: ImportColumnMappingEntry[]): string | null {
  if (mapping.length === 0) {
    return null;
  }

  const includedTargets = mapping
    .filter((entry) => entry.target !== null)
    .map((entry) => entry.target?.trim() ?? "");

  if (includedTargets.length === 0) {
    return "Select at least one column to import.";
  }
  if (includedTargets.some((target) => target.length === 0)) {
    return "Every included column must have a target field name.";
  }

  const normalizedTargets = includedTargets.map((target) => target.toLocaleLowerCase());
  if (new Set(normalizedTargets).size !== normalizedTargets.length) {
    return "Target field names must be unique.";
  }
  return null;
}

function getBackgroundJobError(job: ImportBackgroundJobContract): string | null {
  if (job.status === "duplicate") {
    return `This file has already been imported as "${job.duplicateImportName ?? "an existing import"}".`;
  }
  if (job.status === "cancelled") {
    return "Background import was cancelled. You can resume it when ready.";
  }
  if (job.status === "failed") {
    return job.error || "Background import failed. You can resume it after reviewing the file.";
  }
  return null;
}

export function useSingleImportState({
  importUploadLimitBytes,
  onNavigate,
}: UseSingleImportStateOptions) {
  const [file, setFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");
  const [parsedData, setParsedData] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ImportColumnMappingEntry[]>([]);
  const [backgroundJob, setBackgroundJob] = useState<ImportBackgroundJobContract | null>(null);
  const [previewDeferred, setPreviewDeferred] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleParseRequestIdRef = useRef(0);
  const singleSaveInFlightRef = useRef(false);
  const singleSaveAbortControllerRef = useRef<AbortController | null>(null);
  const singleSaveMutationIntentRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const isMountedRef = useRef(true);
  const { toast } = useToast();

  const resetSingleImport = useCallback(() => {
    singleParseRequestIdRef.current += 1;
    singleSaveAbortControllerRef.current?.abort();
    singleSaveAbortControllerRef.current = null;
    singleSaveInFlightRef.current = false;
    setLoading(false);
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setColumnMapping([]);
    setBackgroundJob(null);
    setPreviewDeferred(false);
    setImportName("");
    setError("");
    persistActiveImportJobId(null);
    singleSaveMutationIntentRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const invalidateSinglePreview = useCallback(() => {
    singleParseRequestIdRef.current += 1;
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    const requestId = ++singleParseRequestIdRef.current;
    singleSaveAbortControllerRef.current?.abort();
    setError("");
    setFile(selectedFile);
    setParsedData([]);
    setHeaders([]);
    setColumnMapping([]);
    setBackgroundJob(null);
    persistActiveImportJobId(null);
    setPreviewDeferred(false);

    if (isImportFileTooLarge(selectedFile, importUploadLimitBytes)) {
      setError(buildImportFileTooLargeMessage(selectedFile.size, importUploadLimitBytes));
      return;
    }

    setImportName((currentName) => resolveNextImportName(currentName, selectedFile.name));
    if (shouldDeferImportPreview(selectedFile)) {
      setPreviewDeferred(true);
      try {
        const deferredHeaders = await readDeferredCsvHeaders(selectedFile);
        if (requestId !== singleParseRequestIdRef.current) {
          return;
        }
        setHeaders(deferredHeaders);
        setColumnMapping(buildIdentityColumnMapping(deferredHeaders));
      } catch (headerError) {
        if (requestId === singleParseRequestIdRef.current) {
          logClientError("Failed to read deferred import headers:", headerError);
        }
      }
      return;
    }

    try {
      const parsed = await parseImportPreview(selectedFile);
      if (requestId !== singleParseRequestIdRef.current) {
        return;
      }
      if (parsed.error) {
        setError(parsed.error);
        setFile(null);
        setPreviewDeferred(false);
        return;
      }

      setHeaders(parsed.headers);
      setColumnMapping(buildIdentityColumnMapping(parsed.headers));
      setParsedData(parsed.rows);
    } catch (parseError) {
      if (requestId !== singleParseRequestIdRef.current) {
        return;
      }
      setError("Failed to read file. Please ensure the file format is correct.");
      logClientError("Failed to parse single import preview:", parseError);
    }
  }, [importUploadLimitBytes]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (!droppedFile) {
      return;
    }

    const input = fileInputRef.current;
    if (!input) {
      return;
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(droppedFile);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const finishSuccessfulImport = useCallback((
    savedName: string,
    rowCount: number,
    wasDeferred: boolean,
  ) => {
    resetSingleImport();
    toast({
      title: "Success",
      description: wasDeferred
        ? `File "${savedName}" was validated and imported (${rowCount.toLocaleString()} rows).`
        : `Data "${savedName}" has been saved (${rowCount.toLocaleString()} rows).`,
    });
    onNavigate("saved");
  }, [onNavigate, resetSingleImport, toast]);

  const handleSave = useCallback(async () => {
    if (loading || singleSaveInFlightRef.current) {
      return;
    }

    if (!importName.trim()) {
      setError("Please enter an import name.");
      return;
    }

    if (parsedData.length === 0 && !previewDeferred) {
      setError("No data to save.");
      return;
    }

    const mappingError = validateColumnMapping(columnMapping);
    if (mappingError) {
      setError(mappingError);
      return;
    }

    setLoading(true);
    setError("");
    setBackgroundJob(null);
    singleSaveInFlightRef.current = true;
    singleSaveAbortControllerRef.current?.abort();
    const controller = new AbortController();
    singleSaveAbortControllerRef.current = controller;

    try {
      const previewRowCount = parsedData.length;
      const savedName = importName.trim();
      const selectedFile = file;
      let importedRowCount = previewRowCount;

      if (
        selectedFile
        && shouldSaveSingleImportFromOriginalFile(selectedFile, previewRowCount, previewDeferred)
      ) {
        const fingerprint = buildImportMutationFingerprint(savedName, selectedFile);
        if (singleSaveMutationIntentRef.current?.fingerprint !== fingerprint) {
          singleSaveMutationIntentRef.current = {
            fingerprint,
            key: createImportMutationIdempotencyKey(),
          };
        }
        const result = await createImportFromFile(savedName, selectedFile, {
          columnMapping,
          idempotencyFingerprint: singleSaveMutationIntentRef.current.fingerprint,
          idempotencyKey: singleSaveMutationIntentRef.current.key,
          signal: controller.signal,
        });

        if ("job" in result) {
          persistActiveImportJobId(result.job.id);
          const terminalJob = await waitForImportJobCompletion(
            result.job,
            controller.signal,
            (job) => {
              if (isMountedRef.current) {
                setBackgroundJob(job);
              }
            },
          );
          if (terminalJob.status === "duplicate") {
            persistActiveImportJobId(null);
          }
          const terminalError = getBackgroundJobError(terminalJob);
          if (terminalError) {
            setError(terminalError);
            return;
          }
          importedRowCount = terminalJob.rowCount ?? 0;
        } else {
          importedRowCount = result.rowCount;
        }
      } else {
        const result = await createImport(
          savedName,
          selectedFile?.name || "unknown.csv",
          parsedData,
          { columnMapping, signal: controller.signal },
        );
        if ("job" in result) {
          throw new Error("Unexpected background response for an in-browser import.");
        }
        importedRowCount = result.rowCount;
      }

      if (controller.signal.aborted || !isMountedRef.current) {
        return;
      }
      finishSuccessfulImport(savedName, importedRowCount, previewDeferred);
    } catch (saveError: unknown) {
      if (isImportAbortError(saveError) || !isMountedRef.current) {
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "Failed to save data.");
    } finally {
      if (singleSaveAbortControllerRef.current === controller) {
        singleSaveAbortControllerRef.current = null;
        singleSaveInFlightRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }
  }, [
    columnMapping,
    file,
    finishSuccessfulImport,
    importName,
    loading,
    parsedData,
    previewDeferred,
  ]);

  const handleCancelBackgroundJob = useCallback(async () => {
    if (!backgroundJob?.canCancel) {
      return;
    }
    try {
      const nextJob = await cancelImportJob(backgroundJob.id);
      if (isMountedRef.current) {
        setBackgroundJob(nextJob);
      }
    } catch (cancelError) {
      if (isMountedRef.current) {
        setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel import.");
      }
    }
  }, [backgroundJob]);

  const handleResumeBackgroundJob = useCallback(async () => {
    if (!backgroundJob?.canResume || loading || singleSaveInFlightRef.current) {
      return;
    }

    setLoading(true);
    setError("");
    singleSaveInFlightRef.current = true;
    const controller = new AbortController();
    singleSaveAbortControllerRef.current?.abort();
    singleSaveAbortControllerRef.current = controller;

    try {
      const resumedJob = await resumeImportJob(backgroundJob.id, { signal: controller.signal });
      persistActiveImportJobId(resumedJob.id);
      const terminalJob = await waitForImportJobCompletion(
        resumedJob,
        controller.signal,
        (job) => {
          if (isMountedRef.current) {
            setBackgroundJob(job);
          }
        },
      );
      if (terminalJob.status === "duplicate") {
        persistActiveImportJobId(null);
      }
      const terminalError = getBackgroundJobError(terminalJob);
      if (terminalError) {
        setError(terminalError);
        return;
      }
      finishSuccessfulImport(
        terminalJob.name,
        terminalJob.rowCount ?? 0,
        true,
      );
    } catch (resumeError) {
      if (!isImportAbortError(resumeError) && isMountedRef.current) {
        setError(resumeError instanceof Error ? resumeError.message : "Failed to resume import.");
      }
    } finally {
      if (singleSaveAbortControllerRef.current === controller) {
        singleSaveAbortControllerRef.current = null;
        singleSaveInFlightRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }
  }, [backgroundJob, finishSuccessfulImport, loading]);

  const resetSingleForInactiveTab = useCallback(() => {
    if (backgroundJob) {
      return;
    }
    invalidateSinglePreview();
    resetSingleImport();
  }, [backgroundJob, invalidateSinglePreview, resetSingleImport]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      singleSaveAbortControllerRef.current?.abort();
      invalidateSinglePreview();
    };
  }, [invalidateSinglePreview]);

  useEffect(() => {
    const jobId = readActiveImportJobId();
    if (!jobId || singleSaveInFlightRef.current) {
      return undefined;
    }

    const controller = new AbortController();
    singleSaveAbortControllerRef.current = controller;
    singleSaveInFlightRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const initialJob = await getImportJob(jobId, { signal: controller.signal });
        const terminalJob = await waitForImportJobCompletion(
          initialJob,
          controller.signal,
          (job) => {
            if (isMountedRef.current) {
              setBackgroundJob(job);
            }
          },
        );
        if (terminalJob.status === "duplicate") {
          persistActiveImportJobId(null);
        }
        const terminalError = getBackgroundJobError(terminalJob);
        if (terminalError) {
          setError(terminalError);
          return;
        }
        finishSuccessfulImport(terminalJob.name, terminalJob.rowCount ?? 0, true);
      } catch (restoreError) {
        if (isImportAbortError(restoreError) || !isMountedRef.current) {
          return;
        }
        persistActiveImportJobId(null);
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : "Failed to restore background import status.",
        );
      } finally {
        if (singleSaveAbortControllerRef.current === controller) {
          singleSaveAbortControllerRef.current = null;
          singleSaveInFlightRef.current = false;
          if (isMountedRef.current) {
            setLoading(false);
          }
        }
      }
    })();

    return () => {
      controller.abort();
      if (singleSaveAbortControllerRef.current === controller) {
        singleSaveAbortControllerRef.current = null;
        singleSaveInFlightRef.current = false;
      }
    };
  }, [finishSuccessfulImport]);

  return {
    file,
    importName,
    setImportName,
    parsedData,
    headers,
    columnMapping,
    setColumnMapping,
    backgroundJob,
    previewDeferred,
    loading,
    error,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleSave,
    handleCancelBackgroundJob,
    handleResumeBackgroundJob,
    resetSingleImport,
    resetSingleForInactiveTab,
  };
}
