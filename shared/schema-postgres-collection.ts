import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dataRows, imports, userActivity, users } from "./schema-postgres-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const collectionRecords = pgTable("collection_records", {
  id: uuid("id").primaryKey(),
  customerName: text("customer_name"),
  customerNameEncrypted: text("customer_name_encrypted"),
  customerNameSearchHash: text("customer_name_search_hash"),
  customerNameSearchHashes: text("customer_name_search_hashes").array(),
  icNumber: text("ic_number"),
  icNumberEncrypted: text("ic_number_encrypted"),
  icNumberSearchHash: text("ic_number_search_hash"),
  customerPhone: text("customer_phone"),
  customerPhoneEncrypted: text("customer_phone_encrypted"),
  customerPhoneSearchHash: text("customer_phone_search_hash"),
  accountNumber: text("account_number"),
  accountNumberEncrypted: text("account_number_encrypted"),
  accountNumberSearchHash: text("account_number_search_hash"),
  cardNumberLast4: text("card_number_last4"),
  sourceImportId: text("source_import_id")
    .references(() => imports.id, { onDelete: "set null", onUpdate: "cascade" }),
  sourceDataRowId: text("source_data_row_id")
    .references(() => dataRows.id, { onDelete: "set null", onUpdate: "cascade" }),
  sourceImportName: text("source_import_name"),
  sourceFilename: text("source_filename"),
  agingBucket: text("aging_bucket"),
  callingDate: date("calling_date", { mode: "string" }),
  callingWindowEndExclusive: date("calling_window_end_exclusive", { mode: "string" }),
  totalDue: numeric("total_due", { precision: 14, scale: 2 }),
  billingPrincipalOsp: numeric("billing_principal_osp", { precision: 14, scale: 2 }),
  sourceMatchBasis: text("source_match_basis"),
  sourceMatchAccuracy: integer("source_match_accuracy"),
  sourceObligationKey: text("source_obligation_key"),
  settlementCycleKey: text("settlement_cycle_key"),
  classification: text("classification"),
  cumulativeCollected: numeric("cumulative_collected", { precision: 14, scale: 2 }),
  remainingAmount: numeric("remaining_amount", { precision: 14, scale: 2 }),
  // A verified external/unassigned payment is deliberately kept separate from
  // `amount`: it may settle an obligation, but it is never staff collection,
  // receipt value, or performance credit.
  settlementOverrideStatus: text("settlement_override_status"),
  poolAmount: numeric("pool_amount", { precision: 14, scale: 2 }),
  manualSettlementDate: date("manual_settlement_date", { mode: "string" }),
  manualSettlementReason: text("manual_settlement_reason"),
  manualSettlementNote: text("manual_settlement_note"),
  manualSettlementReference: text("manual_settlement_reference"),
  manualSettlementVersion: integer("manual_settlement_version"),
  manualSettlementVerifiedBy: text("manual_settlement_verified_by"),
  manualSettlementVerifiedAt: utcTimestamp("manual_settlement_verified_at"),
  manualSettlementUpdatedBy: text("manual_settlement_updated_by"),
  manualSettlementUpdatedAt: utcTimestamp("manual_settlement_updated_at"),
  manualSettlementRevokedBy: text("manual_settlement_revoked_by"),
  manualSettlementRevokedAt: utcTimestamp("manual_settlement_revoked_at"),
  manualSettlementRevokedReason: text("manual_settlement_revoked_reason"),
  batch: text("batch").notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  // Primary payment total is stored in MYR using a fixed decimal numeric column.
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  receiptFile: text("receipt_file"),
  // Receipt-derived totals stay in integer sen/cents to avoid rounding drift across OCR/import flows.
  receiptTotalAmount: bigint("receipt_total_amount", { mode: "number" }).notNull().default(0),
  receiptValidationStatus: text("receipt_validation_status").notNull().default("needs_review"),
  receiptValidationMessage: text("receipt_validation_message"),
  receiptCount: integer("receipt_count").notNull().default(0),
  duplicateReceiptFlag: boolean("duplicate_receipt_flag").notNull().default(false),
  createdByLogin: text("created_by_login")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  collectionStaffNickname: text("collection_staff_nickname").notNull(),
  staffUsername: text("staff_username").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  paymentDateIdx: index("idx_collection_records_payment_date").on(table.paymentDate),
  createdAtIdx: index("idx_collection_records_created_at").on(table.createdAt.desc()),
  staffUsernameIdx: index("idx_collection_records_staff_username").on(table.staffUsername),
  createdByLoginIdx: index("idx_collection_records_created_by_login").on(table.createdByLogin),
  staffNicknameIdx: index("idx_collection_records_staff_nickname").on(table.collectionStaffNickname),
  sourceImportIdIdx: index("idx_collection_records_source_import_id").on(table.sourceImportId),
  sourceDataRowIdIdx: index("idx_collection_records_source_data_row_id").on(table.sourceDataRowId),
  sourceSettlementWindowIdx: index("idx_collection_records_source_settlement_window").on(
    table.sourceImportId,
    table.sourceDataRowId,
    table.paymentDate,
  ),
  settlementCycleOrderIdx: index("idx_collection_records_settlement_cycle_order").on(
    table.settlementCycleKey,
    table.paymentDate,
    table.createdAt,
    table.id,
  ),
  obligationHistoryOrderIdx: index("idx_collection_records_obligation_history_order")
    .on(
      table.sourceObligationKey,
      table.paymentDate.desc(),
      table.createdAt.desc(),
      table.id.desc(),
    )
    .where(sql`${table.sourceObligationKey} IS NOT NULL`),
  soleAbortPerCycleIdx: uniqueIndex("idx_collection_records_sole_abort_per_cycle")
    .on(table.settlementCycleKey)
    .where(sql`${table.classification} = 'abort_cp' AND ${table.settlementCycleKey} IS NOT NULL`),
  soleActiveManualSettlementPerCycleIdx: uniqueIndex("idx_collection_records_sole_active_manual_settlement_per_cycle")
    .on(table.settlementCycleKey)
    .where(sql`${table.settlementOverrideStatus} = 'ACTIVE' AND ${table.settlementCycleKey} IS NOT NULL`),
  activePoolEvidenceUniqueIdx: uniqueIndex("idx_collection_records_active_pool_evidence_unique")
    .on(
      table.sourceObligationKey,
      table.manualSettlementDate,
      table.poolAmount,
      sql`COALESCE(lower(trim(${table.manualSettlementReference})), '')`,
    )
    .where(sql`
      ${table.settlementOverrideStatus} = 'ACTIVE'
      AND ${table.sourceObligationKey} IS NOT NULL
      AND ${table.manualSettlementDate} IS NOT NULL
      AND ${table.poolAmount} IS NOT NULL
    `),
  customerPhoneIdx: index("idx_collection_records_customer_phone").on(table.customerPhone),
  customerNameSearchHashIdx: index("idx_collection_records_customer_name_search_hash").on(
    table.customerNameSearchHash,
  ),
  customerNameSearchHashesIdx: index("idx_collection_records_customer_name_search_hashes").using(
    "gin",
    table.customerNameSearchHashes,
  ),
  icNumberSearchHashIdx: index("idx_collection_records_ic_number_search_hash").on(
    table.icNumberSearchHash,
  ),
  customerPhoneSearchHashIdx: index("idx_collection_records_customer_phone_search_hash").on(
    table.customerPhoneSearchHash,
  ),
  accountNumberSearchHashIdx: index("idx_collection_records_account_number_search_hash").on(
    table.accountNumberSearchHash,
  ),
  receiptValidationStatusIdx: index("idx_collection_records_receipt_validation_status").on(
    table.receiptValidationStatus,
  ),
  paymentDateCreatedAtIdIdx: index("idx_collection_records_payment_created_id").on(
    table.paymentDate,
    table.createdAt,
    table.id,
  ),
  createdByPaymentDateCreatedAtIdIdx: index("idx_collection_records_created_by_payment_created_id").on(
    table.createdByLogin,
    table.paymentDate,
    table.createdAt,
    table.id,
  ),
  staffNicknameLowerPaymentDateCreatedAtIdIdx: index("idx_collection_records_lower_staff_nickname_payment_created_id").using(
    "btree",
    sql`lower(${table.collectionStaffNickname})`,
    table.paymentDate,
    table.createdAt,
    table.id,
  ),
  createdByLowerPaymentDateCreatedAtIdIdx: index("idx_collection_records_lower_created_by_payment_created_id").using(
    "btree",
    sql`lower(${table.createdByLogin})`,
    table.paymentDate,
    table.createdAt,
    table.id,
  ),
  staffUsernameMatchesNickname: check(
    "chk_collection_records_staff_username_matches_nickname",
    sql`lower(${table.staffUsername}) = lower(${table.collectionStaffNickname})`,
  ),
  customerNamePiiXor: check(
    "chk_collection_records_customer_name_pii_xor",
    sql`NULLIF(trim(COALESCE(${table.customerName}, '')), '') IS NULL OR NULLIF(trim(COALESCE(${table.customerNameEncrypted}, '')), '') IS NULL`,
  ),
  icNumberPiiXor: check(
    "chk_collection_records_ic_number_pii_xor",
    sql`NULLIF(trim(COALESCE(${table.icNumber}, '')), '') IS NULL OR NULLIF(trim(COALESCE(${table.icNumberEncrypted}, '')), '') IS NULL`,
  ),
  customerPhonePiiXor: check(
    "chk_collection_records_customer_phone_pii_xor",
    sql`CASE WHEN trim(COALESCE(${table.customerPhone}, '')) IN ('', '-') THEN NULL ELSE trim(${table.customerPhone}) END IS NULL OR NULLIF(trim(COALESCE(${table.customerPhoneEncrypted}, '')), '') IS NULL`,
  ),
  accountNumberPiiXor: check(
    "chk_collection_records_account_number_pii_xor",
    sql`NULLIF(trim(COALESCE(${table.accountNumber}, '')), '') IS NULL OR NULLIF(trim(COALESCE(${table.accountNumberEncrypted}, '')), '') IS NULL`,
  ),
  agingBucketCheck: check(
    "chk_collection_records_aging_bucket",
    sql`${table.agingBucket} IS NULL OR ${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')`,
  ),
  sourceMatchBasisCheck: check(
    "chk_collection_records_source_match_basis",
    sql`${table.sourceMatchBasis} IS NULL OR ${table.sourceMatchBasis} IN ('ic', 'phone_and_account', 'account_number', 'card_number', 'account_and_card')`,
  ),
  sourceMatchAccuracyCheck: check(
    "chk_collection_records_source_match_accuracy",
    sql`${table.sourceMatchAccuracy} IS NULL OR (${table.sourceMatchAccuracy} >= 0 AND ${table.sourceMatchAccuracy} <= 100)`,
  ),
  callingWindowCheck: check(
    "chk_collection_records_calling_window",
    sql`(${table.callingDate} IS NULL AND ${table.callingWindowEndExclusive} IS NULL) OR (${table.callingDate} IS NOT NULL AND ${table.callingWindowEndExclusive} = (${table.callingDate} + INTERVAL '1 month')::date)`,
  ),
  cardNumberLast4Check: check(
    "chk_collection_records_card_number_last4",
    sql`${table.cardNumberLast4} IS NULL OR ${table.cardNumberLast4} ~ '^[0-9]{4}$'`,
  ),
  classificationCheck: check(
    "chk_collection_records_classification",
    sql`${table.classification} IS NULL OR ${table.classification} IN ('cp', 'abort_cp')`,
  ),
  settlementStateCheck: check(
    "chk_collection_records_settlement_state",
    sql`(
      ${table.classification} IS NULL
      AND ${table.cumulativeCollected} IS NULL
      AND ${table.remainingAmount} IS NULL
    ) OR (
      ${table.classification} IN ('cp', 'abort_cp')
      AND ${table.settlementCycleKey} IS NOT NULL
      AND ${table.sourceObligationKey} IS NOT NULL
      AND ${table.cumulativeCollected} >= 0
      AND ${table.remainingAmount} >= 0
    )`,
  ),
  manualSettlementStateCheck: check(
    "chk_collection_records_manual_settlement_state",
    sql`(
      ${table.settlementOverrideStatus} IS NULL
      AND ${table.poolAmount} IS NULL
      AND ${table.manualSettlementDate} IS NULL
      AND ${table.manualSettlementReason} IS NULL
      AND ${table.manualSettlementNote} IS NULL
      AND ${table.manualSettlementReference} IS NULL
      AND ${table.manualSettlementVersion} IS NULL
      AND ${table.manualSettlementVerifiedBy} IS NULL
      AND ${table.manualSettlementVerifiedAt} IS NULL
      AND ${table.manualSettlementUpdatedBy} IS NULL
      AND ${table.manualSettlementUpdatedAt} IS NULL
      AND ${table.manualSettlementRevokedBy} IS NULL
      AND ${table.manualSettlementRevokedAt} IS NULL
      AND ${table.manualSettlementRevokedReason} IS NULL
    ) OR (
      ${table.settlementOverrideStatus} IN ('ACTIVE', 'REVOKED')
      AND ${table.settlementCycleKey} IS NOT NULL
      AND ${table.sourceImportId} IS NOT NULL
      AND ${table.sourceDataRowId} IS NOT NULL
      AND ${table.sourceObligationKey} IS NOT NULL
      AND ${table.totalDue} > 0
      AND ${table.poolAmount} > 0
      AND ${table.manualSettlementDate} IS NOT NULL
      AND ${table.callingDate} IS NOT NULL
      AND ${table.callingWindowEndExclusive} IS NOT NULL
      AND ${table.manualSettlementDate} >= ${table.callingDate}
      AND ${table.manualSettlementDate} < ${table.callingWindowEndExclusive}
      AND char_length(trim(${table.manualSettlementReason})) BETWEEN 1 AND 64
      AND ${table.manualSettlementReason} IN (
        'EXTERNAL_UNASSIGNED_PAYMENT',
        'CLIENT_CONFIRMED_PAYMENT',
        'HISTORICAL_PAYMENT_NOT_CAPTURED',
        'OTHER_WITH_REQUIRED_NOTE'
      )
      AND (
        ${table.manualSettlementReason} <> 'OTHER_WITH_REQUIRED_NOTE'
        OR char_length(trim(COALESCE(${table.manualSettlementNote}, ''))) > 0
      )
      AND (${table.manualSettlementNote} IS NULL OR char_length(${table.manualSettlementNote}) <= 2000)
      AND (${table.manualSettlementReference} IS NULL OR char_length(${table.manualSettlementReference}) <= 200)
      AND ${table.manualSettlementVersion} >= 1
      AND ${table.manualSettlementVerifiedBy} IS NOT NULL
      AND ${table.manualSettlementVerifiedAt} IS NOT NULL
      AND ${table.manualSettlementUpdatedBy} IS NOT NULL
      AND ${table.manualSettlementUpdatedAt} IS NOT NULL
      AND (
        (${table.settlementOverrideStatus} = 'ACTIVE'
          AND ${table.manualSettlementRevokedBy} IS NULL
          AND ${table.manualSettlementRevokedAt} IS NULL
          AND ${table.manualSettlementRevokedReason} IS NULL)
        OR
        (${table.settlementOverrideStatus} = 'REVOKED'
          AND ${table.manualSettlementRevokedBy} IS NOT NULL
          AND ${table.manualSettlementRevokedAt} IS NOT NULL
          AND char_length(trim(${table.manualSettlementRevokedReason})) BETWEEN 1 AND 500)
      )
    )`,
  ),
}));

