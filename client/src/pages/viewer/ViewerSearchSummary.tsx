import { buildViewerSearchResultsSummary } from "@/pages/viewer/search-bar-utils";

interface ViewerSearchSummaryProps {
  filteredRowsCount: number;
  rowsCount: number;
  totalRows?: number | undefined;
  message?: string | undefined;
  visible?: boolean | undefined;
}

export function ViewerSearchSummary({
  filteredRowsCount,
  rowsCount,
  totalRows,
  message,
  visible = true,
}: ViewerSearchSummaryProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={visible ? "text-xs text-muted-foreground" : "sr-only"}
    >
      {message ?? (totalRows === undefined
        ? buildViewerSearchResultsSummary(filteredRowsCount, rowsCount)
        : `${totalRows} hasil · ${filteredRowsCount} dipaparkan`)}
    </p>
  );
}
