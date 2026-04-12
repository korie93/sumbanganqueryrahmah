import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

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
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  passwordChangedAt: utcTimestamp("password_changed_at"),
  activatedAt: utcTimestamp("activated_at"),
  lastLoginAt: utcTimestamp("last_login_at"),
  isBanned: boolean("is_banned").default(false),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecretEncrypted: text("two_factor_secret_encrypted"),
  twoFactorConfiguredAt: utcTimestamp("two_factor_configured_at"),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedAt: utcTimestamp("locked_at"),
  lockedReason: text("locked_reason"),
  lockedBySystem: boolean("locked_by_system").default(false).notNull(),
}, (table) => ({
  usernameLowerUnique: uniqueIndex("idx_users_username_lower_unique").using(
    "btree",
    sql`lower(${table.username})`,
  ),
  usernameLowerIdx: index("idx_users_username_lower").using(
    "btree",
    sql`lower(${table.username})`,
  ),
  roleIdx: index("idx_users_role").on(table.role),
  statusIdx: index("idx_users_status").on(table.status),
  mustChangePasswordIdx: index("idx_users_must_change_password").on(table.mustChangePassword),
  createdByIdx: index("idx_users_created_by").on(table.createdBy),
  passwordResetBySuperuserIdx: index("idx_users_password_reset_by_superuser").on(table.passwordResetBySuperuser),
  twoFactorEnabledIdx: index("idx_users_two_factor_enabled").on(table.twoFactorEnabled),
  failedLoginAttemptsIdx: index("idx_users_failed_login_attempts").on(table.failedLoginAttempts),
  lockedAtIdx: index("idx_users_locked_at").on(table.lockedAt),
  lockedBySystemIdx: index("idx_users_locked_by_system").on(table.lockedBySystem),
  emailLowerUnique: uniqueIndex("idx_users_email_lower_unique")
    .using("btree", sql`lower(${table.email})`)
    .where(sql`${table.email} IS NOT NULL AND trim(${table.email}) <> ''`),
}));

export const accountActivationTokens = pgTable("account_activation_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: utcTimestamp("expires_at").notNull(),
  usedAt: utcTimestamp("used_at"),
  createdBy: text("created_by"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
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
  expiresAt: utcTimestamp("expires_at"),
  usedAt: utcTimestamp("used_at"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_password_reset_requests_user_id").on(table.userId),
  createdAtIdx: index("idx_password_reset_requests_created_at").on(table.createdAt.desc()),
  tokenHashUnique: uniqueIndex("idx_password_reset_requests_token_hash_unique")
    .on(table.tokenHash)
    .where(sql`${table.tokenHash} IS NOT NULL`),
  expiresAtIdx: index("idx_password_reset_requests_expires_at")
    .on(table.expiresAt)
    .where(sql`${table.expiresAt} IS NOT NULL`),
  pendingReviewIdx: index("idx_password_reset_requests_pending_review")
    .on(table.userId, table.createdAt.desc())
    .where(sql`${table.approvedBy} IS NULL AND ${table.usedAt} IS NULL`),
}));

export const imports = pgTable("imports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdBy: text("created_by"),
}, (table) => ({
  createdAtIdx: index("idx_imports_created_at").on(table.createdAt),
  isDeletedIdx: index("idx_imports_is_deleted").on(table.isDeleted),
  createdByIdx: index("idx_imports_created_by").on(table.createdBy),
}));

export const dataRows = pgTable("data_rows", {
  id: text("id").primaryKey(),
  importId: text("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade", onUpdate: "cascade" }),
  jsonDataJsonb: jsonb("json_data").notNull(),
}, (table) => ({
  importIdIdx: index("idx_data_rows_import_id").on(table.importId),
}));

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
  loginTime: utcTimestamp("login_time"),
  logoutTime: utcTimestamp("logout_time"),
  lastActivityTime: utcTimestamp("last_activity_time"),
  isActive: boolean("is_active").default(true),
  logoutReason: text("logout_reason"),
}, (table) => ({
  userIdIdx: index("idx_user_activity_user_id").on(table.userId),
  usernameIdx: index("idx_user_activity_username").on(table.username),
  isActiveIdx: index("idx_user_activity_is_active").on(table.isActive),
  loginTimeIdx: index("idx_user_activity_login_time").on(table.loginTime),
  logoutTimeIdx: index("idx_user_activity_logout_time").on(table.logoutTime),
  lastActivityTimeIdx: index("idx_user_activity_last_activity_time").on(table.lastActivityTime),
  fingerprintIdx: index("idx_user_activity_fingerprint").on(table.fingerprint),
  ipAddressIdx: index("idx_user_activity_ip_address").on(table.ipAddress),
}));

