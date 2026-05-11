type CollectionMonthlyComparisonHeaderProps = {
  showHeader: boolean;
};

export function CollectionMonthlyComparisonHeader({
  showHeader,
}: CollectionMonthlyComparisonHeaderProps) {
  if (!showHeader) {
    return (
      <h2 id="collection-monthly-comparison-title" className="sr-only">
        Monthly Collection Comparison
      </h2>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id="collection-monthly-comparison-title" className="text-lg font-semibold text-foreground">
          Monthly Collection Comparison
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Compare monthly totals, same-day pacing, target progress, and audit movement for one staff nickname.
        </p>
      </div>
      <span className="collection-monthly-comparison-chip rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        Same-day pacing ready
      </span>
    </div>
  );
}
