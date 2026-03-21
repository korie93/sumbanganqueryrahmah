import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  passwordResetBySuperuser: boolean("password_reset_by_superuser").default(false).notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  passwordChangedAt: timestamp("password_changed_at"),
  activatedAt: timestamp("activated_at"),
  lastLoginAt: timestamp("last_login_at"),
  isBanned: boolean("is_banned").default(false),
});

export const accountActivationTokens = pgTable("account_activation_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_account_activation_tokens_user_id").on(table.userId),
  expiresAtIdx: index("idx_account_activation_tokens_expires_at").on(table.expiresAt),
  tokenHashUnique: uniqueIndex("idx_account_activation_tokens_hash_unique").on(table.tokenHash),
}));

export const passwordResetRequests = pgTable("password_reset_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  requestedByUser: text("requested_by_user"),
  approvedBy: text("approved_by"),
  resetType: text("reset_type").notNull().default("email_link"),
  tokenHash: text("token_hash"),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_password_reset_requests_user_id").on(table.userId),
  createdAtIdx: index("idx_password_reset_requests_created_at").on(table.createdAt),
}));

export const imports = pgTable("imports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").default(false),
  createdBy: text("created_by"),
});

export const dataRows = pgTable("data_rows", {
  id: text("id").primaryKey(),
  importId: text("import_id").notNull(),
  jsonDataJsonb: jsonb("json_data").notNull(), // guna satu column sahaja
});

export const userActivity = pgTable("user_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  username: text("username").notNull(),
  role: text("role").notNull(),
  pcName: text("pc_name"),
  browser: text("browser"),
  fingerprint: text("fingerprint"),
  ipAddress: text("ip_address"),
  loginTime: timestamp("login_time"),
  logoutTime: timestamp("logout_time"),
  lastActivityTime: timestamp("last_activity_time"),
  isActive: boolean("is_active").default(true),
  logoutReason: text("logout_reason"),
}, (table) => ({
  userIdIdx: index("idx_user_activity_user_id").on(table.userId),
  usernameIdx: index("idx_user_activity_username").on(table.username),
  isActiveIdx: index("idx_user_activity_is_active").on(table.isActive),
  loginTimeIdx: index("idx_user_activity_login_time").on(table.loginTime),
  lastActivityTimeIdx: index("idx_user_activity_last_activity_time").on(table.lastActivityTime),
  fingerprintIdx: index("idx_user_activity_fingerprint").on(table.fingerprint),
  ipAddressIdx: index("idx_user_activity_ip_address").on(table.ipAddress),
}));

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  targetUser: text("target_user"),
  targetResource: text("target_resource"),
  details: text("details"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const backups = pgTable("backups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by").notNull(),
  backupData: text("backup_data").notNull(),
  metadata: text("metadata"),
});

export const settingCategories = pgTable("setting_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  nameUnique: uniqueIndex("setting_categories_name_unique").on(table.name),
}));

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").references(() => settingCategories.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  value: text("value").notNull(),
  defaultValue: text("default_value"),
  isCritical: boolean("is_critical").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  keyUnique: uniqueIndex("system_settings_key_unique").on(table.key),
  categoryIdx: index("system_settings_category_id_idx").on(table.categoryId),
}));

export const settingOptions = pgTable("setting_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingId: uuid("setting_id").references(() => systemSettings.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  label: text("label").notNull(),
}, (table) => ({
  settingValueUnique: uniqueIndex("idx_setting_options_unique_value").on(table.settingId, table.value),
  settingIdx: index("idx_setting_options_setting_id").on(table.settingId),
}));

export const roleSettingPermissions = pgTable("role_setting_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: text("role").notNull(),
  settingKey: text("setting_key").notNull(),
  canView: boolean("can_view").default(false),
  canEdit: boolean("can_edit").default(false),
}, (table) => ({
  roleSettingUnique: uniqueIndex("idx_role_setting_permissions_unique").on(table.role, table.settingKey),
}));

export const settingVersions = pgTable("setting_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingKey: text("setting_key").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow(),
}, (table) => ({
  settingKeyChangedAtIdx: index("idx_setting_versions_key_time").on(table.settingKey, table.changedAt),
}));

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  keyUnique: uniqueIndex("feature_flags_key_unique").on(table.key),
}));

