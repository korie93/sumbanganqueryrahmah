import { Plus, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterRow } from "@/pages/general-search/types";
import { OPERATORS } from "@/pages/general-search/utils";

interface GeneralSearchAdvancedControlsProps {
  columns: string[];
  filters: FilterRow[];
  loading: boolean;
  loadingColumns: boolean;
  logic: "AND" | "OR";
  onAddFilter: () => void;
  onLogicChange: (value: "AND" | "OR") => void;
  onRemoveFilter: (id: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onUpdateFilter: (id: string, updates: Partial<FilterRow>) => void;
}

export function GeneralSearchAdvancedControls({
  columns,
  filters,
  loading,
  loadingColumns,
  logic,
  onAddFilter,
  onLogicChange,
  onRemoveFilter,
  onReset,
  onSearch,
  onUpdateFilter,
}: GeneralSearchAdvancedControlsProps) {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <div className={`gap-3 ${isMobile ? "space-y-2" : "flex flex-wrap items-center"}`}>
        <span className="text-sm text-muted-foreground">Combine filters with:</span>
        <div className={`gap-2 ${isMobile ? "grid grid-cols-2" : "flex"}`}>
          <Button
            variant={logic === "AND" ? "default" : "outline"}
            size={isMobile ? "default" : "sm"}
            onClick={() => onLogicChange("AND")}
            className={isMobile ? "h-10 w-full" : ""}
            data-testid="button-logic-and"
          >
            AND
          </Button>
          <Button
            variant={logic === "OR" ? "default" : "outline"}
            size={isMobile ? "default" : "sm"}
            onClick={() => onLogicChange("OR")}
            className={isMobile ? "h-10 w-full" : ""}
            data-testid="button-logic-or"
          >
            OR
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {filters.map((filter, index) => (
          <div
            key={filter.id}
            className={`rounded-xl bg-muted/50 p-3 ${isMobile ? "space-y-3" : "flex flex-wrap items-center gap-2"}`}
            data-testid={`filter-row-${index}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-sm font-medium text-muted-foreground">
                {index === 0 ? "Where" : logic}
              </span>
              {isMobile ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveFilter(filter.id)}
                  disabled={filters.length === 1}
                  className="h-11 w-11 shrink-0"
                  aria-label={`Remove filter ${index + 1}`}
                  title={`Remove filter ${index + 1}`}
                  data-testid={`button-remove-filter-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <Select
              value={filter.field}
              onValueChange={(value) => onUpdateFilter(filter.id, { field: value })}
            >
              <SelectTrigger className={isMobile ? "h-11 w-full" : "w-[180px]"} data-testid={`select-field-${index}`}>
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                {loadingColumns ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : columns.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    No fields available
                  </SelectItem>
                ) : (
                  columns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select
              value={filter.operator}
              onValueChange={(value) => onUpdateFilter(filter.id, { operator: value })}
            >
              <SelectTrigger
                className={isMobile ? "h-11 w-full" : "w-[180px]"}
                data-testid={`select-operator-${index}`}
              >
                <SelectValue placeholder="Operator..." />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filter.operator !== "isEmpty" && filter.operator !== "isNotEmpty" ? (
              <Input
                id={`general-search-filter-value-${index}`}
                name={`generalSearchFilterValue${index + 1}`}
                type="search"
                value={filter.value}
                onChange={(event) =>
                  onUpdateFilter(filter.id, { value: event.target.value })
                }
                placeholder="Value..."
                autoComplete="off"
                className={isMobile ? "h-11 w-full" : "min-w-[150px] flex-1"}
                data-testid={`input-value-${index}`}
              />
            ) : null}

            {!isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveFilter(filter.id)}
                disabled={filters.length === 1}
                className="shrink-0"
                aria-label={`Remove filter ${index + 1}`}
                title={`Remove filter ${index + 1}`}
                data-testid={`button-remove-filter-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <div
        className={`gap-3 rounded-xl ${isMobile ? "sticky bottom-0 -mx-4 border-t border-border/60 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]" : "flex flex-wrap items-center"}`}
        data-floating-ai-avoid="true"
      >
        <Button
          variant="outline"
          size={isMobile ? "default" : "sm"}
          onClick={onAddFilter}
          className={isMobile ? "h-11 w-full" : ""}
          data-testid="button-add-filter"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Filter
        </Button>

        {!isMobile ? <div className="flex-1" /> : null}

        <Button
          onClick={onSearch}
          disabled={loading}
          className={isMobile ? "h-12 w-full" : ""}
          data-testid="button-search-advanced"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Searching...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search
            </div>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onReset}
          className={isMobile ? "h-11 w-full" : ""}
          data-testid="button-reset-advanced"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}
