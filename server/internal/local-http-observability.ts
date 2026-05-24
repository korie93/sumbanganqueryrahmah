import type { Express } from "express";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";
import { runWithRequestContext } from "../lib/request-context";
import { resolveRequestId } from "../http/request-id";

const HTTP_SLOW_REQUEST_MS = runtimeConfig.runtime.httpSlowRequestMs;
const API_VERSION_HEADER = "API-Version";
const API_VERSION_VALUE = "1";

type NormalizedRequestUserAgent = {
  truncated: boolean;
  userAgent: string | undefined;
};

type LocalHttpObservabilityOptions = {
  recordRequestFinished: (elapsedMs: number, statusCode: number) => void;
  recordRequestStarted: () => void;
};

function normalizeRequestUserAgent(rawUserAgent: unknown): NormalizedRequestUserAgent {
  const normalized = String(rawUserAgent || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { truncated: false, userAgent: undefined };
  }

  const maxLength = 180;
  return {
    truncated: normalized.length > maxLength,
    userAgent: normalized.slice(0, maxLength),
  };
}

export function registerLocalHttpObservability(app: Express, options: LocalHttpObservabilityOptions) {
  app.use((req, res, next) => {
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    const clientIp = String(req.ip || req.socket.remoteAddress || "").trim() || undefined;
    const normalizedUserAgent = normalizeRequestUserAgent(req.headers["user-agent"]);
    const userAgent = normalizedUserAgent.userAgent;
    res.setHeader("x-request-id", requestId);
    res.setHeader(API_VERSION_HEADER, API_VERSION_VALUE);

    runWithRequestContext({
      requestId,
      httpMethod: req.method,
      httpPath: req.path,
      clientIp,
      userAgent,
    }, () => {
      const start = process.hrtime.bigint();
      options.recordRequestStarted();

      res.on("finish", () => {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        options.recordRequestFinished(elapsedMs, Number(res.statusCode || 0));
        const requestMeta = {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          elapsedMs: Number(elapsedMs.toFixed(2)),
          contentLength: Number(req.headers["content-length"] || 0) || 0,
          responseSize: Number(res.getHeader("content-length") || 0) || 0,
          clientIp,
          userAgent,
          ...(normalizedUserAgent.truncated ? { userAgentTruncated: true } : {}),
        };

        if (res.statusCode >= 500) {
          logger.error("HTTP request completed with server error", requestMeta);
        } else if (res.statusCode >= 400) {
          logger.warn("HTTP request completed with client error", requestMeta);
        } else if (elapsedMs >= HTTP_SLOW_REQUEST_MS) {
          logger.warn("HTTP request completed slowly", {
            ...requestMeta,
            slowRequestThresholdMs: HTTP_SLOW_REQUEST_MS,
          });
        }
      });

      next();
    });
  });
}
