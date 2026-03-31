interface ViewerDataTableFeedbackProps {
  debouncedSearch: string;
  filteredRowsCount: number;
  minSearchLength: number;
}

export function ViewerDataTableFeedback({
  debouncedSearch,
  filteredRowsCount,
  minSearchLength,
}: ViewerDataTableFeedbackProps) {
  if (debouncedSearch && debouncedSearch.length < minSearchLength) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Type at least {minSearchLength} characters to search
      </div>
    );
  }

  if (debouncedSearch && debouncedSearch.length >= minSearchLength && filteredRowsCount === 0) {
    return <div className="p-6 text-center text-muted-foreground">No results found</div>;
  }

  return null;
}
