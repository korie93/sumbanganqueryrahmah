import { Eye } from "lucide-react";

interface ViewerEmptyStateProps {
  emptyHint: string;
  isSearchBelowMinLength: boolean;
  minSearchLength: number;
}

export function ViewerEmptyState({
  emptyHint,
  isSearchBelowMinLength,
  minSearchLength,
}: ViewerEmptyStateProps) {
  return (
    <div className="ops-empty-state">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Eye className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">No data</p>
      {emptyHint ? <p className="mt-2 text-sm text-muted-foreground">{emptyHint}</p> : null}
      {isSearchBelowMinLength ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Enter at least {minSearchLength} characters to search large datasets.
        </p>
      ) : null}
    </div>
  );
}
