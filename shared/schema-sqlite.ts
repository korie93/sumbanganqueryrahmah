import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  isBanned: integer("is_banned", { mode: "boolean" }).default(false),
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
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
