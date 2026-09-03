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
  activeRevision: BillingPrincipalSavedTargetRevision;
  createdAt: string;
  updatedAt: string;
};

export type BillingPrincipalClientRow = {
  aging: BillingPrincipalAging;
  resultPercentage: string;
  ospClosed: string;
  note: string | null;
  reference: string | null;
  effectiveDate: string | null;
  version: number | null;
};

export type BillingPrincipalManualSummaryRow = {
  aging: BillingPrincipalAging;
  ospClosed: string;
  closedAccountCount: number;
};

export type BillingPrincipalReconciledRow = BillingPrincipalReportRow & {
  systemOspClosed: string;
  manualReconciledOsp: string;
  reconciledOspClosed: string;
  reconciledResultPercentage: string;
};

export type BillingPrincipalComparisonRow = {
  aging: BillingPrincipalAging | "ALL";
  systemResultPercentage: string;
  reconciledResultPercentage: string;
  clientResultPercentage: string | null;
  systemOspClosed: string;
  manualReconciledOsp: string;
  reconciledOspClosed: string;
  clientOspClosed: string | null;
  systemVsClientResultPercentagePointDifference: string | null;
  reconciledVsClientResultPercentagePointDifference: string | null;
  systemVsClientOspDifference: string | null;
  reconciledVsClientOspDifference: string | null;
};

export type BillingPrincipalSavedTargetOverview = {
  ok: true;
  target: BillingPrincipalSavedTarget;
  revision: BillingPrincipalSavedTargetRevision;
  asOf: string;
  systemResult: BillingPrincipalReportResponse["report"];
  clientResult: {
    rows: BillingPrincipalClientRow[];
    all: Omit<BillingPrincipalClientRow, "aging"> & { aging: "ALL" };
  };
  manualReconciliation: {
    rows: BillingPrincipalManualSummaryRow[];
    all: Omit<BillingPrincipalManualSummaryRow, "aging"> & { aging: "ALL" };
  };
  reconciledResult: {
    rows: BillingPrincipalReconciledRow[];
    all: Omit<BillingPrincipalReconciledRow, "aging"> & { aging: "ALL" };
  };
  comparison: { rows: BillingPrincipalComparisonRow[] };
};

export type BillingPrincipalAccountCandidate = {
  sourceImportId: string;
  sourceRecordId: string;
  sourceName: string;
  sourceFilename: string;
  maskedAccountNumber: string;
  cardNumberLast4: string | null;
  maskedCustomerName: string;
  aging: BillingPrincipalAging;
  callingDate: string;
  totalDue: string;
  billingPrincipalOsp: string;
  systemEligibleCumulative: string;
  rawSystemClassification: "CP" | "ABORT_CP" | null;
  activeReconciliationId: string | null;
};

export type BillingPrincipalManualReason =
  | "PRIOR_PAYMENT_NOT_IN_SYSTEM"
  | "CLIENT_CONFIRMED_PRIOR_PAYMENT"
  | "HISTORICAL_PAYMENT_MISSING"
  | "MIGRATED_HISTORY_GAP"
  | "OTHER_WITH_REQUIRED_NOTE";

export type BillingPrincipalManualReconciliation = Omit<
  BillingPrincipalAccountCandidate,
  "activeReconciliationId"
