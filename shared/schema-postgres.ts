import { pgTable, text, integer, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { jsonb } from "drizzle-orm/pg-core";

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
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetRequests = pgTable("password_reset_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  requestedByUser: text("requested_by_user"),
  approvedBy: text("approved_by"),
  resetType: text("reset_type").notNull().default("email_link"),
  tokenHash: text("token_hash"),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  userId: text("user_id").notNull(),
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
});

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
