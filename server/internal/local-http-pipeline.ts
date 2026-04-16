import { randomUUID } from "node:crypto";
import path from "node:path";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import { runtimeConfig } from "../config/runtime";
import { dbQueryProfiler } from "../db-postgres";
import { buildContentDispositionHeader } from "../http/content-disposition";
import {
  createRequestTimeoutMiddleware,
  createRequestTimeoutOverrideMiddleware,
} from "../http/request-timeout-middleware";
import { logger } from "../lib/logger";
import { runWithRequestContext } from "../lib/request-context";
import { createCsrfProtectionMiddleware } from "../http/csrf";
import { createCorsMiddleware } from "../http/cors";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../shared/trusted-types";

const HTTP_SLOW_REQUEST_MS = runtimeConfig.runtime.httpSlowRequestMs;
const API_VERSION_HEADER = "API-Version";
const API_VERSION_VALUE = "1";

function normalizeRequestUserAgent(rawUserAgent: unknown): string | undefined {
  const normalized = String(rawUserAgent || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 180);
}

function resolveAttachmentFilename(filePath: string): string {
  const basename = path.basename(filePath).replace(/[^\w.!#$&+^`|~-]+/g, "_");
  const trimmed = basename.replace(/^\.+/, "").slice(0, 180);
  return trimmed || "download";
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
  requestTimeoutMs?: number;
  backupOperationTimeoutMs?: number;
  importAnalysisTimeoutMs?: number;
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
    requestTimeoutMs = runtimeConfig.runtime.requestTimeoutMs,
    backupOperationTimeoutMs = runtimeConfig.runtime.backupOperationTimeoutMs,
    importAnalysisTimeoutMs = runtimeConfig.runtime.importAnalysisTimeoutMs,
  } = options;

  app.use(helmet({
    frameguard: {
      action: "sameorigin",
    },
    hsts: {
      maxAge: 15552000,
      includeSubDomains: true,
      preload: false,
    },
    noSniff: true,
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
  app.use("/uploads", express.static(uploadsRootDir, {
    setHeaders: (res, filePath) => {
      res.setHeader(
        "Content-Disposition",
        buildContentDispositionHeader("attachment", resolveAttachmentFilename(filePath), "download"),
      );
    },
  }));

  app.use((req, res, next) => {
    const incomingRequestId = String(req.headers["x-request-id"] || "").trim();
    const requestId = incomingRequestId || randomUUID();
    const clientIp = String(req.ip || req.socket.remoteAddress || "").trim() || undefined;
    const userAgent = normalizeRequestUserAgent(req.headers["user-agent"]);
    const requestAbortController = new AbortController();
    res.setHeader("x-request-id", requestId);
    res.setHeader(API_VERSION_HEADER, API_VERSION_VALUE);

    runWithRequestContext({
      requestId,
      httpMethod: req.method,
      httpPath: req.path,
      clientIp,
      userAgent,
      abortController: requestAbortController,
      abortSignal: requestAbortController.signal,
      requestTimeoutMs,
      requestDeadlineAtMs: Date.now() + Math.max(0, requestTimeoutMs),
      requestTimedOut: false,
    }, () => {
      dbQueryProfiler.runWithRequestProfiling({
        requestId,
        method: req.method,
        path: req.path,
      }, () => {
        const start = process.hrtime.bigint();
        let requestProfileFlushed = false;
        recordRequestStarted();

        const flushRequestProfile = () => {
          if (requestProfileFlushed) {
            return;
          }

          requestProfileFlushed = true;
          const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
          dbQueryProfiler.flushRequestProfile(
            Number(res.statusCode || 0),
            Number(elapsedMs.toFixed(2)),
          );
        };

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

          if (res.statusCode === 504) {
            logger.warn("HTTP request completed after the global timeout deadline", requestMeta);
          } else if (res.statusCode >= 500) {
            logger.error("HTTP request completed with server error", requestMeta);
          } else if (res.statusCode >= 400) {
            logger.warn("HTTP request completed with client error", requestMeta);
          } else if (elapsedMs >= HTTP_SLOW_REQUEST_MS) {
            logger.warn("HTTP request completed slowly", {
              ...requestMeta,
              slowRequestThresholdMs: HTTP_SLOW_REQUEST_MS,
            });
          }

          flushRequestProfile();
        });
        res.once("close", flushRequestProfile);

        next();
      });
    });
  });

  app.use("/api/backups", createRequestTimeoutOverrideMiddleware({
    timeoutMs: backupOperationTimeoutMs,
  }));
  app.use("/api/imports/:id/analyze", createRequestTimeoutOverrideMiddleware({
    timeoutMs: importAnalysisTimeoutMs,
  }));
  app.use("/api/analyze/all", createRequestTimeoutOverrideMiddleware({
    timeoutMs: importAnalysisTimeoutMs,
  }));
  app.use(createRequestTimeoutMiddleware({ timeoutMs: requestTimeoutMs }));
  app.use(createCsrfProtectionMiddleware());
  app.use(adaptiveRateLimit);
  app.use(systemProtectionMiddleware);
  app.use(maintenanceGuard);
}
