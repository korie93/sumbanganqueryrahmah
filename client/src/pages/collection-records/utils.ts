import type { ReceiptPreviewKind } from "@/pages/collection-records/types";

export function fitCollectionRecordText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function inferReceiptMimeTypeFromName(fileName: string): string {
  const normalized = String(fileName || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "";
}

export function resolveReceiptPreviewKind(input: {
  mimeType?: string;
  fileName?: string;
  receiptPath?: string;
}): ReceiptPreviewKind {
  const mimeType = String(input.mimeType || "").toLowerCase();
  const fileName = String(input.fileName || "");
  const receiptPath = String(input.receiptPath || "");
  const inferredMime =
    inferReceiptMimeTypeFromName(fileName) || inferReceiptMimeTypeFromName(receiptPath);
  const effectiveMime = mimeType || inferredMime;

  if (effectiveMime.includes("pdf")) return "pdf";
  if (effectiveMime.startsWith("image/")) return "image";
  return "unsupported";
}

export function shouldRenderInlineReceiptPdfPreview(input: {
  kind: ReceiptPreviewKind;
  isMobile: boolean;
}): boolean {
  return input.kind === "pdf" && !input.isMobile;
}

export function toCollectionDisplayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
