import { z } from "zod";
import { apiRequest } from "../api-client";
import { createClientRandomId } from "../secure-id";
import { parseApiJson } from "./contract";

export type BillingPrincipalAging = "D3" | "D4" | "D5" | "D6";

export type BillingPrincipalReportRow = {
  aging: BillingPrincipalAging;
  totalOsp: string;
  targetPercentage: string;
  targetOsp: string;
  resultPercentage: string;
  ospClosed: string;
  closedAccountCount: number;
};

export type BillingPrincipalReportResponse = {
  ok: true;
  filters: {
    sourceImportIds: string[];
    from: string;
    to: string;
    agingBuckets: BillingPrincipalAging[];
    nicknames: string[];
  };
  report: {
    rows: BillingPrincipalReportRow[];
    all: Omit<BillingPrincipalReportRow, "aging"> & { aging: "ALL" };
  };
};

export type BillingPrincipalTargetInput = {
  agingBucket: BillingPrincipalAging;
  totalOspBaseline: string | null;
  targetPercentage: string;
};

export type BillingPrincipalSavedTargetRevision = {
  id: string;
  revisionNumber: number;
  sourceValidityVerified?: boolean | undefined;
  from: string;
  to: string;
  trackingStartDate: string | null;
  trackingEndDate: string | null;
  sourceImportIds: string[];
  sourceSnapshots: Array<{
    sourceImportId: string;
    name: string;
    filename: string | null;
  }>;
  nicknameScope: string[];
  agingScope: BillingPrincipalAging[];
  createdAt: string;
};

export type BillingPrincipalSavedTarget = {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DELETED";
  version: number;
  assignedAdminUserId: string | null;
  assignedAdmin: { id: string; username: string; fullName: string | null } | null;
  activeRevision: BillingPrincipalSavedTargetRevision;
  createdAt: string;
  updatedAt: string;
};

export type BillingPrincipalClientRow = {
  aging: BillingPrincipalAging;
  totalOsp: string;
  targetPercentage: string;
  targetOsp: string;
  resultPercentage: string;
  ospClosed: string;
  balanceOsp: string;
  note: string | null;
  reference: string | null;
  receivedDate: string | null;
  updatedAt: string | null;
  version: number | null;
};

export type BillingPrincipalLatestComparison = {
  system: {
    asOf: string;
    totalOsp: string;
    ospClosed: string;
    resultPercentage: string;
  };
  client: {
    lastUpdatedAt: string;
    receivedDate: string;
    totalOsp: string;
    ospClosed: string;
    resultPercentage: string;
  } | null;
  differencePercentagePoints: string | null;
};

export type BillingPrincipalSavedTargetOverview = {
  ok: true;
  target: BillingPrincipalSavedTarget;
  revision: BillingPrincipalSavedTargetRevision;
  asOf: string;
  systemResult: {
    rows: Array<BillingPrincipalReportRow & { balanceOsp: string }>;
    all: Omit<BillingPrincipalReportRow, "aging"> & { aging: "ALL"; balanceOsp: string };
  };
  clientResult: {
    rows: BillingPrincipalClientRow[];
    all: Omit<BillingPrincipalClientRow, "aging"> & { aging: "ALL" };
  };
  latestComparison: BillingPrincipalLatestComparison;
};

export type BillingPrincipalCalendarDay = {
  date: string;
  aging: BillingPrincipalAging | "ALL";
  totalOsp: string;
  targetOsp: string;
  systemOspClosedToday: string;
  balanceOsp: string;
  systemCumulativeOspClosed: string;
  systemResultPercentage: string;
  systemPreviousResultPercentage: string;
  systemDailyMovementPercentagePoints: string;
  systemAchievementVsTargetPercentage: string;
  systemDailyAccounts: number;
};

