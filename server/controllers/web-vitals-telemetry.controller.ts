import type { RequestHandler } from "express";
import { parseRequestBody } from "../http/validation";
import { webVitalTelemetrySchema } from "../../shared/web-vitals";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import type { WebVitalsTelemetryService } from "../services/web-vitals-telemetry.service";

type CreateWebVitalsTelemetryControllerOptions = {
  metrics?: InternalMetricsRecorder;
  webVitalsTelemetryService: Pick<WebVitalsTelemetryService, "record">;
};

export function createWebVitalsTelemetryController(
  options: CreateWebVitalsTelemetryControllerOptions,
): { report: RequestHandler } {
  const { webVitalsTelemetryService } = options;
  const metrics = options.metrics ?? internalMetrics;

  return {
    report(req, res) {
      const payload = parseRequestBody(webVitalTelemetrySchema, req.body);
      webVitalsTelemetryService.record(payload);
      metrics.increment("webVitalsAcceptedTotal");
      res.status(204).end();
    },
  };
}
