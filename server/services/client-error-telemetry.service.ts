import {
  sanitizeClientErrorTelemetryPath,
  type ClientErrorTelemetryPayload,
} from "../../shared/client-error-telemetry";
import { logger as defaultLogger } from "../lib/logger";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type ClientErrorTelemetryServiceOptions = {
  logger?: LoggerLike;
};

export class ClientErrorTelemetryService {
  private readonly logger: LoggerLike;

  constructor(options: ClientErrorTelemetryServiceOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
  }

  record(payload: ClientErrorTelemetryPayload) {
    this.logger.warn("Client runtime error reported", {
      event: "client_runtime_error_reported",
      source: payload.source,
      errorName: payload.errorName,
      fingerprint: payload.fingerprint,
      path: sanitizeClientErrorTelemetryPath(payload.path),
      pageType: payload.pageType,
      releaseSha: payload.releaseSha ?? null,
      visibilityState: payload.visibilityState ?? null,
      online: payload.online ?? null,
      capturedAt: payload.ts,
    });
  }
}
