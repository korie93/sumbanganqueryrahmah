import { CollectionReceiptSecurityError } from "../lib/collection-receipt-security";

const EXTERNAL_SCAN_OPERATIONAL_REASON_CODES = new Set([
  "external-scan-config-invalid",
  "external-scan-command-missing",
  "external-scan-command-invalid",
  "external-scan-file-invalid",
  "external-scan-spawn-failed",
  "external-scan-timeout",
  "external-scan-unexpected-exit",
]);

function toReceiptErrorCode(reasonCode: string): string {
  return `COLLECTION_RECEIPT_${reasonCode.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
}

function resolveCollectionReceiptPublicMessage(error: CollectionReceiptSecurityError): string {
  if (error.reasonCode === "external-scan-rejected") {
    return "Receipt gagal melepasi imbasan keselamatan. Sila semak fail receipt dan cuba semula.";
  }

  if (error.reasonCode === "external-scan-timeout") {
    return "Imbasan keselamatan receipt mengambil masa terlalu lama. Sila cuba Save Collection semula.";
  }

  if (EXTERNAL_SCAN_OPERATIONAL_REASON_CODES.has(error.reasonCode)) {
    return "Imbasan keselamatan receipt belum tersedia. Sila hubungi admin untuk semak konfigurasi scanner.";
  }

  return String(error.message || "Receipt gagal melepasi semakan keselamatan.").slice(0, 300);
}

export function buildCollectionReceiptSecurityErrorResponse(error: unknown): {
  statusCode: number;
  body: {
    ok: false;
    message: string;
    error: {
      code: string;
      message: string;
    };
  };
} | null {
  if (!(error instanceof CollectionReceiptSecurityError)) {
    return null;
  }

  const message = resolveCollectionReceiptPublicMessage(error);
  return {
    statusCode: 400,
    body: {
      ok: false,
      message,
      error: {
        code: toReceiptErrorCode(error.reasonCode),
        message,
      },
    },
  };
}