export const collectionSourceConfigs = pgTable("collection_source_configs", {
  sourceImportId: text("source_import_id")
    .primaryKey()
    .references(() => imports.id, { onDelete: "cascade", onUpdate: "cascade" }),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validTo: date("valid_to", { mode: "string" }).notNull(),
  cycleKey: text("cycle_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  compatibilityStatus: text("compatibility_status").notNull().default("incompatible"),
  compatibilityIssues: text("compatibility_issues").array().notNull().default(sql`ARRAY[]::text[]`),
  indexedRowCount: integer("indexed_row_count").notNull().default(0),
  configuredBy: text("configured_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  enabledValidityIdx: index("idx_collection_source_configs_enabled_validity").on(
    table.enabled,
    table.validFrom,
    table.validTo,
  ),
  cycleKeyIdx: index("idx_collection_source_configs_cycle_key").on(table.cycleKey),
  validityCheck: check(
    "chk_collection_source_configs_validity",
    sql`${table.validFrom} <= ${table.validTo}`,
  ),
  compatibilityCheck: check(
    "chk_collection_source_configs_compatibility",
    sql`${table.compatibilityStatus} IN ('compatible', 'incompatible')`,
  ),
  indexedRowCountCheck: check(
    "chk_collection_source_configs_indexed_row_count",
    sql`${table.indexedRowCount} >= 0`,
  ),
  enabledCompatibilityCheck: check(
    "chk_collection_source_configs_enabled_compatibility",
    sql`${table.enabled} = false OR ${table.compatibilityStatus} = 'compatible'`,
  ),
}));