export const bannedSessions = pgTable("banned_sessions", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  role: text("role").notNull(),
  activityId: text("activity_id").notNull(),
  fingerprint: text("fingerprint"),
  ipAddress: text("ip_address"),
  browser: text("browser"),
  pcName: text("pc_name"),
  bannedAt: utcTimestamp("banned_at").defaultNow().notNull(),
}, (table) => ({
  fingerprintIdx: index("idx_banned_sessions_fingerprint").on(table.fingerprint),
  ipAddressIdx: index("idx_banned_sessions_ip").on(table.ipAddress),
}));

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  requestId: text("request_id"),
  targetUser: text("target_user"),
  targetResource: text("target_resource"),
  details: text("details"),
  timestamp: utcTimestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  timestampIdx: index("idx_audit_logs_timestamp").on(table.timestamp),
  actionIdx: index("idx_audit_logs_action").on(table.action),
  performedByIdx: index("idx_audit_logs_performed_by").on(table.performedBy),
  requestIdIdx: index("idx_audit_logs_request_id").on(table.requestId),
}));

export const mutationIdempotencyKeys = pgTable("mutation_idempotency_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: text("scope").notNull(),
  actor: text("actor").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint"),
  state: text("state").notNull().default("pending"),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  completedAt: utcTimestamp("completed_at"),
}, (table) => ({
  scopeActorKeyUnique: uniqueIndex("idx_mutation_idempotency_scope_actor_key_unique").on(
    table.scope,
    table.actor,
    table.idempotencyKey,
  ),
  updatedAtIdx: index("idx_mutation_idempotency_updated_at").on(table.updatedAt),
  stateIdx: index("idx_mutation_idempotency_state").on(table.state),
}));

export const backups = pgTable("backups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  backupData: text("backup_data").notNull(),
  metadata: text("metadata"),
});

export const backupPayloadChunks = pgTable("backup_payload_chunks", {
  id: uuid("id").primaryKey(),
  backupId: text("backup_id")
    .notNull()
    .references(() => backups.id, { onDelete: "cascade", onUpdate: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  chunkData: text("chunk_data").notNull(),
}, (table) => ({
  backupIdChunkUnique: uniqueIndex("idx_backup_payload_chunks_backup_chunk_unique").on(
    table.backupId,
    table.chunkIndex,
  ),
  backupIdIdx: index("idx_backup_payload_chunks_backup_id").on(table.backupId),
}));

export const backupJobs = pgTable("backup_jobs", {
  id: uuid("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default("queued"),
  requestedBy: text("requested_by").notNull(),
  requestedAt: utcTimestamp("requested_at").defaultNow().notNull(),
  startedAt: utcTimestamp("started_at"),
  finishedAt: utcTimestamp("finished_at"),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  backupId: text("backup_id"),
  backupName: text("backup_name"),
  result: jsonb("result"),
  error: jsonb("error").$type<{ message: string; statusCode: number } | null>(),
}, (table) => ({
  statusRequestedAtIdx: index("idx_backup_jobs_status_requested_at").on(table.status, table.requestedAt),
  updatedAtIdx: index("idx_backup_jobs_updated_at").on(table.updatedAt),
}));

export const monitorAlertIncidents = pgTable("monitor_alert_incidents", {
  id: uuid("id").primaryKey(),
  alertKey: text("alert_key").notNull(),
  severity: text("severity").notNull(),
  source: text("source"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  firstSeenAt: utcTimestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: utcTimestamp("last_seen_at").defaultNow().notNull(),
  resolvedAt: utcTimestamp("resolved_at"),
  updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  openAlertKeyUnique: uniqueIndex("idx_monitor_alert_incidents_open_key_unique")
    .on(table.alertKey)
    .where(sql`${table.status} = 'open'`),
  statusUpdatedAtIdx: index("idx_monitor_alert_incidents_status_updated_at").on(
    table.status,
    table.updatedAt.desc(),
  ),
  resolvedAtIdx: index("idx_monitor_alert_incidents_resolved_at").on(table.resolvedAt.desc()),
}));

export const systemStabilityPatterns = pgTable("system_stability_patterns", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  metricSignature: text("metric_signature").notNull(),
  hour: integer("hour").notNull(),
  weekday: integer("weekday").notNull(),
  severity: text("severity").notNull(),
  actionTaken: text("action_taken").notNull(),
  durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
  createdAt: utcTimestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  signatureWindowIdx: index("idx_stability_patterns_signature_window").on(
    table.metricSignature,
    table.hour,
    table.weekday,
    table.severity,
  ),
}));
