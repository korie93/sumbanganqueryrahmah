import type { ReactNode } from "react";

type CollectionMonthlyComparisonHeaderProps = {
  showHeader: boolean;
  actions?: ReactNode;
};

export function CollectionMonthlyComparisonHeader({
  showHeader,
  actions,
}: CollectionMonthlyComparisonHeaderProps) {
  if (!showHeader) {
    return (
      <div className="monthly-comparison-header monthly-comparison-header--compact">
        <h2 id="collection-monthly-comparison-title" className="sr-only">
          Monthly Collection Comparison
        </h2>
        {actions}
      </div>
    );
  }

  return (
    <header className="monthly-comparison-header">
      <div className="min-w-0 space-y-1">
        <h2 id="collection-monthly-comparison-title" className="monthly-comparison-title">
          Monthly Collection Comparison
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Compare the trend and exact amounts in one view.
        </p>
      </div>
      {actions}
    </header>
  );
}