export const collectionRecords = pgTable("collection_records", {
  id: uuid("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  icNumber: text("ic_number").notNull(),
  customerPhone: text("customer_phone").notNull(),
  accountNumber: text("account_number").notNull(),
  batch: text("batch").notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  receiptFile: text("receipt_file"),
  createdByLogin: text("created_by_login").notNull(),
  collectionStaffNickname: text("collection_staff_nickname").notNull(),
  staffUsername: text("staff_username").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  paymentDateIdx: index("idx_collection_records_payment_date").on(table.paymentDate),
  createdAtIdx: index("idx_collection_records_created_at").on(table.createdAt),
  staffUsernameIdx: index("idx_collection_records_staff_username").on(table.staffUsername),
  createdByLoginIdx: index("idx_collection_records_created_by_login").on(table.createdByLogin),
  staffNicknameIdx: index("idx_collection_records_staff_nickname").on(table.collectionStaffNickname),
  customerPhoneIdx: index("idx_collection_records_customer_phone").on(table.customerPhone),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recordStorageUnique: uniqueIndex("idx_collection_record_receipts_record_storage_unique").on(
    table.collectionRecordId,
    table.storagePath,
  ),
  recordCreatedAtIdx: index("idx_collection_record_receipts_record_created_at").on(
    table.collectionRecordId,
    table.createdAt,
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
  passwordUpdatedAt: timestamp("password_updated_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  leaderNicknameLowerUnique: uniqueIndex("idx_admin_groups_leader_nickname_unique").using(
    "btree",
    sql`lower(${table.leaderNickname})`,
  ),
}));

export const adminGroupMembers = pgTable("admin_group_members", {
  id: uuid("id").primaryKey(),
  adminGroupId: uuid("admin_group_id").notNull(),
  memberNickname: text("member_nickname").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  activityId: text("activity_id").primaryKey(),
  username: text("username").notNull(),
  userRole: text("user_role").notNull(),
  nickname: text("nickname").notNull(),
  verifiedAt: timestamp("verified_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  adminUserId: text("admin_user_id").notNull(),
  nicknameId: uuid("nickname_id").notNull(),
  createdBySuperuser: text("created_by_superuser"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  yearMonthDayUnique: uniqueIndex("idx_collection_daily_calendar_unique").on(
    table.year,
    table.month,
    table.day,
  ),
  yearMonthIdx: index("idx_collection_daily_calendar_year_month").on(table.year, table.month),
}));

export const dataEmbeddings = pgTable("data_embeddings", {
  id: text("id").primaryKey(),
  importId: text("import_id").notNull(),
  rowId: text("row_id").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  rowIdUnique: uniqueIndex("data_embeddings_row_id_unique").on(table.rowId),
  importIdIdx: index("idx_data_embeddings_import_id").on(table.importId),
  vectorIdx: index("idx_data_embeddings_vector").using("ivfflat", table.embedding.op("vector_cosine_ops")),
}));

export const aiConversations = pgTable("ai_conversations", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  conversationIdx: index("idx_ai_messages_conversation_id").on(table.conversationId),
  conversationCreatedAtIdx: index("idx_ai_messages_conversation_created_at").on(
    table.conversationId,
    table.createdAt,
  ),
}));

export const aiCategoryStats = pgTable("ai_category_stats", {
  key: text("key").primaryKey(),
  total: integer("total").notNull(),
  samples: jsonb("samples").$type<Array<{ name: string; ic: string; source: string | null }>>(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  updatedAtIdx: index("idx_ai_category_stats_updated_at").on(table.updatedAt),
}));

export const aiCategoryRules = pgTable("ai_category_rules", {
  key: text("key").primaryKey(),
  terms: text("terms").array().notNull().default(sql`'{}'::text[]`),
  fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
  matchMode: text("match_mode").notNull().default("contains"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  updatedAtIdx: index("idx_ai_category_rules_updated_at").on(table.updatedAt),
}));

export const aeonBranches = pgTable("aeon_branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  branchAddress: text("branch_address"),
  phoneNumber: text("phone_number"),
  faxNumber: text("fax_number"),
  businessHour: text("business_hour"),
  dayOpen: text("day_open"),
  atmCdm: text("atm_cdm"),
  inquiryAvailability: text("inquiry_availability"),
  applicationAvailability: text("application_availability"),
  aeonLounge: text("aeon_lounge"),
  branchLat: doublePrecision("branch_lat").notNull(),
  branchLng: doublePrecision("branch_lng").notNull(),
}, (table) => ({
  latLngIdx: index("idx_aeon_branches_lat_lng").on(table.branchLat, table.branchLng),
  nameLowerUnique: uniqueIndex("idx_aeon_branches_name_unique").using(
    "btree",
    sql`lower(${table.name})`,
  ),
}));

export const aeonBranchPostcodes = pgTable("aeon_branch_postcodes", {
  postcode: text("postcode").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  sourceBranch: text("source_branch"),
  state: text("state"),
}, (table) => ({
  postcodeIdx: index("idx_aeon_postcodes").on(table.postcode),
}));

export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
});

export const insertImportSchema = createInsertSchema(imports).pick({
  name: true,
  filename: true,
});

export const insertDataRowSchema = z.object({
  importId: z.string(),
  jsonDataJsonb: z.record(z.any()),
});

export const insertUserActivitySchema = createInsertSchema(userActivity).pick({
  userId: true,
  username: true,
  role: true,
  pcName: true,
  browser: true,
  fingerprint: true,
  ipAddress: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  action: true,
  performedBy: true,
  targetUser: true,
  targetResource: true,
  details: true,
});