export type BillingPrincipalDrilldownItem = {
  contributionSource: "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT";
  maskedAccountNumber: string;
  cardNumber: string | null;
  cardNumberLast4: string | null;
  maskedCustomerName: string;
  accountNumber: string | null;
  customerName: string | null;
  identificationNumber: string | null;
  phone: string | null;
  paymentDate: string;
  classification: "ABORT_CP" | "MANUAL_VERIFIED_ABORT";
  sourceName: string;
  sourceFilename: string;
  callingDate: string;
  aging: BillingPrincipalAging;
  totalDue: string;
  systemEligibleCumulative: string;
  systemClosureCollectionAmount: string | null;
  systemClosureStaffNickname: string | null;
  poolAmount: string;
  effectiveCumulative: string;
  billingPrincipalOsp: string;
  effectiveClosedDate: string;
  reason: string | null;
  reference: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type BillingPrincipalVisualExportDataset = {
  ok: true;
  generatedAt: string;
  generatedBy: string;
  generatedByUserId: string;
  filters: {
    asOf: string;
    from: string;
    to: string;
    date: string | null;
    aging: BillingPrincipalAging | null;
  };
  overview: Omit<BillingPrincipalSavedTargetOverview, "ok">;
  calendar: BillingPrincipalCalendarDay[];
  drilldown: BillingPrincipalDrilldownItem[];
  drilldownTotal: number;
};

export type BillingPrincipalPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type BillingPrincipalSavedTargetInput = {
  name: string;
  assignedAdminUserId: string;
  description?: string | null | undefined;
  sourceImportIds: string[];
  from?: string;
  to?: string;
  trackingStartDate?: string | null | undefined;
  trackingEndDate?: string | null | undefined;
  nicknameScope: string[];
  agingScope: BillingPrincipalAging[];
  targets: BillingPrincipalTargetInput[];
};

export type BillingPrincipalClientResultInput = {
  aging: BillingPrincipalAging;
  targetPercentage: string;
  resultPercentage: string;
  note?: string | null | undefined;
  reference?: string | null | undefined;
  version?: number | null | undefined;
};

const reportAgingSchema = z.enum(["D3", "D4", "D5", "D6"]);
const reportRowSchema = z.object({
  aging: reportAgingSchema,
  totalOsp: z.string(),
  targetPercentage: z.string(),
  targetOsp: z.string(),
  resultPercentage: z.string(),
  ospClosed: z.string(),
  closedAccountCount: z.number().int().nonnegative(),
});

const billingPrincipalReportResponseSchema = z.object({
  ok: z.literal(true),
  filters: z.object({
    sourceImportIds: z.array(z.string()),
    from: z.string(),
    to: z.string(),
    agingBuckets: z.array(reportAgingSchema),
    nicknames: z.array(z.string()),
  }),
  report: z.object({
    rows: z.array(reportRowSchema),
    all: reportRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL") }),
  }),
});

const targetInputSchema = z.object({
  agingBucket: reportAgingSchema,
  totalOspBaseline: z.string().nullable(),
  targetPercentage: z.string(),
});

const targetsMutationResponseSchema = z.object({
  ok: z.literal(true),
  targets: z.array(targetInputSchema),
});

const idSchema = z.string().min(1).max(128);
const descriptionSchema = z.string().max(1_000);
const noteSchema = z.string().max(2_000);
const referenceSchema = z.string().max(300);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeSchema = z.string().min(1).max(64);
const decimalSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/).max(40);

const savedTargetRevisionSchema: z.ZodType<BillingPrincipalSavedTargetRevision> = z.object({
  id: idSchema,
  revisionNumber: z.number().int().positive(),
  sourceValidityVerified: z.boolean().optional(),
  from: isoDateSchema,
  to: isoDateSchema,
  trackingStartDate: isoDateSchema.nullable(),
  trackingEndDate: isoDateSchema.nullable(),
  sourceImportIds: z.array(idSchema).max(5),
  sourceSnapshots: z.array(z.object({
    sourceImportId: idSchema,
    name: z.string().min(1).max(300),
    filename: z.string().min(1).max(500).nullable(),
  })).max(5),
  nicknameScope: z.array(z.string().min(1).max(120)).max(100),
  agingScope: z.array(reportAgingSchema).max(4),
  createdAt: dateTimeSchema,
});

const savedTargetSchema: z.ZodType<BillingPrincipalSavedTarget> = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  description: descriptionSchema.nullable(),
  status: z.enum(["ACTIVE", "DELETED"]),
  version: z.number().int().positive(),
  assignedAdminUserId: z.string().min(1).max(200).nullable(),
  assignedAdmin: z.object({
    id: z.string().min(1).max(200),
    username: z.string().min(1).max(160),
    fullName: z.string().max(300).nullable(),
  }).nullable(),
  activeRevision: savedTargetRevisionSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

