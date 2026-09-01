import type {
  CollectionDailyCalendarDay,
  CollectionDailyCalendarAuditEntry,
  CollectionDailyTarget,
  CollectionRecord,
} from "../storage-postgres";
import {
  formatCollectionAmountFromCents,
  formatCollectionAmountMyrString,
  parseCollectionAmountToCents,
  parseCollectionAmountMyrNumber,
} from "../../shared/collection-amount-types";
import {
  isCollectionDailyCalendarStatus,
  isCollectionDailyLeaveType,
} from "../../shared/collection-daily-status";
import { resolveCollectionRecordPiiValuesFailClosed } from "../lib/collection-pii-encryption";
import { subtractOneDayDateOnly } from "../lib/collection-calling-window";

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
  card_number_last4?: unknown;
  cardNumberLast4?: unknown;
  source_import_id?: unknown;
  sourceImportId?: unknown;
  source_data_row_id?: unknown;
  sourceDataRowId?: unknown;
  source_import_name?: unknown;
  sourceImportName?: unknown;
  source_filename?: unknown;
  sourceFilename?: unknown;
  aging_bucket?: unknown;
  agingBucket?: unknown;
  calling_date?: unknown;
  callingDate?: unknown;
  calling_window_end?: unknown;
  callingWindowEnd?: unknown;
  calling_window_end_exclusive?: unknown;
  callingWindowEndExclusive?: unknown;
  total_due?: unknown;
  totalDue?: unknown;
  billing_principal_osp?: unknown;
  billingPrincipalOsp?: unknown;
  source_match_basis?: unknown;
  sourceMatchBasis?: unknown;
  source_match_accuracy?: unknown;
  sourceMatchAccuracy?: unknown;
  source_obligation_key?: unknown;
  sourceObligationKey?: unknown;
  settlement_cycle_key?: unknown;
  settlementCycleKey?: unknown;
  classification?: unknown;
  cumulative_collected?: unknown;
  cumulativeCollected?: unknown;
  remaining_amount?: unknown;
  remainingAmount?: unknown;
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
  username?: unknown;
  calendar_date?: unknown;
  calendarDate?: unknown;
  year?: unknown;
  month?: unknown;
  day?: unknown;
  status?: unknown;
  leave_type?: unknown;
  leaveType?: unknown;
  note?: unknown;
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

