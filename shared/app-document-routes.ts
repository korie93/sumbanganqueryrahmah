// The HTTP shell and client router must agree: a rendered 404 is still HTTP 404.
// Keep this limited to document URLs, never API authorization or feature access.
const APP_DOCUMENT_PATHS = new Set([
  "/", "/login", "/banned", "/maintenance", "/forgot-password",
  "/activate-account", "/reset-password", "/change-password", "/settings",
  "/search", "/general-search", "/import", "/saved", "/viewer", "/ai",
  "/monitor", "/dashboard", "/activity", "/analysis", "/audit", "/audit-logs",
  "/collection-report", "/collection/save", "/collection/records",
  "/collection/nicknames", "/collection/nickname-summary", "/collection/daily",
  "/collection/billing-principal", "/collection/monthly-comparison", "/collection/summary",
  "/403", "/404",
]);

export function isKnownAppDocumentPath(pathname: string) {
  return APP_DOCUMENT_PATHS.has(pathname.toLowerCase());
}

export function isRequestNamespace(pathname: string, namespace: string) {
  const normalized = pathname.toLowerCase();
  return normalized === namespace || normalized.startsWith(`${namespace}/`);
}