const clientRowSchema = z.object({
  aging: reportAgingSchema,
  totalOsp: decimalSchema,
  targetPercentage: decimalSchema,
  targetOsp: decimalSchema,
  resultPercentage: decimalSchema,
  ospClosed: decimalSchema,
  balanceOsp: decimalSchema,
  note: noteSchema.nullable(),
  reference: referenceSchema.nullable(),
  receivedDate: isoDateSchema.nullable(),
  updatedAt: dateTimeSchema.nullable(),
  version: z.number().int().nonnegative().nullable(),
});

const latestComparisonSchema: z.ZodType<BillingPrincipalLatestComparison> = z.object({
  system: z.object({
    asOf: isoDateSchema,
    totalOsp: decimalSchema,
    ospClosed: decimalSchema,
    resultPercentage: decimalSchema,
  }),
  client: z.object({
    lastUpdatedAt: dateTimeSchema,
    receivedDate: isoDateSchema,
    totalOsp: decimalSchema,
    ospClosed: decimalSchema,
    resultPercentage: decimalSchema,
  }).nullable(),
  differencePercentagePoints: decimalSchema.nullable(),
});

const paginatedFieldsSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const overviewSchema = z.object({
  ok: z.literal(true),
  target: savedTargetSchema,
  revision: savedTargetRevisionSchema,
  asOf: isoDateSchema,
  systemResult: z.object({
    rows: z.array(reportRowSchema.extend({ balanceOsp: decimalSchema })).max(4),
    all: reportRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL"), balanceOsp: decimalSchema }),
  }),
  clientResult: z.object({
    rows: z.array(clientRowSchema).max(4),
    all: clientRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL") }),
  }),
  latestComparison: latestComparisonSchema,
}) satisfies z.ZodType<BillingPrincipalSavedTargetOverview>;

const calendarDaySchema: z.ZodType<BillingPrincipalCalendarDay> = z.object({
  date: isoDateSchema,
  aging: z.enum(["D3", "D4", "D5", "D6", "ALL"]),
  totalOsp: decimalSchema,
  targetOsp: decimalSchema,
  systemOspClosedToday: decimalSchema,
  balanceOsp: decimalSchema,
  systemCumulativeOspClosed: decimalSchema,
  systemResultPercentage: decimalSchema,
  systemPreviousResultPercentage: decimalSchema,
  systemDailyMovementPercentagePoints: decimalSchema,
  systemAchievementVsTargetPercentage: decimalSchema,
  systemDailyAccounts: z.number().int().nonnegative(),
});

const drilldownItemSchema: z.ZodType<BillingPrincipalDrilldownItem> = z.object({
  contributionSource: z.enum(["AUTOMATIC_ABORT_CP", "MANUAL_VERIFIED_ABORT"]),
  maskedAccountNumber: z.string().min(1).max(64),
  cardNumber: z.string().min(1).max(80).nullable(),
  cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
  maskedCustomerName: z.string().min(1).max(160),
  accountNumber: z.string().max(200).nullable(),
  customerName: z.string().max(300).nullable(),
  identificationNumber: z.string().max(200).nullable(),
  phone: z.string().max(200).nullable(),
  paymentDate: isoDateSchema,
  classification: z.enum(["ABORT_CP", "MANUAL_VERIFIED_ABORT"]),
  sourceName: z.string().min(1).max(300),
  sourceFilename: z.string().min(1).max(500),
  callingDate: isoDateSchema,
  aging: reportAgingSchema,
  totalDue: decimalSchema,
  systemEligibleCumulative: decimalSchema,
  systemClosureCollectionAmount: decimalSchema.nullable(),
  systemClosureStaffNickname: z.string().min(1).max(160).nullable(),
  poolAmount: decimalSchema,
  effectiveCumulative: decimalSchema,
  billingPrincipalOsp: decimalSchema,
  effectiveClosedDate: isoDateSchema,
  reason: z.string().max(500).nullable(),
  reference: referenceSchema.nullable(),
  verifiedBy: z.string().min(1).max(160).nullable(),
  verifiedAt: dateTimeSchema.nullable(),
  updatedBy: z.string().min(1).max(160).nullable(),
  updatedAt: dateTimeSchema.nullable(),
});

