import {
  isValidCollectionDate,
  normalizeCollectionText,
} from "../../routes/collection.validation";

export type CollectionReceiptValidationStatus = "matched" | "mismatch" | "needs_review";
export type CollectionReceiptValidationBlockingReason = "mismatch" | "missing_amounts" | null;

export type CollectionReceiptValidationDraft = {
  receiptId?: string | null;
  fileHash?: string | null;
  originalFileName?: string | null;
  receiptAmountCents?: number | null;
  extractedAmountCents?: number | null;
  extractionConfidence?: number | null;
  receiptDate?: string | null;
  receiptReference?: string | null;
};

export type CollectionReceiptValidationResult = {
  receiptCount: number;
  receiptTotalAmountCents: number;
  status: CollectionReceiptValidationStatus;
  message: string;
  blockingReason: CollectionReceiptValidationBlockingReason;
  requiresOverride: boolean;
};

const CURRENCY_INPUT_REGEX = /^\d+(?:\.\d{1,2})?$/;

export function normalizeCollectionReceiptReference(value: unknown): string | null {
  const normalized = normalizeCollectionText(value);
  return normalized ? normalized.slice(0, 140) : null;
}

export function normalizeCollectionReceiptDate(value: unknown): string | null {
  const normalized = normalizeCollectionText(value);
  if (!normalized) {
    return null;
  }
  if (!isValidCollectionDate(normalized)) {
    return null;
  }
  return normalized;
}

export function parseCollectionAmountToCents(
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

  const [wholePartRaw, fractionPartRaw = ""] = normalized.split(".");
  const wholePart = Number.parseInt(wholePartRaw, 10);
  if (!Number.isSafeInteger(wholePart) || wholePart < 0) {
    return null;
  }
  const fractionPart = Number.parseInt(`${fractionPartRaw}00`.slice(0, 2), 10);
  if (!Number.isSafeInteger(fractionPart) || fractionPart < 0) {
    return null;
  }

  const cents = (wholePart * 100) + fractionPart;
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

function parseStoredCentsValue(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  const normalized = String(value).trim();
  if (!normalized || !/^-?\d+$/.test(normalized)) {
    return null;
  }

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

export function formatCollectionAmountFromCents(value: unknown): string {
  const cents = parseStoredCentsValue(value) ?? 0n;
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

export function formatCollectionCurrencyLabelFromCents(value: unknown): string {
  const amount = Number.parseFloat(formatCollectionAmountFromCents(value));
  return amount.toLocaleString("en-MY", {
    style: "currency",
    currency: "MYR",
  });
}

export function findDuplicateCollectionReceiptHashes(
  receipts: Array<Pick<CollectionReceiptValidationDraft, "fileHash" | "originalFileName">>,
): Array<{ fileHash: string; fileNames: string[] }> {
  const entriesByHash = new Map<string, { fileNames: Set<string>; count: number }>();

  for (const receipt of receipts) {
    const hash = normalizeCollectionText(receipt.fileHash).toLowerCase();
    if (!hash) {
      continue;
    }
    const current = entriesByHash.get(hash) || { fileNames: new Set<string>(), count: 0 };
    const fileName = normalizeCollectionText(receipt.originalFileName) || "receipt";
    current.fileNames.add(fileName);
    current.count += 1;
    entriesByHash.set(hash, current);
  }

  return Array.from(entriesByHash.entries())
    .filter(([, entry]) => entry.count > 1)
    .map(([fileHash, entry]) => ({
      fileHash,
      fileNames: Array.from(entry.fileNames),
    }));
}

export function buildCollectionReceiptValidationResult(params: {
  totalPaidCents: number;
  receipts: CollectionReceiptValidationDraft[];
}): CollectionReceiptValidationResult {
  const activeReceipts = Array.isArray(params.receipts)
    ? params.receipts
    : [];
  const receiptCount = activeReceipts.length;

  if (receiptCount === 0) {
    return {
      receiptCount: 0,
      receiptTotalAmountCents: 0,
      status: "needs_review",
      message: "Tiada resit dilampirkan untuk semakan jumlah.",
      blockingReason: null,
      requiresOverride: false,
    };
  }

  const missingAmountCount = activeReceipts.filter((receipt) => receipt.receiptAmountCents === null || receipt.receiptAmountCents === undefined).length;
  const receiptTotalAmountCents = activeReceipts.reduce(
    (sum, receipt) => sum + (Number.isSafeInteger(receipt.receiptAmountCents) ? Number(receipt.receiptAmountCents) : 0),
    0,
  );

  if (missingAmountCount > 0) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      status: "needs_review",
      message: "Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan.",
      blockingReason: "missing_amounts",
      requiresOverride: true,
    };
  }

  if (receiptTotalAmountCents !== params.totalPaidCents) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      status: "mismatch",
      message: `Jumlah resit ${formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents)} tidak sepadan dengan jumlah bayaran ${formatCollectionCurrencyLabelFromCents(params.totalPaidCents)}.`,
      blockingReason: "mismatch",
      requiresOverride: true,
    };
  }

  return {
    receiptCount,
    receiptTotalAmountCents,
    status: "matched",
    message: "Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan.",
    blockingReason: null,
    requiresOverride: false,
  };
}
