type CollectionMonthlyComparisonStateMessagesProps = {
  errorMessage: string | null;
  hasAvailableNickname: boolean;
  loading: boolean;
};

export function CollectionMonthlyComparisonStateMessages({
  errorMessage,
  hasAvailableNickname,
  loading,
}: CollectionMonthlyComparisonStateMessagesProps) {
  return (
    <>
      {!hasAvailableNickname ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-background px-4 py-4 text-sm text-muted-foreground">
          No visible staff nickname is available for this monthly comparison yet.
        </p>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="collection-monthly-comparison-state-card rounded-2xl border border-border/60 bg-background px-4 py-5 text-sm text-muted-foreground"
        >
          <div className="flex flex-col gap-2">
            <span>Loading monthly comparison...</span>
            <span className="collection-monthly-comparison-skeleton h-2 w-full max-w-md rounded-full" aria-hidden="true" />
            <span className="collection-monthly-comparison-skeleton h-2 w-2/3 max-w-sm rounded-full" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
