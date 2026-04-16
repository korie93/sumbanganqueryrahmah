import type { RequestHandler } from "express";
import { parseRequestBody } from "../http/validation";
import { logger } from "../lib/logger";
import { clientErrorTelemetrySchema } from "../../shared/client-error-telemetry";

type CreateClientErrorTelemetryControllerOptions = {
  enabled: boolean;
};

export function createClientErrorTelemetryController(
  options: CreateClientErrorTelemetryControllerOptions,
): { report: RequestHandler } {
  return {
    report(req, res) {
      if (!options.enabled) {
        res.status(204).end();
        return;
      }

      const payload = parseRequestBody(clientErrorTelemetrySchema, req.body);
      logger.error("Client runtime error reported", payload);
      res.status(204).end();
    },
  };
}
