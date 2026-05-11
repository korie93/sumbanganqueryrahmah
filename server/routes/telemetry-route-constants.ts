export const WEB_VITALS_TELEMETRY_PATHS = [
  "/api/telemetry/web-vitals",
  "/telemetry/web-vitals",
] as const;

export const LEGACY_WEB_VITALS_TELEMETRY_PATH = "/telemetry/web-vitals";
export const CANONICAL_WEB_VITALS_TELEMETRY_PATH = "/api/telemetry/web-vitals";
export const LEGACY_TELEMETRY_SUNSET_DATE = "Wed, 01 Jul 2026 00:00:00 GMT";
export const LEGACY_WEB_VITALS_TELEMETRY_SUNSET = LEGACY_TELEMETRY_SUNSET_DATE;
export const LEGACY_TELEMETRY_ROUTE_ENABLED = true;

const LEGACY_TELEMETRY_SUNSET_MS = Date.parse(LEGACY_TELEMETRY_SUNSET_DATE);

export function isLegacyTelemetryRouteRetired(now = new Date()) {
  return Number.isFinite(LEGACY_TELEMETRY_SUNSET_MS)
    && now.getTime() >= LEGACY_TELEMETRY_SUNSET_MS;
}
