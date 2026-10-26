import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import type { CollectionRecord } from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";
import { resolveReceiptPreviewKind } from "@/pages/collection-records/utils";
import { parseApiError } from "@/pages/collection/utils";
import { resolveReceiptImagePreviewProfile } from "./receipt-preview-image-policy";

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function useCollectionReceiptPreview() {
  const { toast } = useToast();
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const receiptPreviewRequestIdRef = useRef(0);
  const receiptPreviewAbortControllerRef = useRef<AbortController | null>(null);
  const receiptDownloadAbortControllerRef = useRef<AbortController | null>(null);
  const receiptDetailAbortControllerRef = useRef<AbortController | null>(null);
  const detailReadyRef = useRef(true);
  const isMountedRef = useRef(true);

  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewRecord, setReceiptPreviewRecord] =
    useState<CollectionRecord | null>(null);
  const [receiptPreviewReceiptId, setReceiptPreviewReceiptId] = useState<string | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewDownloading, setReceiptPreviewDownloading] = useState(false);
  const [receiptPreviewSource, setReceiptPreviewSource] = useState("");
  const [receiptPreviewMimeType, setReceiptPreviewMimeType] = useState("");
  const [receiptPreviewFileName, setReceiptPreviewFileName] = useState("");
  const [receiptPreviewError, setReceiptPreviewError] = useState("");
  const [receiptPreviewRetryAttempt, setReceiptPreviewRetryAttempt] = useState(0);
  const [receiptPreviewRefining, setReceiptPreviewRefining] = useState(false);
  const [receiptPreviewRefinementError, setReceiptPreviewRefinementError] = useState("");

  const selectedPreviewReceipt = useMemo(() => {
    if (!receiptPreviewRecord) return null;
    if (!receiptPreviewReceiptId) return receiptPreviewRecord.receipts?.[0] || null;
    return (
      receiptPreviewRecord.receipts?.find((receipt) => receipt.id === receiptPreviewReceiptId) ||
      receiptPreviewRecord.receipts?.[0] ||
      null
    );
  }, [receiptPreviewReceiptId, receiptPreviewRecord]);

  const receiptPreviewKind = useMemo<ReceiptPreviewKind>(
    () =>
      resolveReceiptPreviewKind({
        mimeType: receiptPreviewMimeType || selectedPreviewReceipt?.originalMimeType || "",
        fileName: receiptPreviewFileName || selectedPreviewReceipt?.originalFileName || "",
        receiptPath: selectedPreviewReceipt?.storagePath || "",
      }),
    [
      receiptPreviewFileName,
      receiptPreviewMimeType,
      selectedPreviewReceipt?.originalFileName,
      selectedPreviewReceipt?.originalMimeType,
      selectedPreviewReceipt?.storagePath,
    ],
  );

  const clearReceiptPreviewObjectUrl = useCallback(() => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
  }, []);

  const abortReceiptPreviewRequest = useCallback(() => {
    if (receiptPreviewAbortControllerRef.current) {
      receiptPreviewAbortControllerRef.current.abort();
      receiptPreviewAbortControllerRef.current = null;
    }
  }, []);

  const abortReceiptDownloadRequest = useCallback(() => {
    if (receiptDownloadAbortControllerRef.current) {
      receiptDownloadAbortControllerRef.current.abort();
      receiptDownloadAbortControllerRef.current = null;
    }
  }, []);

  const abortReceiptDetailRequest = useCallback(() => {
    receiptDetailAbortControllerRef.current?.abort();
    receiptDetailAbortControllerRef.current = null;
  }, []);

  const invalidateReceiptPreview = useCallback(() => {
    receiptPreviewRequestIdRef.current += 1;
    abortReceiptPreviewRequest();
    abortReceiptDetailRequest();
    clearReceiptPreviewObjectUrl();
    detailReadyRef.current = true;
    setReceiptPreviewRefining(false);
    setReceiptPreviewRefinementError("");
  }, [abortReceiptDetailRequest, abortReceiptPreviewRequest, clearReceiptPreviewObjectUrl]);

  const closeReceiptPreview = useCallback(() => {
    invalidateReceiptPreview();
    abortReceiptDownloadRequest();
    setReceiptPreviewOpen(false);
    setReceiptPreviewRecord(null);
    setReceiptPreviewReceiptId(null);
    setReceiptPreviewLoading(false);
    setReceiptPreviewDownloading(false);
    setReceiptPreviewSource("");
    setReceiptPreviewMimeType("");
    setReceiptPreviewFileName("");
    setReceiptPreviewError("");
  }, [abortReceiptDownloadRequest, invalidateReceiptPreview]);

  const handleViewReceipt = useCallback((record: CollectionRecord, receiptId?: string) => {
    const nextReceiptId = receiptId || record.receipts?.[0]?.id || null;
    invalidateReceiptPreview();
    setReceiptPreviewSource("");
    setReceiptPreviewLoading(true);
    setReceiptPreviewRecord(record);
    setReceiptPreviewReceiptId(nextReceiptId);
    setReceiptPreviewRetryAttempt((attempt) => attempt + 1);
    setReceiptPreviewOpen(true);
  }, [invalidateReceiptPreview]);

  const handleSelectReceipt = useCallback((receiptId: string) => {
    if (!receiptPreviewRecord || receiptId === selectedPreviewReceipt?.id || !receiptPreviewRecord.receipts?.some((receipt) => receipt.id === receiptId)) return;
    invalidateReceiptPreview();
    setReceiptPreviewSource("");
    setReceiptPreviewLoading(true);
    setReceiptPreviewReceiptId(receiptId);
  }, [invalidateReceiptPreview, receiptPreviewRecord, selectedPreviewReceipt?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortReceiptPreviewRequest();
      abortReceiptDetailRequest();
      abortReceiptDownloadRequest();
      clearReceiptPreviewObjectUrl();
    };
  }, [abortReceiptDetailRequest, abortReceiptDownloadRequest, abortReceiptPreviewRequest, clearReceiptPreviewObjectUrl]);

  useEffect(() => {
    if (!receiptPreviewOpen || !receiptPreviewRecord) return;

    const activeRequestId = ++receiptPreviewRequestIdRef.current;
    const selectedReceiptId = selectedPreviewReceipt?.id || null;
    abortReceiptPreviewRequest();
    abortReceiptDetailRequest();
    const profile = resolveReceiptImagePreviewProfile(typeof window === "undefined" ? 0 : window.innerWidth);
    detailReadyRef.current = !profile.compact;
    setReceiptPreviewRefining(false);
    setReceiptPreviewRefinementError("");
    const controller = new AbortController();
    receiptPreviewAbortControllerRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && isMountedRef.current &&
      activeRequestId === receiptPreviewRequestIdRef.current;

    const loadPreview = async () => {
      setReceiptPreviewLoading(true);
      setReceiptPreviewError("");
      setReceiptPreviewSource("");
      clearReceiptPreviewObjectUrl();
      setReceiptPreviewMimeType(selectedPreviewReceipt?.originalMimeType || "");
      setReceiptPreviewFileName(selectedPreviewReceipt?.originalFileName || "");

      try {
        const { prepareReceiptPreview } = await import("./receipt-preview-image-detail");
        if (!isCurrent()) return;
        const preview = await prepareReceiptPreview({
          recordId: receiptPreviewRecord.id, receiptId: selectedReceiptId,
          signal: controller.signal, isCurrent, profile,
          fallbackMimeType: selectedPreviewReceipt?.originalMimeType || "",
          fallbackFileName: selectedPreviewReceipt?.originalFileName || "",
        });
        if (!preview || !isCurrent()) return;

        const objectUrl = URL.createObjectURL(preview.blob);
        if (!isCurrent()) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        receiptPreviewUrlRef.current = objectUrl;
        setReceiptPreviewSource(objectUrl);
        setReceiptPreviewMimeType(preview.mimeType);
        setReceiptPreviewFileName(preview.fileName);
      } catch (error: unknown) {
        if (!isCurrent() || isAbortError(error)) return;
        setReceiptPreviewError(parseApiError(error));
      } finally {
        if (receiptPreviewAbortControllerRef.current === controller) {
          receiptPreviewAbortControllerRef.current = null;
        }
        if (isCurrent()) {
          setReceiptPreviewLoading(false);
        }
      }
    };

    void loadPreview();
    return () => {
      controller.abort();
      if (receiptPreviewAbortControllerRef.current === controller) receiptPreviewAbortControllerRef.current = null;
      if (receiptPreviewRequestIdRef.current === activeRequestId) abortReceiptDetailRequest();
    };
  }, [
    abortReceiptDetailRequest,
    abortReceiptPreviewRequest,
    clearReceiptPreviewObjectUrl,
    receiptPreviewOpen,
    receiptPreviewRecord,
    receiptPreviewRetryAttempt,
    selectedPreviewReceipt,
  ]);

  const refineReceiptImage = useCallback(async () => {
    if (!receiptPreviewOpen || !receiptPreviewRecord || receiptPreviewKind !== "image" ||
      !receiptPreviewSource || detailReadyRef.current || receiptDetailAbortControllerRef.current) return;
    const requestId = receiptPreviewRequestIdRef.current;
    const controller = new AbortController();
    receiptDetailAbortControllerRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && isMountedRef.current &&
      receiptDetailAbortControllerRef.current === controller && receiptPreviewRequestIdRef.current === requestId;
    setReceiptPreviewRefining(true);
    setReceiptPreviewRefinementError("");
    try {
      const { prepareReceiptImageDetail } = await import("./receipt-preview-image-detail");
      if (!isCurrent()) return;
      await prepareReceiptImageDetail({
        recordId: receiptPreviewRecord.id, receiptId: selectedPreviewReceipt?.id,
        signal: controller.signal, isCurrent,
        publish: (nextUrl) => {
          const previousUrl = receiptPreviewUrlRef.current;
          receiptPreviewUrlRef.current = nextUrl;
          detailReadyRef.current = true;
          setReceiptPreviewSource(nextUrl);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
        },
      });
    } catch (error: unknown) {
      if (isCurrent() && !isAbortError(error)) setReceiptPreviewRefinementError("Clearer preview is unavailable. The current receipt remains visible.");
    } finally {
      if (isCurrent()) {
        receiptDetailAbortControllerRef.current = null;
        setReceiptPreviewRefining(false);
      }
    }
  }, [receiptPreviewKind, receiptPreviewOpen, receiptPreviewRecord, receiptPreviewSource, selectedPreviewReceipt?.id]);

  const handleReceiptImageZoom = useCallback((zoom: number) => {
    if (Number.isFinite(zoom) && zoom > 1) void refineReceiptImage();
  }, [refineReceiptImage]);

  const retryReceiptPreview = useCallback(() => {
    if (!receiptPreviewOpen || !receiptPreviewRecord || receiptPreviewLoading) return;
    setReceiptPreviewRetryAttempt((attempt) => attempt + 1);
  }, [receiptPreviewLoading, receiptPreviewOpen, receiptPreviewRecord]);

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptPreviewRecord || receiptPreviewDownloading) return;
    abortReceiptDownloadRequest();
    const controller = new AbortController();
    receiptDownloadAbortControllerRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && isMountedRef.current && receiptDownloadAbortControllerRef.current === controller;
    setReceiptPreviewDownloading(true);
    try {
      const { downloadReceiptOriginal } = await import("./receipt-preview-image-detail");
      if (!isCurrent()) return;
      await downloadReceiptOriginal({
        recordId: receiptPreviewRecord.id, receiptId: selectedPreviewReceipt?.id,
        signal: controller.signal, isCurrent,
        fallbackFileName: selectedPreviewReceipt?.originalFileName || "",
      });
    } catch (error: unknown) {
      if (isAbortError(error) || !isCurrent()) return;
      toast({
        title: "Download Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (isCurrent()) {
        receiptDownloadAbortControllerRef.current = null;
        setReceiptPreviewDownloading(false);
      }
    }
  }, [
    abortReceiptDownloadRequest,
    receiptPreviewDownloading,
    receiptPreviewRecord,
    selectedPreviewReceipt,
    toast,
  ]);

  const handleReceiptPreviewOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeReceiptPreview();
    } else {
      setReceiptPreviewOpen(true);
    }
  }, [closeReceiptPreview]);

  return {
    handleViewReceipt,
    receiptPreview: {
      open: receiptPreviewOpen,
      record: receiptPreviewRecord,
      receipts: receiptPreviewRecord?.receipts || [],
      selectedReceiptId: selectedPreviewReceipt?.id || null,
      loading: receiptPreviewLoading,
      downloading: receiptPreviewDownloading,
      source: receiptPreviewSource,
      fileName: receiptPreviewFileName,
      error: receiptPreviewError,
      kind: receiptPreviewKind,
      refining: receiptPreviewRefining,
      refinementError: receiptPreviewRefinementError,
      onImageZoom: handleReceiptImageZoom,
      onRetryRefinement: () => void refineReceiptImage(),
      onOpenChange: handleReceiptPreviewOpenChange,
      onSelectReceipt: handleSelectReceipt,
      onDownload: () => void handleDownloadReceipt(),
      onRetry: retryReceiptPreview,
      onClose: closeReceiptPreview,
    },
  };
}
