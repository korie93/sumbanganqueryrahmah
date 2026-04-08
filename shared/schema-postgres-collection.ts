import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userActivity, users } from "./schema-postgres-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const collectionRecords = pgTable("collection_records", {
  id: uuid("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerNameEncrypted: text("customer_name_encrypted"),
  customerNameSearchHash: text("customer_name_search_hash"),
  customerNameSearchHashes: text("customer_name_search_hashes").array(),
  icNumber: text("ic_number").notNull(),
  icNumberEncrypted: text("ic_number_encrypted"),
  icNumberSearchHash: text("ic_number_search_hash"),
  customerPhone: text("customer_phone").notNull(),
  customerPhoneEncrypted: text("customer_phone_encrypted"),
  customerPhoneSearchHash: text("customer_phone_search_hash"),
  accountNumber: text("account_number").notNull(),
  accountNumberEncrypted: text("account_number_encrypted"),
  accountNumberSearchHash: text("account_number_search_hash"),
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
  createdByLogin: text("created_by_login").notNull(),
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
  createdBy: text("created_by"),
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
  leaderNickname: text("leader_nickname").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
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
  memberNickname: text("member_nickname").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
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
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
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
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  day: integer("day").notNull(),
  isWorkingDay: boolean("is_working_day").notNull().default(true),
  isHoliday: boolean("is_holiday").notNull().default(false),
  holidayName: text("holiday_name"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  yearMonthDayUnique: uniqueIndex("idx_collection_daily_calendar_unique").on(
    table.year,
    table.month,
    table.day,
  ),
  yearMonthIdx: index("idx_collection_daily_calendar_year_month").on(table.year, table.month),
}));