export const collectionSourceRows = pgTable("collection_source_rows", {
  sourceImportId: text("source_import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade", onUpdate: "cascade" }),
  sourceDataRowId: text("source_data_row_id")
    .notNull()
    .references(() => dataRows.id, { onDelete: "cascade", onUpdate: "cascade" }),
  accountNumberHash: text("account_number_hash"),
  cardNumberHash: text("card_number_hash"),
  cardNumberLast4: text("card_number_last4"),
  canonicalObligationKey: text("canonical_obligation_key").notNull(),
  totalDue: numeric("total_due", { precision: 14, scale: 2 }).notNull(),
  billingPrincipalOsp: numeric("billing_principal_osp", { precision: 14, scale: 2 }).notNull(),
  totalOsb: numeric("total_osb", { precision: 14, scale: 2 }),
  agingBucket: text("aging_bucket").notNull(),
  callingDate: date("calling_date", { mode: "string" }).notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({
    name: "pk_collection_source_rows",
    columns: [table.sourceImportId, table.sourceDataRowId],
  }),
  dataRowUnique: uniqueIndex("idx_collection_source_rows_data_row_unique").on(table.sourceDataRowId),
  accountLookupIdx: index("idx_collection_source_rows_account_lookup").on(
    table.sourceImportId,
    table.accountNumberHash,
  ),
  cardLookupIdx: index("idx_collection_source_rows_card_lookup").on(
    table.sourceImportId,
    table.cardNumberHash,
  ),
  agingIdx: index("idx_collection_source_rows_aging").on(table.sourceImportId, table.agingBucket),
  obligationIdx: index("idx_collection_source_rows_obligation").on(table.canonicalObligationKey),
  identifierCheck: check(
    "chk_collection_source_rows_identifier",
    sql`${table.accountNumberHash} IS NOT NULL OR ${table.cardNumberHash} IS NOT NULL`,
  ),
  agingCheck: check(
    "chk_collection_source_rows_aging",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')`,
  ),
  accountHashCheck: check(
    "chk_collection_source_rows_account_hash",
    sql`${table.accountNumberHash} IS NULL OR char_length(${table.accountNumberHash}) = 64`,
  ),
  cardHashCheck: check(
    "chk_collection_source_rows_card_hash",
    sql`${table.cardNumberHash} IS NULL OR char_length(${table.cardNumberHash}) = 64`,
  ),
  cardLast4Check: check(
    "chk_collection_source_rows_card_last4",
    sql`${table.cardNumberLast4} IS NULL OR ${table.cardNumberLast4} ~ '^[0-9]{4}$'`,
  ),
  moneyCheck: check(
    "chk_collection_source_rows_money",
    sql`${table.totalDue} > 0 AND ${table.billingPrincipalOsp} >= 0 AND (${table.totalOsb} IS NULL OR ${table.totalOsb} >= 0)`,
  ),
}));

export const collectionOspTargets = pgTable("collection_osp_targets", {
  id: uuid("id").primaryKey(),
  sourceScopeHash: text("source_scope_hash").notNull(),
  sourceImportIds: text("source_import_ids").array().notNull(),
  periodFrom: date("period_from", { mode: "string" }).notNull(),
  periodTo: date("period_to", { mode: "string" }).notNull(),
  agingBucket: text("aging_bucket").notNull(),
  totalOspBaseline: numeric("total_osp_baseline", { precision: 16, scale: 2 }),
  targetPercentage: numeric("target_percentage", { precision: 7, scale: 4 }).notNull(),
  configuredBy: text("configured_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  scopePeriodAgingUnique: uniqueIndex("idx_collection_osp_targets_scope_period_aging_unique").on(
    table.sourceScopeHash,
    table.periodFrom,
    table.periodTo,
    table.agingBucket,
  ),
  periodIdx: index("idx_collection_osp_targets_period").on(table.periodFrom, table.periodTo),
  periodCheck: check("chk_collection_osp_targets_period", sql`${table.periodFrom} <= ${table.periodTo}`),
  agingCheck: check(
    "chk_collection_osp_targets_aging",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')`,
  ),
  targetPercentageCheck: check(
    "chk_collection_osp_targets_percentage",
    sql`${table.targetPercentage} >= 0 AND ${table.targetPercentage} <= 100`,
  ),
  sourceCountCheck: check(
    "chk_collection_osp_targets_source_count",
    sql`cardinality(${table.sourceImportIds}) BETWEEN 1 AND 5`,
  ),
  baselineCheck: check(
    "chk_collection_osp_targets_baseline",
    sql`${table.totalOspBaseline} IS NULL OR ${table.totalOspBaseline} >= 0`,
  ),
}));

/**
 * Stable, user-facing identity for a named Billing Principal target.
 *
 * Structural reporting inputs live in immutable revision tables below. Updating
 * a target definition therefore creates another revision instead of changing
 * the historical denominator used by an older report/calendar view.
 */
