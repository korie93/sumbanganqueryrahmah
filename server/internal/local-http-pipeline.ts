import { randomUUID } from "node:crypto";
import path from "node:path";
import compression from "compression";
import express, { type Express, type Request, type Response, type RequestHandler } from "express";
import helmet from "helmet";
import { z } from "zod";
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
const CSP_REPORT_ENDPOINT_PATH = "/api/security/csp-reports";
const API_COMPRESSION_THRESHOLD_BYTES = 1024;
const CSP_REPORT_LOG_WINDOW_MS = 5 * 60 * 1000;
const CSP_REPORT_REPEAT_LOG_INTERVAL = 10;
const MAX_TRACKED_CSP_REPORT_FINGERPRINTS = 200;

const cspReportDocumentSchema = z.object({
  "blocked-uri": z.string().max(2_048).optional(),
  "document-uri": z.string().max(2_048).optional(),
  "effective-directive": z.string().max(255).optional(),
  "original-policy": z.string().max(8_192).optional(),
  referrer: z.string().max(2_048).optional(),
  "violated-directive": z.string().max(255).optional(),
}).passthrough();

const cspReportEnvelopeSchema = z.object({
  "csp-report": cspReportDocumentSchema,
});

const cspReportingApiSchema = z.array(z.object({
  body: cspReportDocumentSchema.optional(),
  type: z.string().max(255).optional(),
})).max(10);

