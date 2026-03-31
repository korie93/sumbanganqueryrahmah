import { Columns } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildViewerColumnSelectorLabel } from "@/pages/viewer/column-selector-utils";
import { ViewerColumnSelectorList } from "@/pages/viewer/ViewerColumnSelectorList";

interface ViewerColumnSelectorProps {
  open: boolean;
  headers: string[];
  selectedColumns: Set<string>;
  onOpenChange: (open: boolean) => void;
  onToggleColumn: (column: string) => void;
  onSelectAllColumns: () => void;
  onDeselectAllColumns: () => void;
}

export function ViewerColumnSelector({
  open,
  headers,
  selectedColumns,
  onOpenChange,
  onToggleColumn,
  onSelectAllColumns,
  onDeselectAllColumns,
}: ViewerColumnSelectorProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" data-testid="button-column-selector">
          <Columns className="w-4 h-4 mr-2" />
          {buildViewerColumnSelectorLabel(selectedColumns.size, headers.length)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">Select Columns</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAllColumns}
                data-testid="button-select-all-columns"
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeselectAllColumns}
                data-testid="button-deselect-columns"
              >
                Min
              </Button>
            </div>
          </div>
          <ViewerColumnSelectorList
            headers={headers}
            selectedColumns={selectedColumns}
            onToggleColumn={onToggleColumn}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
