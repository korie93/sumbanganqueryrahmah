import { Columns } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
          Columns ({selectedColumns.size}/{headers.length})
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
          <div className="max-h-48 overflow-y-auto space-y-2">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-2">
                <Checkbox
                  id={`col-${header}`}
                  checked={selectedColumns.has(header)}
                  onCheckedChange={() => onToggleColumn(header)}
                  data-testid={`checkbox-column-${header}`}
                />
                <Label htmlFor={`col-${header}`} className="text-sm cursor-pointer">
                  {header}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