type CollectionDailyCalendarAuditDbRow = {
  id?: unknown;
  calendar_id?: unknown;
  calendarId?: unknown;
  username?: unknown;
  calendar_date?: unknown;
  calendarDate?: unknown;
  year?: unknown;
  month?: unknown;
  day?: unknown;
  action?: unknown;
  old_status?: unknown;
  oldStatus?: unknown;
  new_status?: unknown;
  newStatus?: unknown;
  old_leave_type?: unknown;
  oldLeaveType?: unknown;
  new_leave_type?: unknown;
  newLeaveType?: unknown;
  old_note?: unknown;
  oldNote?: unknown;
  new_note?: unknown;
  newNote?: unknown;
  old_holiday_name?: unknown;
  oldHolidayName?: unknown;
  new_holiday_name?: unknown;
  newHolidayName?: unknown;
  actor?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
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

function normalizeCollectionDateOnly(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, 10) : null;
  }
  return null;
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
  const piiValues = resolveCollectionRecordPiiValuesFailClosed({
    customerName: {
      plaintext: normalizedRow.customer_name ?? normalizedRow.customerName,
      encrypted: normalizedRow.customer_name_encrypted ?? normalizedRow.customerNameEncrypted,
    },
    icNumber: {
      plaintext: normalizedRow.ic_number ?? normalizedRow.icNumber,
      encrypted: normalizedRow.ic_number_encrypted ?? normalizedRow.icNumberEncrypted,
    },
    customerPhone: {
      plaintext: normalizedRow.customer_phone ?? normalizedRow.customerPhone,
      encrypted: normalizedRow.customer_phone_encrypted ?? normalizedRow.customerPhoneEncrypted,
    },
    accountNumber: {
      plaintext: normalizedRow.account_number ?? normalizedRow.accountNumber,
      encrypted: normalizedRow.account_number_encrypted ?? normalizedRow.accountNumberEncrypted,
    },
  });
  const amount = formatCollectionAmountMyrString(normalizedRow.amount ?? 0);
  const totalDueRaw = normalizedRow.total_due ?? normalizedRow.totalDue;
  const totalDue = totalDueRaw === null || totalDueRaw === undefined
    ? null
    : formatCollectionAmountMyrString(totalDueRaw);
  const billingPrincipalOspRaw = normalizedRow.billing_principal_osp
    ?? normalizedRow.billingPrincipalOsp;
  const billingPrincipalOsp = billingPrincipalOspRaw === null
    || billingPrincipalOspRaw === undefined
    ? null
    : formatCollectionAmountMyrString(billingPrincipalOspRaw);
  const callingDateRaw = normalizedRow.calling_date ?? normalizedRow.callingDate;
  const callingDate = normalizeCollectionDateOnly(callingDateRaw);
  const callingWindowEndExclusiveRaw = normalizedRow.calling_window_end_exclusive
    ?? normalizedRow.callingWindowEndExclusive;
  const callingWindowEndExclusive = normalizeCollectionDateOnly(callingWindowEndExclusiveRaw);
  const callingWindowEnd = callingWindowEndExclusive
    ? subtractOneDayDateOnly(callingWindowEndExclusive)
    : null;
  const sourceImportId = String(
    normalizedRow.source_import_id ?? normalizedRow.sourceImportId ?? "",
  ).trim() || null;
  const sourceDataRowId = String(
    normalizedRow.source_data_row_id ?? normalizedRow.sourceDataRowId ?? "",
  ).trim() || null;
  const sourceObligationKey = String(
    normalizedRow.source_obligation_key ?? normalizedRow.sourceObligationKey ?? "",
  ).trim() || null;
  const settlementCycleKey = String(
    normalizedRow.settlement_cycle_key ?? normalizedRow.settlementCycleKey ?? "",
  ).trim() || null;
  const cardNumberLast4Raw = String(
    normalizedRow.card_number_last4 ?? normalizedRow.cardNumberLast4 ?? "",
  ).trim();
  const cardNumberLast4 = cardNumberLast4Raw && cardNumberLast4Raw.length <= 4
    ? cardNumberLast4Raw
    : null;
  const matchBasisRaw = normalizedRow.source_match_basis ?? normalizedRow.sourceMatchBasis;
  const sourceMatchBasis = matchBasisRaw === "ic"
    || matchBasisRaw === "phone_and_account"
    || matchBasisRaw === "account_number"
    || matchBasisRaw === "card_number"
    || matchBasisRaw === "account_and_card"
    ? matchBasisRaw
    : null;
  const duplicateReceiptFlag = Boolean(
    normalizedRow.duplicate_receipt_flag
    ?? normalizedRow.duplicateReceiptFlag
    ?? false,
  );
  const hasVerifiedSettlement = Boolean(
    sourceImportId
    && sourceDataRowId
    && sourceMatchBasis
    && sourceObligationKey
    && settlementCycleKey
    && totalDue !== null
    && callingDate
    && callingWindowEndExclusive
    && callingWindowEnd
    && paymentDate >= callingDate
    && paymentDate < callingWindowEndExclusive
    && !duplicateReceiptFlag
  );
  const classificationRaw = normalizedRow.classification;
  const classification = classificationRaw === "cp" || classificationRaw === "abort_cp"
    ? classificationRaw
    : null;
  const cumulativeRaw = normalizedRow.cumulative_collected ?? normalizedRow.cumulativeCollected;
  const cumulativeCents = cumulativeRaw === null || cumulativeRaw === undefined
    ? null
    : parseCollectionAmountToCents(cumulativeRaw, { allowZero: true });
  const remainingRaw = normalizedRow.remaining_amount ?? normalizedRow.remainingAmount;
  const remainingCents = remainingRaw === null || remainingRaw === undefined
    ? null
    : parseCollectionAmountToCents(remainingRaw, { allowZero: true });
  const totalDueCents = totalDue === null
    ? null
    : parseCollectionAmountToCents(totalDue, { allowZero: false });
  const settlementAmountsConsistent = cumulativeCents !== null
    && remainingCents !== null
    && totalDueCents !== null
    && remainingCents === Math.max(0, totalDueCents - cumulativeCents);
  const hasPersistedSettlement = Boolean(
    hasVerifiedSettlement
    && classification
    && settlementAmountsConsistent
    && (classification !== "abort_cp" || remainingCents === 0)
  );
  const totalDueCovered = !hasPersistedSettlement || remainingCents === null
    ? null
    : remainingCents === 0;
  const matchAccuracyRaw = normalizedRow.source_match_accuracy ?? normalizedRow.sourceMatchAccuracy;
  const matchAccuracyNumber = Number(matchAccuracyRaw);
  const sourceMatchAccuracy = Number.isInteger(matchAccuracyNumber)
    && matchAccuracyNumber >= 0
    && matchAccuracyNumber <= 100
    ? matchAccuracyNumber
    : null;
  const agingBucketRaw = String(normalizedRow.aging_bucket ?? normalizedRow.agingBucket ?? "").toUpperCase();
  const agingBucket = agingBucketRaw === "D3"
    || agingBucketRaw === "D4"
    || agingBucketRaw === "D5"
    || agingBucketRaw === "D6"
    ? agingBucketRaw
    : null;

  return {
    id: String(normalizedRow.id ?? ""),
    customerName: piiValues.customerName,
    icNumber: piiValues.icNumber,
    customerPhone: piiValues.customerPhone,
    accountNumber: piiValues.accountNumber,
    cardNumberLast4,
    sourceImportId:
      (normalizedRow.source_import_id ?? normalizedRow.sourceImportId ?? null) as string | null,
    sourceDataRowId:
      (normalizedRow.source_data_row_id ?? normalizedRow.sourceDataRowId ?? null) as string | null,
    sourceImportName:
      (normalizedRow.source_import_name ?? normalizedRow.sourceImportName ?? null) as string | null,
    sourceFilename:
      (normalizedRow.source_filename ?? normalizedRow.sourceFilename ?? null) as string | null,
    agingBucket,
    callingDate,
    callingWindowEnd,
    callingWindowEndExclusive,
    totalDue,
    billingPrincipalOsp,
    sourceMatchBasis,
    sourceMatchAccuracy,
    sourceObligationKey,
    settlementCycleKey,
    totalDueCovered,
    cumulativeCollected: hasPersistedSettlement && cumulativeCents !== null
      ? formatCollectionAmountFromCents(cumulativeCents)
      : null,
    remainingAmount: hasPersistedSettlement && remainingCents !== null
      ? formatCollectionAmountFromCents(remainingCents)
      : null,
    cpStatus: hasPersistedSettlement && classification ? classification : "unverified",
    batch: String(normalizedRow.batch ?? "") as CollectionBatch,
    paymentDate,
    amount,
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
    duplicateReceiptFlag,
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
  const year = Number(normalizedRow.year ?? 0);
  const month = Number(normalizedRow.month ?? 0);
  const day = Number(normalizedRow.day ?? 0);
  const statusRaw = String(normalizedRow.status ?? "").toUpperCase();
  const status = isCollectionDailyCalendarStatus(statusRaw) ? statusRaw : "WORKING";
  const leaveTypeRaw = String(normalizedRow.leave_type ?? normalizedRow.leaveType ?? "").toUpperCase();
  const leaveType = isCollectionDailyLeaveType(leaveTypeRaw) ? leaveTypeRaw : null;
  const dateRaw = normalizedRow.calendar_date ?? normalizedRow.calendarDate;
  const date = typeof dateRaw === "string"
    ? dateRaw.slice(0, 10)
    : dateRaw instanceof Date
      ? dateRaw.toISOString().slice(0, 10)
      : year > 0 && month > 0 && day > 0
        ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : "";
  return {
    id: String(normalizedRow.id ?? ""),
    username: String(normalizedRow.username ?? ""),
    date,
    year,
    month,
    day,
    status,
    leaveType,
    note: (normalizedRow.note ?? null) as string | null,
    isWorkingDay: Boolean(normalizedRow.is_working_day ?? normalizedRow.isWorkingDay),
    isHoliday: Boolean(normalizedRow.is_holiday ?? normalizedRow.isHoliday),
    holidayName: (normalizedRow.holiday_name ?? normalizedRow.holidayName ?? null) as string | null,
    createdBy: (normalizedRow.created_by ?? normalizedRow.createdBy ?? null) as string | null,
    updatedBy: (normalizedRow.updated_by ?? normalizedRow.updatedBy ?? null) as string | null,
    createdAt: normalizeCollectionDate(normalizedRow.created_at),
    updatedAt: normalizeCollectionDate(normalizedRow.updated_at),
  };
}

