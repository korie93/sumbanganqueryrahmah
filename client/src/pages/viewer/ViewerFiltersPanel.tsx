import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnFilter } from "@/pages/viewer/types";

interface ViewerFiltersPanelProps {
  headers: string[];
  columnFilters: ColumnFilter[];
  onAddFilter: () => void;
  onClearAllFilters: () => void;
  onUpdateFilter: (index: number, field: keyof ColumnFilter, value: string) => void;
  onRemoveFilter: (index: number) => void;
}

export function ViewerFiltersPanel({
  headers,
  columnFilters,
  onAddFilter,
  onClearAllFilters,
  onUpdateFilter,
  onRemoveFilter,
}: ViewerFiltersPanelProps) {
  return (
    <div className="ops-toolbar mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium text-foreground">Column Filters</h3>
          <p className="text-xs text-muted-foreground">
            Narrow the loaded rows without leaving the viewer.
          </p>
        </div>
        <div className="flex gap-2">
          {columnFilters.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAllFilters}
              data-testid="button-clear-filters"
            >
              <X className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onAddFilter} data-testid="button-add-filter">
            Add Filter
          </Button>
        </div>
      </div>

      {columnFilters.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active filters. Click "Add Filter" to add one.
        </p>
      ) : (
        <div className="space-y-3">
          {columnFilters.map((filter, index) => (
            <div key={index} className="flex items-center gap-2 flex-wrap">
              <Select
                value={filter.column}
                onValueChange={(value) => onUpdateFilter(index, "column", value)}
              >
                <SelectTrigger className="w-40" data-testid={`select-filter-column-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filter.operator}
                onValueChange={(value) => onUpdateFilter(index, "operator", value)}
              >
                <SelectTrigger className="w-32" data-testid={`select-filter-operator-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="startsWith">Starts With</SelectItem>
                  <SelectItem value="endsWith">Ends With</SelectItem>
                  <SelectItem value="notEquals">Not Equals</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={filter.value}
                onChange={(event) => onUpdateFilter(index, "value", event.target.value)}
                placeholder="Value..."
                className="flex-1 min-w-32"
                data-testid={`input-filter-value-${index}`}
              />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveFilter(index)}
                data-testid={`button-remove-filter-${index}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