const targetListResponseSchema = z.object({
  ok: z.literal(true),
  targets: z.array(savedTargetSchema).max(50),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(50),
  hasMore: z.boolean(),
});

const targetMutationResponseSchema = z.object({
  ok: z.literal(true),
  target: savedTargetSchema,
});

const targetReadResponseSchema = targetMutationResponseSchema.extend({
  viewerUserId: z.string().min(1).max(200),
});

const clientResultsMutationResponseSchema = z.object({
  ok: z.literal(true),
  clientResult: z.object({
    rows: z.array(clientRowSchema).max(4),
    all: clientRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL") }),
  }),
  latestComparison: latestComparisonSchema,
});

const calendarResponseSchema = z.object({
  ok: z.literal(true),
  from: isoDateSchema,
  to: isoDateSchema,
  aging: z.enum(["D3", "D4", "D5", "D6", "ALL"]),
  days: z.array(calendarDaySchema).max(366),
});

const drilldownResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(drilldownItemSchema).max(100),
  pagination: paginatedFieldsSchema,
  summary: z.object({ accountCount: z.number().int().nonnegative(), ospClosed: decimalSchema }),
});

const visualExportDatasetSchema = z.object({
  ok: z.literal(true),
  generatedAt: dateTimeSchema,
  generatedBy: z.string().min(1).max(160),
  generatedByUserId: z.string().min(1).max(200),
  filters: z.object({
    asOf: isoDateSchema,
    from: isoDateSchema,
    to: isoDateSchema,
    date: isoDateSchema.nullable(),
    aging: reportAgingSchema.nullable(),
  }),
  overview: overviewSchema.omit({ ok: true }),
  calendar: z.array(calendarDaySchema).max(366),
  drilldown: z.array(drilldownItemSchema).max(10_000),
  drilldownTotal: z.number().int().nonnegative().max(10_000),
}) satisfies z.ZodType<BillingPrincipalVisualExportDataset>;

type RequestOptions = { signal?: AbortSignal | undefined };

export type BillingPrincipalMutationAttempt = {
  idempotencyKey: string;
  idempotencyFingerprint: string;
};

type MutationRequestOptions = RequestOptions & Partial<BillingPrincipalMutationAttempt>;

function sortFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortFingerprintValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortFingerprintValue(nested)]),
    );
  }
  return value ?? null;
}

