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
  readImportErrorMessage,
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
const IMPORT_COLUMN_MAPPING_MAX_ENTRIES = 256;
const IMPORT_COLUMN_MAPPING_MAX_FIELD_LENGTH = 128;
const UNSAFE_IMPORT_COLUMN_MAPPING_NAMES = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

type ImportColumnMappingSubmissionResult = {
  columnMapping: ImportColumnMappingEntry[];
  error: string | null;
};

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

function normalizeImportColumnMappingField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > IMPORT_COLUMN_MAPPING_MAX_FIELD_LENGTH) {
    return null;
  }

  if (UNSAFE_IMPORT_COLUMN_MAPPING_NAMES.has(normalized.toLowerCase())) {
    return null;
  }

  return normalized;
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

export function prepareImportColumnMappingForSubmission(
  mapping: readonly unknown[],
): ImportColumnMappingSubmissionResult {
  if (mapping.length > IMPORT_COLUMN_MAPPING_MAX_ENTRIES) {
    return {
      columnMapping: [],
      error: "Column mapping has too many columns. Please reduce the selected columns and try again.",
    };
  }

  const sanitizedMapping: ImportColumnMappingEntry[] = [];

  for (const entry of mapping) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return {
        columnMapping: [],
        error: "Column mapping is invalid. Please review the selected columns.",
      };
    }

    const rawEntry = entry as Record<string, unknown>;
    if (
      !Object.prototype.hasOwnProperty.call(rawEntry, "source")
      || !Object.prototype.hasOwnProperty.call(rawEntry, "target")
    ) {
      return {
        columnMapping: [],
        error: "Column mapping is invalid. Please review the selected columns.",
      };
    }

    const source = normalizeImportColumnMappingField(rawEntry.source);
    if (!source) {
      return {
        columnMapping: [],
        error: "Column mapping contains an unsupported source column.",
      };
    }

    let target: string | null = null;
    if (rawEntry.target !== null) {
      target = normalizeImportColumnMappingField(rawEntry.target);
      if (!target) {
        return {
          columnMapping: [],
          error: "Column mapping contains an unsupported target field.",
        };
      }
    }

    sanitizedMapping.push({ source, target });
  }

  return {
    columnMapping: sanitizedMapping,
    error: validateColumnMapping(sanitizedMapping),
  };
}

function getBackgroundJobError(job: ImportBackgroundJobContract): string | null {
  if (job.status === "duplicate") {
    return job.duplicateImportName
      ? `Fail ini sudah pernah diimport sebagai "${job.duplicateImportName}". `
        + "Buka Saved Imports untuk lihat data sedia ada, atau pilih fail lain."
      : "Fail ini sudah pernah diimport. Buka Saved Imports untuk lihat data sedia ada, atau pilih fail lain.";
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
  const backgroundJobIdRef = useRef<string | null>(null);
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

  const setTrackedBackgroundJob = useCallback((nextJob: ImportBackgroundJobContract | null) => {
    backgroundJobIdRef.current = nextJob?.id ?? null;
    setBackgroundJob(nextJob);
  }, []);

  const isActiveSingleSaveController = useCallback((controller: AbortController) => (
    isMountedRef.current
    && !controller.signal.aborted
    && singleSaveAbortControllerRef.current === controller
  ), []);

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
    setTrackedBackgroundJob(null);
    setPreviewDeferred(false);
    setImportName("");
    setError("");
    persistActiveImportJobId(null);
    singleSaveMutationIntentRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [setTrackedBackgroundJob]);

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
    setTrackedBackgroundJob(null);
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
  }, [importUploadLimitBytes, setTrackedBackgroundJob]);

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

    const mappingSubmission = prepareImportColumnMappingForSubmission(columnMapping);
    if (mappingSubmission.error) {
      setError(mappingSubmission.error);
      return;
    }
    const sanitizedColumnMapping = mappingSubmission.columnMapping;

    setLoading(true);
    setError("");
    setTrackedBackgroundJob(null);
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
          columnMapping: sanitizedColumnMapping,
          idempotencyFingerprint: singleSaveMutationIntentRef.current.fingerprint,
          idempotencyKey: singleSaveMutationIntentRef.current.key,
          signal: controller.signal,
        });

        if (!isActiveSingleSaveController(controller)) {
          return;
        }

        if ("job" in result) {
          persistActiveImportJobId(result.job.id);
          const terminalJob = await waitForImportJobCompletion(
            result.job,
            controller.signal,
            (job) => {
              if (isActiveSingleSaveController(controller)) {
                setTrackedBackgroundJob(job);
              }
            },
          );
          if (!isActiveSingleSaveController(controller)) {
            return;
          }
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
          { columnMapping: sanitizedColumnMapping, signal: controller.signal },
        );
        if (!isActiveSingleSaveController(controller)) {
          return;
        }
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
      setError(readImportErrorMessage(saveError, "Failed to save data."));
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
    isActiveSingleSaveController,
    loading,
    parsedData,
    previewDeferred,
    setTrackedBackgroundJob,
  ]);

  const handleCancelBackgroundJob = useCallback(async () => {
    if (!backgroundJob?.canCancel) {
      return;
    }
    const jobId = backgroundJob.id;
    try {
      const nextJob = await cancelImportJob(jobId);
      if (isMountedRef.current && backgroundJobIdRef.current === jobId) {
        setTrackedBackgroundJob(nextJob);
      }
    } catch (cancelError) {
      if (isMountedRef.current && backgroundJobIdRef.current === jobId) {
        setError(readImportErrorMessage(cancelError, "Failed to cancel import."));
      }
    }
  }, [backgroundJob, setTrackedBackgroundJob]);

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
      if (!isActiveSingleSaveController(controller)) {
        return;
      }
      persistActiveImportJobId(resumedJob.id);
      const terminalJob = await waitForImportJobCompletion(
        resumedJob,
        controller.signal,
        (job) => {
          if (isActiveSingleSaveController(controller)) {
            setTrackedBackgroundJob(job);
          }
        },
      );
      if (!isActiveSingleSaveController(controller)) {
        return;
      }
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
        setError(readImportErrorMessage(resumeError, "Failed to resume import."));
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
  }, [
    backgroundJob,
    finishSuccessfulImport,
    isActiveSingleSaveController,
    loading,
    setTrackedBackgroundJob,
  ]);

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
        if (!isActiveSingleSaveController(controller)) {
          return;
        }
        const terminalJob = await waitForImportJobCompletion(
          initialJob,
          controller.signal,
          (job) => {
            if (isActiveSingleSaveController(controller)) {
              setTrackedBackgroundJob(job);
            }
          },
        );
        if (!isActiveSingleSaveController(controller)) {
          return;
        }
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
        setError(readImportErrorMessage(restoreError, "Failed to restore background import status."));
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
  }, [finishSuccessfulImport, isActiveSingleSaveController, setTrackedBackgroundJob]);

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
