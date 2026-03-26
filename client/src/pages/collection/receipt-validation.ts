import type {
  CollectionReceiptDuplicateSummary,
  CollectionReceiptExtractionStatus,
  CollectionReceiptInspection,
  CollectionReceiptMetadata,
  CollectionReceiptValidationStatus,
  CollectionRecordReceipt,
} from "@/lib/api";

export type CollectionReceiptDraftInput = {
  draftLocalId: string;
  receiptId?: string | null;
  receiptAmount: string;
  extractedAmount?: string | null;
  extractionStatus?: CollectionReceiptExtractionStatus | null;
  extractionMessage?: string | null;
  extractionConfidence?: number | null;
  receiptDate: string;
  receiptReference: string;
  fileHash?: string | null;
  duplicateSummary?: CollectionReceiptDuplicateSummary | null;
};

export type CollectionReceiptValidationPreview = {
  receiptCount: number;
  receiptTotalAmountCents: number;
  receiptTotalAmountLabel: string;
  totalPaidCents: number | null;
  totalPaidLabel: string;
  differenceAmountCents: number | null;
  differenceAmountLabel: string;
  status: CollectionReceiptValidationStatus;
  message: string;
  requiresOverride: boolean;
  blockedForRegularUsers: boolean;
  duplicateWarningCount: number;
};

const CURRENCY_INPUT_REGEX = /^\d+(?:\.\d{1,2})?$/;

