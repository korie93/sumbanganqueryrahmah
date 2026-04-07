import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

import {
  accountActivationTokens,
  auditLogs,
  backupJobs,
  backups,
  bannedSessions,
  dataRows,
  imports,
  monitorAlertIncidents,
  mutationIdempotencyKeys,
  passwordResetRequests,
  systemStabilityPatterns,
  userActivity,
  users,
} from "./schema-postgres-core";
import {
  adminGroupMembers,
  adminGroups,
  adminVisibleNicknames,
  collectionDailyCalendar,
  collectionDailyTargets,
  collectionNicknameSessions,
  collectionRecordReceipts,
  collectionRecords,
  collectionStaffNicknames,
  collectionRecordMonthlyRollups,
} from "./schema-postgres-collection";
import {
  aeonBranchPostcodes,
  aeonBranches,
  aiCategoryRules,
  aiCategoryStats,
  aiConversations,
  aiMessages,
  dataEmbeddings,
} from "./schema-postgres-ai";
import {
  featureFlags,
  roleSettingPermissions,
  settingCategories,
  settingOptions,
  settingVersions,
  systemSettings,
} from "./schema-postgres-settings";

export {
  users,
  accountActivationTokens,
  passwordResetRequests,
  imports,
  dataRows,
  userActivity,
  bannedSessions,
  auditLogs,
  mutationIdempotencyKeys,
  backups,
  backupJobs,
  monitorAlertIncidents,
  systemStabilityPatterns,
} from "./schema-postgres-core";
export {
  collectionRecords,
  collectionRecordReceipts,
  collectionRecordDailyRollups,
  collectionRecordMonthlyRollups,
  collectionRecordDailyRollupRefreshQueue,
  collectionStaffNicknames,
  adminGroups,
  adminGroupMembers,
  collectionNicknameSessions,
  adminVisibleNicknames,
  collectionDailyTargets,
  collectionDailyCalendar,
} from "./schema-postgres-collection";
export {
  dataEmbeddings,
  aiConversations,
  aiMessages,
  aiCategoryStats,
  aiCategoryRules,
  aeonBranches,
  aeonBranchPostcodes,
} from "./schema-postgres-ai";
export {
  settingCategories,
  systemSettings,
  settingOptions,
  roleSettingPermissions,
  settingVersions,
  featureFlags,
} from "./schema-postgres-settings";

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
  requestId: true,
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
export type BannedSessionRow = typeof bannedSessions.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Backup = typeof backups.$inferSelect;
export type BackupJobRow = typeof backupJobs.$inferSelect;
export type MonitorAlertIncidentRow = typeof monitorAlertIncidents.$inferSelect;
export type SystemStabilityPatternRow = typeof systemStabilityPatterns.$inferSelect;
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
export type CollectionRecordMonthlyRollupRow = typeof collectionRecordMonthlyRollups.$inferSelect;
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
