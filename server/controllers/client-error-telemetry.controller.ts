import type { RequestHandler } from "express";
import { clientErrorTelemetrySchema } from "../../shared/client-error-telemetry";
import { parseRequestBody } from "../http/validation";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import type { ClientErrorTelemetryService } from "../services/client-error-telemetry.service";

type CreateClientErrorTelemetryControllerOptions = {
  clientErrorTelemetryService: Pick<ClientErrorTelemetryService, "record">;
  metrics?: InternalMetricsRecorder;
};

export function createClientErrorTelemetryController(
  options: CreateClientErrorTelemetryControllerOptions,
): { report: RequestHandler } {
  const { clientErrorTelemetryService } = options;
  const metrics = options.metrics ?? internalMetrics;

  return {
    report(req, res) {
      const payload = parseRequestBody(clientErrorTelemetrySchema, req.body);
      clientErrorTelemetryService.record(payload);
      metrics.increment("clientErrorsAcceptedTotal");
      res.status(204).end();
    },
  };
}
