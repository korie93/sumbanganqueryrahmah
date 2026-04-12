import type {
  CollectionNicknameAggregate,
  CollectionMonthlySummary,
  CollectionNicknameDailyAggregate,
  CollectionReceiptValidationStatus,
} from "../storage-postgres";
import type { CollectionAmountMyrNumber } from "../../shared/collection-amount-types";

export const COLLECTION_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type CollectionRecordFilters = {
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  createdByLogin?: string | undefined;
  nicknames?: string[] | undefined;
  receiptValidationStatus?: CollectionReceiptValidationStatus | "flagged" | undefined;
  duplicateOnly?: boolean | undefined;
};

export type CollectionRollupFilters = Omit<CollectionRecordFilters, "search">;

export type CollectionAggregateRow = {
  total_records?: unknown;
  total_amount?: unknown;
};

export type CollectionMonthlySummaryRow = CollectionAggregateRow & {
  month?: unknown;
};

export type CollectionNicknameAggregateRow = CollectionAggregateRow & {
  nickname?: unknown;
  nickname_key?: unknown;
};

export type CollectionNicknameDailyAggregateRow = CollectionNicknameAggregateRow & {
  payment_date?: unknown;
};

export type CollectionRecordIdRow = {
  id?: unknown;
};

export type CollectionReceiptPathRow = {
  receipt_file?: unknown;
};

export type CollectionReceiptStoragePathRow = {
  storage_path?: unknown;
};

export type CollectionAmountRow = {
  amount?: unknown;
};

export type CollectionAggregateResult = {
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type CollectionMonthlySummaryResult = CollectionMonthlySummary;
export type CollectionNicknameAggregateResult = CollectionNicknameAggregate;
export type CollectionNicknameDailyAggregateResult = CollectionNicknameDailyAggregate;

function isCollectionQueryRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeCollectionQueryRow<T extends Record<string, unknown>>(row: unknown): T {
  return isCollectionQueryRow(row) ? (row as T) : ({} as T);
}

export function normalizeCollectionQueryRows(
  rows: readonly unknown[] | null | undefined,
): readonly unknown[] {
  return Array.isArray(rows) ? rows : [];
}

export function normalizeCollectionNicknameFilters(nicknameSource?: string[]): string[] {
  return Array.isArray(nicknameSource)
    ? nicknameSource
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
    : [];
}
