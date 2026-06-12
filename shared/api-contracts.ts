import { z } from "zod";
import { jsonObjectSchema, jsonValueSchema } from "./json-schema";
import { sharedErrorCodeSchema, type ErrorCode } from "./error-codes";
import { PAGE_LIMIT_MIN_ERROR_MESSAGE } from "./pagination-contracts";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().nullable();
const nullishStringSchema = z.string().nullish();
const nonNegativeIntSchema = z.number().int().nonnegative();
const positiveIntSchema = z.number().int().positive();
const paginationLimitSchema = z.number().int().min(1, PAGE_LIMIT_MIN_ERROR_MESSAGE).max(1000);
export const sensitiveResponseFieldBlocklist = [
  "adminOverrideReason",
  "backupEncryptionKey",
  "backupEncryptionKeys",
  "collectionPiiEncryptionKey",
  "encryptedTotpSecret",
  "hashedPassword",
  "internalNotes",
  "passwordHash",
  "passwordSalt",
  "piiEncryptionKey",
  "totpSecret",
  "totpSecretEncrypted",
  "twoFactorSecretEncrypted",
] as const;

export const sensitiveResponseFieldSchema = z.enum(sensitiveResponseFieldBlocklist);

export const apiErrorCodeSchema = sharedErrorCodeSchema;
export type ApiErrorCode = ErrorCode;

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

export const apiPaginationMetaSchema = z.discriminatedUnion("mode", [
  offsetPaginationMetaSchema,
  cursorPaginationMetaSchema,
  hybridPaginationMetaSchema,
]);

export const importRecordSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  isDeleted: z.boolean(),
  createdBy: nullishStringSchema,
  contentHashSha256: nullishStringSchema,
  sourceSizeBytes: z.number().int().nonnegative().nullish(),
});

export const importListItemSchema = importRecordSchema.extend({
  rowCount: nonNegativeIntSchema,
});

export const importBackgroundJobSchema = z.object({
  id: nonEmptyStringSchema,
  status: z.enum(["queued", "running", "completed", "failed", "cancelled", "duplicate"]),
  name: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
  progress: z.number().int().min(0).max(100),
  rowCount: nonNegativeIntSchema.nullable(),
  importId: nullableStringSchema,
  duplicateImportName: nullableStringSchema,
  error: nullableStringSchema,
  canCancel: z.boolean(),
  canResume: z.boolean(),
});

export const queuedImportMutationResultSchema = z.object({
  status: z.literal("queued"),
  job: importBackgroundJobSchema,
});

export const importMutationResultSchema = z.union([
  importListItemSchema,
  queuedImportMutationResultSchema,
]);

export const importsListResponseSchema = z.object({
  imports: z.array(importListItemSchema),
  pagination: cursorPaginationMetaSchema,
});

