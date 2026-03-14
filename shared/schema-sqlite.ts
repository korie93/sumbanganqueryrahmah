import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).default(false).notNull(),
  passwordResetBySuperuser: integer("password_reset_by_superuser", { mode: "boolean" }).default(false).notNull(),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  passwordChangedAt: integer("password_changed_at", { mode: "timestamp" }),
  activatedAt: integer("activated_at", { mode: "timestamp" }),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  isBanned: integer("is_banned", { mode: "boolean" }).default(false),
});

export const accountActivationTokens = sqliteTable("account_activation_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

export const passwordResetRequests = sqliteTable("password_reset_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  requestedByUser: text("requested_by_user"),
  approvedBy: text("approved_by"),
  resetType: text("reset_type").notNull().default("email_link"),
  tokenHash: text("token_hash"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

export const imports = sqliteTable("imports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  createdBy: text("created_by"),
});

export const dataRows = sqliteTable("data_rows", {
  id: text("id").primaryKey(),
  importId: text("import_id").notNull(),
  jsonData: text("json_data").notNull(),
});

export const userActivity = sqliteTable("user_activity", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  role: text("role").notNull(),
  pcName: text("pc_name"),
  browser: text("browser"),
  fingerprint: text("fingerprint"),
  ipAddress: text("ip_address"),
  loginTime: integer("login_time", { mode: "timestamp" }),
  logoutTime: integer("logout_time", { mode: "timestamp" }),
  lastActivityTime: integer("last_activity_time", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  logoutReason: text("logout_reason"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  targetUser: text("target_user"),
  targetResource: text("target_resource"),
  details: text("details"),
  timestamp: integer("timestamp", { mode: "timestamp" }),
});

export const backups = sqliteTable("backups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  createdBy: text("created_by").notNull(),
  backupData: text("backup_data").notNull(),
  metadata: text("metadata"),
});

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

export const insertDataRowSchema = createInsertSchema(dataRows).pick({
  importId: true,
  jsonData: true,
});

export const insertUserActivitySchema = createInsertSchema(userActivity).pick({
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