export const insertBackupSchema = createInsertSchema(backups).pick({
  name: true,
  createdBy: true,
  backupData: true,
  metadata: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fingerprint: z.string().optional(),
});

export const importRelations = relations(imports, ({ many }) => ({
  rows: many(dataRows),
}));

export const dataRowRelations = relations(dataRows, ({ one }) => ({
  import: one(imports, {
    fields: [dataRows.importId],
    references: [imports.id],
  }),
}));

export const dataEmbeddingRelations = relations(dataEmbeddings, ({ one }) => ({
  import: one(imports, {
    fields: [dataEmbeddings.importId],
    references: [imports.id],
  }),
  row: one(dataRows, {
    fields: [dataEmbeddings.rowId],
    references: [dataRows.id],
  }),
}));

export const aiConversationRelations = relations(aiConversations, ({ many }) => ({
  messages: many(aiMessages),
}));

export const aiMessageRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export const settingCategoryRelations = relations(settingCategories, ({ many }) => ({
  settings: many(systemSettings),
}));

export const systemSettingRelations = relations(systemSettings, ({ one, many }) => ({
  category: one(settingCategories, {
    fields: [systemSettings.categoryId],
    references: [settingCategories.id],
  }),
  options: many(settingOptions),
}));

export const settingOptionRelations = relations(settingOptions, ({ one }) => ({
  setting: one(systemSettings, {
    fields: [settingOptions.settingId],
    references: [systemSettings.id],
  }),
}));

export const collectionRecordRelations = relations(collectionRecords, ({ many }) => ({
  receipts: many(collectionRecordReceipts),
}));

export const collectionRecordReceiptRelations = relations(collectionRecordReceipts, ({ one }) => ({
  record: one(collectionRecords, {
    fields: [collectionRecordReceipts.collectionRecordId],
    references: [collectionRecords.id],
  }),
}));

export const adminGroupRelations = relations(adminGroups, ({ many }) => ({
  members: many(adminGroupMembers),
}));

export const adminGroupMemberRelations = relations(adminGroupMembers, ({ one }) => ({
  group: one(adminGroups, {
    fields: [adminGroupMembers.adminGroupId],
    references: [adminGroups.id],
  }),
}));

export const collectionStaffNicknameRelations = relations(collectionStaffNicknames, ({ many }) => ({
  adminAssignments: many(adminVisibleNicknames),
}));

export const adminVisibleNicknameRelations = relations(adminVisibleNicknames, ({ one }) => ({
  adminUser: one(users, {
    fields: [adminVisibleNicknames.adminUserId],
    references: [users.id],
  }),
  nickname: one(collectionStaffNicknames, {
    fields: [adminVisibleNicknames.nicknameId],
    references: [collectionStaffNicknames.id],
  }),
}));

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertImport = z.infer<typeof insertImportSchema>;
export type Import = typeof imports.$inferSelect;
export type InsertDataRow = z.infer<typeof insertDataRowSchema>;
export type DataRow = typeof dataRows.$inferSelect;
export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;
export type UserActivity = typeof userActivity.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Backup = typeof backups.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type AccountActivationToken = typeof accountActivationTokens.$inferSelect;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;
export type SettingCategoryRow = typeof settingCategories.$inferSelect;
export type SystemSettingRow = typeof systemSettings.$inferSelect;
export type SettingOptionRow = typeof settingOptions.$inferSelect;
export type RoleSettingPermissionRow = typeof roleSettingPermissions.$inferSelect;
export type SettingVersionRow = typeof settingVersions.$inferSelect;
export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type CollectionRecordRow = typeof collectionRecords.$inferSelect;
export type CollectionRecordReceiptRow = typeof collectionRecordReceipts.$inferSelect;
export type CollectionStaffNicknameRow = typeof collectionStaffNicknames.$inferSelect;
export type AdminGroupRow = typeof adminGroups.$inferSelect;
export type AdminGroupMemberRow = typeof adminGroupMembers.$inferSelect;
export type CollectionNicknameSessionRow = typeof collectionNicknameSessions.$inferSelect;
export type AdminVisibleNicknameRow = typeof adminVisibleNicknames.$inferSelect;
export type CollectionDailyTargetRow = typeof collectionDailyTargets.$inferSelect;
export type CollectionDailyCalendarRow = typeof collectionDailyCalendar.$inferSelect;
export type DataEmbeddingRow = typeof dataEmbeddings.$inferSelect;
export type AiConversationRow = typeof aiConversations.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;
export type AiCategoryStatRow = typeof aiCategoryStats.$inferSelect;
export type AiCategoryRuleRow = typeof aiCategoryRules.$inferSelect;
export type AeonBranchRow = typeof aeonBranches.$inferSelect;
export type AeonBranchPostcodeRow = typeof aeonBranchPostcodes.$inferSelect;
