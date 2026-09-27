const VIEWER_CONTENT_CARD_FALLBACK_KEYS = [
  "summary-card",
  "columns-card",
  "rows-card",
] as const;

const VIEWER_CONTENT_ROW_FALLBACK_KEYS = [
  "first-row",
  "second-row",
  "third-row",
  "fourth-row",
  "fifth-row",
] as const;

export function ViewerPageHeaderFallback() {
  return (
    <div className="space-y-3 py-2">
      <h1 className="sr-only">Data Viewer</h1>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-lg bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted/30" />
          <div className="h-7 w-56 max-w-full animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted/25" />
      <div className="viewer-action-toolbar">
        <div className="h-11 w-full animate-pulse rounded-lg border border-border bg-muted sm:h-9 sm:w-36" />
        <div className="h-11 w-full animate-pulse rounded-lg border border-border bg-muted sm:h-9 sm:w-32" />
        <div className="h-11 w-full animate-pulse rounded-lg border border-border bg-muted sm:h-9 sm:w-28" />
      </div>
    </div>
  );
}

export function ViewerContentFallback() {
  return (
    <div className="space-y-4">
      <div className="ops-summary-strip">
        {VIEWER_CONTENT_CARD_FALLBACK_KEYS.map((fallbackKey) => (
          <div
            key={fallbackKey}
            className="h-16 min-w-0 flex-1 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
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
