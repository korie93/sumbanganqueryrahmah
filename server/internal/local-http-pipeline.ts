import type { Express, RequestHandler } from "express";
import { runtimeConfig } from "../config/runtime";
import { createCsrfProtectionMiddleware } from "../http/csrf";
import { createCorsMiddleware } from "../http/cors";
import { createForwardedForTrustProxyWarningMiddleware } from "../http/forwarded-proxy-warning";
import { createGlobalRequestTimeoutMiddleware } from "../http/global-request-timeout";
import { buildApiErrorResponse } from "../http/api-error-response";
import { createSensitiveApiResponseSanitizerMiddleware } from "../http/response-sanitizer";
import { registerLocalHttpBodyParsers } from "./local-http-body-parsers";
import { registerLocalHttpCompression } from "./local-http-compression";
import { registerLocalHttpObservability } from "./local-http-observability";
import { registerLocalHttpSecurityHeaders } from "./local-http-security";

type LocalHttpPipelineOptions = {
  importBodyLimit: string;
  collectionBodyLimit: string;
  defaultBodyLimit: string;
  uploadsRootDir: string;
  recordRequestStarted: () => void;
  recordRequestFinished: (elapsedMs: number, statusCode: number) => void;
  adaptiveRateLimit: RequestHandler;
  systemProtectionMiddleware: RequestHandler;
  maintenanceGuard: RequestHandler;
};

export function registerLocalHttpPipeline(app: Express, options: LocalHttpPipelineOptions) {
  const {
    importBodyLimit,
    collectionBodyLimit,
    defaultBodyLimit,
    recordRequestStarted,
    recordRequestFinished,
    adaptiveRateLimit,
    systemProtectionMiddleware,
    maintenanceGuard,
  } = options;

  // Security middleware order is intentional and covered by
  // server/http/tests/local-http-pipeline-order-contract.test.ts:
  // 1. response hardening headers, compression, and bounded parsers
  // 2. CORS and private upload subtree blocking
  // 3. API response sanitizer before observability/error paths
  // 4. request identity, proxy warning, timeout, and API no-store cache headers
  // 5. CSRF before adaptive/system/maintenance guards
  registerLocalHttpSecurityHeaders(app);
  registerLocalHttpCompression(app);
  registerLocalHttpBodyParsers(app, {
    collectionBodyLimit,
    defaultBodyLimit,
    importBodyLimit,
  });

  app.use(createCorsMiddleware());

  // Upload-backed files are served only through authenticated API endpoints.
  // Keeping the whole subtree dark prevents legacy receipt paths from becoming
  // public if their storage path is leaked or guessed.
  app.use("/uploads", (_req, res) => {
    return res.status(404).json(buildApiErrorResponse("Not found.", {
      statusCode: 404,
    }));
  });

  app.use("/api", createSensitiveApiResponseSanitizerMiddleware());

  registerLocalHttpObservability(app, {
    recordRequestFinished,
    recordRequestStarted,
  });

  app.use(createForwardedForTrustProxyWarningMiddleware({
    trustedProxies: runtimeConfig.app.trustedProxies,
  }));

  app.use(createGlobalRequestTimeoutMiddleware({
    timeoutMs: runtimeConfig.runtime.httpRequestTimeoutMs,
  }));

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  app.use(createCsrfProtectionMiddleware());
  app.use(adaptiveRateLimit);
  app.use(systemProtectionMiddleware);
  app.use(maintenanceGuard);
}
