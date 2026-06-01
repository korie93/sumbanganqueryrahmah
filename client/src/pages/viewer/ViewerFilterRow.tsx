import { memo, useCallback, type ChangeEvent } from "react";
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
import { VIEWER_FILTER_OPERATOR_OPTIONS } from "@/pages/viewer/filter-utils";
import type { ColumnFilter, ViewerFilterMutableField } from "@/pages/viewer/types";

interface ViewerFilterRowProps {
  filter: ColumnFilter;
  headers: string[];
  index: number;
  onRemoveFilter: (index: number) => void;
  onUpdateFilter: (index: number, field: ViewerFilterMutableField, value: string) => void;
}

function ViewerFilterRowImpl({
  filter,
  headers,
  index,
  onRemoveFilter,
  onUpdateFilter,
}: ViewerFilterRowProps) {
  const handleColumnChange = useCallback((value: string) => {
    onUpdateFilter(index, "column", value);
  }, [index, onUpdateFilter]);
  const handleOperatorChange = useCallback((value: string) => {
    onUpdateFilter(index, "operator", value);
  }, [index, onUpdateFilter]);
  const handleValueChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onUpdateFilter(index, "value", event.target.value);
  }, [index, onUpdateFilter]);
  const handleRemoveFilter = useCallback(() => {
    onRemoveFilter(index);
  }, [index, onRemoveFilter]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/70 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={filter.column} onValueChange={handleColumnChange}>
        <SelectTrigger className="w-full sm:w-40" data-testid={`select-filter-column-${index}`}>
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
        onValueChange={handleOperatorChange}
      >
        <SelectTrigger className="w-full sm:w-32" data-testid={`select-filter-operator-${index}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIEWER_FILTER_OPERATOR_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        id={`viewer-filter-value-${index}`}
        name={`viewerFilterValue${index + 1}`}
        type="search"
        value={filter.value}
        onChange={handleValueChange}
        placeholder="Value..."
        autoComplete="off"
        className="min-w-0 flex-1"
        data-testid={`input-filter-value-${index}`}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemoveFilter}
        data-testid={`button-remove-filter-${index}`}
        className="w-full justify-center gap-2 self-end sm:w-auto sm:justify-start sm:self-auto"
      >
        <X className="h-4 w-4" />
        <span>Remove</span>
      </Button>
    </div>
  );
}

export const ViewerFilterRow = memo(ViewerFilterRowImpl);
