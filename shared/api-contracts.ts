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

export const analyticsRoleDistributionSchema = z.array(
  z.object({
    role: nonEmptyStringSchema,
    count: nonNegativeIntSchema,
  }),
);

export const analyticsTopUsersSchema = z.array(
  z.object({
    username: nonEmptyStringSchema,
    role: nonEmptyStringSchema,
    loginCount: nonNegativeIntSchema,
    lastLogin: z.string().datetime({ offset: true }).nullable(),
  }),
);

const analyticsTimestampSchema = z.string().datetime({ offset: true }).nullable();

export const analyticsRecentLoginActivitySchema = z.object({
  browser: nullableStringSchema,
  eventType: z.enum(["failure", "success"]),
  failureReason: nullableStringSchema,
  id: nonEmptyStringSchema,
  ipAddress: nullableStringSchema,
  lastActivityTime: analyticsTimestampSchema,
  loginTime: analyticsTimestampSchema,
  logoutReason: nullableStringSchema,
  logoutTime: analyticsTimestampSchema,
  platform: nullableStringSchema,
  role: nonEmptyStringSchema,
  status: z.enum(["active", "ended", "failed"]),
  userAgentSummary: nullableStringSchema,
  username: nonEmptyStringSchema,
});

export const analyticsRecentLoginActivityListSchema = z.array(
  analyticsRecentLoginActivitySchema,
);

export const analyticsRecentLoginActivityPageSchema = z.object({
  activities: analyticsRecentLoginActivityListSchema,
  filterCounts: z.object({
    all: nonNegativeIntSchema,
    active: nonNegativeIntSchema,
    ended: nonNegativeIntSchema,
    failed: nonNegativeIntSchema,
    attention: nonNegativeIntSchema,
  }),
  pagination: z.object({
    page: positiveIntSchema,
    pageSize: paginationLimitSchema,
    totalItems: nonNegativeIntSchema,
    totalPages: positiveIntSchema,
  }),
});

export const analyticsSummarySchema = z.object({
  totalUsers: nonNegativeIntSchema,
  activeSessions: nonNegativeIntSchema,
  loginsToday: nonNegativeIntSchema,
  totalDataRows: nonNegativeIntSchema,
  totalImports: nonNegativeIntSchema,
  bannedUsers: nonNegativeIntSchema,
  collectionRecordVersionConflicts24h: nonNegativeIntSchema,
  loginFailures24h: nonNegativeIntSchema,
  backupActions24h: nonNegativeIntSchema,
});

export const analyticsLoginTrendsSchema = z.array(
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    logins: nonNegativeIntSchema,
    logouts: nonNegativeIntSchema,
  }),
);

export const analyticsPeakHoursSchema = z.array(
  z.object({
    hour: z.number().int().min(0).max(23),
    count: nonNegativeIntSchema,
  }),
).length(24).superRefine((hours, context) => {
  const uniqueHours = new Set(hours.map(({ hour }) => hour));
  if (uniqueHours.size !== 24) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Peak hours must contain every hour exactly once",
    });
  }
});

export const importRecordSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  lastOpenedAt: nullishStringSchema,
  isDeleted: z.boolean(),
  createdBy: nullishStringSchema,
  contentHashSha256: nullishStringSchema,
  sourceSizeBytes: z.number().int().nonnegative().nullish(),
});

export const importListItemSchema = importRecordSchema.extend({
  isDuplicate: z.boolean().optional(),
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
  pagination: z.discriminatedUnion("mode", [
    cursorPaginationMetaSchema,
    offsetPaginationMetaSchema,
  ]),
});