function hashFingerprintInput(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function buildBillingPrincipalMutationFingerprint(operation: string, payload: unknown) {
  const canonical = JSON.stringify(sortFingerprintValue({ operation, payload }));
  return JSON.stringify({ algorithm: "fnv1a64", hash: hashFingerprintInput(canonical), version: 1 });
}

export function prepareBillingPrincipalMutationAttempt(
  operation: string,
  payload: unknown,
  previous?: BillingPrincipalMutationAttempt | null,
): BillingPrincipalMutationAttempt {
  const idempotencyFingerprint = buildBillingPrincipalMutationFingerprint(operation, payload);
  if (previous?.idempotencyFingerprint === idempotencyFingerprint) return previous;
  return {
    idempotencyKey: createClientRandomId("billing-principal-v7"),
    idempotencyFingerprint,
  };
}

function billingPrincipalMutationOptions(
  operation: string,
  payload: unknown,
  options?: MutationRequestOptions,
) {
  const generated = prepareBillingPrincipalMutationAttempt(operation, payload);
  return {
    ...(options?.signal ? { signal: options.signal } : {}),
    headers: {
      "x-idempotency-key": options?.idempotencyKey || generated.idempotencyKey,
      "x-idempotency-fingerprint": options?.idempotencyFingerprint || generated.idempotencyFingerprint,
    },
  };
}

const SAVED_TARGETS_ENDPOINT = "/api/collection/report/billing-principal/saved-targets";

const targetOptionsSchema = z.object({
  ok: z.literal(true),
  admins: z.array(z.object({ id: z.string().min(1).max(200), username: z.string().max(160), fullName: z.string().max(300).nullable() })).max(100),
  sources: z.array(z.object({
    id: z.string().min(1).max(200), name: z.string().max(300), filename: z.string().max(500),
    validFrom: isoDateSchema, validTo: isoDateSchema, recordCount: z.number().int().nonnegative(), status: z.literal("active"),
  })).max(100),
  adminsHasMore: z.boolean(), sourcesHasMore: z.boolean(), pageSize: z.number().int().positive().max(100),
});
const sourcePreviewSchema = z.object({
  ok: z.literal(true), from: isoDateSchema, to: isoDateSchema,
  sourceImportIds: z.array(z.string().min(1).max(200)).min(1).max(5),
  rows: z.array(z.object({ aging: reportAgingSchema, totalOsp: decimalSchema, accountCount: z.number().int().nonnegative() })).length(4),
});
export type BillingPrincipalTargetOptions = z.infer<typeof targetOptionsSchema>;
export type BillingPrincipalSourcePreview = z.infer<typeof sourcePreviewSchema>;

export async function getBillingPrincipalTargetOptions(
  filters: { adminSearch?: string; sourceSearch?: string; adminPage?: number; sourcePage?: number; pageSize?: number },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(`${SAVED_TARGETS_ENDPOINT}/options`, filters);
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(response, targetOptionsSchema, `${SAVED_TARGETS_ENDPOINT}/options`);
}

export async function previewBillingPrincipalSource(sourceImportIds: string[], options?: RequestOptions) {
  const endpoint = `${SAVED_TARGETS_ENDPOINT}/preview`;
  const response = await apiRequest("POST", endpoint, { sourceImportIds }, options);
  return parseApiJson(response, sourcePreviewSchema, endpoint);
}

function savedTargetEndpoint(targetId: string) {
  return `${SAVED_TARGETS_ENDPOINT}/${encodeURIComponent(targetId)}`;
}

function savedTargetRevisionEndpoint(targetId: string, revisionId: string) {
  return `${savedTargetEndpoint(targetId)}/revisions/${encodeURIComponent(revisionId)}`;
}

function appendQuery(endpoint: string, values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

function buildBillingPrincipalQuery(filters: {
  sourceImportIds: string[];
  from: string;
  to: string;
  agingBuckets?: BillingPrincipalAging[] | undefined;
  nickname?: string | undefined;
}) {
  const params = new URLSearchParams();
  params.set("sourceImportIds", filters.sourceImportIds.join(","));
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.agingBuckets?.length) {
    params.set("agingBuckets", filters.agingBuckets.join(","));
  }
  if (filters.nickname?.trim()) {
    params.set("nickname", filters.nickname.trim());
  }
  return params.toString();
}

export async function getBillingPrincipalReport(
  filters: Parameters<typeof buildBillingPrincipalQuery>[0],
  options?: RequestOptions,
) {
  const query = buildBillingPrincipalQuery(filters);
  const response = await apiRequest(
    "GET",
    `/api/collection/report/billing-principal?${query}`,
    undefined,
    options,
  );
  return parseApiJson(
    response,
    billingPrincipalReportResponseSchema,
    "/api/collection/report/billing-principal",
  ) as Promise<BillingPrincipalReportResponse>;
}

export async function updateBillingPrincipalTargets(payload: {
  sourceImportIds: string[];
  from: string;
  to: string;
  targets: BillingPrincipalTargetInput[];
}, options?: RequestOptions) {
  const response = await apiRequest(
    "PUT",
    "/api/collection/report/billing-principal/targets",
    payload,
    options,
  );
  return parseApiJson(
    response,
    targetsMutationResponseSchema,
    "/api/collection/report/billing-principal/targets",
  );
}

export async function listBillingPrincipalSavedTargets(options?: RequestOptions & { page?: number; pageSize?: number }) {
  const endpoint = appendQuery(SAVED_TARGETS_ENDPOINT, { page: options?.page, pageSize: options?.pageSize });
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(response, targetListResponseSchema, SAVED_TARGETS_ENDPOINT);
}

export async function createBillingPrincipalSavedTarget(
  payload: BillingPrincipalSavedTargetInput,
  options?: MutationRequestOptions,
) {
  const response = await apiRequest(
    "POST",
    SAVED_TARGETS_ENDPOINT,
    payload,
    billingPrincipalMutationOptions("saved-target:create", payload, options),
  );
  return parseApiJson(response, targetMutationResponseSchema, SAVED_TARGETS_ENDPOINT);
}

export async function getBillingPrincipalSavedTarget(
  targetId: string,
  options?: RequestOptions,
) {
  const endpoint = savedTargetEndpoint(targetId);
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(response, targetReadResponseSchema, endpoint);
}

export async function updateBillingPrincipalSavedTarget(
  targetId: string,
  payload: {
    name?: string | undefined;
    description?: string | null | undefined;
    assignedAdminUserId?: string | undefined;
    targets?: BillingPrincipalTargetInput[] | undefined;
    version: number;
  },
  options?: MutationRequestOptions,
) {
  const endpoint = savedTargetEndpoint(targetId);
  const response = await apiRequest(
    "PATCH",
    endpoint,
    payload,
    billingPrincipalMutationOptions("saved-target:update", { targetId, payload }, options),
  );
  return parseApiJson(response, targetMutationResponseSchema, endpoint);
}

export async function deleteBillingPrincipalSavedTarget(
  targetId: string,
  version: number,
  options?: MutationRequestOptions,
) {
  const endpoint = appendQuery(savedTargetEndpoint(targetId), { version });
  const response = await apiRequest(
    "DELETE",
    endpoint,
    undefined,
    billingPrincipalMutationOptions("saved-target:delete", { targetId, version }, options),
  );
  return parseApiJson(response, targetMutationResponseSchema, endpoint);
}

export async function getBillingPrincipalSavedTargetOverview(
  targetId: string,
  revisionId: string,
  filters: { asOf: string },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/overview`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    overviewSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/overview`,
  ) as Promise<BillingPrincipalSavedTargetOverview>;
}

