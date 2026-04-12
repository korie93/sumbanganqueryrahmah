import { parseCollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import type {
  CollectionAmountMyrNumber,
} from "../../shared/collection-amount-types";
import type {
  CollectionMonthlySummary,
  CollectionNicknameAggregate,
  CollectionNicknameDailyAggregate,
} from "../storage-postgres";
import {
  COLLECTION_MONTH_NAMES,
  normalizeCollectionQueryRow,
  normalizeCollectionQueryRows,
  type CollectionAggregateRow,
  type CollectionAmountRow,
  type CollectionMonthlySummaryRow,
  type CollectionNicknameAggregateRow,
  type CollectionNicknameDailyAggregateRow,
  type CollectionReceiptPathRow,
  type CollectionReceiptStoragePathRow,
  type CollectionRecordIdRow,
} from "./collection-record-query-shared";

export function mapCollectionAggregateRow(row: unknown): {
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
} {
  const normalizedRow = normalizeCollectionQueryRow<CollectionAggregateRow>(row);
  return {
    totalRecords: Number(normalizedRow.total_records ?? 0),
    totalAmount: parseCollectionAmountMyrNumber(normalizedRow.total_amount ?? 0),
  };
}

export function mapCollectionMonthlySummaryRows(
  rows: readonly unknown[] | null | undefined,
): CollectionMonthlySummary[] {
  const byMonth = new Map<number, { totalRecords: number; totalAmount: CollectionAmountMyrNumber }>();
  for (const row of normalizeCollectionQueryRows(rows)) {
    const normalizedRow = normalizeCollectionQueryRow<CollectionMonthlySummaryRow>(row);
    const month = Number(normalizedRow.month ?? 0);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    byMonth.set(month, {
      totalRecords: Number(normalizedRow.total_records ?? 0),
      totalAmount: parseCollectionAmountMyrNumber(normalizedRow.total_amount ?? 0),
    });
  }

  return COLLECTION_MONTH_NAMES.map((monthName, index) => {
    const month = index + 1;
    const data = byMonth.get(month);
    return {
      month,
      monthName,
      totalRecords: data?.totalRecords ?? 0,
      totalAmount: data?.totalAmount ?? 0,
    };
  });
}

export function mapCollectionNicknameAggregateRows(
  rows: readonly unknown[] | null | undefined,
): CollectionNicknameAggregate[] {
  return normalizeCollectionQueryRows(rows).map((row) => {
    const normalizedRow = normalizeCollectionQueryRow<CollectionNicknameAggregateRow>(row);
    return {
      nickname: String(normalizedRow.nickname ?? normalizedRow.nickname_key ?? "Unknown"),
      totalRecords: Number(normalizedRow.total_records ?? 0),
      totalAmount: parseCollectionAmountMyrNumber(normalizedRow.total_amount ?? 0),
    };
  });
}

export function mapCollectionNicknameDailyAggregateRows(
  rows: readonly unknown[] | null | undefined,
): CollectionNicknameDailyAggregate[] {
  return normalizeCollectionQueryRows(rows).map((row) => {
    const normalizedRow = normalizeCollectionQueryRow<CollectionNicknameDailyAggregateRow>(row);
    return {
      nickname: String(normalizedRow.nickname ?? normalizedRow.nickname_key ?? "Unknown"),
      paymentDate: String(normalizedRow.payment_date ?? ""),
      totalRecords: Number(normalizedRow.total_records ?? 0),
      totalAmount: parseCollectionAmountMyrNumber(normalizedRow.total_amount ?? 0),
    };
  });
}

export function extractCollectionRecordIds(rows: readonly unknown[] | null | undefined): string[] {
  return normalizeCollectionQueryRows(rows)
    .map((row) => String(normalizeCollectionQueryRow<CollectionRecordIdRow>(row).id ?? "").trim())
    .filter(Boolean);
}

export function collectCollectionReceiptPaths(
  recordRows: readonly unknown[] | null | undefined,
  receiptRows: readonly unknown[] | null | undefined,
): string[] {
  return Array.from(
    new Set(
      [
        ...normalizeCollectionQueryRows(recordRows).map((row) =>
          String(normalizeCollectionQueryRow<CollectionReceiptPathRow>(row).receipt_file ?? "").trim(),
        ),
        ...normalizeCollectionQueryRows(receiptRows).map((row) =>
          String(
            normalizeCollectionQueryRow<CollectionReceiptStoragePathRow>(row).storage_path ?? "",
          ).trim(),
        ),
      ].filter(Boolean),
    ),
  );
}

export function sumCollectionRowAmounts(
  rows: readonly unknown[] | null | undefined,
): CollectionAmountMyrNumber {
  return normalizeCollectionQueryRows(rows).reduce<number>(
    (sum, row) =>
      sum
      + parseCollectionAmountMyrNumber(normalizeCollectionQueryRow<CollectionAmountRow>(row).amount ?? 0),
    0,
  );
}