export const collectionOspSavedTargets = pgTable("collection_osp_saved_targets", {
  id: uuid("id").primaryKey(),
  // NULL is intentionally retained for legacy, unassigned targets. Authorization
  // uses this stable account ID, never a username, nickname or display label.
  assignedAdminUserId: text("assigned_admin_user_id")
    .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  targetName: text("target_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("ACTIVE"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  deletedBy: text("deleted_by")
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  deletedAt: utcTimestamp("deleted_at"),
}, (table) => ({
  activeNameUnique: uniqueIndex("idx_collection_osp_saved_targets_active_name_unique")
    .on(table.normalizedName)
    .where(sql`${table.status} = 'ACTIVE'`),
  updatedAtIdx: index("idx_collection_osp_saved_targets_updated_at").on(table.updatedAt.desc()),
  creatorIdx: index("idx_collection_osp_saved_targets_created_by").on(table.createdBy),
  assignedAdminIdx: index("idx_collection_osp_saved_targets_assigned_admin_active")
    .on(table.assignedAdminUserId, table.updatedAt.desc(), table.id)
    .where(sql`${table.status} = 'ACTIVE'`),
  targetNameCheck: check(
    "chk_collection_osp_saved_targets_name",
    sql`char_length(${table.targetName}) BETWEEN 1 AND 120
      AND ${table.targetName} = trim(${table.targetName})
      AND ${table.targetName} !~ '[[:cntrl:]]'`,
  ),
  normalizedNameCheck: check(
    "chk_collection_osp_saved_targets_normalized_name",
    sql`char_length(${table.normalizedName}) BETWEEN 1 AND 120
      AND ${table.normalizedName} = lower(trim(${table.normalizedName}))
      AND ${table.normalizedName} !~ '[[:cntrl:]]'`,
  ),
  descriptionCheck: check(
    "chk_collection_osp_saved_targets_description",
    sql`${table.description} IS NULL OR char_length(${table.description}) <= 1000`,
  ),
  statusCheck: check(
    "chk_collection_osp_saved_targets_status",
    sql`${table.status} IN ('ACTIVE', 'DELETED')`,
  ),
  versionCheck: check("chk_collection_osp_saved_targets_version", sql`${table.version} >= 1`),
  deletionStateCheck: check(
    "chk_collection_osp_saved_targets_deletion_state",
    sql`(
      ${table.status} = 'ACTIVE'
      AND ${table.deletedAt} IS NULL
      AND ${table.deletedBy} IS NULL
    ) OR (
      ${table.status} = 'DELETED'
      AND ${table.deletedAt} IS NOT NULL
      AND ${table.deletedBy} IS NOT NULL
    )`,
  ),
}));

export const collectionOspTargetRevisions = pgTable("collection_osp_target_revisions", {
  id: uuid("id").primaryKey(),
  targetId: uuid("target_id")
    .notNull()
    .references(() => collectionOspSavedTargets.id, { onDelete: "restrict", onUpdate: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  sourceScopeHash: text("source_scope_hash").notNull(),
  periodFrom: date("period_from", { mode: "string" }).notNull(),
  periodTo: date("period_to", { mode: "string" }).notNull(),
  trackingStartDate: date("tracking_start_date", { mode: "string" }).notNull(),
  trackingEndDate: date("tracking_end_date", { mode: "string" }),
  timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
  nicknameScope: text("nickname_scope").array().notNull().default(sql`ARRAY[]::text[]`),
  agingScope: text("aging_scope").array().notNull()
    .default(sql`ARRAY['D3', 'D4', 'D5', 'D6']::text[]`),
  calculationVersion: text("calculation_version").notNull().default("osp-effective-settlement-v9"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  targetRevisionUnique: uniqueIndex("idx_collection_osp_target_revisions_target_number_unique")
    .on(table.targetId, table.revisionNumber),
  targetIdRevisionIdUnique: uniqueIndex("idx_collection_osp_target_revisions_target_id_id_unique")
    .on(table.targetId, table.id),
  targetCreatedAtIdx: index("idx_collection_osp_target_revisions_target_created_at")
    .on(table.targetId, table.createdAt.desc()),
  periodIdx: index("idx_collection_osp_target_revisions_period").on(table.periodFrom, table.periodTo),
  revisionNumberCheck: check(
    "chk_collection_osp_target_revisions_number",
    sql`${table.revisionNumber} >= 1`,
  ),
  sourceScopeHashCheck: check(
    "chk_collection_osp_target_revisions_source_scope_hash",
    sql`${table.sourceScopeHash} ~ '^[0-9a-f]{64}$'`,
  ),
  periodCheck: check(
    "chk_collection_osp_target_revisions_period",
    sql`${table.periodFrom} <= ${table.periodTo}`,
  ),
  trackingPeriodCheck: check(
    "chk_collection_osp_target_revisions_tracking_period",
    sql`${table.trackingStartDate} BETWEEN ${table.periodFrom} AND ${table.periodTo}
      AND (${table.trackingEndDate} IS NULL OR (
        ${table.trackingEndDate} BETWEEN ${table.trackingStartDate} AND ${table.periodTo}
      ))`,
  ),
  timezoneCheck: check(
    "chk_collection_osp_target_revisions_timezone",
    sql`char_length(trim(${table.timezone})) BETWEEN 1 AND 80
      AND ${table.timezone} !~ '[[:cntrl:]]'`,
  ),
  nicknameScopeCheck: check(
    "chk_collection_osp_target_revisions_nickname_scope",
    sql`cardinality(${table.nicknameScope}) <= 200`,
  ),
  agingScopeCheck: check(
    "chk_collection_osp_target_revisions_aging_scope",
    sql`${table.agingScope} = ARRAY['D3', 'D4', 'D5', 'D6']::text[]`,
  ),
  calculationVersionCheck: check(
    "chk_collection_osp_target_revisions_calculation_version",
    sql`char_length(trim(${table.calculationVersion})) BETWEEN 1 AND 80`,
  ),
}));

/**
 * Minimal immutable source metadata retained by a target revision. There is
 * deliberately no FK to imports: disabling or permanently removing an import
 * must not erase the historical target label or source identity.
 */
export const collectionOspTargetSources = pgTable("collection_osp_target_sources", {
  targetRevisionId: uuid("target_revision_id")
    .notNull()
    .references(() => collectionOspTargetRevisions.id, { onDelete: "restrict", onUpdate: "cascade" }),
  sourceImportId: text("source_import_id").notNull(),
  sourceNameSnapshot: text("source_name_snapshot").notNull(),
  sourceFilenameSnapshot: text("source_filename_snapshot").notNull(),
  sourceVersionSnapshot: text("source_version_snapshot"),
  sourceContentHashSnapshot: text("source_content_hash_snapshot"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({
    name: "pk_collection_osp_target_sources",
    columns: [table.targetRevisionId, table.sourceImportId],
  }),
  sourceImportIdx: index("idx_collection_osp_target_sources_import_id").on(table.sourceImportId),
  sourceTextCheck: check(
    "chk_collection_osp_target_sources_text",
    sql`char_length(trim(${table.sourceImportId})) BETWEEN 1 AND 200
      AND char_length(${table.sourceNameSnapshot}) BETWEEN 1 AND 300
      AND char_length(${table.sourceFilenameSnapshot}) BETWEEN 1 AND 500
      AND ${table.sourceNameSnapshot} !~ '[[:cntrl:]]'
      AND ${table.sourceFilenameSnapshot} !~ '[[:cntrl:]]'`,
  ),
  sourceHashCheck: check(
    "chk_collection_osp_target_sources_content_hash",
    sql`${table.sourceContentHashSnapshot} IS NULL
      OR ${table.sourceContentHashSnapshot} ~ '^[0-9a-f]{64}$'`,
  ),
}));

/**
 * Immutable row-level source facts captured when a target revision is created.
 *
 * Reports and reconciliation candidates read these snapshots instead of the
 * mutable source index, so disabling or deleting an import cannot rewrite a
 * previously saved target's history. Plaintext account/customer identifiers are
 * deliberately excluded.
 */
export const collectionOspTargetSourceRows = pgTable("collection_osp_target_source_rows", {
  targetRevisionId: uuid("target_revision_id").notNull(),
  sourceImportId: text("source_import_id").notNull(),
  sourceDataRowId: text("source_data_row_id").notNull(),
  canonicalObligationKey: text("canonical_obligation_key").notNull(),
  cycleKey: text("cycle_key").notNull(),
  accountNumberEncrypted: text("account_number_encrypted"),
  accountNumberSearchHash: text("account_number_search_hash"),
  cardNumberLast4: text("card_number_last4"),
  cardNumberEncrypted: text("card_number_encrypted"),
  identificationNumberEncrypted: text("identification_number_encrypted"),
  phoneEncrypted: text("phone_encrypted"),
  customerNameEncrypted: text("customer_name_encrypted"),
  customerNameSearchHashes: text("customer_name_search_hashes").array(),
  agingBucket: text("aging_bucket").notNull(),
  callingDate: date("calling_date", { mode: "string" }).notNull(),
  callingWindowEndExclusive: date("calling_window_end_exclusive", { mode: "string" }).notNull(),
  totalDue: numeric("total_due", { precision: 16, scale: 2 }).notNull(),
  billingPrincipalOsp: numeric("billing_principal_osp", { precision: 16, scale: 2 }).notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({
    name: "pk_collection_osp_target_source_rows",
    columns: [table.targetRevisionId, table.sourceImportId, table.sourceDataRowId],
  }),
  targetSourceForeignKey: foreignKey({
    name: "collection_osp_target_source_rows_target_source_fkey",
    columns: [table.targetRevisionId, table.sourceImportId],
    foreignColumns: [collectionOspTargetSources.targetRevisionId, collectionOspTargetSources.sourceImportId],
  }).onDelete("restrict").onUpdate("cascade"),
  revisionCycleUnique: uniqueIndex("idx_collection_osp_target_source_rows_revision_cycle_unique")
    .on(table.targetRevisionId, table.cycleKey),
  revisionAgingCallingIdx: index("idx_collection_osp_target_source_rows_revision_aging_calling")
    .on(table.targetRevisionId, table.agingBucket, table.callingDate),
  accountSearchIdx: index("idx_collection_osp_target_source_rows_account_search_hash")
    .on(table.accountNumberSearchHash),
  customerSearchIdx: index("idx_collection_osp_target_source_rows_customer_search_hashes")
    .using("gin", table.customerNameSearchHashes),
  identityCheck: check(
    "chk_collection_osp_target_source_rows_identity",
    sql`char_length(trim(${table.sourceImportId})) BETWEEN 1 AND 200
      AND char_length(trim(${table.sourceDataRowId})) BETWEEN 1 AND 200
      AND char_length(${table.canonicalObligationKey}) BETWEEN 1 AND 160
      AND char_length(${table.cycleKey}) BETWEEN 1 AND 192
      AND (${table.accountNumberEncrypted} IS NOT NULL OR ${table.cardNumberLast4} IS NOT NULL)
      AND (
        (${table.accountNumberEncrypted} IS NULL AND ${table.accountNumberSearchHash} IS NULL)
        OR (
          char_length(${table.accountNumberEncrypted}) > 0
          AND ${table.accountNumberSearchHash} ~ '^[0-9a-f]{64}$'
        )
      )
      AND (${table.cardNumberLast4} IS NULL OR ${table.cardNumberLast4} ~ '^[0-9]{4}$')
      AND (${table.customerNameEncrypted} IS NULL OR char_length(${table.customerNameEncrypted}) > 0)`,
  ),
  customerSearchHashesCheck: check(
    "chk_collection_osp_target_source_rows_customer_hashes",
    sql`${table.customerNameSearchHashes} IS NULL
      OR (
        cardinality(${table.customerNameSearchHashes}) BETWEEN 0 AND 128
        AND array_position(${table.customerNameSearchHashes}, NULL) IS NULL
      )`,
  ),
  detailEncryptionCheck: check(
    "chk_collection_osp_target_source_rows_detail_encryption",
    sql`(${table.cardNumberEncrypted} IS NULL OR char_length(${table.cardNumberEncrypted}) > 0)
      AND (${table.identificationNumberEncrypted} IS NULL OR char_length(${table.identificationNumberEncrypted}) > 0)
      AND (${table.phoneEncrypted} IS NULL OR char_length(${table.phoneEncrypted}) > 0)`,
  ),
  trustedSnapshotCheck: check(
    "chk_collection_osp_target_source_rows_snapshot",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')
      AND ${table.totalDue} > 0
      AND ${table.billingPrincipalOsp} >= 0
      AND ${table.callingWindowEndExclusive} = (${table.callingDate} + INTERVAL '1 month')::date`,
  ),
}));

export const collectionOspTargetAgingRows = pgTable("collection_osp_target_aging_rows", {
  targetRevisionId: uuid("target_revision_id")
    .notNull()
    .references(() => collectionOspTargetRevisions.id, { onDelete: "restrict", onUpdate: "cascade" }),
  agingBucket: text("aging_bucket").notNull(),
  totalOspBaseline: numeric("total_osp_baseline", { precision: 16, scale: 2 }).notNull(),
  targetPercentage: numeric("target_percentage", { precision: 7, scale: 4 }).notNull(),
  targetOsp: numeric("target_osp", { precision: 16, scale: 2 }).notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({
    name: "pk_collection_osp_target_aging_rows",
    columns: [table.targetRevisionId, table.agingBucket],
  }),
  agingCheck: check(
    "chk_collection_osp_target_aging_rows_aging",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')`,
  ),
  moneyCheck: check(
    "chk_collection_osp_target_aging_rows_money",
    sql`${table.totalOspBaseline} >= 0 AND ${table.targetOsp} >= 0`,
  ),
  targetPercentageCheck: check(
    "chk_collection_osp_target_aging_rows_percentage",
    sql`${table.targetPercentage} >= 0 AND ${table.targetPercentage} <= 100`,
  ),
  targetConsistencyCheck: check(
    "chk_collection_osp_target_aging_rows_consistency",
    sql`${table.targetOsp} = round(${table.totalOspBaseline} * ${table.targetPercentage} / 100, 2)`,
  ),
}));

export const collectionOspClientResults = pgTable("collection_osp_client_results", {
  id: uuid("id").primaryKey(),
  targetId: uuid("target_id").notNull(),
  targetRevisionId: uuid("target_revision_id").notNull(),
  asOfDate: date("as_of_date", { mode: "string" }).notNull(),
  agingBucket: text("aging_bucket").notNull(),
  resultPercentage: numeric("result_percentage", { precision: 9, scale: 4 }).notNull(),
  ospClosed: numeric("osp_closed", { precision: 16, scale: 2 }).notNull(),
  clientReference: text("client_reference"),
  note: text("note"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  targetRevisionForeignKey: foreignKey({
    name: "collection_osp_client_results_target_revision_fkey",
    columns: [table.targetId, table.targetRevisionId],
    foreignColumns: [collectionOspTargetRevisions.targetId, collectionOspTargetRevisions.id],
  }).onDelete("restrict").onUpdate("cascade"),
  targetDateAgingUnique: uniqueIndex("idx_collection_osp_client_results_revision_date_aging_unique")
    .on(table.targetRevisionId, table.asOfDate, table.agingBucket),
  targetDateIdx: index("idx_collection_osp_client_results_target_date")
    .on(table.targetId, table.asOfDate.desc()),
  agingCheck: check(
    "chk_collection_osp_client_results_aging",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6', 'ALL')`,
  ),
  amountCheck: check(
    "chk_collection_osp_client_results_amount",
    sql`${table.ospClosed} >= 0 AND ${table.resultPercentage} >= 0 AND ${table.resultPercentage} <= 100`,
  ),
  textCheck: check(
    "chk_collection_osp_client_results_text",
    sql`(${table.clientReference} IS NULL OR char_length(${table.clientReference}) <= 300)
      AND (${table.note} IS NULL OR char_length(${table.note}) <= 2000)`,
  ),
  versionCheck: check("chk_collection_osp_client_results_version", sql`${table.version} >= 1`),
}));

/**
 * Viewer-private TABLE B. The legacy shared client table above is retained for
 * audit only: it never recorded a private target percentage or reliable owner
 * for a complete save, so migration must not fabricate private historical data.
 * A source/baseline revision stays stable when shared A percentages change.
 */
export const collectionOspPrivateClientResults = pgTable("collection_osp_private_client_results", {
  id: uuid("id").primaryKey(),
  targetId: uuid("target_id").notNull(),
  targetRevisionId: uuid("target_revision_id").notNull(),
  ownerUserId: text("owner_user_id").notNull()
    .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  agingBucket: text("aging_bucket").notNull(),
  targetPercentage: numeric("target_percentage", { precision: 7, scale: 4 }).notNull(),
  resultPercentage: numeric("result_percentage", { precision: 9, scale: 4 }).notNull(),
  ospClosed: numeric("osp_closed", { precision: 16, scale: 2 }).notNull(),
  asOfDate: date("as_of_date", { mode: "string" }).notNull(),
  clientReference: text("client_reference"),
  note: text("note"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedBy: text("updated_by").notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  targetRevisionForeignKey: foreignKey({
    name: "collection_osp_private_client_results_target_revision_fkey",
    columns: [table.targetId, table.targetRevisionId],
    foreignColumns: [collectionOspTargetRevisions.targetId, collectionOspTargetRevisions.id],
  }).onDelete("restrict").onUpdate("cascade"),
  ownerAgingUnique: uniqueIndex("idx_collection_osp_private_client_results_owner_aging_unique")
    .on(table.targetRevisionId, table.ownerUserId, table.agingBucket),
  ownerTargetIdx: index("idx_collection_osp_private_client_results_owner_target")
    .on(table.ownerUserId, table.targetId),
  agingCheck: check("chk_collection_osp_private_client_results_aging",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')`),
  percentageCheck: check("chk_collection_osp_private_client_results_percentage",
    sql`${table.targetPercentage} BETWEEN 0 AND 100 AND ${table.resultPercentage} BETWEEN 0 AND 100`),
  amountCheck: check("chk_collection_osp_private_client_results_amount", sql`${table.ospClosed} >= 0`),
  textCheck: check("chk_collection_osp_private_client_results_text",
    sql`(${table.clientReference} IS NULL OR char_length(${table.clientReference}) <= 300)
      AND (${table.note} IS NULL OR char_length(${table.note}) <= 2000)`),
  versionCheck: check("chk_collection_osp_private_client_results_version", sql`${table.version} >= 1`),
}));

export const collectionOspManualReconciliations = pgTable("collection_osp_manual_reconciliations", {
  id: uuid("id").primaryKey(),
  targetId: uuid("target_id").notNull(),
  targetRevisionId: uuid("target_revision_id").notNull(),
  sourceImportId: text("source_import_id").notNull(),
  sourceDataRowId: text("source_data_row_id").notNull(),
  canonicalObligationKey: text("canonical_obligation_key").notNull(),
  cycleKey: text("cycle_key").notNull(),
  accountNumberEncrypted: text("account_number_encrypted"),
  accountNumberSearchHash: text("account_number_search_hash"),
  cardNumberLast4: text("card_number_last4"),
  customerNameEncrypted: text("customer_name_encrypted"),
  agingBucket: text("aging_bucket").notNull(),
  callingDate: date("calling_date", { mode: "string" }).notNull(),
  callingWindowEndExclusive: date("calling_window_end_exclusive", { mode: "string" }).notNull(),
  totalDue: numeric("total_due", { precision: 16, scale: 2 }).notNull(),
  billingPrincipalOsp: numeric("billing_principal_osp", { precision: 16, scale: 2 }).notNull(),
  manualPriorAmount: numeric("manual_prior_amount", { precision: 16, scale: 2 }).notNull(),
  manualAsOfDate: date("manual_as_of_date", { mode: "string" }).notNull(),
  actualPaymentDate: date("actual_payment_date", { mode: "string" }),
  dateSource: text("date_source").notNull(),
  reasonCode: text("reason_code").notNull(),
  note: text("note"),
  evidenceReference: text("evidence_reference"),
  status: text("status").notNull().default("ACTIVE"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  voidedBy: text("voided_by")
    .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
  voidedAt: utcTimestamp("voided_at"),
  voidReason: text("void_reason"),
}, (table) => ({
  targetRevisionForeignKey: foreignKey({
    name: "collection_osp_manual_reconciliations_target_revision_fkey",
    columns: [table.targetId, table.targetRevisionId],
    foreignColumns: [collectionOspTargetRevisions.targetId, collectionOspTargetRevisions.id],
  }).onDelete("restrict").onUpdate("cascade"),
  targetSourceForeignKey: foreignKey({
    name: "collection_osp_manual_reconciliations_target_source_fkey",
    columns: [table.targetRevisionId, table.sourceImportId],
    foreignColumns: [collectionOspTargetSources.targetRevisionId, collectionOspTargetSources.sourceImportId],
  }).onDelete("restrict").onUpdate("cascade"),
  targetSourceRowForeignKey: foreignKey({
    name: "collection_osp_manual_reconciliations_source_row_fkey",
    columns: [table.targetRevisionId, table.sourceImportId, table.sourceDataRowId],
    foreignColumns: [
      collectionOspTargetSourceRows.targetRevisionId,
      collectionOspTargetSourceRows.sourceImportId,
      collectionOspTargetSourceRows.sourceDataRowId,
    ],
  }).onDelete("restrict").onUpdate("cascade"),
  activeAccountUnique: uniqueIndex("idx_collection_osp_manual_reconciliations_active_account_unique")
    .on(table.targetRevisionId, table.canonicalObligationKey, table.cycleKey)
    .where(sql`${table.status} = 'ACTIVE'`),
  targetStatusDateIdx: index("idx_collection_osp_manual_reconciliations_target_status_date")
    .on(table.targetRevisionId, table.status, table.manualAsOfDate),
  targetAgingDateIdx: index("idx_collection_osp_manual_reconciliations_target_aging_date")
    .on(table.targetRevisionId, table.agingBucket, table.manualAsOfDate),
  sourceRowIdx: index("idx_collection_osp_manual_reconciliations_source_row")
    .on(table.sourceImportId, table.sourceDataRowId),
  accountSearchIdx: index("idx_collection_osp_manual_reconciliations_account_search_hash")
    .on(table.accountNumberSearchHash),
  identityCheck: check(
    "chk_collection_osp_manual_reconciliations_identity",
    sql`char_length(${table.canonicalObligationKey}) BETWEEN 1 AND 160
      AND char_length(${table.cycleKey}) BETWEEN 1 AND 192
      AND char_length(trim(${table.sourceDataRowId})) BETWEEN 1 AND 200
      AND (${table.accountNumberEncrypted} IS NOT NULL OR ${table.cardNumberLast4} IS NOT NULL)
      AND (
        (${table.accountNumberEncrypted} IS NULL AND ${table.accountNumberSearchHash} IS NULL)
        OR (
          char_length(${table.accountNumberEncrypted}) > 0
          AND ${table.accountNumberSearchHash} ~ '^[0-9a-f]{64}$'
        )
      )
      AND (${table.cardNumberLast4} IS NULL OR ${table.cardNumberLast4} ~ '^[0-9]{4}$')`,
  ),
  trustedSnapshotCheck: check(
    "chk_collection_osp_manual_reconciliations_trusted_snapshot",
    sql`${table.agingBucket} IN ('D3', 'D4', 'D5', 'D6')
      AND ${table.totalDue} > 0
      AND ${table.billingPrincipalOsp} >= 0
      AND ${table.callingWindowEndExclusive} = (${table.callingDate} + INTERVAL '1 month')::date`,
  ),
  manualAmountCheck: check(
    "chk_collection_osp_manual_reconciliations_manual_amount",
    sql`${table.manualPriorAmount} > 0`,
  ),
  manualDateCheck: check(
    "chk_collection_osp_manual_reconciliations_manual_date",
    sql`${table.manualAsOfDate} >= ${table.callingDate}
      AND ${table.manualAsOfDate} < ${table.callingWindowEndExclusive}
      AND (${table.actualPaymentDate} IS NULL OR (
        ${table.actualPaymentDate} >= ${table.callingDate}
        AND ${table.actualPaymentDate} < ${table.callingWindowEndExclusive}
        AND ${table.actualPaymentDate} <= ${table.manualAsOfDate}
      ))`,
  ),
  dateSourceCheck: check(
    "chk_collection_osp_manual_reconciliations_date_source",
    sql`(
      ${table.dateSource} = 'ACTUAL_PAYMENT_DATE'
      AND ${table.actualPaymentDate} IS NOT NULL
    ) OR (
      ${table.dateSource} IN ('CLIENT_AS_OF', 'MANUAL_AS_OF')
      AND ${table.actualPaymentDate} IS NULL
    )`,
  ),
  reasonCodeCheck: check(
    "chk_collection_osp_manual_reconciliations_reason_code",
    sql`${table.reasonCode} IN (
      'PRIOR_PAYMENT_NOT_IN_SYSTEM',
      'CLIENT_CONFIRMED_PRIOR_PAYMENT',
      'HISTORICAL_PAYMENT_MISSING',
      'MIGRATED_HISTORY_GAP',
      'OTHER_WITH_REQUIRED_NOTE'
    ) AND (${table.reasonCode} <> 'OTHER_WITH_REQUIRED_NOTE' OR char_length(trim(COALESCE(${table.note}, ''))) > 0)`,
  ),
  textCheck: check(
    "chk_collection_osp_manual_reconciliations_text",
    sql`(${table.note} IS NULL OR char_length(${table.note}) <= 2000)
      AND (${table.evidenceReference} IS NULL OR char_length(${table.evidenceReference}) <= 300)
      AND (${table.voidReason} IS NULL OR char_length(${table.voidReason}) <= 500)`,
  ),
  versionCheck: check("chk_collection_osp_manual_reconciliations_version", sql`${table.version} >= 1`),
  statusCheck: check(
    "chk_collection_osp_manual_reconciliations_status",
    sql`${table.status} IN ('ACTIVE', 'VOIDED')`,
  ),
  voidStateCheck: check(
    "chk_collection_osp_manual_reconciliations_void_state",
    sql`(
      ${table.status} = 'ACTIVE'
      AND ${table.voidedAt} IS NULL
      AND ${table.voidedBy} IS NULL
      AND ${table.voidReason} IS NULL
    ) OR (
      ${table.status} = 'VOIDED'
      AND ${table.voidedAt} IS NOT NULL
      AND ${table.voidedBy} IS NOT NULL
      AND char_length(trim(COALESCE(${table.voidReason}, ''))) BETWEEN 1 AND 500
    )`,
  ),
}));

export const collectionOspManualReconciliationAudit = pgTable("collection_osp_manual_reconciliation_audit", {
    id: uuid("id").primaryKey(),
    reconciliationId: uuid("reconciliation_id").notNull(),
    targetId: uuid("target_id").notNull(),
    targetRevisionId: uuid("target_revision_id").notNull(),
    operation: text("operation").notNull(),
    fromVersion: integer("from_version"),
    toVersion: integer("to_version").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    actorUsername: text("actor_username")
      .notNull()
      .references(() => users.username, { onDelete: "restrict", onUpdate: "cascade" }),
    actorRole: text("actor_role").notNull(),
    requestId: text("request_id"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    reconciliationForeignKey: foreignKey({
      name: "collection_osp_manual_reconciliation_audit_reconciliation_fkey",
      columns: [table.reconciliationId],
      foreignColumns: [collectionOspManualReconciliations.id],
    }).onDelete("restrict").onUpdate("cascade"),
    targetRevisionForeignKey: foreignKey({
      name: "collection_osp_manual_reconciliation_audit_target_revision_fkey",
      columns: [table.targetId, table.targetRevisionId],
      foreignColumns: [collectionOspTargetRevisions.targetId, collectionOspTargetRevisions.id],
    }).onDelete("restrict").onUpdate("cascade"),
    reconciliationCreatedIdx: index("idx_collection_osp_manual_reconciliation_audit_reconciliation_created")
      .on(table.reconciliationId, table.createdAt.desc()),
    targetCreatedIdx: index("idx_collection_osp_manual_reconciliation_audit_target_created")
      .on(table.targetRevisionId, table.createdAt.desc()),
    operationCheck: check(
      "chk_collection_osp_manual_reconciliation_audit_operation",
      sql`${table.operation} IN ('CREATE', 'UPDATE', 'VOID', 'RESTORE')`,
    ),
    versionCheck: check(
      "chk_collection_osp_manual_reconciliation_audit_version",
      sql`${table.toVersion} >= 1
        AND (${table.fromVersion} IS NULL OR ${table.fromVersion} >= 1)
        AND (
          (${table.operation} = 'CREATE' AND ${table.fromVersion} IS NULL AND ${table.toVersion} = 1)
          OR (
            ${table.operation} <> 'CREATE'
            AND ${table.fromVersion} IS NOT NULL
            AND ${table.toVersion} = ${table.fromVersion} + 1
          )
        )`,
    ),
    stateCheck: check(
      "chk_collection_osp_manual_reconciliation_audit_state",
      sql`(${table.operation} = 'CREATE' AND ${table.beforeState} IS NULL AND ${table.afterState} IS NOT NULL)
        OR (${table.operation} <> 'CREATE' AND ${table.beforeState} IS NOT NULL AND ${table.afterState} IS NOT NULL)`,
    ),
    actorRoleCheck: check(
      "chk_collection_osp_manual_reconciliation_audit_actor_role",
      sql`${table.actorRole} = 'superuser'`,
    ),
    requestIdCheck: check(
      "chk_collection_osp_manual_reconciliation_audit_request_id",
      sql`${table.requestId} IS NULL OR char_length(${table.requestId}) <= 160`,
    ),
  }),
);

export const collectionRecordPurgeHistory = pgTable("collection_record_purge_history", {
  originalRecordId: uuid("original_record_id").primaryKey(),
  sourceImportId: text("source_import_id"),
  sourceDataRowId: text("source_data_row_id"),
  sourceObligationKey: text("source_obligation_key"),
  sourceImportName: text("source_import_name"),
  sourceFilename: text("source_filename"),
  icNumberSearchHash: text("ic_number_search_hash"),
  customerPhoneSearchHash: text("customer_phone_search_hash"),
  accountNumberSearchHash: text("account_number_search_hash"),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  automaticClassification: text("automatic_classification"),
  settlementOverrideStatus: text("settlement_override_status"),
  poolAmount: numeric("pool_amount", { precision: 14, scale: 2 }),
  manualSettlementDate: date("manual_settlement_date", { mode: "string" }),
  manualSettlementReason: text("manual_settlement_reason"),
  manualSettlementNote: text("manual_settlement_note"),
  manualSettlementReference: text("manual_settlement_reference"),
  manualSettlementVersion: integer("manual_settlement_version"),
  manualSettlementVerifiedBy: text("manual_settlement_verified_by"),
  manualSettlementVerifiedAt: utcTimestamp("manual_settlement_verified_at"),
  manualSettlementUpdatedBy: text("manual_settlement_updated_by"),
  manualSettlementUpdatedAt: utcTimestamp("manual_settlement_updated_at"),
  manualSettlementRevokedBy: text("manual_settlement_revoked_by"),
  manualSettlementRevokedAt: utcTimestamp("manual_settlement_revoked_at"),
  manualSettlementRevokedReason: text("manual_settlement_revoked_reason"),
  createdByLogin: text("created_by_login").notNull(),
  collectionStaffNickname: text("collection_staff_nickname").notNull(),
  originalCreatedAt: utcTimestamp("original_created_at").notNull(),
  purgedAt: utcTimestamp("purged_at").defaultNow().notNull(),
  purgedBy: text("purged_by").notNull(),
  purgeReason: text("purge_reason").notNull().default("retention_policy"),
}, (table) => ({
  sourceImportIdIdx: index("idx_collection_record_purge_history_source_import_id")
    .on(table.sourceImportId),
  sourceDataRowIdIdx: index("idx_collection_record_purge_history_source_data_row_id")
    .on(table.sourceDataRowId),
  obligationOrderIdx: index("idx_collection_record_purge_history_obligation_order")
    .on(
      table.sourceObligationKey,
      table.paymentDate.desc(),
      table.originalCreatedAt.desc(),
      table.originalRecordId.desc(),
    )
    .where(sql`${table.sourceObligationKey} IS NOT NULL`),
  icNumberSearchHashIdx: index("idx_collection_record_purge_history_ic_search_hash")
    .on(table.icNumberSearchHash),
  customerPhoneSearchHashIdx: index("idx_collection_record_purge_history_phone_search_hash")
    .on(table.customerPhoneSearchHash),
  accountNumberSearchHashIdx: index("idx_collection_record_purge_history_account_search_hash")
    .on(table.accountNumberSearchHash),
  createdByLoginIdx: index("idx_collection_record_purge_history_created_by")
    .on(table.createdByLogin),
  nicknameLowerIdx: index("idx_collection_record_purge_history_nickname_lower").using(
    "btree",
    sql`lower(${table.collectionStaffNickname})`,
  ),
  purgedAtIdx: index("idx_collection_record_purge_history_purged_at").on(table.purgedAt.desc()),
  purgeReasonCheck: check(
    "chk_collection_record_purge_history_reason",
    sql`${table.purgeReason} IN ('retention_policy')`,
  ),
}));

export const collectionRecordReceipts = pgTable("collection_record_receipts", {
  id: uuid("id").primaryKey(),
  collectionRecordId: uuid("collection_record_id")
    .notNull()
    .references(() => collectionRecords.id, { onDelete: "cascade", onUpdate: "cascade" }),
  storagePath: text("storage_path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  originalMimeType: text("original_mime_type").notNull(),
  originalExtension: text("original_extension").notNull().default(""),
  fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
  // Receipt amounts are normalized to integer sen/cents before persistence.
  receiptAmount: bigint("receipt_amount", { mode: "number" }),
  extractedAmount: bigint("extracted_amount", { mode: "number" }),
  extractionStatus: text("extraction_status").notNull().default("unprocessed"),
  extractionConfidence: numeric("extraction_confidence", { precision: 5, scale: 4 }),
  receiptDate: date("receipt_date", { mode: "string" }),
  receiptReference: text("receipt_reference"),
  fileHash: text("file_hash"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recordStorageUnique: uniqueIndex("idx_collection_record_receipts_record_storage_unique").on(
    table.collectionRecordId,
    table.storagePath,
  ),
  recordFileHashUnique: uniqueIndex("idx_collection_record_receipts_record_file_hash_unique")
    .on(table.collectionRecordId, table.fileHash),
  fileHashIdx: index("idx_collection_record_receipts_file_hash").on(table.fileHash),
  extractionStatusIdx: index("idx_collection_record_receipts_extraction_status").on(
    table.extractionStatus,
  ),
  receiptDateIdx: index("idx_collection_record_receipts_receipt_date")
    .on(table.receiptDate)
    .where(sql`${table.receiptDate} IS NOT NULL`),
  recordCreatedAtIdx: index("idx_collection_record_receipts_record_created_at").on(
    table.collectionRecordId,
    table.createdAt,
  ),
  suggestedStatusRequiresExtractedAmount: check(
    "chk_collection_record_receipts_suggested_extracted_amount",
    sql`${table.extractionStatus} <> 'suggested' OR ${table.extractedAmount} IS NOT NULL`,
  ),
}));

export const collectionRecordDailyRollups = pgTable("collection_record_daily_rollups", {
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  createdByLogin: text("created_by_login").notNull(),
  collectionStaffNickname: text("collection_staff_nickname").notNull(),
  totalRecords: integer("total_records").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  slicePrimaryKey: primaryKey({
    name: "idx_collection_record_daily_rollups_slice_unique",
    columns: [table.paymentDate, table.createdByLogin, table.collectionStaffNickname],
  }),
  paymentDateIdx: index("idx_collection_record_daily_rollups_payment_date").on(table.paymentDate),
  createdByPaymentDateIdx: index("idx_collection_record_daily_rollups_created_by_payment_date").on(
    table.createdByLogin,
    table.paymentDate,
  ),
  nicknameLowerPaymentDateIdx: index("idx_collection_record_daily_rollups_lower_nickname_payment_date").using(
    "btree",
    sql`lower(${table.collectionStaffNickname})`,
    table.paymentDate,
  ),
}));

export const collectionRecordMonthlyRollups = pgTable("collection_record_monthly_rollups", {
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  createdByLogin: text("created_by_login").notNull(),
  collectionStaffNickname: text("collection_staff_nickname").notNull(),
  totalRecords: integer("total_records").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  slicePrimaryKey: primaryKey({
    name: "idx_collection_record_monthly_rollups_slice_unique",
    columns: [table.year, table.month, table.createdByLogin, table.collectionStaffNickname],
  }),
  yearMonthIdx: index("idx_collection_record_monthly_rollups_year_month").on(table.year, table.month),
  createdByYearMonthIdx: index("idx_collection_record_monthly_rollups_created_by_year_month").on(
    table.createdByLogin,
    table.year,
    table.month,
  ),
  nicknameLowerYearMonthIdx: index("idx_collection_record_monthly_rollups_lower_nickname_year_month").using(
    "btree",
    sql`lower(${table.collectionStaffNickname})`,
    table.year,
    table.month,
  ),
}));

export const collectionRecordDailyRollupRefreshQueue = pgTable("collection_record_daily_rollup_refresh_queue", {
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  createdByLogin: text("created_by_login").notNull(),
  collectionStaffNickname: text("collection_staff_nickname").notNull(),
  status: text("status").notNull().default("queued"),
  requestedAt: utcTimestamp("requested_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  nextAttemptAt: utcTimestamp("next_attempt_at").defaultNow().notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
}, (table) => ({
  slicePrimaryKey: primaryKey({
    name: "idx_collection_rollup_refresh_queue_slice_unique",
    columns: [table.paymentDate, table.createdByLogin, table.collectionStaffNickname],
  }),
  statusNextAttemptIdx: index("idx_collection_rollup_refresh_queue_status_next_attempt").on(
    table.status,
    table.nextAttemptAt,
  ),
  updatedAtIdx: index("idx_collection_rollup_refresh_queue_updated_at").on(table.updatedAt),
  nicknameLowerPaymentDateIdx: index("idx_collection_rollup_refresh_queue_lower_nickname_payment_date").using(
    "btree",
    sql`lower(${table.collectionStaffNickname})`,
    table.paymentDate,
  ),
}));

export const collectionStaffNicknames = pgTable("collection_staff_nicknames", {
  id: uuid("id").primaryKey(),
  nickname: text("nickname").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  roleScope: text("role_scope").notNull().default("both"),
  nicknamePasswordHash: text("nickname_password_hash"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  passwordResetBySuperuser: boolean("password_reset_by_superuser").notNull().default(false),
  passwordUpdatedAt: utcTimestamp("password_updated_at"),
  createdBy: text("created_by").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  nicknameLowerUnique: uniqueIndex("idx_collection_staff_nicknames_lower_unique").using(
    "btree",
    sql`lower(${table.nickname})`,
  ),
  activeIdx: index("idx_collection_staff_nicknames_active").on(table.isActive),
  roleScopeIdx: index("idx_collection_staff_nicknames_role_scope").on(table.roleScope),
  mustChangePasswordIdx: index("idx_collection_staff_nicknames_must_change_password").on(table.mustChangePassword),
  passwordResetIdx: index("idx_collection_staff_nicknames_password_reset").on(table.passwordResetBySuperuser),
}));

export const adminGroups = pgTable("admin_groups", {
  id: uuid("id").primaryKey(),
  leaderNicknameId: uuid("leader_nickname_id")
    .notNull()
    .references(() => collectionStaffNicknames.id, { onDelete: "restrict", onUpdate: "cascade" }),
  // Retained as a compatibility/display snapshot. Team identity is the UUID.
  leaderNickname: text("leader_nickname").notNull(),
  createdBy: text("created_by").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  leaderNicknameIdUnique: uniqueIndex("idx_admin_groups_leader_nickname_id_unique").on(
    table.leaderNicknameId,
  ),
  leaderNicknameLowerUnique: uniqueIndex("idx_admin_groups_leader_nickname_unique").using(
    "btree",
    sql`lower(${table.leaderNickname})`,
  ),
}));

export const adminGroupMembers = pgTable("admin_group_members", {
  id: uuid("id").primaryKey(),
  adminGroupId: uuid("admin_group_id")
    .notNull()
    .references(() => adminGroups.id, { onDelete: "cascade", onUpdate: "cascade" }),
  memberNicknameId: uuid("member_nickname_id")
    .notNull()
    .references(() => collectionStaffNicknames.id, { onDelete: "restrict", onUpdate: "cascade" }),
  // Retained as a compatibility/display snapshot. Membership identity is the UUID.
  memberNickname: text("member_nickname").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  groupMemberNicknameIdUnique: uniqueIndex("idx_admin_group_members_group_member_nickname_id_unique").on(
    table.adminGroupId,
    table.memberNicknameId,
  ),
  memberNicknameIdUnique: uniqueIndex("idx_admin_group_members_member_nickname_id_unique").on(
    table.memberNicknameId,
  ),
  groupMemberLowerUnique: uniqueIndex("idx_admin_group_members_group_member_unique").using(
    "btree",
    table.adminGroupId,
    sql`lower(${table.memberNickname})`,
  ),
  memberLowerUnique: uniqueIndex("idx_admin_group_members_member_unique").using(
    "btree",
    sql`lower(${table.memberNickname})`,
  ),
  groupIdx: index("idx_admin_group_members_group").on(table.adminGroupId),
}));

export const collectionNicknameSessions = pgTable("collection_nickname_sessions", {
  activityId: text("activity_id")
    .primaryKey()
    .references(() => userActivity.id, { onDelete: "cascade", onUpdate: "cascade" }),
  username: text("username").notNull(),
  userRole: text("user_role").notNull(),
  nickname: text("nickname").notNull(),
  verifiedAt: utcTimestamp("verified_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  usernameIdx: index("idx_collection_nickname_sessions_username").on(table.username),
  nicknameLowerIdx: index("idx_collection_nickname_sessions_nickname").using(
    "btree",
    sql`lower(${table.nickname})`,
  ),
  updatedAtIdx: index("idx_collection_nickname_sessions_updated_at").on(table.updatedAt),
}));

export const adminVisibleNicknames = pgTable("admin_visible_nicknames", {
  id: uuid("id").primaryKey(),
  adminUserId: text("admin_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  nicknameId: uuid("nickname_id")
    .notNull()
    .references(() => collectionStaffNicknames.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdBySuperuser: text("created_by_superuser"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminNicknameUnique: uniqueIndex("idx_admin_visible_nicknames_admin_nickname_unique").on(
    table.adminUserId,
    table.nicknameId,
  ),
  adminIdx: index("idx_admin_visible_nicknames_admin").on(table.adminUserId),
  nicknameIdx: index("idx_admin_visible_nicknames_nickname").on(table.nicknameId),
}));

export const collectionDailyTargets = pgTable("collection_daily_targets", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  monthlyTarget: numeric("monthly_target", { precision: 14, scale: 2 }).notNull().default("0"),
  createdBy: text("created_by").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  updatedBy: text("updated_by").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userMonthLowerUnique: uniqueIndex("idx_collection_daily_targets_user_month_unique").using(
    "btree",
    sql`lower(${table.username})`,
    table.year,
    table.month,
  ),
  yearMonthIdx: index("idx_collection_daily_targets_year_month").on(table.year, table.month),
}));

export const collectionDailyCalendar = pgTable("collection_daily_calendar", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull().default(""),
  calendarDate: date("calendar_date", { mode: "string" }).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  day: integer("day").notNull(),
  status: text("status").notNull().default("WORKING"),
  leaveType: text("leave_type"),
  note: text("note"),
  isWorkingDay: boolean("is_working_day").notNull().default(true),
  isHoliday: boolean("is_holiday").notNull().default(false),
  holidayName: text("holiday_name"),
  createdBy: text("created_by").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  updatedBy: text("updated_by").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  usernameDateUnique: uniqueIndex("idx_collection_daily_calendar_username_date_unique").using(
    "btree",
    sql`lower(${table.username})`,
    table.calendarDate,
  ),
  yearMonthIdx: index("idx_collection_daily_calendar_year_month").on(table.year, table.month),
  usernameYearMonthIdx: index("idx_collection_daily_calendar_username_year_month").using(
    "btree",
    sql`lower(${table.username})`,
    table.year,
    table.month,
  ),
  statusCheck: check(
    "chk_collection_daily_calendar_status",
    sql`${table.status} IN ('WORKING', 'HOLIDAY')`,
  ),
  leaveTypeCheck: check(
    "chk_collection_daily_calendar_leave_type",
    sql`${table.leaveType} IS NULL OR ${table.leaveType} IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')`,
  ),
}));