export async function upsertBillingPrincipalClientResults(
  targetId: string,
  revisionId: string,
  payload: { rows: BillingPrincipalClientResultInput[] },
  options?: MutationRequestOptions,
) {
  const endpoint = `${savedTargetRevisionEndpoint(targetId, revisionId)}/client-results`;
  const response = await apiRequest(
    "PUT",
    endpoint,
    payload,
    billingPrincipalMutationOptions("client-results:upsert", { targetId, revisionId, payload }, options),
  );
  return parseApiJson(
    response,
    clientResultsMutationResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/client-results`,
  );
}

export async function getBillingPrincipalCalendar(
  targetId: string,
  revisionId: string,
  filters: {
    from: string;
    to: string;
    asOf?: string | undefined;
    aging?: BillingPrincipalAging | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/calendar`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    calendarResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/calendar`,
  );
}

export async function getBillingPrincipalDrilldown(
  targetId: string,
  revisionId: string,
  filters: {
    asOf: string;
    date?: string | undefined;
    page: number;
    pageSize: number;
    aging?: BillingPrincipalAging | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/drilldown`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    drilldownResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/drilldown`,
  );
}

function parseDownloadFilename(contentDisposition: string | null): string | null {
  const raw = String(contentDisposition || "").trim();
  const utfMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).trim() || null;
    } catch {
      return utfMatch[1].trim() || null;
    }
  }
  return raw.match(/filename="?([^";]+)"?/i)?.[1]?.trim() || null;
}

export async function downloadBillingPrincipalExport(
  targetId: string,
  revisionId: string,
  filters: {
    asOf: string;
    format: "csv" | "xlsx";
    from?: string | undefined;
    to?: string | undefined;
    date?: string | undefined;
    aging?: BillingPrincipalAging | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/export`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, { ...options, retry: false });
  const blob = await response.blob();
  return {
    blob,
    generatedByUserId: z.string().min(1).max(200).parse(response.headers.get("X-Billing-Export-Owner-Id")),
    fileName: parseDownloadFilename(response.headers.get("Content-Disposition")),
    mimeType: String(response.headers.get("Content-Type") || blob.type || "application/octet-stream"),
  };
}

export async function getBillingPrincipalVisualExportDataset(
  targetId: string,
  revisionId: string,
  filters: {
    asOf: string;
    from: string;
    to: string;
    date?: string | undefined;
    aging?: BillingPrincipalAging | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/export`,
    { ...filters, format: "json" },
  );
  const response = await apiRequest("GET", endpoint, undefined, { ...options, retry: false });
  return parseApiJson(
    response,
    visualExportDatasetSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/export?format=json`,
  );
}
