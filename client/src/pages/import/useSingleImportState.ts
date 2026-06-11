import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildImportMutationFingerprint,
  createImport,
  createImportFromFile,
  createImportMutationIdempotencyKey,
} from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";
import {
  parseImportPreview,
  shouldDeferImportPreview,
} from "@/pages/import/parsing";
import {
  isImportAbortError,
  resolveNextImportName,
  shouldSaveSingleImportFromOriginalFile,
} from "@/pages/import/import-page-state-utils";
import type { ImportRow } from "@/pages/import/types";
import {
  buildImportFileTooLargeMessage,
  isImportFileTooLarge,
} from "@/pages/import/upload-limits";

type UseSingleImportStateOptions = {
  importUploadLimitBytes: number;
  onNavigate: (page: string) => void;
};

export function useSingleImportState({
  importUploadLimitBytes,
  onNavigate,
}: UseSingleImportStateOptions) {
  const [file, setFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");
  const [parsedData, setParsedData] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
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
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setPreviewDeferred(false);
    setImportName("");
    setError("");
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
    setError("");
    setFile(selectedFile);
    setParsedData([]);
    setHeaders([]);
    setPreviewDeferred(false);

    if (isImportFileTooLarge(selectedFile, importUploadLimitBytes)) {
      setError(buildImportFileTooLargeMessage(selectedFile.size, importUploadLimitBytes));
      return;
    }

    setImportName((currentName) => resolveNextImportName(currentName, selectedFile.name));
    if (shouldDeferImportPreview(selectedFile)) {
      setPreviewDeferred(true);
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

    setLoading(true);
    setError("");
    singleSaveInFlightRef.current = true;
    singleSaveAbortControllerRef.current?.abort();
    const controller = new AbortController();
    singleSaveAbortControllerRef.current = controller;

    try {
      const rowCount = parsedData.length;
      const savedName = importName.trim();
      const selectedFile = file;
      if (
        selectedFile
        && shouldSaveSingleImportFromOriginalFile(selectedFile, rowCount, previewDeferred)
      ) {
        const fingerprint = buildImportMutationFingerprint(savedName, selectedFile);
        if (singleSaveMutationIntentRef.current?.fingerprint !== fingerprint) {
          singleSaveMutationIntentRef.current = {
            fingerprint,
            key: createImportMutationIdempotencyKey(),
          };
        }
        await createImportFromFile(savedName, selectedFile, {
          idempotencyFingerprint: singleSaveMutationIntentRef.current.fingerprint,
          idempotencyKey: singleSaveMutationIntentRef.current.key,
          signal: controller.signal,
        });
      } else {
        await createImport(
          savedName,
          selectedFile?.name || "unknown.csv",
          parsedData,
          { signal: controller.signal },
        );
      }
      if (controller.signal.aborted || !isMountedRef.current) {
        return;
      }

      resetSingleImport();
      toast({
        title: "Success",
        description: previewDeferred
          ? `File "${savedName}" has been validated and saved by the server.`
          : `Data "${savedName}" has been saved (${rowCount} rows).`,
      });
      onNavigate("saved");
    } catch (saveError: unknown) {
      if (isImportAbortError(saveError) || !isMountedRef.current) {
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "Failed to save data.");
    } finally {
      if (singleSaveAbortControllerRef.current === controller) {
        singleSaveAbortControllerRef.current = null;
      }
      singleSaveInFlightRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [
    file,
    importName,
    loading,
    onNavigate,
    parsedData,
    previewDeferred,
    resetSingleImport,
    toast,
  ]);

  const resetSingleForInactiveTab = useCallback(() => {
    invalidateSinglePreview();
    resetSingleImport();
  }, [invalidateSinglePreview, resetSingleImport]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      singleSaveAbortControllerRef.current?.abort();
      invalidateSinglePreview();
    };
  }, [invalidateSinglePreview]);

  return {
    file,
    importName,
    setImportName,
    parsedData,
    headers,
    previewDeferred,
    loading,
    error,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleSave,
    resetSingleImport,
    resetSingleForInactiveTab,
  };
}