export const collectionDailyCalendarAudit = pgTable("collection_daily_calendar_audit", {
  id: uuid("id").primaryKey(),
  calendarId: uuid("calendar_id"),
  username: text("username").notNull(),
  calendarDate: date("calendar_date", { mode: "string" }).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  day: integer("day").notNull(),
  action: text("action").notNull(),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  oldLeaveType: text("old_leave_type"),
  newLeaveType: text("new_leave_type"),
  oldNote: text("old_note"),
  newNote: text("new_note"),
  oldHolidayName: text("old_holiday_name"),
  newHolidayName: text("new_holiday_name"),
  actor: text("actor").references(() => users.username, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  lookupIdx: index("idx_collection_daily_calendar_audit_lookup").using(
    "btree",
    sql`lower(${table.username})`,
    table.calendarDate,
    table.createdAt.desc(),
  ),
  monthIdx: index("idx_collection_daily_calendar_audit_month").using(
    "btree",
    sql`lower(${table.username})`,
    table.year,
    table.month,
    table.day,
  ),
  actionCheck: check(
    "chk_collection_daily_calendar_audit_action",
    sql`${table.action} IN ('CREATE', 'UPDATE', 'DELETE')`,
  ),
  oldStatusCheck: check(
    "chk_collection_daily_calendar_audit_old_status",
    sql`${table.oldStatus} IS NULL OR ${table.oldStatus} IN ('WORKING', 'HOLIDAY')`,
  ),
  newStatusCheck: check(
    "chk_collection_daily_calendar_audit_new_status",
    sql`${table.newStatus} IS NULL OR ${table.newStatus} IN ('WORKING', 'HOLIDAY')`,
  ),
  oldLeaveTypeCheck: check(
    "chk_collection_daily_calendar_audit_old_leave_type",
    sql`${table.oldLeaveType} IS NULL OR ${table.oldLeaveType} IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')`,
  ),
  newLeaveTypeCheck: check(
    "chk_collection_daily_calendar_audit_new_leave_type",
    sql`${table.newLeaveType} IS NULL OR ${table.newLeaveType} IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')`,
  ),
}));
