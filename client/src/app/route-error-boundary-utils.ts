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

  if (
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      message,
    )
  ) {
    return "A page bundle failed to load. Retry this page first, or reload the app if the problem persists.";
  }

  if (message) {
    return message;
  }

  return "The page crashed unexpectedly. Retry this page, go back home, or reload the app.";
}
