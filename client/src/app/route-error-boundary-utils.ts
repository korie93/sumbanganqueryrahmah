import {
  APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS,
  isChunkLoadRouteError,
} from "@/app/route-error-boundary-retry-utils";
import type { ClientLoggerEnvironment } from "@/lib/client-logger";

const ROUTE_LABELS: Record<string, string> = {
  activity: "Activity",
  ai: "AI Assistant",
  analysis: "Analysis",
  audit: "Audit Logs",
  "audit-logs": "Audit Logs",
  backup: "Backup & Restore",
  banned: "Account Access",
  "change-password": "Change Password",
  "collection-report": "Collection",
  dashboard: "Dashboard",
  "forgot-password": "Forgot Password",
  "general-search": "General Search",
  home: "Home",
  import: "Import",
  login: "Login",
  maintenance: "Maintenance Mode",
  monitor: "System Monitor",
  "not-found": "Not Found",
  saved: "Saved Imports",
  settings: "Settings",
  viewer: "Viewer",
};

export function resolveRouteErrorTitle(routeLabel?: string | null): string {
  const normalized = String(routeLabel || "").trim();
  const humanLabel = ROUTE_LABELS[normalized] || normalized;
  return humanLabel ? `${humanLabel} Ran Into a Problem` : "This Page Ran Into a Problem";
}

export function resolveRouteErrorDescription(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message.trim()
      : String(error || "").trim();

  if (isChunkLoadRouteError(error)) {
    return "A page bundle failed to load. Retry this page first, or reload the app if the problem persists.";
  }

  if (message) {
    return message;
  }

  return "The page crashed unexpectedly. Retry this page, go back home, or reload the app.";
}

export function shouldShowRouteRetrySupportNotice(
  error: unknown,
  autoRetryAttempt: number,
  autoRetrying: boolean,
): boolean {
  return isChunkLoadRouteError(error)
    && !autoRetrying
    && Math.max(0, Math.trunc(autoRetryAttempt)) >= APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS;
}

export function resolveRouteRetrySupportNotice(
  error: unknown,
  autoRetryAttempt: number,
  autoRetrying: boolean,
): string {
  if (!shouldShowRouteRetrySupportNotice(error, autoRetryAttempt, autoRetrying)) {
    return "";
  }

  return "Automatic recovery has already been attempted. Reload the app, then contact your system administrator if this page keeps failing.";
}

export function resolveRouteErrorDebugDetails(
  error: unknown,
  env: ClientLoggerEnvironment = import.meta.env,
): string | null {
  if (!env?.DEV || !(error instanceof Error)) {
    return null;
  }

  const debugSections = [error.name, error.message.trim()].filter(Boolean);
  const stack = typeof error.stack === "string" ? error.stack.trim() : "";
  if (stack) {
    debugSections.push(stack);
  }

  return debugSections.length > 0 ? debugSections.join("\n\n") : null;
}