function normalizeCspReportValue(value: string | undefined, maxLength: number) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function extractSanitizedCspReportPayloads(payload: unknown) {
  const envelopeResult = cspReportEnvelopeSchema.safeParse(payload);
  if (envelopeResult.success) {
    const report = envelopeResult.data["csp-report"];
    return [{
      blockedUri: normalizeCspReportValue(report["blocked-uri"], 512),
      documentUri: normalizeCspReportValue(report["document-uri"], 512),
      effectiveDirective: normalizeCspReportValue(report["effective-directive"], 128),
      originalPolicy: normalizeCspReportValue(report["original-policy"], 1_024),
      referrer: normalizeCspReportValue(report.referrer, 512),
      violatedDirective: normalizeCspReportValue(report["violated-directive"], 128),
    }];
  }

  const reportingApiResult = cspReportingApiSchema.safeParse(payload);
  if (!reportingApiResult.success) {
    return null;
  }

  return reportingApiResult.data
    .map((entry) => {
      const report = entry.body;
      if (!report) {
        return null;
      }

      return {
        blockedUri: normalizeCspReportValue(report["blocked-uri"], 512),
        documentUri: normalizeCspReportValue(report["document-uri"], 512),
        effectiveDirective: normalizeCspReportValue(report["effective-directive"], 128),
        originalPolicy: normalizeCspReportValue(report["original-policy"], 1_024),
        referrer: normalizeCspReportValue(report.referrer, 512),
        violatedDirective: normalizeCspReportValue(report["violated-directive"], 128),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

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

function shouldBypassApiCompression(requestPath: string) {
  if (!requestPath) {
    return false;
  }

  if (requestPath.startsWith("/uploads") || requestPath.startsWith("/api/backups")) {
    return true;
  }

  return /^\/api\/collection\/[^/]+\/(?:receipt(?:\/|$)|receipts\/)/i.test(requestPath);
}

function shouldCompressApiResponse(req: Request, res: Response) {
  if (
    (!req.path.startsWith("/api") && !req.path.startsWith("/internal"))
    || shouldBypassApiCompression(req.path)
  ) {
    return false;
  }

  return compression.filter(req, res);
}

function readResponseEncoding(res: Response): string | undefined {
  const normalized = String(res.getHeader("content-encoding") || "").trim().toLowerCase();
  return normalized || undefined;
}

type TrackedCspReportObservation = {
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
};

function observeCspReportFingerprint(
  tracker: Map<string, TrackedCspReportObservation>,
  fingerprint: string,
  now = Date.now(),
) {
  for (const [trackedFingerprint, observation] of tracker.entries()) {
    if (now - observation.lastSeenAt <= CSP_REPORT_LOG_WINDOW_MS) {
      continue;
    }
    tracker.delete(trackedFingerprint);
  }

  const existing = tracker.get(fingerprint);
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    tracker.delete(fingerprint);
    tracker.set(fingerprint, existing);
    return {
      count: existing.count,
      shouldLog: existing.count % CSP_REPORT_REPEAT_LOG_INTERVAL === 0,
    };
  }

  while (tracker.size >= MAX_TRACKED_CSP_REPORT_FINGERPRINTS) {
    const oldestFingerprint = tracker.keys().next().value;
    if (!oldestFingerprint) {
      break;
    }
    tracker.delete(oldestFingerprint);
  }

  tracker.set(fingerprint, {
    count: 1,
    firstSeenAt: now,
    lastSeenAt: now,
  });
  return {
    count: 1,
    shouldLog: true,
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
  const cspReportFingerprintTracker = new Map<string, TrackedCspReportObservation>();

  app.use(helmet({
    frameguard: {
      action: "deny",
    },
    hsts: {
      maxAge: 15552000,
      includeSubDomains: true,
      // Keep preload aligned with an explicit operator review of hstspreload.org requirements.
      // The runtime warning surface reminds operators not to treat this header as proof that a domain
      // has already been accepted into browser preload lists.
      preload: true,
    },
    noSniff: true,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        baseUri: ["'self'"],
        // `data:` and `blob:` stay enabled because the app uses object URLs and safe inline data URLs
        // for authenticated receipt previews, image export flows, and canvas-based client rendering.
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        "report-uri": [CSP_REPORT_ENDPOINT_PATH],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        trustedTypes: ["default", SQR_TRUSTED_TYPES_POLICY_NAME],
        "require-trusted-types-for": ["'script'"],
      },
    },
  }));
  app.use(compression({
    threshold: API_COMPRESSION_THRESHOLD_BYTES,
    filter: shouldCompressApiResponse,
  }));

  // Keep default parser small; enable larger payload only for import endpoints.
  app.use("/api/imports", express.json({ limit: importBodyLimit }));
  app.use("/api/imports", express.urlencoded({ extended: false, limit: importBodyLimit }));
  app.use("/api/collection", express.json({ limit: collectionBodyLimit }));
  app.use("/api/collection", express.urlencoded({ extended: false, limit: collectionBodyLimit }));
  app.use(express.json({ limit: defaultBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: defaultBodyLimit }));

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
          const compressionEligible = req.path.startsWith("/api") || req.path.startsWith("/internal");
          const compressionBypassed = compressionEligible && shouldBypassApiCompression(req.path);
          const responseEncoding = readResponseEncoding(res);
          const requestMeta = {
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            elapsedMs: Number(elapsedMs.toFixed(2)),
            contentLength: Number(req.headers["content-length"] || 0) || 0,
            responseSize: Number(res.getHeader("content-length") || 0) || 0,
            responseEncoding,
            compressionEligible,
            compressionBypassed,
            clientIp,
            userAgent,
          };

          if (
            runtimeConfig.app.debugLogs
            && responseEncoding
            && compressionEligible
            && !compressionBypassed
          ) {
            logger.debug("HTTP response compression applied", requestMeta);
          }

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

  app.post(
    CSP_REPORT_ENDPOINT_PATH,
    express.json({
      type: ["application/csp-report", "application/json", "application/reports+json"],
      limit: "32kb",
    }),
    (req, res) => {
      const sanitizedReports = extractSanitizedCspReportPayloads(req.body);
      if (!sanitizedReports) {
        return res.status(400).json({
          ok: false,
          message: "Invalid CSP report payload.",
        });
      }

      for (const report of sanitizedReports) {
        const fingerprint = JSON.stringify(report);
        const observation = observeCspReportFingerprint(cspReportFingerprintTracker, fingerprint);
        if (!observation.shouldLog) {
          continue;
        }

        logger.warn(
          observation.count === 1
            ? "Content Security Policy violation report received"
            : "Content Security Policy violation report repeated",
          {
            ...report,
            reportCount: observation.count,
          },
        );
      }

      return res.status(204).end();
    },
  );

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
