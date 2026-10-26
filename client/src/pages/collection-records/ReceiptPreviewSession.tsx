import { useCallback, useLayoutEffect } from "react";
import type { CollectionRecord } from "@/lib/api";
import { ReceiptPreviewDialog } from "@/pages/collection-records/ReceiptPreviewDialog";
import { useCollectionReceiptPreview } from "@/pages/collection-records/useCollectionReceiptPreview";

export type ReceiptPreviewRequest = {
  record: CollectionRecord;
  receiptId?: string;
};

export type ReceiptPreviewSessionProps = {
  request: ReceiptPreviewRequest;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export function ReceiptPreviewSession({
  request,
  onClose,
  onCloseAutoFocus,
}: ReceiptPreviewSessionProps) {
  const { handleViewReceipt, receiptPreview } = useCollectionReceiptPreview();

  useLayoutEffect(() => {
    handleViewReceipt(request.record, request.receiptId);
  }, [handleViewReceipt, request]);

  const closePreview = useCallback(() => {
    receiptPreview.onClose();
    onClose();
  }, [onClose, receiptPreview.onClose]);
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) closePreview();
    else receiptPreview.onOpenChange(open);
  }, [closePreview, receiptPreview.onOpenChange]);

  return (
    <ReceiptPreviewDialog
      {...receiptPreview}
      onOpenChange={handleOpenChange}
      onClose={closePreview}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
    />
  );
}
