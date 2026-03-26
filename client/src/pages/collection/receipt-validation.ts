import type {
  CollectionReceiptMetadata,
  CollectionReceiptValidationStatus,
  CollectionRecordReceipt,
} from "@/lib/api";

export type CollectionReceiptDraftInput = {
  receiptId?: string | null;
  receiptAmount: string;
  extractedAmount?: string | null;
  extractionConfidence?: number | null;
  receiptDate: string;
  receiptReference: string;
  fileHash?: string | null;
};

export type CollectionReceiptValidationPreview = {
  receiptCount: number;
  receiptTotalAmountCents: number;
  receiptTotalAmountLabel: string;
  totalPaidCents: number | null;
  totalPaidLabel: string;
  status: CollectionReceiptValidationStatus;
  message: string;
  requiresOverride: boolean;
  blockedForRegularUsers: boolean;
};

const CURRENCY_INPUT_REGEX = /^\d+(?:\.\d{1,2})?$/;

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

export function createEmptyCollectionReceiptDraft(): CollectionReceiptDraftInput {
  return {
    receiptId: null,
    receiptAmount: "",
    extractedAmount: null,
    extractionConfidence: null,
    receiptDate: "",
    receiptReference: "",
    fileHash: null,
  };
}

export function createCollectionReceiptDraftFromReceipt(
  receipt: CollectionRecordReceipt,
): CollectionReceiptDraftInput {
  return {
    receiptId: receipt.id,
    receiptAmount: receipt.receiptAmount || "",
    extractedAmount: receipt.extractedAmount,
    extractionConfidence: receipt.extractionConfidence,
    receiptDate: receipt.receiptDate || "",
    receiptReference: receipt.receiptReference || "",
    fileHash: receipt.fileHash,
  };
}

export function buildCollectionReceiptMetadataPayload(
  draft: CollectionReceiptDraftInput,
): CollectionReceiptMetadata {
  return {
    receiptId: draft.receiptId || undefined,
    receiptAmount: draft.receiptAmount.trim() || null,
    extractedAmount: draft.extractedAmount || null,
    extractionConfidence:
      draft.extractionConfidence === undefined || draft.extractionConfidence === null
        ? null
        : draft.extractionConfidence,
    receiptDate: draft.receiptDate.trim() || null,
    receiptReference: draft.receiptReference.trim() || null,
    fileHash: draft.fileHash || null,
  };
}

export function buildCollectionReceiptValidationPreview(params: {
  totalPaid: string | number;
  receipts: CollectionReceiptDraftInput[];
}): CollectionReceiptValidationPreview {
  const totalPaidCents = parseCollectionAmountInputToCents(params.totalPaid, { allowZero: true });
  const receipts = Array.isArray(params.receipts) ? params.receipts : [];
  const receiptCount = receipts.length;

  if (receiptCount === 0) {
    return {
      receiptCount,
      receiptTotalAmountCents: 0,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(0),
      totalPaidCents,
      totalPaidLabel: totalPaidCents === null ? "Belum sah" : formatCollectionCurrencyLabelFromCents(totalPaidCents),
      status: "needs_review",
      message: "Tiada resit dilampirkan untuk semakan jumlah.",
      requiresOverride: false,
      blockedForRegularUsers: false,
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

  if (missingAmountCount > 0 || totalPaidCents === null) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
      totalPaidCents,
      totalPaidLabel,
      status: "needs_review",
      message:
        totalPaidCents === null
          ? "Jumlah bayaran utama belum sah. Sahkan jumlah bayaran dan semua jumlah resit sebelum simpan."
          : "Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan.",
      requiresOverride: true,
      blockedForRegularUsers: true,
    };
  }

  if (receiptTotalAmountCents !== totalPaidCents) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
      totalPaidCents,
      totalPaidLabel,
      status: "mismatch",
      message: `Jumlah resit ${formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents)} tidak sepadan dengan jumlah bayaran ${formatCollectionCurrencyLabelFromCents(totalPaidCents)}.`,
      requiresOverride: true,
      blockedForRegularUsers: true,
    };
  }

  return {
    receiptCount,
    receiptTotalAmountCents,
    receiptTotalAmountLabel: formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents),
    totalPaidCents,
    totalPaidLabel,
    status: "matched",
    message: "Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan.",
    requiresOverride: false,
    blockedForRegularUsers: false,
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
