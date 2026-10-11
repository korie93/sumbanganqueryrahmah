import { safeJsonParseResult } from "@/lib/utils/safe-json";
import { validateSaveCollectionIdentityFields } from "@/pages/collection/save-collection-page-utils";
import { isFutureDate, isValidDate } from "@/pages/collection/utils";
import { formatCollectionAmountFromCents, parseCollectionAmountToCents } from "@shared/collection-amount-types";

export const COLLECTION_MATCHING_DEBOUNCE_MS = 800;
export const COLLECTION_MATCHING_TIMEOUT_MS = 60_000;

export type CollectionMatchingStatus =
  | "incomplete" | "waiting" | "checking" | "matched" | "no-match" | "error" | "paused";
export type CollectionMatchingErrorKind =
  | "no-match" | "no-config" | "ambiguous" | "access" | "transient" | "other";

export type CollectionSourceMatchingInput = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  cardNumber: string;
  paymentDate: string;
  amount: string;
};

export function normalizeCollectionMatchingInput(
  input: CollectionSourceMatchingInput,
): CollectionSourceMatchingInput | null {
  const amountInCents = parseCollectionAmountToCents(input.amount);
  const normalized = {
    customerName: input.customerName.trim(),
    icNumber: input.icNumber.trim(),
    customerPhone: input.customerPhone.trim(),
    accountNumber: input.accountNumber.trim(),
    cardNumber: input.cardNumber.trim(),
    paymentDate: input.paymentDate.trim(),
    amount: amountInCents === null ? "" : formatCollectionAmountFromCents(amountInCents),
  };

  if (
    Object.keys(validateSaveCollectionIdentityFields(normalized)).length > 0
    || amountInCents === null
    || !isValidDate(normalized.paymentDate)
    || isFutureDate(normalized.paymentDate)
    // Date parsing otherwise accepts rolled-over dates such as February 30.
    || new Date(`${normalized.paymentDate}T00:00:00Z`).toISOString().slice(0, 10) !== normalized.paymentDate
  ) return null;

  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function classifyCollectionMatchingError(error: unknown): {
  errorKind: CollectionMatchingErrorKind;
  message: string;
  retryAfterMs: number;
} {
  const rawMessage = error instanceof Error ? error.message : "";
  const statusMatch = rawMessage.match(/^(\d{3}):\s*/);
  const parsed = safeJsonParseResult<unknown>(rawMessage.replace(/^\d{3}:\s*/, ""));
  const payload = parsed.ok ? asRecord(parsed.data) : null;
  const nestedError = asRecord(payload?.error);
  const errorRecord = asRecord(error);
  const status = Number(statusMatch?.[1] ?? payload?.status ?? errorRecord?.status);
  const code = nestedError?.code ?? payload?.code ?? errorRecord?.code;
  const message = nestedError?.message ?? payload?.message;
  const retryAfterMs = Number(payload?.retryAfterMs ?? nestedError?.retryAfterMs ?? errorRecord?.retryAfterMs);
  let errorKind: CollectionMatchingErrorKind = "other";

  if (status === 401 || status === 403) {
    errorKind = "access";
  } else if (code === "COLLECTION_SOURCE_NO_MATCH") {
    errorKind = "no-match";
  } else if (code === "COLLECTION_SOURCE_NOT_CONFIGURED") {
    errorKind = "no-config";
  } else if (code === "COLLECTION_SOURCE_AMBIGUOUS_MATCH" || code === "COLLECTION_SOURCE_IDENTITY_CONFLICT") {
    errorKind = "ambiguous";
  } else if (
    status === 408 || status === 429 || (status >= 500 && status <= 599)
    || (!statusMatch && error instanceof Error && (
      ["NetworkError", "TimeoutError", "ApiCircuitOpenError"].includes(error.name)
      || /failed to fetch|networkerror|load failed|network request failed|econnreset|etimedout|timed out|appear to be offline/i.test(rawMessage)
    ))
  ) {
    errorKind = "transient";
  }

  return {
    errorKind,
    message: typeof message === "string" && message.trim()
      ? message.trim()
      : "Padanan tidak dapat disemak. Semak maklumat yang dimasukkan.",
    retryAfterMs: errorKind === "transient" && Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? Math.ceil(retryAfterMs)
      : 0,
  };
}