export const importSummaryResponseSchema = z.object({
  import: importListItemSchema,
  columns: z.array(nonEmptyStringSchema),
  columnCount: nonNegativeIntSchema,
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

export const importAnalysisCategorySchema = z.object({
  count: nonNegativeIntSchema,
  samples: z.array(z.string()),
});

export const importAnalysisDuplicateItemSchema = z.object({
  value: z.string(),
  count: positiveIntSchema,
});

export const importAnalysisColumnTypeSchema = z.enum([
  "boolean",
  "date",
  "empty",
  "mixed",
  "number",
  "structured",
  "text",
]);

const importAnalysisProfiledTypeSchema = z.enum([
  "boolean",
  "date",
  "number",
  "structured",
  "text",
]);

export const importAnalysisColumnProfileSchema = z.object({
  name: nonEmptyStringSchema.max(120),
  inferredType: importAnalysisColumnTypeSchema,
  applicableRows: nonNegativeIntSchema,
  populatedCount: nonNegativeIntSchema,
  emptyCount: nonNegativeIntSchema,
  completenessPercent: z.number().min(0).max(100),
  typeConsistencyPercent: z.number().min(0).max(100),
  uniqueCount: nonNegativeIntSchema,
  uniqueCountIsApproximate: z.boolean(),
  duplicateCount: nonNegativeIntSchema,
  typeDistribution: z.record(importAnalysisProfiledTypeSchema, nonNegativeIntSchema),
});

export const importAnalysisQualitySchema = z.object({
  score: z.number().int().min(0).max(100),
  grade: z.enum(["excellent", "good", "review", "poor", "no_data"]),
  completenessPercent: z.number().min(0).max(100),
  typeConsistencyPercent: z.number().min(0).max(100),
  profiledColumns: nonNegativeIntSchema,
  columnsNeedingReview: nonNegativeIntSchema,
  columnsWithMissingValues: nonNegativeIntSchema,
  mixedTypeColumns: nonNegativeIntSchema,
  limitedCardinalityColumns: nonNegativeIntSchema,
  totalApplicableCells: nonNegativeIntSchema,
  populatedCells: nonNegativeIntSchema,
  emptyCells: nonNegativeIntSchema,
  columnLimitReached: z.boolean(),
});

export const importAnalysisDataSchema = z.object({
  icLelaki: importAnalysisCategorySchema,
  icPerempuan: importAnalysisCategorySchema,
  noPolis: importAnalysisCategorySchema,
  noTentera: importAnalysisCategorySchema,
  passportMY: importAnalysisCategorySchema,
  passportLuarNegara: importAnalysisCategorySchema,
  duplicates: z.object({
    count: nonNegativeIntSchema,
    items: z.array(importAnalysisDuplicateItemSchema),
  }),
  quality: importAnalysisQualitySchema,
  columns: z.array(importAnalysisColumnProfileSchema),
});

const importAnalysisSourceSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
});

export const singleImportAnalysisResponseSchema = z.object({
  import: importAnalysisSourceSchema,
  totalRows: nonNegativeIntSchema,
  analysis: importAnalysisDataSchema,
});

