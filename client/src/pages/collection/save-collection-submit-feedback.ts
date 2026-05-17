import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";

export type SaveCollectionSubmitFailureKind = "validation" | "request";

export type SaveCollectionSubmitFailure = {
  kind: SaveCollectionSubmitFailureKind;
  title: string;
  message: string;
  helperText: string;
  requestId: string | null;
  receiptCount: number;
  canRetry: boolean;
};

const MALWARE_SCAN_TIMEOUT_PATTERN = /malware scan failed|timed out|external malware scan/i;

function normalizeReceiptCount(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0);
}

export function buildSaveCollectionValidationFailure(params: {
  message: string;
  receiptCount: number;
}): SaveCollectionSubmitFailure {
  return {
    kind: "validation",
    title: "Semak maklumat sebelum simpan",
    message: String(params.message || "Maklumat collection belum lengkap.").trim(),
    helperText: "Betulkan maklumat yang ditanda, kemudian cuba Save Collection semula.",
    requestId: null,
    receiptCount: normalizeReceiptCount(params.receiptCount),
    canRetry: false,
  };
}

export function buildSaveCollectionRequestFailure(params: {
  error: unknown;
  receiptCount: number;
  fallbackMessage?: string;
}): SaveCollectionSubmitFailure {
  const details = parseCollectionApiErrorDetails(params.error);
  const parsedMessage = details.message.trim();
  const message = parsedMessage || params.fallbackMessage || "Collection gagal disimpan.";
  const isReceiptScanTimeout = MALWARE_SCAN_TIMEOUT_PATTERN.test(message);

  return {
    kind: "request",
    title: isReceiptScanTimeout ? "Receipt belum berjaya diimbas" : "Collection gagal disimpan",
    message: isReceiptScanTimeout
      ? "Imbasan keselamatan receipt mengambil masa terlalu lama. Rekod belum disimpan."
      : message,
    helperText: isReceiptScanTimeout
      ? "Klik Save Collection semula untuk cuba lagi. Jika masih gagal, cuba kecilkan saiz fail receipt atau hubungi admin."
      : "Semak mesej ini, pastikan sambungan stabil, kemudian cuba Save Collection semula.",
    requestId: details.requestId,
    receiptCount: normalizeReceiptCount(params.receiptCount),
    canRetry: true,
  };
}
