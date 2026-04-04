import { z } from "zod";

export const WEB_VITAL_NAMES = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;
export const WEB_VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;
export const WEB_VITAL_PAGE_TYPES = ["public", "authenticated"] as const;

export const webVitalTelemetrySchema = z.object({
  name: z.enum(WEB_VITAL_NAMES),
  value: z.number().finite().min(0).max(120_000),
  delta: z.number().finite().min(0).max(120_000),
  rating: z.enum(WEB_VITAL_RATINGS),
  id: z.string().trim().min(1).max(160),
  path: z.string().trim().min(1).max(512).regex(/^\//, "Path must start with '/'."),
  pageType: z.enum(WEB_VITAL_PAGE_TYPES),
  navigationType: z.string().trim().min(1).max(64).optional(),
  visibilityState: z.string().trim().min(1).max(32).optional(),
  effectiveConnectionType: z.string().trim().min(1).max(32).optional(),
  saveData: z.boolean().optional(),
  ts: z.string().trim().min(1).max(64),
}).strict();

export const webVitalMetricSummarySchema = z.object({
  name: z.enum(WEB_VITAL_NAMES),
  sampleCount: z.number().int().min(0),
  p75: z.number().finite().min(0).nullable(),
  p75Rating: z.enum(WEB_VITAL_RATINGS).nullable(),
  latestValue: z.number().finite().min(0).nullable(),
  latestRating: z.enum(WEB_VITAL_RATINGS).nullable(),
  latestCapturedAt: z.string().trim().min(1).max(64).nullable(),
  latestPath: z.string().trim().min(1).max(512).nullable(),
});

export const webVitalPageSummarySchema = z.object({
  pageType: z.enum(WEB_VITAL_PAGE_TYPES),
  sampleCount: z.number().int().min(0),
  latestCapturedAt: z.string().trim().min(1).max(64).nullable(),
  metrics: z.array(webVitalMetricSummarySchema),
});

export const webVitalOverviewSchema = z.object({
  windowMinutes: z.number().int().positive(),
  totalSamples: z.number().int().min(0),
  pageSummaries: z.array(webVitalPageSummarySchema),
  updatedAt: z.string().trim().min(1).max(64),
});

export type WebVitalTelemetryPayload = z.infer<typeof webVitalTelemetrySchema>;
export type WebVitalMetricSummary = z.infer<typeof webVitalMetricSummarySchema>;
export type WebVitalPageSummary = z.infer<typeof webVitalPageSummarySchema>;
export type WebVitalOverviewPayload = z.infer<typeof webVitalOverviewSchema>;
