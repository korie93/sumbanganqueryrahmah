import { useCallback, useEffect, useRef } from "react";
import {
  inspectCollectionReceiptFiles,
  type CollectionReceiptInspection,
} from "@/lib/api";
import {
  buildCollectionReceiptDraftPatchFromInspection,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";

type ReceiptDraftPatchApplier = (
  draftLocalId: string,
  patch: Partial<CollectionReceiptDraftInput>,
) => void;

type InspectCollectionReceiptParams = {
  file: File;
  draftLocalId: string;
  applyDraftPatch: ReceiptDraftPatchApplier;
  onError?: (error: unknown) => void;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function buildInspectionLoadingPatch(): Partial<CollectionReceiptDraftInput> {
  return {
    extractionStatus: "unprocessed",
    extractionMessage: "Sedang menganalisis resit untuk cadangan jumlah.",
    extractionConfidence: null,
    duplicateSummary: null,
  };
}

function buildInspectionErrorPatch(): Partial<CollectionReceiptDraftInput> {
  return {
    extractionStatus: "error",
    extractionMessage: "Analisis automatik gagal. Sila sahkan jumlah resit secara manual.",
    extractionConfidence: null,
  };
}

export function useCollectionReceiptInspection() {
  const controllersRef = useRef(new Map<string, AbortController>());

  const cancelInspection = useCallback((draftLocalId: string) => {
    const controller = controllersRef.current.get(draftLocalId);
    if (!controller) {
      return;
    }

    controller.abort();
    controllersRef.current.delete(draftLocalId);
  }, []);

  const cancelAllInspections = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      cancelAllInspections();
    };
  }, [cancelAllInspections]);

  const inspectReceipt = useCallback(async ({
    file,
    draftLocalId,
    applyDraftPatch,
    onError,
  }: InspectCollectionReceiptParams) => {
    cancelInspection(draftLocalId);
    applyDraftPatch(draftLocalId, buildInspectionLoadingPatch());

    const controller = new AbortController();
    controllersRef.current.set(draftLocalId, controller);

    try {
      const response = await inspectCollectionReceiptFiles([file], {
        signal: controller.signal,
      });
      const inspection = response.receipts?.[0] as CollectionReceiptInspection | undefined;
      if (!inspection) {
        applyDraftPatch(draftLocalId, {
          extractionStatus: "unavailable",
          extractionMessage: "Tiada cadangan jumlah ditemui pada resit ini. Sila isi jumlah secara manual.",
          extractionConfidence: null,
          duplicateSummary: null,
        });
        return;
      }

      applyDraftPatch(draftLocalId, buildCollectionReceiptDraftPatchFromInspection(inspection));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      applyDraftPatch(draftLocalId, buildInspectionErrorPatch());
      onError?.(error);
    } finally {
      const activeController = controllersRef.current.get(draftLocalId);
      if (activeController === controller) {
        controllersRef.current.delete(draftLocalId);
      }
    }
  }, [cancelInspection]);

  return {
    inspectReceipt,
    cancelInspection,
    cancelAllInspections,
  };
}
