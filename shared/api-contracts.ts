import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().nullable();
const nonNegativeIntSchema = z.number().int().nonnegative();

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
  pagination: z.object({
    limit: nonNegativeIntSchema,
    nextCursor: nullableStringSchema,
    hasMore: z.boolean(),
    total: nonNegativeIntSchema,
  }),
});

export const importDataRowSchema = z.object({
  id: nonEmptyStringSchema,
  importId: nonEmptyStringSchema,
  jsonDataJsonb: z.record(z.unknown()),
});

export const importDataPageResponseSchema = z.object({
  rows: z.array(importDataRowSchema),
  total: nonNegativeIntSchema,
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  nextCursor: nullableStringSchema,
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
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdateResponse = z.infer<typeof settingsUpdateResponseSchema>;
export type TabVisibilityResponse = z.infer<typeof tabVisibilityResponseSchema>;
