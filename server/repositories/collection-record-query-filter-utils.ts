import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  hasCollectionPiiEncryptionConfigured,
} from "../lib/collection-pii-encryption";
import { buildTextArraySql } from "./sql-array-utils";
import { buildLikePattern } from "./sql-like-utils";
import {
  normalizeCollectionNicknameFilters,
  type CollectionRecordFilters,
} from "./collection-record-query-shared";

/**
 * Canonical classification used by Collection reads. `classification` remains
 * the automatic result; an active POOL can make only its anchor row an
 * effective ABORT CP. A later automatic ABORT supersedes the POOL so a logical
 * obligation is never counted twice.
 */
export function buildCollectionEffectiveClassificationSql(): SQL {
  return sql`CASE
    WHEN record.classification = 'abort_cp' THEN 'abort_cp'
    WHEN record.settlement_override_status = 'ACTIVE'
      AND record.settlement_cycle_key IS NOT NULL
      AND record.source_import_id IS NOT NULL
      AND record.source_data_row_id IS NOT NULL
      AND record.source_obligation_key IS NOT NULL
      AND record.source_match_basis IS NOT NULL
      AND record.total_due > 0
      AND record.pool_amount > 0
      AND record.manual_settlement_date >= record.calling_date
      AND record.manual_settlement_date < record.calling_window_end_exclusive
      AND record.duplicate_receipt_flag = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.collection_records automatic_abort
        WHERE automatic_abort.settlement_cycle_key = record.settlement_cycle_key
          AND automatic_abort.classification = 'abort_cp'
      )
      AND COALESCE((
        SELECT SUM(sibling.amount)
        FROM public.collection_records sibling
        WHERE sibling.settlement_cycle_key = record.settlement_cycle_key
          AND sibling.source_import_id IS NOT NULL
          AND sibling.source_data_row_id IS NOT NULL
          AND sibling.source_obligation_key IS NOT NULL
          AND sibling.source_match_basis IS NOT NULL
          AND sibling.total_due = record.total_due
          AND sibling.total_due > 0
          AND sibling.calling_date IS NOT NULL
          AND sibling.calling_window_end_exclusive IS NOT NULL
          AND sibling.payment_date >= sibling.calling_date
          AND sibling.payment_date < sibling.calling_window_end_exclusive
          AND sibling.payment_date <= record.manual_settlement_date
          AND sibling.duplicate_receipt_flag = false
      ), 0) + record.pool_amount >= record.total_due
      THEN 'abort_cp'
    ELSE record.classification
  END`;
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

  if (Array.isArray(filters?.staffNicknameIds)) {
    const staffNicknameIds = Array.from(new Set(
      filters.staffNicknameIds
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)),
    ));
    if (staffNicknameIds.length === 0) {
      conditions.push(sql`false`);
    } else {
      conditions.push(sql`EXISTS (
        SELECT 1
        FROM public.collection_staff_nicknames team_member
        WHERE team_member.id = ANY(${buildTextArraySql(staffNicknameIds)}::uuid[])
          AND team_member.is_active = true
          AND lower(team_member.nickname) = lower(collection_staff_nickname)
      )`);
    }
  }

  const receiptValidationStatus = String(filters?.receiptValidationStatus || "")
    .trim()
    .toLowerCase();
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

  const sourceImportIds = Array.isArray(filters?.sourceImportIds)
    ? Array.from(new Set(filters.sourceImportIds.map((value) => String(value || "").trim()).filter(Boolean)))
    : [];
  if (sourceImportIds.length > 0) {
    conditions.push(sql`source_import_id = ANY(${buildTextArraySql(sourceImportIds)})`);
  }

  const agingBuckets = Array.isArray(filters?.agingBuckets)
    ? Array.from(new Set(filters.agingBuckets.filter((value) => (
        value === "D3" || value === "D4" || value === "D5" || value === "D6"
      ))))
    : [];
  if (agingBuckets.length > 0) {
    conditions.push(sql`aging_bucket = ANY(${buildTextArraySql(agingBuckets)})`);
  }

  const classifications = Array.isArray(filters?.classifications)
    ? Array.from(new Set(filters.classifications.filter((value) => (
        value === "cp" || value === "abort_cp"
      ))))
    : [];
  if (classifications.length > 0) {
    conditions.push(sql`${buildCollectionEffectiveClassificationSql()} = ANY(${buildTextArraySql(classifications)})`);
  }

  return conditions;
}

export function buildCollectionRecordWhereSql(filters?: CollectionRecordFilters): SQL {
  const conditions = buildCollectionRecordConditions(filters);
  return conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

export function canUseCollectionRecordDailyRollups(filters?: CollectionRecordFilters): boolean {
  return (
    String(filters?.search || "").trim().length === 0
    && String(filters?.receiptValidationStatus || "").trim().length === 0
    && filters?.duplicateOnly !== true
    && !Array.isArray(filters?.staffNicknameIds)
    && (!filters?.sourceImportIds || filters.sourceImportIds.length === 0)
    && (!filters?.agingBuckets || filters.agingBuckets.length === 0)
    && (!filters?.classifications || filters.classifications.length === 0)
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

  return conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
}

export function buildCollectionRecordMonthlyRollupWhereSql(filters: {
  year: number;
  nicknames?: string[] | undefined;
  createdByLogin?: string | undefined;
}): { safeYear: number; whereSql: SQL } {
  const safeYear = Number.isFinite(filters.year)
    ? Math.min(2100, Math.max(2000, Math.floor(filters.year)))
    : new Date().getFullYear();
  const conditions: SQL[] = [sql`year = ${safeYear}`];

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

export function buildCollectionRecordMonthlyComparisonWhereSql(filters: {
  from: string;
  to: string;
  nicknames?: string[] | undefined;
  createdByLogin?: string | undefined;
}): SQL {
  const startYear = Math.min(
    2100,
    Math.max(2000, Number.parseInt(String(filters.from || "").slice(0, 4), 10) || 2000),
  );
  const startMonth = Math.min(
    12,
    Math.max(1, Number.parseInt(String(filters.from || "").slice(5, 7), 10) || 1),
  );
  const endYear = Math.min(
    2100,
    Math.max(2000, Number.parseInt(String(filters.to || "").slice(0, 4), 10) || 2100),
  );
  const endMonth = Math.min(
    12,
    Math.max(1, Number.parseInt(String(filters.to || "").slice(5, 7), 10) || 12),
  );
  const startKey = (startYear * 100) + startMonth;
  const endKey = (endYear * 100) + endMonth;
  const conditions: SQL[] = [
    sql`((year * 100) + month) >= ${startKey}`,
    sql`((year * 100) + month) <= ${endKey}`,
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

  return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
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
