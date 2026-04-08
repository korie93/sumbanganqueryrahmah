import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type {
  CollectionMonthlySummary,
  CollectionNicknameDailyAggregate,
  CollectionReceiptValidationStatus,
} from "../storage-postgres";
import {
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  hasCollectionPiiEncryptionConfigured,
} from "../lib/collection-pii-encryption";
import { buildTextArraySql } from "./sql-array-utils";
import { buildLikePattern } from "./sql-like-utils";

const COLLECTION_MONTH_NAMES = [
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

type CollectionRecordFilters = {
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  createdByLogin?: string | undefined;
  nicknames?: string[] | undefined;
  receiptValidationStatus?: CollectionReceiptValidationStatus | "flagged" | undefined;
  duplicateOnly?: boolean | undefined;
};

export type CollectionRollupFilters = Omit<CollectionRecordFilters, "search">;

function normalizeCollectionNicknameFilters(nicknameSource?: string[]): string[] {
  return Array.isArray(nicknameSource)
    ? nicknameSource
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
    : [];
}

export function buildCollectionRecordConditions(filters?: CollectionRecordFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters?.from) {
    conditions.push(sql`payment_date >= ${filters.from}::date`);
  }
  if (filters?.to) {
    conditions.push(sql`payment_date <= ${filters.to}::date`);
  }

  const search = String(filters?.search || "").trim();
  if (search) {
    const like = buildLikePattern(search, "contains");
    const searchConditions: SQL[] = [
      sql`batch ILIKE ${like} ESCAPE '\'`,
      sql`amount::text ILIKE ${like} ESCAPE '\'`,
    ];
    if (!hasCollectionPiiEncryptionConfigured()) {
      searchConditions.push(sql`customer_name ILIKE ${like} ESCAPE '\'`);
      searchConditions.push(
        sql`ic_number ILIKE ${like} ESCAPE '\'`,
        sql`account_number ILIKE ${like} ESCAPE '\'`,
        sql`customer_phone ILIKE ${like} ESCAPE '\'`,
      );
    }
    const customerNameSearchHash = hashCollectionPiiSearchValue("customerName", search);
    if (customerNameSearchHash) {
      searchConditions.push(sql`customer_name_search_hash = ${customerNameSearchHash}`);
    }
    const customerNameSearchHashes = hashCollectionCustomerNameSearchTerms(search);
    if (customerNameSearchHashes?.length) {
      searchConditions.push(
        sql`customer_name_search_hashes @> ${buildTextArraySql(customerNameSearchHashes)}`,
      );
    }
    const icNumberSearchHash = hashCollectionPiiSearchValue("icNumber", search);
    if (icNumberSearchHash) {
      searchConditions.push(sql`ic_number_search_hash = ${icNumberSearchHash}`);
    }
    const customerPhoneSearchHash = hashCollectionPiiSearchValue("customerPhone", search);
    if (customerPhoneSearchHash) {
      searchConditions.push(sql`customer_phone_search_hash = ${customerPhoneSearchHash}`);
    }
    const accountNumberSearchHash = hashCollectionPiiSearchValue("accountNumber", search);
    if (accountNumberSearchHash) {
      searchConditions.push(sql`account_number_search_hash = ${accountNumberSearchHash}`);
    }
    conditions.push(sql`(
      ${sql.join(searchConditions, sql`
      OR `)}
    )`);
  }

  const createdByLogin = String(filters?.createdByLogin || "").trim();
  if (createdByLogin) {
    conditions.push(sql`created_by_login = ${createdByLogin}`);
  }

  const nicknames = normalizeCollectionNicknameFilters(filters?.nicknames);
  if (nicknames.length > 0) {
    const nicknameSql = sql.join(nicknames.map((value) => sql`${value}`), sql`, `);
    conditions.push(sql`lower(collection_staff_nickname) IN (${nicknameSql})`);
  }

  const receiptValidationStatus = String(filters?.receiptValidationStatus || "").trim().toLowerCase();
  if (receiptValidationStatus === "flagged") {
    conditions.push(sql`(receipt_validation_status <> 'matched' OR duplicate_receipt_flag = true)`);
  } else if (
    receiptValidationStatus === "matched"
    || receiptValidationStatus === "underpaid"
    || receiptValidationStatus === "overpaid"
    || receiptValidationStatus === "unverified"
    || receiptValidationStatus === "needs_review"
  ) {
    conditions.push(sql`receipt_validation_status = ${receiptValidationStatus}`);
  }

  if (filters?.duplicateOnly) {
    conditions.push(sql`duplicate_receipt_flag = true`);
  }

  return conditions;
}

export function buildCollectionRecordWhereSql(filters?: CollectionRecordFilters): SQL {
  const conditions = buildCollectionRecordConditions(filters);
  return conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}

export function canUseCollectionRecordDailyRollups(filters?: CollectionRecordFilters): boolean {
  return (
    String(filters?.search || "").trim().length === 0
    && String(filters?.receiptValidationStatus || "").trim().length === 0
    && filters?.duplicateOnly !== true
  );
}

