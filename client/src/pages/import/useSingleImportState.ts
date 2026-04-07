import { useCallback, useEffect, useRef, useState } from "react";
import { createImport } from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";
import { parseImportPreview } from "@/pages/import/parsing";
import {
  isImportAbortError,
  resolveNextImportName,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleParseRequestIdRef = useRef(0);
  const singleSaveInFlightRef = useRef(false);
  const singleSaveAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const { toast } = useToast();

  const resetSingleImport = useCallback(() => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setImportName("");
    setError("");
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

    if (isImportFileTooLarge(selectedFile, importUploadLimitBytes)) {
      setError(buildImportFileTooLargeMessage(selectedFile.size, importUploadLimitBytes));
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
        return;
      }

      setHeaders(parsed.headers);
      setParsedData(parsed.rows);
      setImportName((currentName) => resolveNextImportName(currentName, selectedFile.name));
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

    if (parsedData.length === 0) {
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
      await createImport(
        savedName,
        file?.name || "unknown.csv",
        parsedData,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !isMountedRef.current) {
        return;
      }

      resetSingleImport();
      toast({
        title: "Success",
        description: `Data "${savedName}" has been saved (${rowCount} rows).`,
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
  }, [file?.name, importName, loading, onNavigate, parsedData, resetSingleImport, toast]);

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
