import type { RequestHandler } from "express";
import { parseRequestBody } from "../http/validation";
import { webVitalTelemetrySchema } from "../../shared/web-vitals";
import type { WebVitalsTelemetryService } from "../services/web-vitals-telemetry.service";

type CreateWebVitalsTelemetryControllerOptions = {
  webVitalsTelemetryService: Pick<WebVitalsTelemetryService, "record">;
};

export function createWebVitalsTelemetryController(
  options: CreateWebVitalsTelemetryControllerOptions,
): { report: RequestHandler } {
  const { webVitalsTelemetryService } = options;

  return {
    report(req, res) {
      const payload = parseRequestBody(webVitalTelemetrySchema, req.body);
      webVitalsTelemetryService.record(payload);
      res.status(204).end();
    },
  };
}
