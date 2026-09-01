import { z } from "zod";
import { apiRequest } from "../api-client";
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

type RequestOptions = { signal?: AbortSignal | undefined };

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
