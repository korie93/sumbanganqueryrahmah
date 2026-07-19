import { z } from "zod";

export const CLIENT_ERROR_TELEMETRY_SOURCES = [
  "route_render",
  "dashboard_section_render",
  "floating_ai_render",
  "lazy_module_load",
  "unhandled_rejection",
  "window_error",
] as const;

export const CLIENT_ERROR_PAGE_TYPES = ["public", "authenticated"] as const;

const CLIENT_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

const KNOWN_CLIENT_ERROR_PATHS = new Set([
  "/",
  "/403",
  "/404",
  "/activate-account",
  "/activity",
  "/ai",
  "/analysis",
  "/audit",
  "/audit-logs",
  "/banned",
  "/change-password",
  "/collection-report",
  "/collection/daily",
  "/collection/monthly-comparison",
  "/collection/nickname-summary",
  "/collection/nicknames",
  "/collection/records",
  "/collection/save",
  "/collection/summary",
  "/dashboard",
  "/forgot-password",
  "/general-search",
  "/import",
  "/login",
  "/maintenance",
  "/monitor",
  "/reset-password",
  "/saved",
  "/search",
  "/settings",
  "/viewer",
]);

export function sanitizeClientErrorTelemetryPath(pathname: string) {
  const rawPathname = String(pathname || "/").trim() || "/";
  let pathOnly = rawPathname.split(/[?#]/, 1)[0] || "/";

  try {
    pathOnly = new URL(rawPathname, "https://sqr.local").pathname || "/";
  } catch {
    // Keep the split path fallback for malformed values.
  }

  const normalizedPath = (pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`)
    .slice(0, 512)
    .toLowerCase();

  return KNOWN_CLIENT_ERROR_PATHS.has(normalizedPath) ? normalizedPath : "/unknown";
}

export function normalizeClientErrorName(value: unknown) {
  const candidate = String(value || "Error").trim();
  return CLIENT_ERROR_NAME_PATTERN.test(candidate) ? candidate : "Error";
}

export const clientErrorTelemetrySchema = z.object({
  source: z.enum(CLIENT_ERROR_TELEMETRY_SOURCES),
  errorName: z.string().trim().regex(CLIENT_ERROR_NAME_PATTERN),
  fingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  path: z.string().trim().min(1).max(512).regex(/^\//, "Path must start with '/'."),
  pageType: z.enum(CLIENT_ERROR_PAGE_TYPES),
  releaseSha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  visibilityState: z.enum(["hidden", "visible", "prerender"]).optional(),
  online: z.boolean().optional(),
  ts: z.string().datetime({ offset: true }),
}).strict();

export type ClientErrorTelemetryPayload = z.infer<typeof clientErrorTelemetrySchema>;
export type ClientErrorTelemetrySource = ClientErrorTelemetryPayload["source"];
