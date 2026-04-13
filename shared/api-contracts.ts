import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().nullable();
const nonNegativeIntSchema = z.number().int().nonnegative();
const positiveIntSchema = z.number().int().positive();
const paginationLimitSchema = z.number().int().positive().max(1000);

export const offsetPaginationMetaSchema = z.object({
  mode: z.literal("offset"),
  page: positiveIntSchema,
  pageSize: paginationLimitSchema,
  limit: paginationLimitSchema,
  offset: nonNegativeIntSchema,
  total: nonNegativeIntSchema,
  totalPages: positiveIntSchema,
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const cursorPaginationMetaSchema = z.object({
  mode: z.literal("cursor"),
  limit: paginationLimitSchema,
  pageSize: paginationLimitSchema.optional(),
  nextCursor: nullableStringSchema,
  hasMore: z.boolean(),
  total: nonNegativeIntSchema,
});

export const hybridPaginationMetaSchema = z.object({
  mode: z.literal("hybrid"),
  page: positiveIntSchema,
  pageSize: paginationLimitSchema,
  limit: paginationLimitSchema,
  offset: nonNegativeIntSchema,
  total: nonNegativeIntSchema,
  totalPages: positiveIntSchema,
  nextCursor: nullableStringSchema,
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const importRecordSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  isDeleted: z.boolean(),
  createdBy: z.string().nullable().optional(),
});

export const importListItemSchema = importRecordSchema.extend({
  rowCount: nonNegativeIntSchema,
});

export const importsListResponseSchema = z.object({
  imports: z.array(importListItemSchema),
  pagination: cursorPaginationMetaSchema,
});

export const importDataRowSchema = z.object({
  id: nonEmptyStringSchema,
  importId: nonEmptyStringSchema,
  jsonDataJsonb: z.record(z.unknown()),
});

export const importDataPageResponseSchema = z.object({
  rows: z.array(importDataRowSchema),
  headers: z.array(nonEmptyStringSchema),
  total: nonNegativeIntSchema,
  page: positiveIntSchema,
  limit: paginationLimitSchema,
  pageSize: paginationLimitSchema.optional(),
  offset: nonNegativeIntSchema,
  nextCursor: nullableStringSchema,
  pagination: hybridPaginationMetaSchema,
});

const searchResultRowSchema = z.record(z.unknown());

export const searchGlobalResponseSchema = z.object({
  columns: z.array(nonEmptyStringSchema),
  rows: z.array(searchResultRowSchema),
  results: z.array(searchResultRowSchema),
  total: nonNegativeIntSchema,
  page: positiveIntSchema,
  limit: paginationLimitSchema,
  pageSize: paginationLimitSchema,
  offset: nonNegativeIntSchema,
  pagination: offsetPaginationMetaSchema,
});

export const advancedSearchResponseSchema = z.object({
  results: z.array(searchResultRowSchema),
  headers: z.array(nonEmptyStringSchema),
  total: nonNegativeIntSchema,
  page: positiveIntSchema,
  limit: paginationLimitSchema,
  pageSize: paginationLimitSchema,
  offset: nonNegativeIntSchema,
  pagination: offsetPaginationMetaSchema,
});

export const auditLogRecordSchema = z.object({
  id: nonEmptyStringSchema,
  action: nonEmptyStringSchema,
  performedBy: nonEmptyStringSchema,
  requestId: z.string().nullable().optional(),
  targetUser: z.string().nullable().optional(),
  targetResource: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  timestamp: nonEmptyStringSchema,
});

export const auditLogsResponseSchema = z.object({
  logs: z.array(auditLogRecordSchema),
  pagination: offsetPaginationMetaSchema,
});

export const deleteImportResponseSchema = z.object({
  ok: z.literal(true).optional(),
  success: z.boolean(),
});

export const settingOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const settingPermissionSchema = z.object({
  canView: z.boolean(),
  canEdit: z.boolean(),
});

export const settingItemSchema = z.object({
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  description: z.string().nullable(),
  type: z.enum(["text", "number", "boolean", "select", "timestamp"]),
  value: z.string(),
  defaultValue: z.string().nullable(),
  isCritical: z.boolean(),
  updatedAt: z.string().nullable(),
  permission: settingPermissionSchema,
  options: z.array(settingOptionSchema),
});

export const settingCategorySchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  description: z.string().nullable(),
  settings: z.array(settingItemSchema),
});

export const settingsResponseSchema = z.object({
  categories: z.array(settingCategorySchema),
});

export const settingsUpdateResponseSchema = z.object({
  ok: z.literal(true).optional(),
  success: z.boolean(),
  status: z.enum(["updated", "unchanged"]),
  message: z.string(),
  setting: settingItemSchema.nullable(),
});

export const tabVisibilityResponseSchema = z.object({
  role: nonEmptyStringSchema,
  tabs: z.record(z.boolean()),
});

export type ImportsListResponse = z.infer<typeof importsListResponseSchema>;
export type ImportDataPageResponse = z.infer<typeof importDataPageResponseSchema>;
export type SearchGlobalResponse = z.infer<typeof searchGlobalResponseSchema>;
export type AdvancedSearchResponse = z.infer<typeof advancedSearchResponseSchema>;
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdateResponse = z.infer<typeof settingsUpdateResponseSchema>;
export type TabVisibilityResponse = z.infer<typeof tabVisibilityResponseSchema>;
