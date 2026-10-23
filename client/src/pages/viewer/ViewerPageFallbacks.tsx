const VIEWER_CONTENT_ROW_FALLBACK_KEYS = [
  "first-row",
  "second-row",
  "third-row",
  "fourth-row",
  "fifth-row",
] as const;

export function ViewerPageHeaderFallback() {
  return (
    <div className="space-y-2">
      <h1 className="sr-only">Data Viewer</h1>
      <div className="h-8 w-20 animate-pulse rounded bg-muted" aria-hidden="true" />
      <div className="h-7 w-72 max-w-full animate-pulse rounded bg-muted" aria-hidden="true" />
      <div className="h-5 w-40 animate-pulse rounded bg-muted" aria-hidden="true" />
    </div>
  );
}

export function ViewerContentFallback() {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4 h-11 w-full animate-pulse rounded-lg border border-border bg-muted" />
        <div className="space-y-3">
          {VIEWER_CONTENT_ROW_FALLBACK_KEYS.map((fallbackKey) => (
            <div
              key={fallbackKey}
              className="h-12 animate-pulse rounded-xl border border-border/60 bg-muted/20"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
