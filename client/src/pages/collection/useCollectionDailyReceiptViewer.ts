import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCollectionReceiptBlob,
  type CollectionRecord,
} from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import type { ReceiptPreviewDialogProps } from "@/pages/collection-records/ReceiptPreviewDialog";
import { optimizeImageBlobForPreview } from "@/pages/collection-records/preview";
import { inferReceiptMimeTypeFromName, resolveReceiptPreviewKind } from "@/pages/collection-records/utils";
import { parseApiError } from "@/pages/collection/utils";
import {
  buildCollectionDailyReceiptKey,
  type CollectionDailyDayRecord,
  isAbortError,
  mapDailyRecordToCollectionRecord,
} from "./collection-daily-receipt-viewer-utils";

export { buildCollectionDailyReceiptKey } from "./collection-daily-receipt-viewer-utils";

type UseCollectionDailyReceiptViewerResult = {
  loadingReceiptKey: string | null;
  openReceiptViewer: (record: CollectionDailyDayRecord, receiptId?: string) => void;
  closeReceiptViewer: () => void;
  receiptPreviewDialogProps: ReceiptPreviewDialogProps;
};

export function useCollectionDailyReceiptViewer(): UseCollectionDailyReceiptViewerResult {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const previewRequestIdRef = useRef(0);
  const previewObjectUrlRef = useRef<string | null>(null);
  const previewAbortControllerRef = useRef<AbortController | null>(null);
  const downloadAbortControllerRef = useRef<AbortController | null>(null);

  const [loadingReceiptKey, setLoadingReceiptKey] = useState<string | null>(null);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewRecord, setReceiptPreviewRecord] = useState<CollectionRecord | null>(null);
  const [receiptPreviewReceiptId, setReceiptPreviewReceiptId] = useState<string | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewDownloading, setReceiptPreviewDownloading] = useState(false);
  const [receiptPreviewSource, setReceiptPreviewSource] = useState("");
  const [receiptPreviewMimeType, setReceiptPreviewMimeType] = useState("");
  const [receiptPreviewFileName, setReceiptPreviewFileName] = useState("");
  const [receiptPreviewError, setReceiptPreviewError] = useState("");

  const selectedPreviewReceipt = useMemo(() => {
    if (!receiptPreviewRecord) return null;
    if (!receiptPreviewReceiptId) return receiptPreviewRecord.receipts?.[0] || null;
    return (
      receiptPreviewRecord.receipts?.find((receipt) => receipt.id === receiptPreviewReceiptId) ||
      receiptPreviewRecord.receipts?.[0] ||
      null
    );
  }, [receiptPreviewReceiptId, receiptPreviewRecord]);

  const clearPreviewObjectUrl = useCallback(() => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  }, []);

  const abortPreviewRequest = useCallback(() => {
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
      previewAbortControllerRef.current = null;
    }
  }, []);

  const abortDownloadRequest = useCallback(() => {
    if (downloadAbortControllerRef.current) {
      downloadAbortControllerRef.current.abort();
      downloadAbortControllerRef.current = null;
    }
  }, []);

  const closeReceiptViewer = useCallback(() => {
    previewRequestIdRef.current += 1;
    abortPreviewRequest();
    abortDownloadRequest();
    clearPreviewObjectUrl();
    setLoadingReceiptKey(null);
    setReceiptPreviewOpen(false);
    setReceiptPreviewRecord(null);
    setReceiptPreviewReceiptId(null);
    setReceiptPreviewLoading(false);
    setReceiptPreviewDownloading(false);
    setReceiptPreviewSource("");
    setReceiptPreviewMimeType("");
    setReceiptPreviewFileName("");
    setReceiptPreviewError("");
  }, [abortDownloadRequest, abortPreviewRequest, clearPreviewObjectUrl]);

  const openReceiptViewer = useCallback((record: CollectionDailyDayRecord, receiptId?: string) => {
    const mappedRecord = mapDailyRecordToCollectionRecord(record);
    const nextReceiptId = receiptId || mappedRecord.receipts?.[0]?.id || null;
    setLoadingReceiptKey(buildCollectionDailyReceiptKey(record.id, nextReceiptId));
    setReceiptPreviewRecord(mappedRecord);
    setReceiptPreviewReceiptId(nextReceiptId);
    setReceiptPreviewOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortPreviewRequest();
      abortDownloadRequest();
      clearPreviewObjectUrl();
    };
  }, [abortDownloadRequest, abortPreviewRequest, clearPreviewObjectUrl]);

  useEffect(() => {
    if (!receiptPreviewOpen || !receiptPreviewRecord) return;

    const activeRequestId = ++previewRequestIdRef.current;
    const selectedReceiptId = selectedPreviewReceipt?.id || null;
    const activeReceiptKey = buildCollectionDailyReceiptKey(receiptPreviewRecord.id, selectedReceiptId);
    setLoadingReceiptKey(activeReceiptKey);
    abortPreviewRequest();
    const controller = new AbortController();
    previewAbortControllerRef.current = controller;

    const loadPreview = async () => {
      setReceiptPreviewLoading(true);
      setReceiptPreviewError("");
      setReceiptPreviewSource("");
      clearPreviewObjectUrl();

      try {
        const { blob, mimeType, fileName } = await fetchCollectionReceiptBlob(
          receiptPreviewRecord.id,
          "view",
          selectedReceiptId,
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          activeRequestId !== previewRequestIdRef.current
        ) {
          return;
        }

        const effectiveMimeType =
          mimeType ||
          selectedPreviewReceipt?.originalMimeType ||
          inferReceiptMimeTypeFromName(fileName || "");
        const previewBlob =
          effectiveMimeType.startsWith("image/")
            ? await optimizeImageBlobForPreview(blob, { signal: controller.signal })
            : blob;
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          activeRequestId !== previewRequestIdRef.current
        ) {
          return;
        }

        const objectUrl = URL.createObjectURL(previewBlob);
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          activeRequestId !== previewRequestIdRef.current
        ) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        previewObjectUrlRef.current = objectUrl;
        setReceiptPreviewSource(objectUrl);
        setReceiptPreviewMimeType(
          previewBlob.type || effectiveMimeType || "application/octet-stream",
        );
        setReceiptPreviewFileName(
          fileName ||
            selectedPreviewReceipt?.originalFileName ||
            "",
        );
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          isAbortError(error) ||
          !isMountedRef.current ||
          activeRequestId !== previewRequestIdRef.current
        ) {
          return;
        }
        setReceiptPreviewSource("");
        setReceiptPreviewMimeType(
          selectedPreviewReceipt?.originalMimeType ||
            inferReceiptMimeTypeFromName(selectedPreviewReceipt?.originalFileName || ""),
        );
        setReceiptPreviewFileName(
          selectedPreviewReceipt?.originalFileName || "",
        );
        setReceiptPreviewError(parseApiError(error));
      } finally {
        if (previewAbortControllerRef.current === controller) {
          previewAbortControllerRef.current = null;
        }
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          activeRequestId !== previewRequestIdRef.current
        ) {
          return;
        }
        setReceiptPreviewLoading(false);
        setLoadingReceiptKey(null);
      }
    };

    void loadPreview();
  }, [
    abortPreviewRequest,
    clearPreviewObjectUrl,
    receiptPreviewOpen,
    receiptPreviewRecord,
    selectedPreviewReceipt,
  ]);

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptPreviewRecord || receiptPreviewDownloading) return;
    abortDownloadRequest();
    const controller = new AbortController();
    downloadAbortControllerRef.current = controller;
    setReceiptPreviewDownloading(true);
    try {
      const { blob, fileName } = await fetchCollectionReceiptBlob(
        receiptPreviewRecord.id,
        "download",
        selectedPreviewReceipt?.id,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      downloadBlob(
        blob,
        fileName ||
          selectedPreviewReceipt?.originalFileName ||
          "receipt",
      );
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return;
      }
      toast({
        title: "Download Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (downloadAbortControllerRef.current === controller) {
        downloadAbortControllerRef.current = null;
      }
      if (!isMountedRef.current) return;
      setReceiptPreviewDownloading(false);
    }
  }, [
    abortDownloadRequest,
    receiptPreviewDownloading,
    receiptPreviewRecord,
    selectedPreviewReceipt,
    toast,
  ]);

  const receiptPreviewKind = useMemo(
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

  const handleReceiptPreviewOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeReceiptViewer();
      return;
    }
    setReceiptPreviewOpen(true);
  }, [closeReceiptViewer]);

  return {
    loadingReceiptKey,
    openReceiptViewer,
    closeReceiptViewer,
    receiptPreviewDialogProps: {
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
      onOpenChange: handleReceiptPreviewOpenChange,
      onSelectReceipt: setReceiptPreviewReceiptId,
      onDownload: () => void handleDownloadReceipt(),
      onClose: closeReceiptViewer,
    },
  };
}