export function buildCollectionRecordDailyRollupWhereSql(filters?: CollectionRecordFilters): SQL {
  const conditions: SQL[] = [];
  if (filters?.from) {
    conditions.push(sql`payment_date >= ${filters.from}::date`);
  }
  if (filters?.to) {
    conditions.push(sql`payment_date <= ${filters.to}::date`);
  }

  const createdByLogin = String(filters?.createdByLogin || "").trim();
  if (createdByLogin) {
    conditions.push(sql`created_by_login = ${createdByLogin}`);
  }

  const nicknames = normalizeCollectionNicknameFilters(filters?.nicknames);
  if (nicknames.length > 0) {
    const nicknameSql = sql.join(nicknames.map((value) => sql`${value}`), sql`, `);
    conditions.push(sql`lower(collection_staff_nickname) IN (${nicknameSql})`);
  }

  return conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}

export function buildCollectionRecordMonthlyRollupWhereSql(filters: {
  year: number;
  nicknames?: string[] | undefined;
  createdByLogin?: string | undefined;
}): { safeYear: number; whereSql: SQL } {
  const safeYear = Number.isFinite(filters.year)
    ? Math.min(2100, Math.max(2000, Math.floor(filters.year)))
    : new Date().getFullYear();
  const conditions: SQL[] = [
    sql`year = ${safeYear}`,
  ];

  const nicknames = normalizeCollectionNicknameFilters(filters.nicknames);
  if (nicknames.length > 0) {
    const nicknameSql = sql.join(nicknames.map((value) => sql`${value}`), sql`, `);
    conditions.push(sql`lower(collection_staff_nickname) IN (${nicknameSql})`);
  }

  const createdByLogin = String(filters.createdByLogin || "").trim();
  if (createdByLogin) {
    conditions.push(sql`created_by_login = ${createdByLogin}`);
  }

  return {
    safeYear,
    whereSql: sql`WHERE ${sql.join(conditions, sql` AND `)}`,
  };
}

export function buildCollectionMonthlySummaryWhereSql(filters: {
  year: number;
  nicknames?: string[] | undefined;
  createdByLogin?: string | undefined;
}): { safeYear: number; whereSql: SQL } {
  const safeYear = Number.isFinite(filters.year)
    ? Math.min(2100, Math.max(2000, Math.floor(filters.year)))
    : new Date().getFullYear();
  const yearStart = `${safeYear}-01-01`;
  const yearEnd = `${safeYear}-12-31`;
  const conditions: SQL[] = [
    sql`payment_date >= ${yearStart}::date`,
    sql`payment_date <= ${yearEnd}::date`,
  ];

  const nicknames = normalizeCollectionNicknameFilters(filters.nicknames);
  if (nicknames.length > 0) {
    const nicknameSql = sql.join(nicknames.map((value) => sql`${value}`), sql`, `);
    conditions.push(sql`lower(collection_staff_nickname) IN (${nicknameSql})`);
  }

  const createdByLogin = String(filters.createdByLogin || "").trim();
  if (createdByLogin) {
    conditions.push(sql`created_by_login = ${createdByLogin}`);
  }

  return {
    safeYear,
    whereSql: sql`WHERE ${sql.join(conditions, sql` AND `)}`,
  };
}

export function mapCollectionAggregateRow(row: any): {
  totalRecords: number;
  totalAmount: number;
} {
  return {
    totalRecords: Number(row?.total_records ?? 0),
    totalAmount: Number(row?.total_amount ?? 0),
  };
}

export function mapCollectionMonthlySummaryRows(rows: any[]): CollectionMonthlySummary[] {
  const byMonth = new Map<number, { totalRecords: number; totalAmount: number }>();
  for (const row of rows || []) {
    const month = Number(row?.month ?? 0);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    byMonth.set(month, {
      totalRecords: Number(row?.total_records ?? 0),
      totalAmount: Number(row?.total_amount ?? 0),
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

export function mapCollectionNicknameDailyAggregateRows(rows: any[]): CollectionNicknameDailyAggregate[] {
  return (rows || []).map((row) => ({
    nickname: String(row?.nickname || row?.nickname_key || "Unknown"),
    paymentDate: String(row?.payment_date || ""),
    totalRecords: Number(row?.total_records ?? 0),
    totalAmount: Number(row?.total_amount ?? 0),
  }));
}

export function extractCollectionRecordIds(rows: any[]): string[] {
  return (rows || [])
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);
}

export function collectCollectionReceiptPaths(
  recordRows: any[],
  receiptRows: any[],
): string[] {
  return Array.from(
    new Set(
      [
        ...(recordRows || []).map((row) => String(row?.receipt_file || "").trim()),
        ...(receiptRows || []).map((row) => String(row?.storage_path || "").trim()),
      ].filter(Boolean),
    ),
  );
}

export function sumCollectionRowAmounts(rows: any[]): number {
  return (rows || []).reduce((sum: number, row: any) => sum + Number(row?.amount ?? 0), 0);
}