function normalizeCollectionCalendarDateKey(
  value: unknown,
  year: number,
  month: number,
  day: number,
) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return year > 0 && month > 0 && day > 0
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
}

function normalizeCollectionDailyAuditAction(
  value: unknown,
): CollectionDailyCalendarAuditEntry["action"] {
  return value === "CREATE" || value === "UPDATE" || value === "DELETE" ? value : "UPDATE";
}

function normalizeCollectionDailyAuditStatus(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();
  return isCollectionDailyCalendarStatus(normalized) ? normalized : null;
}

function normalizeCollectionDailyAuditLeaveType(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();
  return isCollectionDailyLeaveType(normalized) ? normalized : null;
}

export function mapCollectionDailyCalendarAuditRow(
  row: unknown,
): CollectionDailyCalendarAuditEntry {
  const normalizedRow = normalizeCollectionDbRow<CollectionDailyCalendarAuditDbRow>(row);
  const year = Number(normalizedRow.year ?? 0);
  const month = Number(normalizedRow.month ?? 0);
  const day = Number(normalizedRow.day ?? 0);
  const dateRaw = normalizedRow.calendar_date ?? normalizedRow.calendarDate;

  return {
    id: String(normalizedRow.id ?? ""),
    calendarId: (normalizedRow.calendar_id ?? normalizedRow.calendarId ?? null) as string | null,
    username: String(normalizedRow.username ?? "").toLowerCase(),
    date: normalizeCollectionCalendarDateKey(dateRaw, year, month, day),
    year,
    month,
    day,
    action: normalizeCollectionDailyAuditAction(normalizedRow.action),
    oldStatus: normalizeCollectionDailyAuditStatus(
      normalizedRow.old_status ?? normalizedRow.oldStatus,
    ),
    newStatus: normalizeCollectionDailyAuditStatus(
      normalizedRow.new_status ?? normalizedRow.newStatus,
    ),
    oldLeaveType: normalizeCollectionDailyAuditLeaveType(
      normalizedRow.old_leave_type ?? normalizedRow.oldLeaveType,
    ),
    newLeaveType: normalizeCollectionDailyAuditLeaveType(
      normalizedRow.new_leave_type ?? normalizedRow.newLeaveType,
    ),
    oldNote: (normalizedRow.old_note ?? normalizedRow.oldNote ?? null) as string | null,
    newNote: (normalizedRow.new_note ?? normalizedRow.newNote ?? null) as string | null,
    oldHolidayName: (
      normalizedRow.old_holiday_name
      ?? normalizedRow.oldHolidayName
      ?? null
    ) as string | null,
    newHolidayName: (
      normalizedRow.new_holiday_name
      ?? normalizedRow.newHolidayName
      ?? null
    ) as string | null,
    actor: (normalizedRow.actor ?? null) as string | null,
    createdAt: normalizeCollectionDate(normalizedRow.created_at ?? normalizedRow.createdAt),
  };
}