function createReceiptDraftLocalId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `receipt-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeExtractionStatus(
  value: unknown,
): CollectionReceiptExtractionStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "suggested") return "suggested";
  if (normalized === "ambiguous") return "ambiguous";
  if (normalized === "unavailable") return "unavailable";
  if (normalized === "error") return "error";
  return "unprocessed";
}

function receiptDraftNeedsReview(receipt: CollectionReceiptDraftInput): boolean {
  const extractionStatus = normalizeExtractionStatus(receipt.extractionStatus);
  if (extractionStatus === "ambiguous" || extractionStatus === "error") {
    return true;
  }

  const extractedAmountCents = parseCollectionAmountInputToCents(receipt.extractedAmount, {
    allowEmpty: true,
    allowZero: true,
  });
  const confirmedAmountCents = parseCollectionAmountInputToCents(receipt.receiptAmount, {
    allowEmpty: true,
    allowZero: true,
  });
  if (
    extractionStatus === "suggested"
    && extractedAmountCents !== null
    && confirmedAmountCents !== null
    && extractedAmountCents !== confirmedAmountCents
    && Number(receipt.extractionConfidence || 0) >= 0.85
  ) {
    return true;
  }

  return false;
}

export function parseCollectionAmountInputToCents(
  value: unknown,
  options?: {
    allowEmpty?: boolean;
    allowZero?: boolean;
  },
): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return options?.allowEmpty ? null : null;
  }

  const normalized = raw.replace(/,/g, "");
  if (!CURRENCY_INPUT_REGEX.test(normalized)) {
    return null;
  }

  const [wholeRaw, fractionRaw = ""] = normalized.split(".");
  const whole = Number.parseInt(wholeRaw, 10);
  const fraction = Number.parseInt(`${fractionRaw}00`.slice(0, 2), 10);
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) {
    return null;
  }

  const cents = (whole * 100) + fraction;
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  if (!options?.allowZero && cents <= 0) {
    return null;
  }
  if (options?.allowZero && cents < 0) {
    return null;
  }

  return cents;
}

export function formatCollectionAmountFromCents(value: number | null | undefined): string {
  const cents = Number.isFinite(value) ? Math.max(0, Math.trunc(value || 0)) : 0;
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function formatCollectionCurrencyLabelFromCents(value: number | null | undefined): string {
  const amount = Number.parseFloat(formatCollectionAmountFromCents(value));
  return amount.toLocaleString("en-MY", {
    style: "currency",
    currency: "MYR",
  });
}

export function createEmptyCollectionReceiptDraft(
  overrides?: Partial<CollectionReceiptDraftInput>,
): CollectionReceiptDraftInput {
  return {
    draftLocalId: overrides?.draftLocalId || createReceiptDraftLocalId(),
    receiptId: overrides?.receiptId ?? null,
    receiptAmount: overrides?.receiptAmount || "",
    extractedAmount: overrides?.extractedAmount ?? null,
    extractionStatus: normalizeExtractionStatus(overrides?.extractionStatus),
    extractionMessage: overrides?.extractionMessage ?? null,
    extractionConfidence: overrides?.extractionConfidence ?? null,
    receiptDate: overrides?.receiptDate || "",
    receiptReference: overrides?.receiptReference || "",
    fileHash: overrides?.fileHash ?? null,
    duplicateSummary: overrides?.duplicateSummary ?? null,
  };
}

export function createCollectionReceiptDraftFromReceipt(
  receipt: CollectionRecordReceipt,
): CollectionReceiptDraftInput {
  return createEmptyCollectionReceiptDraft({
    draftLocalId: receipt.id,
    receiptId: receipt.id,
    receiptAmount: receipt.receiptAmount || "",
    extractedAmount: receipt.extractedAmount,
    extractionStatus: receipt.extractionStatus,
    extractionConfidence: receipt.extractionConfidence,
    receiptDate: receipt.receiptDate || "",
    receiptReference: receipt.receiptReference || "",
    fileHash: receipt.fileHash,
  });
}

export function buildCollectionReceiptMetadataPayload(
  draft: CollectionReceiptDraftInput,
): CollectionReceiptMetadata {
  return {
    receiptId: draft.receiptId || undefined,
    receiptAmount: draft.receiptAmount.trim() || null,
    extractedAmount: draft.extractedAmount || null,
    extractionStatus: normalizeExtractionStatus(draft.extractionStatus),
    extractionConfidence:
      draft.extractionConfidence === undefined || draft.extractionConfidence === null
        ? null
        : draft.extractionConfidence,
    receiptDate: draft.receiptDate.trim() || null,
    receiptReference: draft.receiptReference.trim() || null,
    fileHash: draft.fileHash || null,
  };
}

export function buildCollectionReceiptDraftPatchFromInspection(
  inspection: CollectionReceiptInspection,
): Partial<CollectionReceiptDraftInput> {
  return {
    extractedAmount: inspection.extractedAmount || null,
    extractionStatus: normalizeExtractionStatus(inspection.extractionStatus),
    extractionMessage: inspection.extractionMessage || null,
    extractionConfidence:
      inspection.extractionConfidence === undefined || inspection.extractionConfidence === null
        ? null
        : inspection.extractionConfidence,
    fileHash: inspection.fileHash || null,
    duplicateSummary: inspection.duplicateSummary || null,
  };
}

export function buildCollectionReceiptValidationPreview(params: {
  totalPaid: string | number;
  receipts: CollectionReceiptDraftInput[];
}): CollectionReceiptValidationPreview {
  const totalPaidCents = parseCollectionAmountInputToCents(params.totalPaid, { allowZero: true });
  const receipts = Array.isArray(params.receipts) ? params.receipts : [];
  const receiptCount = receipts.length;
  const duplicateWarningCount = receipts.filter((receipt) => Number(receipt.duplicateSummary?.matchCount || 0) > 0).length;

  if (receiptCount === 0) {
    return {
      receiptCount,
      receiptTotalAmountCents: 0,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(0),
      totalPaidCents,
      totalPaidLabel: totalPaidCents === null ? "Belum sah" : formatCollectionCurrencyLabelFromCents(totalPaidCents),
      differenceAmountCents: totalPaidCents === null ? null : 0 - totalPaidCents,
      differenceAmountLabel:
        totalPaidCents === null
          ? "Belum sah"
          : formatCollectionCurrencyLabelFromCents(Math.abs(0 - totalPaidCents)),
      status: "unverified",
      message: "Tiada resit dilampirkan untuk semakan jumlah.",
      requiresOverride: false,
      blockedForRegularUsers: false,
      duplicateWarningCount,
    };
  }

  const receiptAmountCents = receipts.map((receipt) =>
    parseCollectionAmountInputToCents(receipt.receiptAmount, { allowZero: true, allowEmpty: true }));
  const missingAmountCount = receiptAmountCents.filter((value) => value === null).length;
  const receiptTotalAmountCents = receiptAmountCents.reduce<number>(
    (sum, value) => sum + (value === null ? 0 : value),
    0,
  );
  const totalPaidLabel =
    totalPaidCents === null
      ? "Belum sah"
      : formatCollectionCurrencyLabelFromCents(totalPaidCents);
  const differenceAmountCents =
    totalPaidCents === null
      ? null
      : receiptTotalAmountCents - totalPaidCents;
  const differenceAmountLabel =
    differenceAmountCents === null
      ? "Belum sah"
      : formatCollectionCurrencyLabelFromCents(Math.abs(differenceAmountCents));

  if (missingAmountCount > 0 || totalPaidCents === null) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
      totalPaidCents,
      totalPaidLabel,
      differenceAmountCents,
      differenceAmountLabel,
      status: "unverified",
      message:
        totalPaidCents === null
          ? "Jumlah bayaran utama belum sah. Sahkan jumlah bayaran dan semua jumlah resit sebelum simpan."
          : "Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan.",
      requiresOverride: true,
      blockedForRegularUsers: true,
      duplicateWarningCount,
    };
  }

  if (receiptTotalAmountCents < totalPaidCents) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
      totalPaidCents,
      totalPaidLabel,
      differenceAmountCents,
      differenceAmountLabel,
      status: "underpaid",
      message: `Jumlah resit ${formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents)} lebih rendah daripada jumlah bayaran ${formatCollectionCurrencyLabelFromCents(totalPaidCents)}.`,
      requiresOverride: true,
      blockedForRegularUsers: true,
      duplicateWarningCount,
    };
  }

  if (receiptTotalAmountCents > totalPaidCents) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
      totalPaidCents,
      totalPaidLabel,
      differenceAmountCents,
      differenceAmountLabel,
      status: "overpaid",
      message: `Jumlah resit ${formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents)} melebihi jumlah bayaran ${formatCollectionCurrencyLabelFromCents(totalPaidCents)}.`,
      requiresOverride: true,
      blockedForRegularUsers: true,
      duplicateWarningCount,
    };
  }

  if (receipts.some((receipt) => receiptDraftNeedsReview(receipt))) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
      totalPaidCents,
      totalPaidLabel,
      differenceAmountCents,
      differenceAmountLabel,
      status: "needs_review",
      message: "Jumlah resit sepadan, tetapi ada cadangan OCR/PDF yang memerlukan semakan lanjut.",
      requiresOverride: false,
      blockedForRegularUsers: false,
      duplicateWarningCount,
    };
  }

  return {
    receiptCount,
    receiptTotalAmountCents,
    receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
    totalPaidCents,
    totalPaidLabel,
    differenceAmountCents,
    differenceAmountLabel,
    status: "matched",
    message: "Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan.",
    requiresOverride: false,
    blockedForRegularUsers: false,
    duplicateWarningCount,
  };
}

export function shouldBlockCollectionReceiptSave(params: {
  validation: CollectionReceiptValidationPreview;
  role: string;
  overrideReason?: string | null;
}): boolean {
  if (!params.validation.requiresOverride) {
    return false;
  }

  const normalizedRole = String(params.role || "").trim().toLowerCase();
  if (normalizedRole === "admin" || normalizedRole === "superuser") {
    return !String(params.overrideReason || "").trim();
  }

  return params.validation.blockedForRegularUsers;
}
