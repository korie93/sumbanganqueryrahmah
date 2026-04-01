import {
  createCollectionReceiptSecurityError,
  type CollectionReceiptFileType,
} from "./collection-receipt-security-shared";

const DANGEROUS_PDF_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\/javascript\b/i, reason: "contains embedded JavaScript" },
  { pattern: /\/openaction\b/i, reason: "contains automatic open actions" },
  { pattern: /\/aa\b/i, reason: "contains additional automatic actions" },
  { pattern: /\/launch\b/i, reason: "contains launch actions" },
  { pattern: /\/richmedia\b/i, reason: "contains rich media content" },
  { pattern: /\/embeddedfile\b/i, reason: "contains embedded files" },
  { pattern: /\/submitform\b/i, reason: "contains submit-form actions" },
  { pattern: /\/importdata\b/i, reason: "contains import-data actions" },
];

export function validatePdfCollectionReceiptBuffer(buffer: Buffer) {
  if (buffer.length < 8 || buffer.toString("latin1", 0, 5) !== "%PDF-") {
    throw createCollectionReceiptSecurityError("Receipt PDF header is invalid.", "pdf-header-invalid");
  }

  const source = buffer.toString("latin1");
  const loweredSource = source.toLowerCase();
  const eofIndex = loweredSource.lastIndexOf("%%eof");
  if (eofIndex < 0) {
    throw createCollectionReceiptSecurityError("Receipt PDF appears incomplete.", "pdf-eof-missing");
  }

  const trailingSource = source.slice(eofIndex + 5);
  if (/\S/.test(trailingSource)) {
    throw createCollectionReceiptSecurityError(
      "Receipt PDF contains trailing data after the EOF marker.",
      "pdf-trailing-data",
    );
  }

  for (const rule of DANGEROUS_PDF_PATTERNS) {
    if (rule.pattern.test(source)) {
      throw createCollectionReceiptSecurityError(
        `Receipt PDF ${rule.reason}.`,
        "pdf-dangerous-content",
      );
    }
  }
}

export function detectCollectionReceiptSignature(buffer: Buffer): CollectionReceiptFileType | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  if (
    buffer.length >= 5
    && buffer[0] === 0x25
    && buffer[1] === 0x50
    && buffer[2] === 0x44
    && buffer[3] === 0x46
    && buffer[4] === 0x2d
  ) {
    return "pdf";
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return "jpg";
  }

  if (
    buffer.length >= 12
    && buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}
