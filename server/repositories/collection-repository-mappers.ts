import type {
  CollectionDailyCalendarDay,
  CollectionDailyTarget,
  CollectionRecord,
} from "../storage-postgres";
import {
  formatCollectionAmountFromCents,
  formatCollectionAmountMyrString,
  parseCollectionAmountMyrNumber,
} from "../../shared/collection-amount-types";
import { resolveCollectionPiiFieldValue } from "../lib/collection-pii-encryption";

type CollectionBatch = CollectionRecord["batch"];

type CollectionRecordDbRow = {
  id?: unknown;
  customer_name?: unknown;
  customerName?: unknown;
  customer_name_encrypted?: unknown;
  customerNameEncrypted?: unknown;
  ic_number?: unknown;
  icNumber?: unknown;
  ic_number_encrypted?: unknown;
  icNumberEncrypted?: unknown;
  customer_phone?: unknown;
  customerPhone?: unknown;
  customer_phone_encrypted?: unknown;
  customerPhoneEncrypted?: unknown;
  account_number?: unknown;
  accountNumber?: unknown;
  account_number_encrypted?: unknown;
  accountNumberEncrypted?: unknown;
  batch?: unknown;
  payment_date?: unknown;
  paymentDate?: unknown;
  amount?: unknown;
  receipt_file?: unknown;
  receiptFile?: unknown;
  receipt_total_amount?: unknown;
  receiptTotalAmount?: unknown;
  receipt_validation_status?: unknown;
  receiptValidationStatus?: unknown;
  receipt_validation_message?: unknown;
  receiptValidationMessage?: unknown;
  receipt_count?: unknown;
  receiptCount?: unknown;
  duplicate_receipt_flag?: unknown;
  duplicateReceiptFlag?: unknown;
  created_by_login?: unknown;
  createdByLogin?: unknown;
  collection_staff_nickname?: unknown;
  collectionStaffNickname?: unknown;
  staff_username?: unknown;
  staffUsername?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

type CollectionDailyTargetDbRow = {
  id?: unknown;
  username?: unknown;
  year?: unknown;
  month?: unknown;
  monthly_target?: unknown;
  monthlyTarget?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  updated_by?: unknown;
  updatedBy?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type CollectionDailyCalendarDbRow = {
  id?: unknown;
  year?: unknown;
  month?: unknown;
  day?: unknown;
  is_working_day?: unknown;
  isWorkingDay?: unknown;
  is_holiday?: unknown;
  isHoliday?: unknown;
  holiday_name?: unknown;
  holidayName?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  updated_by?: unknown;
  updatedBy?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function isCollectionRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCollectionDbRow<T extends Record<string, unknown>>(row: unknown): T {
  return isCollectionRow(row) ? (row as T) : ({} as T);
}

function normalizeCollectionDate(value: unknown, fallback: Date | number = Date.now()): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  if (fallback instanceof Date) {
    return new Date(fallback.getTime());
  }
  return new Date(fallback);
}

export function mapCollectionRecordRow(row: unknown): CollectionRecord {
  const normalizedRow = normalizeCollectionDbRow<CollectionRecordDbRow>(row);
  const paymentDateRaw = normalizedRow.payment_date ?? normalizedRow.paymentDate;
  const paymentDate =
    typeof paymentDateRaw === "string"
      ? paymentDateRaw.slice(0, 10)
      : paymentDateRaw instanceof Date
        ? paymentDateRaw.toISOString().slice(0, 10)
        : "";

  const createdAtRaw = normalizedRow.created_at ?? normalizedRow.createdAt;
  const createdAt = normalizeCollectionDate(createdAtRaw);
  const updatedAtRaw = normalizedRow.updated_at ?? normalizedRow.updatedAt ?? createdAt;
  const updatedAt = normalizeCollectionDate(updatedAtRaw, createdAt);

  return {
    id: String(normalizedRow.id ?? ""),
    customerName: resolveCollectionPiiFieldValue({
      field: "customerName",
      plaintext: normalizedRow.customer_name ?? normalizedRow.customerName,
      encrypted: normalizedRow.customer_name_encrypted ?? normalizedRow.customerNameEncrypted,
    }),
    icNumber: resolveCollectionPiiFieldValue({
      field: "icNumber",
      plaintext: normalizedRow.ic_number ?? normalizedRow.icNumber,
      encrypted: normalizedRow.ic_number_encrypted ?? normalizedRow.icNumberEncrypted,
    }),
    customerPhone: resolveCollectionPiiFieldValue({
      field: "customerPhone",
      plaintext: normalizedRow.customer_phone ?? normalizedRow.customerPhone,
      encrypted: normalizedRow.customer_phone_encrypted ?? normalizedRow.customerPhoneEncrypted,
    }),
    accountNumber: resolveCollectionPiiFieldValue({
      field: "accountNumber",
      plaintext: normalizedRow.account_number ?? normalizedRow.accountNumber,
      encrypted: normalizedRow.account_number_encrypted ?? normalizedRow.accountNumberEncrypted,
    }),
    batch: String(normalizedRow.batch ?? "") as CollectionBatch,
    paymentDate,
    amount: formatCollectionAmountMyrString(normalizedRow.amount ?? 0),
    receiptFile: (normalizedRow.receipt_file ?? normalizedRow.receiptFile ?? null) as string | null,
    receipts: [],
    archivedReceipts: [],
    receiptTotalAmount: formatCollectionAmountFromCents(
      normalizedRow.receipt_total_amount ?? normalizedRow.receiptTotalAmount ?? 0,
    ),
    receiptValidationStatus: String(
      normalizedRow.receipt_validation_status
      ?? normalizedRow.receiptValidationStatus
      ?? "needs_review",
    ) as CollectionRecord["receiptValidationStatus"],
    receiptValidationMessage:
      (normalizedRow.receipt_validation_message ?? normalizedRow.receiptValidationMessage ?? null) as string | null,
    receiptCount: Math.max(0, Number(normalizedRow.receipt_count ?? normalizedRow.receiptCount ?? 0) || 0),
    duplicateReceiptFlag: Boolean(
      normalizedRow.duplicate_receipt_flag
      ?? normalizedRow.duplicateReceiptFlag
      ?? false,
    ),
    createdByLogin: String(
      normalizedRow.created_by_login
      ?? normalizedRow.createdByLogin
      ?? normalizedRow.staff_username
      ?? normalizedRow.staffUsername
      ?? "",
    ),
    collectionStaffNickname: String(
      normalizedRow.collection_staff_nickname
      ?? normalizedRow.collectionStaffNickname
      ?? normalizedRow.staff_username
      ?? normalizedRow.staffUsername
      ?? "",
    ),
    createdAt,
    updatedAt,
  };
}

export function mapCollectionDailyTargetRow(row: unknown): CollectionDailyTarget {
  const normalizedRow = normalizeCollectionDbRow<CollectionDailyTargetDbRow>(row);
  return {
    id: String(normalizedRow.id ?? ""),
    username: String(normalizedRow.username ?? "").toLowerCase(),
    year: Number(normalizedRow.year ?? 0),
    month: Number(normalizedRow.month ?? 0),
    monthlyTarget: parseCollectionAmountMyrNumber(normalizedRow.monthly_target ?? normalizedRow.monthlyTarget ?? 0),
    createdBy: (normalizedRow.created_by ?? normalizedRow.createdBy ?? null) as string | null,
    updatedBy: (normalizedRow.updated_by ?? normalizedRow.updatedBy ?? null) as string | null,
    createdAt: normalizeCollectionDate(normalizedRow.created_at),
    updatedAt: normalizeCollectionDate(normalizedRow.updated_at),
  };
}

export function mapCollectionDailyCalendarRow(row: unknown): CollectionDailyCalendarDay {
  const normalizedRow = normalizeCollectionDbRow<CollectionDailyCalendarDbRow>(row);
  return {
    id: String(normalizedRow.id ?? ""),
    year: Number(normalizedRow.year ?? 0),
    month: Number(normalizedRow.month ?? 0),
    day: Number(normalizedRow.day ?? 0),
    isWorkingDay: Boolean(normalizedRow.is_working_day ?? normalizedRow.isWorkingDay),
    isHoliday: Boolean(normalizedRow.is_holiday ?? normalizedRow.isHoliday),
    holidayName: (normalizedRow.holiday_name ?? normalizedRow.holidayName ?? null) as string | null,
    createdBy: (normalizedRow.created_by ?? normalizedRow.createdBy ?? null) as string | null,
    updatedBy: (normalizedRow.updated_by ?? normalizedRow.updatedBy ?? null) as string | null,
    createdAt: normalizeCollectionDate(normalizedRow.created_at),
    updatedAt: normalizeCollectionDate(normalizedRow.updated_at),
  };
}
