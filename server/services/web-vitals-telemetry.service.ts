import {
  WEB_VITAL_NAMES,
  WEB_VITAL_PAGE_TYPES,
  type WebVitalOverviewPayload,
  type WebVitalTelemetryPayload,
} from "../../shared/web-vitals";
import { logger as defaultLogger } from "../lib/logger";

type LoggerLike = Pick<typeof defaultLogger, "info" | "warn">;

type WebVitalsTelemetryServiceOptions = {
  logger?: LoggerLike;
  maxSamples?: number;
  maxAgeMs?: number;
};

type StoredWebVitalTelemetry = WebVitalTelemetryPayload & {
  capturedAtMs: number;
};

const DEFAULT_MAX_SAMPLES = 500;
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

const WEB_VITAL_THRESHOLDS: Record<
  WebVitalTelemetryPayload["name"],
  { good: number; needsImprovement: number }
> = {
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  INP: { good: 200, needsImprovement: 500 },
  LCP: { good: 2500, needsImprovement: 4000 },
  TTFB: { good: 800, needsImprovement: 1800 },
};

function roundMetricValue(value: number) {
  return Number(value.toFixed(3));
}

function normalizeCapturedAtMs(timestamp: string) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function sortSamplesByTimeDescending(
  samples: StoredWebVitalTelemetry[],
) {
  return [...samples].sort((left, right) => right.capturedAtMs - left.capturedAtMs);
}

function calculateP75(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.75) - 1);
  return sorted[index] ?? null;
}

function rateWebVital(
  name: WebVitalTelemetryPayload["name"],
  value: number | null,
): WebVitalTelemetryPayload["rating"] | null {
  if (value === null) {
    return null;
  }

  const thresholds = WEB_VITAL_THRESHOLDS[name];
  if (value <= thresholds.good) {
    return "good";
  }
  if (value <= thresholds.needsImprovement) {
    return "needs-improvement";
  }
  return "poor";
}

export class WebVitalsTelemetryService {
  private readonly logger: LoggerLike;
  private readonly maxSamples: number;
  private readonly maxAgeMs: number;
  private samples: StoredWebVitalTelemetry[] = [];

  constructor(options: WebVitalsTelemetryServiceOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
    this.maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  private prune(nowMs = Date.now()) {
    const cutoff = nowMs - this.maxAgeMs;
    this.samples = this.samples.filter((sample) => sample.capturedAtMs >= cutoff);

    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(this.samples.length - this.maxSamples);
    }
  }

  record(payload: WebVitalTelemetryPayload) {
    const capturedAtMs = normalizeCapturedAtMs(payload.ts);
    this.samples.push({
      ...payload,
      capturedAtMs,
    });
    this.prune(capturedAtMs);

    const logMeta = {
      metric: payload.name,
      value: roundMetricValue(payload.value),
      delta: roundMetricValue(payload.delta),
      rating: payload.rating,
      metricId: payload.id,
      path: payload.path,
      pageType: payload.pageType,
      navigationType: payload.navigationType,
      visibilityState: payload.visibilityState,
      effectiveConnectionType: payload.effectiveConnectionType,
      saveData: payload.saveData,
      capturedAt: payload.ts,
    };

    if (payload.rating === "poor") {
      this.logger.warn("Client web vital reported a poor experience", logMeta);
      return;
    }

    this.logger.info("Client web vital reported", logMeta);
  }

  getOverview(nowMs = Date.now()): WebVitalOverviewPayload {
    this.prune(nowMs);

    return {
      windowMinutes: Math.round(this.maxAgeMs / 60_000),
      totalSamples: this.samples.length,
      pageSummaries: WEB_VITAL_PAGE_TYPES.map((pageType) => {
        const pageSamples = this.samples.filter((sample) => sample.pageType === pageType);
        const latestPageSample = sortSamplesByTimeDescending(pageSamples)[0] ?? null;

        return {
          pageType,
          sampleCount: pageSamples.length,
          latestCapturedAt: latestPageSample?.ts ?? null,
          metrics: WEB_VITAL_NAMES.map((name) => {
            const metricSamples = pageSamples.filter((sample) => sample.name === name);
            const latestMetricSample = sortSamplesByTimeDescending(metricSamples)[0] ?? null;
            const p75 = calculateP75(metricSamples.map((sample) => sample.value));

            return {
              name,
              sampleCount: metricSamples.length,
              p75,
              p75Rating: rateWebVital(name, p75),
              latestValue: latestMetricSample?.value ?? null,
              latestRating: latestMetricSample?.rating ?? null,
              latestCapturedAt: latestMetricSample?.ts ?? null,
              latestPath: latestMetricSample?.path ?? null,
            };
          }),
        };
      }),
      updatedAt: new Date(nowMs).toISOString(),
    };
  }
}
