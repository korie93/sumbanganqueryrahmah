import { Filter } from "lucide-react";
import { buildViewerSearchResultsSummary } from "@/pages/viewer/search-bar-utils";

interface ViewerSearchSummaryProps {
  filteredRowsCount: number;
  rowsCount: number;
}

export function ViewerSearchSummary({
  filteredRowsCount,
  rowsCount,
}: ViewerSearchSummaryProps) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/80 px-3 py-2 text-sm text-muted-foreground">
      <Filter className="h-4 w-4" />
      <span>{buildViewerSearchResultsSummary(filteredRowsCount, rowsCount)}</span>
    </div>
  );
}
