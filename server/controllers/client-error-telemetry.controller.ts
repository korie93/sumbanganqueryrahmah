import type { RequestHandler } from "express";
import { parseRequestBody } from "../http/validation";
import { logger } from "../lib/logger";
import type { RemoteErrorTracker } from "../lib/remote-error-tracking";
import { remoteErrorTracker } from "../lib/remote-error-tracking";
import { clientErrorTelemetrySchema } from "../../shared/client-error-telemetry";

type CreateClientErrorTelemetryControllerOptions = {
  enabled: boolean;
  remoteErrorTracker?: Pick<RemoteErrorTracker, "captureClientError"> | null;
};

function readTelemetryRequestId(headers: Record<string, unknown> | undefined): string | undefined {
  const requestId = typeof headers?.["x-request-id"] === "string"
    ? headers["x-request-id"].trim()
    : Array.isArray(headers?.["x-request-id"])
      ? String(headers?.["x-request-id"][0] || "").trim()
      : "";

  return requestId || undefined;
}

export function createClientErrorTelemetryController(
  options: CreateClientErrorTelemetryControllerOptions,
): { report: RequestHandler } {
  const tracking = options.remoteErrorTracker ?? remoteErrorTracker;

  return {
    report(req, res) {
      if (!options.enabled) {
        res.status(204).end();
        return;
      }

      const payload = parseRequestBody(clientErrorTelemetrySchema, req.body);
      logger.error("Client runtime error reported", payload);
      void tracking.captureClientError(payload, {
        requestId: readTelemetryRequestId(req.headers as Record<string, unknown> | undefined),
      });
      res.status(204).end();
    },
  };
}
