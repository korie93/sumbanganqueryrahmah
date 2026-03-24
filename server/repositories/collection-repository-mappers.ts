import type {
  CollectionDailyCalendarDay,
  CollectionDailyTarget,
  CollectionRecord,
} from "../storage-postgres";

type CollectionBatch = CollectionRecord["batch"];

export function mapCollectionRecordRow(row: any): CollectionRecord {
  const paymentDateRaw = row.payment_date ?? row.paymentDate;
  const paymentDate =
    typeof paymentDateRaw === "string"
      ? paymentDateRaw.slice(0, 10)
      : paymentDateRaw instanceof Date
        ? paymentDateRaw.toISOString().slice(0, 10)
        : "";

  const createdAtRaw = row.created_at ?? row.createdAt;
  const createdAt = createdAtRaw instanceof Date
    ? createdAtRaw
    : new Date(createdAtRaw ?? Date.now());
  const updatedAtRaw = row.updated_at ?? row.updatedAt ?? createdAt;
  const updatedAt = updatedAtRaw instanceof Date
    ? updatedAtRaw
    : new Date(updatedAtRaw ?? createdAt);

  return {
    id: String(row.id),
    customerName: String(row.customer_name ?? row.customerName ?? ""),
    icNumber: String(row.ic_number ?? row.icNumber ?? ""),
    customerPhone: String(row.customer_phone ?? row.customerPhone ?? ""),
    accountNumber: String(row.account_number ?? row.accountNumber ?? ""),
    batch: String(row.batch ?? "") as CollectionBatch,
    paymentDate,
    amount: String(row.amount ?? "0"),
    receiptFile: row.receipt_file ?? row.receiptFile ?? null,
    receipts: [],
    createdByLogin: String(row.created_by_login ?? row.createdByLogin ?? row.staff_username ?? row.staffUsername ?? ""),
    collectionStaffNickname: String(row.collection_staff_nickname ?? row.collectionStaffNickname ?? row.staff_username ?? row.staffUsername ?? ""),
    createdAt,
    updatedAt,
  };
}

export function mapCollectionDailyTargetRow(row: any): CollectionDailyTarget {
  return {
    id: String(row.id),
    username: String(row.username || "").toLowerCase(),
    year: Number(row.year || 0),
    month: Number(row.month || 0),
    monthlyTarget: Number(row.monthly_target ?? row.monthlyTarget ?? 0),
    createdBy: row.created_by ?? row.createdBy ?? null,
    updatedBy: row.updated_by ?? row.updatedBy ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export function mapCollectionDailyCalendarRow(row: any): CollectionDailyCalendarDay {
  return {
    id: String(row.id),
    year: Number(row.year || 0),
    month: Number(row.month || 0),
    day: Number(row.day || 0),
    isWorkingDay: Boolean(row.is_working_day ?? row.isWorkingDay),
    isHoliday: Boolean(row.is_holiday ?? row.isHoliday),
    holidayName: (row.holiday_name ?? row.holidayName ?? null) as string | null,
    createdBy: (row.created_by ?? row.createdBy ?? null) as string | null,
    updatedBy: (row.updated_by ?? row.updatedBy ?? null) as string | null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}
