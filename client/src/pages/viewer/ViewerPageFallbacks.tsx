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
    <div className="mb-6 space-y-3 rounded-3xl border border-border/70 bg-card/95 px-5 py-5 shadow-sm">
      <h1 className="sr-only">Data Viewer</h1>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full border border-border/60 bg-muted/30" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted/30" />
          <div className="h-7 w-56 max-w-full animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted/25" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25 sm:w-36" />
        <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25 sm:w-32" />
        <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25 sm:w-28" />
      </div>
    </div>
  );
}

export function ViewerContentFallback() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {VIEWER_CONTENT_CARD_FALLBACK_KEYS.map((fallbackKey) => (
          <div
            key={fallbackKey}
            className="h-24 animate-pulse rounded-2xl border border-border/60 bg-card/70"
          />
        ))}
      </div>
      <div className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm">
        <div className="mb-4 h-11 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25" />
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