export const importDataRowSchema = z.object({
  id: nonEmptyStringSchema,
  importId: nonEmptyStringSchema,
  jsonDataJsonb: jsonObjectSchema,
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

const searchResultRowSchema = jsonObjectSchema;

export const searchGlobalResponseSchema = z.object({
  columns: z.array(nonEmptyStringSchema),
  rows: z.array(searchResultRowSchema),
  results: z.array(searchResultRowSchema),
  total: nonNegativeIntSchema,
  totalIsApproximate: z.boolean().optional(),
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
  requestId: nullishStringSchema,
  targetUser: nullishStringSchema,
  targetResource: nullishStringSchema,
  details: nullishStringSchema,
  timestamp: nonEmptyStringSchema,
});

export const auditLogsResponseSchema = z.object({
  logs: z.array(auditLogRecordSchema),
  pagination: offsetPaginationMetaSchema,
});

export const apiErrorDetailsSchema = z.object({
  code: apiErrorCodeSchema.optional(),
  message: z.string(),
  details: jsonValueSchema.optional(),
  requestId: z.string().optional(),
}).strict();

export const apiErrorPayloadSchema = z.object({
  ok: z.literal(false).optional(),
  message: z.string(),
  requestId: z.string().optional(),
  code: apiErrorCodeSchema.optional(),
  error: apiErrorDetailsSchema.optional(),
  status: z.number().int().min(100).max(599).optional(),
  limit: nonNegativeIntSchema.optional(),
  retryAfterMs: nonNegativeIntSchema.optional(),
  mode: z.string().trim().min(1).optional(),
  protection: z.boolean().optional(),
  reason: z.string().trim().min(1).optional(),
  banned: z.boolean().optional(),
  locked: z.boolean().optional(),
  forcePasswordChange: z.boolean().optional(),
  forceLogout: z.boolean().optional(),
  maintenance: z.boolean().optional(),
  type: z.enum(["soft", "hard"]).optional(),
  startTime: nullishStringSchema,
  endTime: nullishStringSchema,
  requiresConfirmation: z.boolean().optional(),
  fieldErrors: z.record(jsonValueSchema).optional(),
}).strict();

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

export const collectionReportFreshnessSchema = z.object({
  status: z.enum(["fresh", "warming", "stale"]),
  pendingCount: nonNegativeIntSchema,
  runningCount: nonNegativeIntSchema,
  retryCount: nonNegativeIntSchema,
  oldestPendingAgeMs: nonNegativeIntSchema,
  message: z.string(),
});

const collectionMonthKeySchema = z.string().regex(/^\d{4}-\d{2}$/);

export const collectionMonthlyComparisonMonthSchema = z.object({
  month: collectionMonthKeySchema,
  label: nonEmptyStringSchema,
  totalCollection: z.number().finite(),
  recordCount: nonNegativeIntSchema,
  averagePerRecord: z.number().finite(),
});

export const collectionMonthlyComparisonResponseSchema = z.object({
  ok: z.literal(true),
  nickname: nonEmptyStringSchema,
  startMonth: collectionMonthKeySchema,
  endMonth: collectionMonthKeySchema,
  months: z.array(collectionMonthlyComparisonMonthSchema),
  comparison: z.object({
    baseMonth: collectionMonthKeySchema.nullable(),
    targetMonth: collectionMonthKeySchema,
    baseLabel: nullableStringSchema,
    targetLabel: nonEmptyStringSchema,
    baseTotal: z.number().finite().nullable(),
    targetTotal: z.number().finite(),
    difference: z.number().finite().nullable(),
    percentageChange: z.number().finite().nullable(),
    direction: z.enum(["increase", "decrease", "no_change", "no_previous_data"]),
    summary: nonEmptyStringSchema,
  }),
  freshness: collectionReportFreshnessSchema.optional(),
});

export const collectionMonthlyTargetResponseSchema = z.object({
  ok: z.literal(true),
  nickname: nonEmptyStringSchema,
  month: z.object({
    key: collectionMonthKeySchema,
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
  }),
  monthlyTarget: z.number().finite(),
  configured: z.boolean(),
  source: z.enum(["configured", "missing"]),
});

export type ImportsListResponse = z.infer<typeof importsListResponseSchema>;
export type ImportBackgroundJobContract = z.infer<typeof importBackgroundJobSchema>;
export type ImportMutationResultContract = z.infer<typeof importMutationResultSchema>;
export type ImportDataPageResponse = z.infer<typeof importDataPageResponseSchema>;
export type SearchGlobalResponse = z.infer<typeof searchGlobalResponseSchema>;
export type AdvancedSearchResponse = z.infer<typeof advancedSearchResponseSchema>;
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdateResponse = z.infer<typeof settingsUpdateResponseSchema>;
export type TabVisibilityResponse = z.infer<typeof tabVisibilityResponseSchema>;
export type CollectionReportFreshnessContract = z.infer<typeof collectionReportFreshnessSchema>;
export type CollectionMonthlyComparisonResponse = z.infer<typeof collectionMonthlyComparisonResponseSchema>;
export type CollectionMonthlyTargetResponse = z.infer<typeof collectionMonthlyTargetResponseSchema>;
export type ApiPaginationMeta = z.infer<typeof apiPaginationMetaSchema>;
export type NormalizedApiPaginationMeta = {
  mode: ApiPaginationMeta["mode"];
  page: number | null;
  pageSize: number;
  limit: number;
  offset: number | null;
  total: number;
  totalPages: number | null;
  nextCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  hasMore: boolean;
};

export function normalizeApiPaginationMeta(
  pagination: ApiPaginationMeta,
): NormalizedApiPaginationMeta {
  if (pagination.mode === "cursor") {
    return {
      mode: pagination.mode,
      page: null,
      pageSize: pagination.pageSize ?? pagination.limit,
      limit: pagination.limit,
      offset: null,
      total: pagination.total,
      totalPages: null,
      nextCursor: pagination.nextCursor,
      hasNextPage: pagination.hasMore,
      hasPreviousPage: false,
      hasMore: pagination.hasMore,
    };
  }

  const hasMore = pagination.mode === "hybrid"
    ? pagination.hasNextPage || pagination.nextCursor !== null
    : pagination.hasNextPage;

  return {
    mode: pagination.mode,
    page: pagination.page,
    pageSize: pagination.pageSize,
    limit: pagination.limit,
    offset: pagination.offset,
    total: pagination.total,
    totalPages: pagination.totalPages,
    nextCursor: pagination.mode === "hybrid" ? pagination.nextCursor : null,
    hasNextPage: pagination.hasNextPage,
    hasPreviousPage: pagination.hasPreviousPage,
    hasMore,
  };
}
