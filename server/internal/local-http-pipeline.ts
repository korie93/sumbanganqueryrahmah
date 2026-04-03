import { randomUUID } from "node:crypto";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import { logger } from "../lib/logger";
import { runWithRequestContext } from "../lib/request-context";
import { createCsrfProtectionMiddleware } from "../http/csrf";
import { createCorsMiddleware } from "../http/cors";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../shared/trusted-types";

const HTTP_SLOW_REQUEST_MS = Math.max(250, Number(process.env.HTTP_SLOW_REQUEST_MS || 1500) || 1500);

function normalizeRequestUserAgent(rawUserAgent: unknown): string | undefined {
  const normalized = String(rawUserAgent || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 180);
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
    uploadsRootDir,
    recordRequestStarted,
    recordRequestFinished,
    adaptiveRateLimit,
    systemProtectionMiddleware,
    maintenanceGuard,
  } = options;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        baseUri: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        trustedTypes: ["default", SQR_TRUSTED_TYPES_POLICY_NAME],
        "require-trusted-types-for": ["'script'"],
      },
    },
  }));

  // Keep default parser small; enable larger payload only for import endpoints.
  app.use("/api/imports", express.json({ limit: importBodyLimit }));
  app.use("/api/imports", express.urlencoded({ extended: true, limit: importBodyLimit }));
  app.use("/api/collection", express.json({ limit: collectionBodyLimit }));
  app.use("/api/collection", express.urlencoded({ extended: true, limit: collectionBodyLimit }));
  app.use(express.json({ limit: defaultBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: defaultBodyLimit }));

  app.use(createCorsMiddleware());

  // Receipt files are served via authenticated API endpoints only.
  app.use("/uploads/collection-receipts", (_req, res) => {
    return res.status(404).json({ ok: false, message: "Not found." });
  });
  app.use("/uploads", express.static(uploadsRootDir));

  app.use((req, res, next) => {
    const incomingRequestId = String(req.headers["x-request-id"] || "").trim();
    const requestId = incomingRequestId || randomUUID();
    const clientIp = String(req.ip || req.socket.remoteAddress || "").trim() || undefined;
    const userAgent = normalizeRequestUserAgent(req.headers["user-agent"]);
    res.setHeader("x-request-id", requestId);

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
