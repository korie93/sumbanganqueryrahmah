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
const REACT_REMOVE_SCROLL_BAR_STYLE_HASHES = [
  "'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='",
  "'sha256-yMyGHLLNy9ZXD5cfUANqBnMLxrInc0Xt5wSlgMO77gw='",
  "'sha256-EiVtJtqdjayp2TNkfjKatvHj6zqWKFlCtnKhLaNh+6Y='",
  "'sha256-nMmTtq6jjPmcn3M5mOS+FT7/i5KoRJswjrJI3b/spqQ='",
  "'sha256-AqM6/p13H6JF8ug6zt9Yy7+E9CrBKhGKvN4vJoz71t4='",
  "'sha256-tBpHYumZRC8NnarTegNJ4u4soXWNUtbRChh+6GCVlAE='",
  "'sha256-euE++7UNifzFwUnt97ux0ifFe8aO1lAO54MdyHRBk7s='",
  "'sha256-L6iv6LS6TPj0jNGj8t0Egmh+mXLCQcYpS1CLyFzuEhY='",
  "'sha256-bhKU60izCFLtZFtzA8u3NqR8ZtM/OsML9i+YcHfci8Q='",
  "'sha256-upk5qFSfWikoQ3NraC1DKwhHGoyVAmafisgpmR12Ulw='",
  "'sha256-XReiwjORRzqabGyv2ayyS+6pOG3pMi9VCy3dwX6vmjI='",
  "'sha256-CYQvm9FImp+2UIm3YYS2mta1GLoWribsg8cvl/93QlE='",
  "'sha256-Nu5PeqEkabAbacGGO5j4Yw6GACSnF8ny/ZJwrD4Usz8='",
  "'sha256-um/BVKLkLjh79PZ3seMJ2w5BSEiq2HzhgD/CDFRAKGc='",
  "'sha256-9d6zh832P8CUus1kLkDwBKiQmtT4Js6POR3/xYWrXIs='",
  "'sha256-kAApudxpTi9mfjlC9lC8ZaS9xFHU9/NLLbB173MU7SU='",
  "'sha256-AMd96FJ0GSrxFtEVT53SsztnJlpK57ZkVSOwhrM6Jjg='",
  "'sha256-Q9MUdYBtYzn5frLpoNRLdFYW76cJ4ok2SmIKzTFq57Q='",
  "'sha256-FO9bpi1QCp3bkmNPI0U0vFVx2AwGeeID2YKsSVhEt50='",
  "'sha256-v/DJOcxAWixzP4/crWlagosxg7zwkscezgM94iYZsyY='",
  "'sha256-FrgwzD65SPHF5VyQMJIY0x1JLTnjX8h7V53j5bXLXRE='",
  "'sha256-rpSiGpxmFMo2lQn9HH5WKULoKZ7xvWhUwvgpiRkyTAY='",
  "'sha256-QyI7MPvZeMqJcDA5iD+PgK04sLah6CcuMVp5AVrSvlk='",
  "'sha256-zOMd0cB6s97lKvLWq3a1quL43ZNcWnYISwV24T8QfL0='",
  "'sha256-44LYAc7BwsowSCKEIjNptfewBms/mS8PLOYIq2EHitc='",
  "'sha256-I7KXGhO7gNfZgoAsk2nYeOeCSAbzw1zpJRhVldz/xkU='",
  "'sha256-rUZ+xPT61Z7s79t2TUk+ch3xOQP2kE3wwp4Iyzliuxw='",
  "'sha256-CcN4tD0mSaUZckZIwsuFk01CppQv+aXK07TYmjGXu8Q='",
  "'sha256-duEBVPeKIq266BrQyfCgm49HkZ10yvWWSf1BgX7vmMs='",
  "'sha256-ije6BO59LnJw0dmXdwoEU/lmitsR5WuhL3+PQG/J0Cw='",
  "'sha256-gxdR88Pf6XnTPKFwHTuQk3EIoquqtZWGvJ9PhLdJg20='",
];
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
        // Radix modal/dropdown primitives use react-remove-scroll-bar to
        // inject deterministic scroll-lock CSS. Keep CSP strict by allowing
        // only those hashes instead of reopening style-src-elem unsafe-inline.
        styleSrcElem: ["'self'", ...REACT_REMOVE_SCROLL_BAR_STYLE_HASHES],
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
