import type { Express, RequestHandler } from "express";
import { routeHandler } from "../http/async-handler";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import { logger } from "../lib/logger";
import {
  createCspReportDropGuard,
  createWebVitalsTelemetryDropGuard,
  type CspReportDropGuard,
  type WebVitalsTelemetryDropGuard,
} from "./telemetry-drop-guards";
import {
  createCspReportRequestGuard,
  createWebVitalsTelemetryRequestGuard,
} from "./telemetry-request-guards";
import {
  CANONICAL_WEB_VITALS_TELEMETRY_PATH,
  LEGACY_TELEMETRY_ROUTE_ENABLED,
  LEGACY_TELEMETRY_SUNSET_DATE,
  LEGACY_WEB_VITALS_TELEMETRY_PATH,
  isLegacyTelemetryRouteRetired,
} from "./telemetry-route-constants";

export {
  createCspReportDropGuard,
  createWebVitalsTelemetryDropGuard,
  registerCspReportDropGuardCleanup,
  registerWebVitalsTelemetryDropGuardCleanup,
  type CspReportDropGuard,
  type WebVitalsTelemetryDropGuard,
} from "./telemetry-drop-guards";
export {
  createCspReportRequestGuard,
  createWebVitalsTelemetryRequestGuard,
  type CspReportRequestGuardOptions,
  type WebVitalsTelemetryRequestGuardOptions,
} from "./telemetry-request-guards";
export {
  CANONICAL_WEB_VITALS_TELEMETRY_PATH,
  LEGACY_TELEMETRY_ROUTE_ENABLED,
  LEGACY_TELEMETRY_SUNSET_DATE,
  LEGACY_WEB_VITALS_TELEMETRY_PATH,
  LEGACY_WEB_VITALS_TELEMETRY_SUNSET,
  WEB_VITALS_TELEMETRY_PATHS,
  isLegacyTelemetryRouteRetired,
} from "./telemetry-route-constants";

type TelemetryRouteDeps = {
  cspReportDropGuard?: CspReportDropGuard;
  cspReportRequestGuard?: RequestHandler;
  metrics?: InternalMetricsRecorder;
  now?: () => Date;
  reportWebVital: RequestHandler;
  webVitalsDropGuard?: WebVitalsTelemetryDropGuard;
  webVitalsRequestGuard?: RequestHandler;
};

export function registerTelemetryRoutes(app: Express, deps: TelemetryRouteDeps) {
  const metrics = deps.metrics ?? internalMetrics;
  const now = deps.now ?? (() => new Date());
  const cspReportDropGuard = deps.cspReportDropGuard ?? createCspReportDropGuard({ metrics });
  const webVitalsDropGuard = deps.webVitalsDropGuard ?? createWebVitalsTelemetryDropGuard();
  const webVitalsRequestGuard = deps.webVitalsRequestGuard ?? createWebVitalsTelemetryRequestGuard();

  // CSP reports may contain document URLs or blocked URIs, so this endpoint
  // deliberately records only aggregate counters and returns an empty 204.
  app.post(
    "/api/csp-report",
    deps.cspReportRequestGuard ?? createCspReportRequestGuard({ metrics }),
    cspReportDropGuard,
    routeHandler((_req, res) => {
      metrics.increment("cspReportsAcceptedTotal");
      res.status(204).end();
    }),
  );

  // Threat model: this unauthenticated browser telemetry endpoint is
  // internet-reachable and can receive forged beacons, oversized bodies,
  // replay bursts, or automation-client probes. The canonical route now lives
  // under /api for middleware consistency; the legacy path remains temporarily
  // compatible for already-deployed clients. Both paths are guarded by
  // same-site Origin/Referer checks, JSON content-type validation, a 4KB parser
  // limit in the HTTP pipeline, known non-browser client drops, stricter
  // anonymous/no-provenance request caps, and bounded per-IP drop buckets. The
  // payload schema is strict; do not send PII, auth/session identifiers,
  // cookies, tokens, or raw user input here.
  app.post(
    CANONICAL_WEB_VITALS_TELEMETRY_PATH,
    webVitalsRequestGuard,
    webVitalsDropGuard,
    routeHandler(deps.reportWebVital),
  );

  // TODO(telemetry-sunset): remove this compatibility alias after
  // LEGACY_TELEMETRY_SUNSET_DATE (Mon, 15 Jun 2026 00:00:00 GMT)
  // once deployed clients have migrated fully to /api/telemetry/web-vitals.
  app.post(
    LEGACY_WEB_VITALS_TELEMETRY_PATH,
    (req, res, next) => {
      res.setHeader("Deprecation", "true");
      res.setHeader("Sunset", LEGACY_TELEMETRY_SUNSET_DATE);
      res.setHeader("Link", `<${CANONICAL_WEB_VITALS_TELEMETRY_PATH}>; rel="successor-version"`);

      if (!LEGACY_TELEMETRY_ROUTE_ENABLED || isLegacyTelemetryRouteRetired(now())) {
        metrics.increment("webVitalsLegacyRouteGoneTotal");
        logger.warn("Legacy web vitals telemetry route rejected after sunset", {
          canonicalPath: CANONICAL_WEB_VITALS_TELEMETRY_PATH,
          legacyPath: LEGACY_WEB_VITALS_TELEMETRY_PATH,
          method: req.method,
          path: req.path,
          sunsetAt: LEGACY_TELEMETRY_SUNSET_DATE,
        });
        res.status(410).json({
          ok: false,
          code: "LEGACY_TELEMETRY_ROUTE_RETIRED",
          message: "Legacy telemetry route has been retired. Use /api/telemetry/web-vitals.",
        });
        return;
      }

      metrics.increment("webVitalsLegacyRouteUsedTotal");
      logger.warn("Legacy web vitals telemetry route used", {
        canonicalPath: CANONICAL_WEB_VITALS_TELEMETRY_PATH,
        legacyPath: LEGACY_WEB_VITALS_TELEMETRY_PATH,
        method: req.method,
        path: req.path,
        sunsetAt: LEGACY_TELEMETRY_SUNSET_DATE,
      });
      return next();
    },
    webVitalsRequestGuard,
    webVitalsDropGuard,
    routeHandler(deps.reportWebVital),
  );
}