export const allImportsAnalysisResponseSchema = z.object({
  totalImports: nonNegativeIntSchema,
  totalRows: nonNegativeIntSchema,
  imports: z.array(importAnalysisSourceSchema.extend({
    rowCount: nonNegativeIntSchema,
  })),
  analysis: importAnalysisDataSchema,
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

export const appConfigResponseSchema = z.object({
  systemName: nonEmptyStringSchema,
  sessionTimeoutMinutes: z.number().int().min(1).max(1440),
  heartbeatIntervalMinutes: z.number().int().min(1).max(1440),
  wsIdleMinutes: z.number().int().min(1).max(1440),
  aiEnabled: z.boolean(),
  semanticSearchEnabled: z.boolean(),
  aiTimeoutMs: z.number().int().min(1000).max(120_000),
  searchResultLimit: z.number().int().min(10).max(5000),
  viewerRowsPerPage: z.number().int().min(10).max(500),
  importUploadLimitBytes: z.number().int().min(1024 * 1024).max(512 * 1024 * 1024),
});

export const maintenanceStatusResponseSchema = z.object({
  maintenance: z.boolean(),
  message: nonEmptyStringSchema,
  type: z.enum(["soft", "hard"]),
  startTime: z.string().datetime({ offset: true }).nullable(),
  endTime: z.string().datetime({ offset: true }).nullable(),
});

const authNullableTimestampSchema = z.string().datetime({ offset: true }).nullable();
const authOptionalNullableTimestampSchema = authNullableTimestampSchema.optional().default(null);

export const authCurrentUserSchema = z.object({
  id: nonEmptyStringSchema,
  username: nonEmptyStringSchema,
  fullName: nullableStringSchema,
  email: nullableStringSchema,
  role: nonEmptyStringSchema,
  status: z.enum(["pending_activation", "active", "suspended", "disabled"]),
  mustChangePassword: z.boolean(),
  passwordResetBySuperuser: z.boolean(),
  isBanned: z.boolean().nullable(),
  twoFactorEnabled: z.boolean().optional().default(false),
  twoFactorPendingSetup: z.boolean(),
  twoFactorConfiguredAt: authOptionalNullableTimestampSchema,
  activatedAt: authNullableTimestampSchema,
  passwordChangedAt: authNullableTimestampSchema,
  lastLoginAt: authNullableTimestampSchema,
}).strict();

export const authLoginSuccessResponseSchema = z.object({
  ok: z.literal(true),
  username: nonEmptyStringSchema,
  role: nonEmptyStringSchema,
  activityId: nonEmptyStringSchema,
  mustChangePassword: z.boolean(),
  status: z.enum(["pending_activation", "active", "suspended", "disabled"]),
  user: authCurrentUserSchema.nullable(),
  sessionExpiresAt: z.string().datetime({ offset: true }),
}).strict();

export const authLoginTwoFactorChallengeResponseSchema = z.object({
  ok: z.literal(true),
  twoFactorRequired: z.literal(true),
  challengeToken: nonEmptyStringSchema,
  username: nonEmptyStringSchema,
  role: nonEmptyStringSchema,
  mustChangePassword: z.boolean(),
  status: z.enum(["pending_activation", "active", "suspended", "disabled"]),
  user: authCurrentUserSchema.nullable(),
}).strict();

export const authLoginResponseSchema = z.union([
  authLoginSuccessResponseSchema,
  authLoginTwoFactorChallengeResponseSchema,
]);

export const authUserResponseSchema = z.object({
  ok: z.literal(true),
  sessionExpiresAt: z.string().datetime({ offset: true }).nullable(),
  user: authCurrentUserSchema.nullable(),
}).strict();

export const authUserMutationResponseSchema = z.object({
  ok: z.literal(true),
  user: authCurrentUserSchema.nullable(),
}).strict();

export const authUserForceLogoutResponseSchema = authUserMutationResponseSchema.extend({
  forceLogout: z.boolean(),
}).strict();

export const authTwoFactorStatusResponseSchema = authUserMutationResponseSchema.extend({
  twoFactor: z.object({
    enabled: z.boolean(),
    pendingSetup: z.boolean(),
    configuredAt: authNullableTimestampSchema,
  }).strict(),
}).strict();

export const authTwoFactorSetupResponseSchema = authUserMutationResponseSchema.extend({
  setup: z.object({
    accountName: nonEmptyStringSchema,
    issuer: nonEmptyStringSchema,
    otpauthUrl: z.string().trim().startsWith("otpauth://totp/"),
    secret: nonEmptyStringSchema,
  }).strict(),
}).strict();

export const authRecoveryTokenMetadataSchema = z.object({
  email: nullableStringSchema,
  expiresAt: z.string().datetime({ offset: true }),
  fullName: nullableStringSchema,
  role: nonEmptyStringSchema,
  username: nonEmptyStringSchema,
}).strict();

export const authActivationTokenResponseSchema = z.object({
  ok: z.literal(true),
  activation: authRecoveryTokenMetadataSchema,
}).strict();

export const authPasswordResetTokenResponseSchema = z.object({
  ok: z.literal(true),
  reset: authRecoveryTokenMetadataSchema,
}).strict();

export const authMessageResponseSchema = z.object({
  ok: z.literal(true),
  message: nonEmptyStringSchema,
}).strict();

export const activityStatusSchema = z.enum([
  "ONLINE",
  "IDLE",
  "LOGOUT",
  "KICKED",
  "BANNED",
]);

const optionalActivityStringSchema = z.string().nullish().transform((value) => value ?? undefined);
const optionalActivityTimestampSchema = z.string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value ?? undefined);

export const activityRecordSchema = z.object({
  id: nonEmptyStringSchema,
  username: nonEmptyStringSchema,
  role: nonEmptyStringSchema,
  status: activityStatusSchema,
  pcName: optionalActivityStringSchema,
  browser: optionalActivityStringSchema,
  deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"])
    .nullish()
    .transform((value) => value ?? undefined),
  platform: optionalActivityStringSchema,
  ipAddress: optionalActivityStringSchema,
  loginTime: z.string().datetime({ offset: true }),
  logoutTime: optionalActivityTimestampSchema,
  lastActivityTime: optionalActivityTimestampSchema,
  isActive: z.boolean(),
  logoutReason: optionalActivityStringSchema,
});

export const activityListResponseSchema = z.object({
  activities: z.array(activityRecordSchema),
});

export const activityPageResponseSchema = z.object({
  activities: z.array(activityRecordSchema),
  summary: z.object({
    idleCount: nonNegativeIntSchema,
    kickedCount: nonNegativeIntSchema,
    logoutCount: nonNegativeIntSchema,
    onlineCount: nonNegativeIntSchema,
  }),
  pagination: offsetPaginationMetaSchema,
});

export const activityMutationSuccessResponseSchema = z.object({
  ok: z.literal(true),
  success: z.literal(true),
}).strict();

export const activityCleanupResponseSchema = z.object({
  ok: z.literal(true),
  success: z.literal(true),
  cutoff: z.string().datetime({ offset: true }),
  deletedCount: nonNegativeIntSchema,
  limit: z.number().int().positive(),
  lockAcquired: z.boolean(),
  olderThanDays: z.number().int().positive(),
  protectedActiveBanCount: nonNegativeIntSchema,
  reason: z.enum(["disabled", "lock_unavailable"]).nullable(),
  securityCutoff: z.string().datetime({ offset: true }),
  securityDeletedCount: nonNegativeIntSchema,
  securityRetentionDays: z.number().int().positive(),
  skipped: z.boolean(),
  standardDeletedCount: nonNegativeIntSchema,
  standardRetentionDays: z.number().int().positive(),
}).strict();

export const collectionReportFreshnessSchema = z.object({
  status: z.enum(["fresh", "warming", "stale"]),
  pendingCount: nonNegativeIntSchema,
  runningCount: nonNegativeIntSchema,
  retryCount: nonNegativeIntSchema,
  oldestPendingAgeMs: nonNegativeIntSchema,
  message: z.string(),
});

export const collectionMonthlySummaryRowSchema = z.object({
  month: z.number().int().min(1).max(12),
  monthName: nonEmptyStringSchema,
  totalRecords: nonNegativeIntSchema,
  totalAmount: z.number().finite().nonnegative(),
});

export const collectionMonthlySummaryResponseSchema = z.object({
  ok: z.literal(true),
  year: z.number().int().min(2000).max(2100),
  summary: z.array(collectionMonthlySummaryRowSchema).max(12),
  freshness: collectionReportFreshnessSchema.optional(),
});

const collectionPurgeResponseBaseSchema = z.object({
  ok: z.literal(true),
  retentionMonths: z.number().int().min(1).max(120),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().finite().nonnegative(),
});

export const collectionPurgeSummaryResponseSchema = collectionPurgeResponseBaseSchema.extend({
  eligibleRecords: nonNegativeIntSchema,
});

export const collectionPurgeResponseSchema = collectionPurgeResponseBaseSchema.extend({
  deletedRecords: nonNegativeIntSchema,
});

const collectionRecordReceiptSchema = z.object({
  id: nonEmptyStringSchema,
  collectionRecordId: nonEmptyStringSchema,
  storagePath: nonEmptyStringSchema,
  originalFileName: nonEmptyStringSchema,
  originalMimeType: nonEmptyStringSchema,
  originalExtension: z.string(),
  fileSize: nonNegativeIntSchema,
  receiptAmount: z.string().nullable(),
  extractedAmount: z.string().nullable(),
  extractionStatus: z.enum(["unprocessed", "suggested", "ambiguous", "unavailable", "error"]),
  extractionConfidence: z.number().finite().nullable(),
  receiptDate: nullableStringSchema,
  receiptReference: nullableStringSchema,
  fileHash: nullableStringSchema,
  createdAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const collectionRecordResponseSchema = z.object({
  id: nonEmptyStringSchema,
  customerName: z.string(),
  icNumber: z.string(),
  customerPhone: z.string(),
  accountNumber: z.string(),
  batch: z.enum(["P10", "P25", "MDD02", "MDD10", "MDD18", "MDD25"]),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string(),
  receiptFile: nullableStringSchema,
  receipts: z.array(collectionRecordReceiptSchema),
  archivedReceipts: z.array(collectionRecordReceiptSchema).optional(),
  receiptTotalAmount: z.string(),
  receiptValidationStatus: z.enum(["matched", "underpaid", "overpaid", "unverified", "needs_review"]),
  receiptValidationMessage: nullableStringSchema,
  receiptCount: nonNegativeIntSchema,
  duplicateReceiptFlag: z.boolean(),
  createdByLogin: z.string(),
  collectionStaffNickname: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

const collectionRecordListPageLimitSchema = z.number().int().min(1).max(5000);

export const collectionRecordListResponseSchema = z.object({
  ok: z.literal(true),
  records: z.array(collectionRecordResponseSchema).max(5000),
  total: nonNegativeIntSchema,
  totalAmount: z.number().finite().nonnegative(),
  page: positiveIntSchema,
  pageSize: collectionRecordListPageLimitSchema,
  limit: collectionRecordListPageLimitSchema,
  offset: nonNegativeIntSchema,
  nextCursor: nullableStringSchema,
  pagination: hybridPaginationMetaSchema.extend({
    pageSize: collectionRecordListPageLimitSchema,
    limit: collectionRecordListPageLimitSchema,
  }),
});

const collectionNicknameTargetBenchmarkSchema = z.object({
  amount: z.number().finite().nonnegative(),
  configuredMonths: nonNegativeIntSchema,
  latestUpdatedAt: z.string().datetime().nullable().optional(),
  latestUpdatedBy: nullableStringSchema.optional(),
  missingMonths: nonNegativeIntSchema,
  months: z.array(z.object({
    amount: z.number().finite().nonnegative(),
    configured: z.boolean(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    updatedAt: z.string().datetime().nullable(),
    updatedBy: nullableStringSchema,
  })).optional(),
  requestedMonths: positiveIntSchema,
});

export const collectionNicknameSummaryResponseSchema = z.object({
  ok: z.literal(true),
  nicknames: z.array(nonEmptyStringSchema).max(1000),
  totalRecords: nonNegativeIntSchema,
  totalAmount: z.number().finite().nonnegative(),
  page: positiveIntSchema,
  pageSize: paginationLimitSchema,
  limit: paginationLimitSchema,
  offset: nonNegativeIntSchema,
  nicknameTotals: z.array(z.object({
    nickname: nonEmptyStringSchema,
    totalRecords: nonNegativeIntSchema,
    totalAmount: z.number().finite().nonnegative(),
    targetBenchmark: collectionNicknameTargetBenchmarkSchema.nullable().optional(),
  })).max(1000),
  records: z.array(collectionRecordResponseSchema).max(250),
  freshness: collectionReportFreshnessSchema.optional(),
  pagination: hybridPaginationMetaSchema,
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
export type ImportAnalysisColumnProfileContract = z.infer<typeof importAnalysisColumnProfileSchema>;
export type ImportAnalysisDataContract = z.infer<typeof importAnalysisDataSchema>;
export type ImportAnalysisDuplicateItemContract = z.infer<typeof importAnalysisDuplicateItemSchema>;
export type ImportAnalysisQualityContract = z.infer<typeof importAnalysisQualitySchema>;
export type SingleImportAnalysisResponse = z.infer<typeof singleImportAnalysisResponseSchema>;
export type AllImportsAnalysisResponse = z.infer<typeof allImportsAnalysisResponseSchema>;
export type SearchGlobalResponse = z.infer<typeof searchGlobalResponseSchema>;
export type AdvancedSearchResponse = z.infer<typeof advancedSearchResponseSchema>;
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdateResponse = z.infer<typeof settingsUpdateResponseSchema>;
export type TabVisibilityResponse = z.infer<typeof tabVisibilityResponseSchema>;
export type AppConfigResponse = z.infer<typeof appConfigResponseSchema>;
export type MaintenanceStatusResponse = z.infer<typeof maintenanceStatusResponseSchema>;
export type AuthCurrentUserContract = z.infer<typeof authCurrentUserSchema>;
export type AuthLoginSuccessResponseContract = z.infer<typeof authLoginSuccessResponseSchema>;
export type AuthLoginResponseContract = z.infer<typeof authLoginResponseSchema>;
export type AuthUserResponseContract = z.infer<typeof authUserResponseSchema>;
export type AuthUserMutationResponseContract = z.infer<typeof authUserMutationResponseSchema>;
export type AuthUserForceLogoutResponseContract = z.infer<typeof authUserForceLogoutResponseSchema>;
export type AuthTwoFactorStatusResponseContract = z.infer<typeof authTwoFactorStatusResponseSchema>;
export type AuthTwoFactorSetupResponseContract = z.infer<typeof authTwoFactorSetupResponseSchema>;
export type AuthRecoveryTokenMetadataContract = z.infer<typeof authRecoveryTokenMetadataSchema>;
export type AuthActivationTokenResponseContract = z.infer<typeof authActivationTokenResponseSchema>;
export type AuthPasswordResetTokenResponseContract = z.infer<typeof authPasswordResetTokenResponseSchema>;
export type AuthMessageResponseContract = z.infer<typeof authMessageResponseSchema>;
export type ActivityRecordResponse = z.infer<typeof activityRecordSchema>;
export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;
export type ActivityPageResponseContract = z.infer<typeof activityPageResponseSchema>;
export type ActivityMutationSuccessResponseContract = z.infer<typeof activityMutationSuccessResponseSchema>;
export type ActivityCleanupResponseContract = z.infer<typeof activityCleanupResponseSchema>;
export type CollectionReportFreshnessContract = z.infer<typeof collectionReportFreshnessSchema>;
export type CollectionMonthlySummaryResponseContract = z.infer<typeof collectionMonthlySummaryResponseSchema>;
export type CollectionPurgeSummaryResponseContract = z.infer<typeof collectionPurgeSummaryResponseSchema>;
export type CollectionPurgeResponseContract = z.infer<typeof collectionPurgeResponseSchema>;
export type CollectionRecordListResponseContract = z.infer<typeof collectionRecordListResponseSchema>;
export type CollectionNicknameSummaryResponseContract = z.infer<typeof collectionNicknameSummaryResponseSchema>;
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
