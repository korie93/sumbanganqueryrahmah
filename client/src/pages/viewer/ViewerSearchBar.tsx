import { Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ViewerSearchBarProps {
  search: string;
  filteredRowsCount: number;
  rowsCount: number;
  showResultsSummary: boolean;
  onSearchChange: (value: string) => void;
}

export function ViewerSearchBar({
  search,
  filteredRowsCount,
  rowsCount,
  showResultsSummary,
  onSearchChange,
}: ViewerSearchBarProps) {
  return (
    <div className="mb-4 flex items-center gap-4 flex-wrap">
      <div className="relative flex-1 min-w-48 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search..."
          className="pl-9"
          data-testid="input-search-viewer"
        />
      </div>
      {showResultsSummary ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>
            {filteredRowsCount} results of {rowsCount}
          </span>
        </div>
      ) : null}
    </div>
  );
}
