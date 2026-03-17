import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/download";
import {
  fetchCollectionReceiptBlob,
  type CollectionRecord,
} from "@/lib/api";
import { optimizeImageBlobForPreview } from "@/pages/collection-records/preview";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";
import {
  inferReceiptMimeTypeFromName,
  resolveReceiptPreviewKind,
} from "@/pages/collection-records/utils";
import { parseApiError } from "@/pages/collection/utils";

export function useCollectionReceiptPreview() {
  const { toast } = useToast();
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const receiptPreviewRequestIdRef = useRef(0);
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
        receiptPath: receiptPreviewRecord?.receiptFile || "",
      }),
    [
      receiptPreviewFileName,
      receiptPreviewMimeType,
      receiptPreviewRecord?.receiptFile,
      selectedPreviewReceipt?.originalFileName,
      selectedPreviewReceipt?.originalMimeType,
    ],
  );

  const clearReceiptPreviewObjectUrl = useCallback(() => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
  }, []);

  const closeReceiptPreview = useCallback(() => {
    receiptPreviewRequestIdRef.current += 1;
    clearReceiptPreviewObjectUrl();
    setReceiptPreviewOpen(false);
    setReceiptPreviewRecord(null);
    setReceiptPreviewReceiptId(null);
    setReceiptPreviewLoading(false);
    setReceiptPreviewDownloading(false);
    setReceiptPreviewSource("");
    setReceiptPreviewMimeType("");
    setReceiptPreviewFileName("");
    setReceiptPreviewError("");
  }, [clearReceiptPreviewObjectUrl]);

  const handleViewReceipt = useCallback((record: CollectionRecord, receiptId?: string) => {
    const nextReceiptId = receiptId || record.receipts?.[0]?.id || null;
    setReceiptPreviewRecord(record);
    setReceiptPreviewReceiptId(nextReceiptId);
    setReceiptPreviewOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearReceiptPreviewObjectUrl();
    };
  }, [clearReceiptPreviewObjectUrl]);

  useEffect(() => {
    if (!receiptPreviewOpen || !receiptPreviewRecord) return;

    const activeRequestId = ++receiptPreviewRequestIdRef.current;
    const selectedReceiptId = selectedPreviewReceipt?.id || null;

    const loadPreview = async () => {
      setReceiptPreviewLoading(true);
      setReceiptPreviewError("");
      clearReceiptPreviewObjectUrl();

      try {
        const { blob, mimeType, fileName } = await fetchCollectionReceiptBlob(
          receiptPreviewRecord.id,
          "view",
          selectedReceiptId,
        );
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }

        const effectiveMimeType =
          mimeType ||
          selectedPreviewReceipt?.originalMimeType ||
          inferReceiptMimeTypeFromName(fileName || "");
        const previewBlob =
          effectiveMimeType.startsWith("image/")
            ? await optimizeImageBlobForPreview(blob)
            : blob;
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }

        const objectUrl = URL.createObjectURL(previewBlob);
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        receiptPreviewUrlRef.current = objectUrl;
        setReceiptPreviewSource(objectUrl);
        setReceiptPreviewMimeType(
          previewBlob.type || effectiveMimeType || "application/octet-stream",
        );
        setReceiptPreviewFileName(
          fileName ||
            selectedPreviewReceipt?.originalFileName ||
            receiptPreviewRecord.receiptFile ||
            "",
        );
      } catch (error: unknown) {
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }
        setReceiptPreviewSource("");
        setReceiptPreviewMimeType(
          selectedPreviewReceipt?.originalMimeType ||
            inferReceiptMimeTypeFromName(selectedPreviewReceipt?.originalFileName || ""),
        );
        setReceiptPreviewFileName(
          selectedPreviewReceipt?.originalFileName || receiptPreviewRecord.receiptFile || "",
        );
        setReceiptPreviewError(parseApiError(error));
      } finally {
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }
        setReceiptPreviewLoading(false);
      }
    };

    void loadPreview();
  }, [
    clearReceiptPreviewObjectUrl,
    receiptPreviewOpen,
    receiptPreviewRecord,
    selectedPreviewReceipt,
  ]);

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptPreviewRecord || receiptPreviewDownloading) return;
    setReceiptPreviewDownloading(true);
    try {
      const { blob, fileName } = await fetchCollectionReceiptBlob(
        receiptPreviewRecord.id,
        "download",
        selectedPreviewReceipt?.id,
      );
      downloadBlob(
        blob,
        fileName ||
          selectedPreviewReceipt?.originalFileName ||
          receiptPreviewRecord.receiptFile ||
          "receipt",
      );
    } catch (error: unknown) {
      toast({
        title: "Download Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setReceiptPreviewDownloading(false);
    }
  }, [receiptPreviewDownloading, receiptPreviewRecord, selectedPreviewReceipt, toast]);

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
      onOpenChange: handleReceiptPreviewOpenChange,
      onSelectReceipt: setReceiptPreviewReceiptId,
      onDownload: () => void handleDownloadReceipt(),
      onClose: closeReceiptPreview,
    },
  };
}
