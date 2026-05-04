import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";
import { runWithRequestContext } from "../lib/request-context";
import { createCsrfProtectionMiddleware } from "../http/csrf";
import { createCorsMiddleware } from "../http/cors";
import { resolveRequestId } from "../http/request-id";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../shared/trusted-types";

const HTTP_SLOW_REQUEST_MS = runtimeConfig.runtime.httpSlowRequestMs;
const API_VERSION_HEADER = "API-Version";
const API_VERSION_VALUE = "1";
const WEB_VITALS_BODY_LIMIT = "4kb";
const PERMISSIONS_POLICY_HEADER = [
  "camera=()",
  "geolocation=()",
  "microphone=()",
  "payment=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

type NormalizedRequestUserAgent = {
  truncated: boolean;
  userAgent: string | undefined;
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

  app.disable("x-powered-by");

  app.use(helmet({
    frameguard: {
      action: "sameorigin",
    },
    referrerPolicy: {
      policy: "no-referrer",
    },
    hsts: {
      // HSTS preload remains opt-in because it requires verified HTTPS
      // coverage for every production subdomain before registry submission.
      ...runtimeConfig.app.securityHeaders.hsts,
    },
    noSniff: true,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
        styleSrcElem: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        trustedTypes: ["default", SQR_TRUSTED_TYPES_POLICY_NAME],
        "require-trusted-types-for": ["'script'"],
      },
    },
  }));

  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", PERMISSIONS_POLICY_HEADER);
    next();
  });

  // Keep default parser small; enable larger payload only for import endpoints.
  app.use("/api/imports", express.json({ limit: importBodyLimit }));
  app.use("/api/imports", express.urlencoded({ extended: true, limit: importBodyLimit }));
  app.use("/api/collection", express.json({ limit: collectionBodyLimit }));
  app.use("/api/collection", express.urlencoded({ extended: true, limit: collectionBodyLimit }));
  app.use("/telemetry/web-vitals", express.json({ limit: WEB_VITALS_BODY_LIMIT }));
  app.use(express.json({ limit: defaultBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: defaultBodyLimit }));

  app.use(createCorsMiddleware());

  // Upload-backed files are served only through authenticated API endpoints.
  // Keeping the whole subtree dark prevents legacy receipt paths from becoming
  // public if their storage path is leaked or guessed.
  app.use("/uploads", (_req, res) => {
    return res.status(404).json({ ok: false, message: "Not found." });
  });

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
      recordRequestStarted();

      res.on("finish", () => {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        recordRequestFinished(elapsedMs, Number(res.statusCode || 0));
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

  app.use(createCsrfProtectionMiddleware());
  app.use(adaptiveRateLimit);
  app.use(systemProtectionMiddleware);
  app.use(maintenanceGuard);
}