> & {
  id: string;
  version: number;
  status: "ACTIVE" | "VOIDED";
  manualPriorAmount: string;
  asOfDate: string;
  actualPaymentDate: string | null;
  reconciledCumulative: string;
  reconciledRemaining: string;
  reconciledStatus: "RECONCILED_CLOSED" | "RECONCILED_OPEN" | "SUPERSEDED_BY_SYSTEM_ABORT";
  reconciledClosedEffectiveDate: string | null;
  reason: BillingPrincipalManualReason;
  note: string | null;
  reference: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type BillingPrincipalCalendarDay = {
  date: string;
  aging: BillingPrincipalAging | "ALL";
  totalOsp: string;
  targetOsp: string;
  systemOspClosedToday: string;
  manualReconciliationOspClosedToday: string;
  reconciledOspClosedToday: string;
  systemCumulativeOspClosed: string;
  manualReconciliationCumulativeOsp: string;
  reconciledCumulativeOspClosed: string;
  systemResultPercentage: string;
  reconciledResultPercentage: string;
  clientResultPercentage: string | null;
  systemPreviousResultPercentage: string;
  reconciledPreviousResultPercentage: string;
  systemDailyMovementPercentagePoints: string;
  reconciledDailyMovementPercentagePoints: string;
  systemAchievementVsTargetPercentage: string;
  reconciledAchievementVsTargetPercentage: string;
  systemDailyAccounts: number;
  manualDailyAccounts: number;
  reconciledDailyAccounts: number;
};

export type BillingPrincipalDrilldownItem = {
  contributionSource: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION";
  maskedAccountNumber: string;
  cardNumberLast4: string | null;
  maskedCustomerName: string;
  sourceName: string;
  sourceFilename: string;
  callingDate: string;
  aging: BillingPrincipalAging;
  totalDue: string;
  systemEligibleCumulative: string;
  systemClosureCollectionAmount: string | null;
  systemClosureStaffNickname: string | null;
  manualPriorAmount: string;
  reconciledCumulative: string;
  billingPrincipalOsp: string;
  effectiveClosedDate: string;
  reason: BillingPrincipalManualReason | null;
  reference: string | null;
  reconciliationCreatedBy: string | null;
  reconciliationCreatedAt: string | null;
  reconciliationUpdatedBy: string | null;
  reconciliationUpdatedAt: string | null;
};

export type BillingPrincipalVisualExportDataset = {
  ok: true;
  generatedAt: string;
  generatedBy: string;
  filters: {
    asOf: string;
    from: string;
    to: string;
    date: string | null;
    aging: BillingPrincipalAging | null;
    contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | null | undefined;
  };
  overview: Omit<BillingPrincipalSavedTargetOverview, "ok">;
  reconciliations: BillingPrincipalManualReconciliation[];
  reconciliationTotal: number;
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

export type BillingPrincipalReconciliationHistoryEntry = {
  id: string;
  operation: "CREATE" | "UPDATE" | "VOID" | "RESTORE";
  fromVersion: number | null;
  toVersion: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  createdAt: string;
};

export type BillingPrincipalSavedTargetInput = {
  name: string;
  description?: string | null | undefined;
  sourceImportIds: string[];
  from: string;
  to: string;
  trackingStartDate?: string | null | undefined;
  trackingEndDate?: string | null | undefined;
  nicknameScope: string[];
  agingScope: BillingPrincipalAging[];
  targets: BillingPrincipalTargetInput[];
};

export type BillingPrincipalClientResultInput = {
  aging: BillingPrincipalAging;
  resultPercentage: string;
  ospClosed: string;
  note?: string | null | undefined;
  reference?: string | null | undefined;
  version?: number | null | undefined;
};

export type BillingPrincipalReconciliationInput = {
  sourceImportId: string;
  sourceRecordId: string;
  manualPriorAmount: string;
  asOfDate: string;
  actualPaymentDate?: string | null | undefined;
  reason: BillingPrincipalManualReason;
  note?: string | null | undefined;
  reference?: string | null | undefined;
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
  from: isoDateSchema,
  to: isoDateSchema,
  trackingStartDate: isoDateSchema.nullable(),
  trackingEndDate: isoDateSchema.nullable(),
  sourceImportIds: z.array(idSchema).max(5),
  sourceSnapshots: z.array(z.object({
    sourceImportId: idSchema,
    name: z.string().min(1).max(255),
    filename: z.string().min(1).max(255).nullable(),
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
  activeRevision: savedTargetRevisionSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

const clientRowSchema = z.object({
  aging: reportAgingSchema,
  resultPercentage: decimalSchema,
  ospClosed: decimalSchema,
  note: noteSchema.nullable(),
  reference: referenceSchema.nullable(),
  effectiveDate: isoDateSchema.nullable(),
  version: z.number().int().nonnegative().nullable(),
});

const manualSummaryRowSchema = z.object({
  aging: reportAgingSchema,
  ospClosed: decimalSchema,
  closedAccountCount: z.number().int().nonnegative(),
});

const reconciledRowSchema = reportRowSchema.extend({
  systemOspClosed: decimalSchema,
  manualReconciledOsp: decimalSchema,
  reconciledOspClosed: decimalSchema,
  reconciledResultPercentage: decimalSchema,
});

const comparisonRowSchema: z.ZodType<BillingPrincipalComparisonRow> = z.object({
  aging: z.enum(["D3", "D4", "D5", "D6", "ALL"]),
  systemResultPercentage: decimalSchema,
  reconciledResultPercentage: decimalSchema,
  clientResultPercentage: decimalSchema.nullable(),
  systemOspClosed: decimalSchema,
  manualReconciledOsp: decimalSchema,
  reconciledOspClosed: decimalSchema,
  clientOspClosed: decimalSchema.nullable(),
  systemVsClientResultPercentagePointDifference: decimalSchema.nullable(),
  reconciledVsClientResultPercentagePointDifference: decimalSchema.nullable(),
  systemVsClientOspDifference: decimalSchema.nullable(),
  reconciledVsClientOspDifference: decimalSchema.nullable(),
});

const accountCandidateSchema = z.object({
  sourceImportId: idSchema,
  sourceRecordId: idSchema,
  sourceName: z.string().min(1).max(300),
  sourceFilename: z.string().min(1).max(500),
  maskedAccountNumber: z.string().min(1).max(64),
  cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
  maskedCustomerName: z.string().min(1).max(160),
  aging: reportAgingSchema,
  callingDate: isoDateSchema,
  totalDue: decimalSchema,
  billingPrincipalOsp: decimalSchema,
  systemEligibleCumulative: decimalSchema,
  rawSystemClassification: z.enum(["CP", "ABORT_CP"]).nullable(),
  activeReconciliationId: idSchema.nullable(),
});

const manualReasonSchema = z.enum([
  "PRIOR_PAYMENT_NOT_IN_SYSTEM",
  "CLIENT_CONFIRMED_PRIOR_PAYMENT",
  "HISTORICAL_PAYMENT_MISSING",
  "MIGRATED_HISTORY_GAP",
  "OTHER_WITH_REQUIRED_NOTE",
]);

const reconciliationSchema: z.ZodType<BillingPrincipalManualReconciliation> = accountCandidateSchema.omit({
  activeReconciliationId: true,
}).extend({
  id: idSchema,
  version: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "VOIDED"]),
  manualPriorAmount: decimalSchema,
  asOfDate: isoDateSchema,
  actualPaymentDate: isoDateSchema.nullable(),
  reconciledCumulative: decimalSchema,
  reconciledRemaining: decimalSchema,
  reconciledStatus: z.enum([
    "RECONCILED_CLOSED",
    "RECONCILED_OPEN",
    "SUPERSEDED_BY_SYSTEM_ABORT",
  ]),
  reconciledClosedEffectiveDate: isoDateSchema.nullable(),
  reason: manualReasonSchema,
  note: noteSchema.nullable(),
  reference: referenceSchema.nullable(),
  createdBy: z.string().min(1).max(160),
  createdAt: dateTimeSchema,
  updatedBy: z.string().min(1).max(160),
  updatedAt: dateTimeSchema,
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
  systemResult: billingPrincipalReportResponseSchema.shape.report,
  clientResult: z.object({
    rows: z.array(clientRowSchema).max(4),
    all: clientRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL") }),
  }),
  manualReconciliation: z.object({
    rows: z.array(manualSummaryRowSchema).max(4),
    all: manualSummaryRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL") }),
  }),
  reconciledResult: z.object({
    rows: z.array(reconciledRowSchema).max(4),
    all: reconciledRowSchema.omit({ aging: true }).extend({ aging: z.literal("ALL") }),
  }),
  comparison: z.object({ rows: z.array(comparisonRowSchema).max(5) }),
}) satisfies z.ZodType<BillingPrincipalSavedTargetOverview>;

const calendarDaySchema: z.ZodType<BillingPrincipalCalendarDay> = z.object({
  date: isoDateSchema,
  aging: z.enum(["D3", "D4", "D5", "D6", "ALL"]),
  totalOsp: decimalSchema,
  targetOsp: decimalSchema,
  systemOspClosedToday: decimalSchema,
  manualReconciliationOspClosedToday: decimalSchema,
  reconciledOspClosedToday: decimalSchema,
  systemCumulativeOspClosed: decimalSchema,
  manualReconciliationCumulativeOsp: decimalSchema,
  reconciledCumulativeOspClosed: decimalSchema,
  systemResultPercentage: decimalSchema,
  reconciledResultPercentage: decimalSchema,
  clientResultPercentage: decimalSchema.nullable(),
  systemPreviousResultPercentage: decimalSchema,
  reconciledPreviousResultPercentage: decimalSchema,
  systemDailyMovementPercentagePoints: decimalSchema,
  reconciledDailyMovementPercentagePoints: decimalSchema,
  systemAchievementVsTargetPercentage: decimalSchema,
  reconciledAchievementVsTargetPercentage: decimalSchema,
  systemDailyAccounts: z.number().int().nonnegative(),
  manualDailyAccounts: z.number().int().nonnegative(),
  reconciledDailyAccounts: z.number().int().nonnegative(),
});

const drilldownItemSchema: z.ZodType<BillingPrincipalDrilldownItem> = z.object({
  contributionSource: z.enum(["SYSTEM_ABORT_CP", "MANUAL_RECONCILIATION"]),
  maskedAccountNumber: z.string().min(1).max(64),
  cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
  maskedCustomerName: z.string().min(1).max(160),
  sourceName: z.string().min(1).max(300),
  sourceFilename: z.string().min(1).max(500),
  callingDate: isoDateSchema,
  aging: reportAgingSchema,
  totalDue: decimalSchema,
  systemEligibleCumulative: decimalSchema,
  systemClosureCollectionAmount: decimalSchema.nullable(),
  systemClosureStaffNickname: z.string().min(1).max(160).nullable(),
  manualPriorAmount: decimalSchema,
  reconciledCumulative: decimalSchema,
  billingPrincipalOsp: decimalSchema,
  effectiveClosedDate: isoDateSchema,
  reason: manualReasonSchema.nullable(),
  reference: referenceSchema.nullable(),
  reconciliationCreatedBy: z.string().min(1).max(160).nullable(),
  reconciliationCreatedAt: dateTimeSchema.nullable(),
  reconciliationUpdatedBy: z.string().min(1).max(160).nullable(),
  reconciliationUpdatedAt: dateTimeSchema.nullable(),
});

const targetListResponseSchema = z.object({
  ok: z.literal(true),
  targets: z.array(savedTargetSchema).max(500),
});

const targetMutationResponseSchema = z.object({
  ok: z.literal(true),
  target: savedTargetSchema,
});

const candidateListResponseSchema = z.object({
  ok: z.literal(true),
  candidates: z.array(accountCandidateSchema).max(100),
  pagination: paginatedFieldsSchema,
});

const reconciliationListResponseSchema = z.object({
  ok: z.literal(true),
  reconciliations: z.array(reconciliationSchema).max(100),
  pagination: paginatedFieldsSchema,
});

const reconciliationMutationResponseSchema = z.object({
  ok: z.literal(true),
  reconciliation: reconciliationSchema,
});

const reconciliationHistoryEntrySchema: z.ZodType<BillingPrincipalReconciliationHistoryEntry> = z.object({
  id: idSchema,
  operation: z.enum(["CREATE", "UPDATE", "VOID", "RESTORE"]),
  fromVersion: z.number().int().nonnegative().nullable(),
  toVersion: z.number().int().positive(),
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  actor: z.string().min(1).max(160),
  createdAt: dateTimeSchema,
});

const reconciliationHistoryResponseSchema = z.object({
  ok: z.literal(true),
  history: z.array(reconciliationHistoryEntrySchema).max(500),
});

const clientResultsMutationResponseSchema = z.object({
  ok: z.literal(true),
  rows: z.array(clientRowSchema).max(4),
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
});

const visualExportDatasetSchema = z.object({
  ok: z.literal(true),
  generatedAt: dateTimeSchema,
  generatedBy: z.string().min(1).max(160),
  filters: z.object({
    asOf: isoDateSchema,
    from: isoDateSchema,
    to: isoDateSchema,
    date: isoDateSchema.nullable(),
    aging: reportAgingSchema.nullable(),
    contributionSource: z.enum(["SYSTEM_ABORT_CP", "MANUAL_RECONCILIATION"]).nullable().optional(),
  }),
  overview: overviewSchema.omit({ ok: true }),
  reconciliations: z.array(reconciliationSchema).max(10_000),
  reconciliationTotal: z.number().int().nonnegative().max(10_000),
  calendar: z.array(calendarDaySchema).max(366),
  drilldown: z.array(drilldownItemSchema).max(10_000),
  drilldownTotal: z.number().int().nonnegative().max(10_000),
}).superRefine((dataset, context) => {
  if (dataset.reconciliations.length + dataset.drilldown.length > 10_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconciliations"],
      message: "Visual export detail rows exceed the governed 10,000-row limit.",
    });
  }
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

export async function listBillingPrincipalSavedTargets(options?: RequestOptions) {
  const response = await apiRequest("GET", SAVED_TARGETS_ENDPOINT, undefined, options);
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
  return parseApiJson(response, targetMutationResponseSchema, endpoint);
}

export async function updateBillingPrincipalSavedTarget(
  targetId: string,
  payload: {
    name?: string | undefined;
    description?: string | null | undefined;
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
  payload: { asOf: string; rows: BillingPrincipalClientResultInput[] },
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

export async function listBillingPrincipalReconciliationCandidates(
  targetId: string,
  revisionId: string,
  filters: {
    asOf: string;
    page: number;
    pageSize: number;
    search?: string | undefined;
    aging?: BillingPrincipalAging | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/reconciliation-candidates`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    candidateListResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/reconciliation-candidates`,
  );
}

export async function listBillingPrincipalReconciliations(
  targetId: string,
  revisionId: string,
  filters: {
    asOf: string;
    page: number;
    pageSize: number;
    search?: string | undefined;
    aging?: BillingPrincipalAging | undefined;
    status?: "ACTIVE" | "VOIDED" | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/reconciliations`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    reconciliationListResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/reconciliations`,
  );
}

export async function createBillingPrincipalReconciliation(
  targetId: string,
  revisionId: string,
  payload: BillingPrincipalReconciliationInput,
  options?: MutationRequestOptions,
) {
  const endpoint = `${savedTargetRevisionEndpoint(targetId, revisionId)}/reconciliations`;
  const response = await apiRequest(
    "POST",
    endpoint,
    payload,
    billingPrincipalMutationOptions("reconciliation:create", { targetId, revisionId, payload }, options),
  );
  return parseApiJson(
    response,
    reconciliationMutationResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/reconciliations`,
  );
}

export async function updateBillingPrincipalReconciliation(
  targetId: string,
  revisionId: string,
  reconciliationId: string,
  payload: BillingPrincipalReconciliationInput & { version: number },
  options?: MutationRequestOptions,
) {
  const endpoint = `${savedTargetRevisionEndpoint(targetId, revisionId)}/reconciliations/${encodeURIComponent(reconciliationId)}`;
  const response = await apiRequest(
    "PATCH",
    endpoint,
    payload,
    billingPrincipalMutationOptions(
      "reconciliation:update",
      { targetId, revisionId, reconciliationId, payload },
      options,
    ),
  );
  return parseApiJson(
    response,
    reconciliationMutationResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/reconciliations/:reconciliationId`,
  );
}

export async function voidBillingPrincipalReconciliation(
  targetId: string,
  revisionId: string,
  reconciliationId: string,
  payload: { version: number; reason: string; asOfDate: string },
  options?: MutationRequestOptions,
) {
  const endpoint = `${savedTargetRevisionEndpoint(targetId, revisionId)}/reconciliations/${encodeURIComponent(reconciliationId)}/void`;
  const response = await apiRequest(
    "POST",
    endpoint,
    payload,
    billingPrincipalMutationOptions(
      "reconciliation:void",
      { targetId, revisionId, reconciliationId, payload },
      options,
    ),
  );
  return parseApiJson(
    response,
    reconciliationMutationResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/reconciliations/:reconciliationId/void`,
  );
}

export async function getBillingPrincipalReconciliationHistory(
  targetId: string,
  revisionId: string,
  reconciliationId: string,
  options?: RequestOptions,
) {
  const endpoint = `${savedTargetRevisionEndpoint(targetId, revisionId)}/reconciliations/${encodeURIComponent(reconciliationId)}/history`;
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    reconciliationHistoryResponseSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/reconciliations/:reconciliationId/history`,
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
    contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | undefined;
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
    contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/export`,
    filters,
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  const blob = await response.blob();
  return {
    blob,
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
    contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | undefined;
  },
  options?: RequestOptions,
) {
  const endpoint = appendQuery(
    `${savedTargetRevisionEndpoint(targetId, revisionId)}/export`,
    { ...filters, format: "json" },
  );
  const response = await apiRequest("GET", endpoint, undefined, options);
  return parseApiJson(
    response,
    visualExportDatasetSchema,
    `${SAVED_TARGETS_ENDPOINT}/:targetId/revisions/:revisionId/export?format=json`,
  );
}
