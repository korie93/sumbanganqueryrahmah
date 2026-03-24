export function resolveRouteErrorTitle(routeLabel?: string | null): string {
  const normalized = String(routeLabel || "").trim();
  return normalized ? `${normalized} Ran Into a Problem` : "This Page Ran Into a Problem";
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
