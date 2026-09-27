export function ViewerFiltersPanelFallback() {
  return (
    <div className="ops-toolbar mb-6 space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
      <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-10 w-full animate-pulse rounded-xl border border-border/60 bg-muted/25" />
    </div>
  );
}

export function ViewerDataTableFallback() {
  return (
    <div className="ops-table-shell overflow-x-auto">
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-background/60">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    </div>
  );
}

export function ViewerFooterFallback() {
  return (
    <div className="mt-4 h-16 animate-pulse border-t border-border bg-muted" />
  );
}

export function ViewerSearchBarFallback() {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="h-11 min-w-0 max-w-xl flex-1 animate-pulse rounded-lg border border-border bg-muted sm:h-9" />
        <div className="hidden h-4 w-36 animate-pulse rounded bg-muted sm:block" />
      </div>
    </div>
  );
}

export function ViewerEmptyStateFallback() {
  return (
    <div className="ops-empty-state">
      <div className="mx-auto mb-4 h-16 w-16 animate-pulse rounded-full bg-muted/35" />
      <div className="mx-auto h-5 w-24 animate-pulse rounded bg-muted/35" />
      <div className="mx-auto mt-3 h-4 w-56 max-w-full animate-pulse rounded bg-muted/25" />
    </div>
  );
}
