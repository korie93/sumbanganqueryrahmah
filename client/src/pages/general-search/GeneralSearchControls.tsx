import { AlertCircle, Filter, Plus, RotateCcw, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterRow } from "@/pages/general-search/types";
import { OPERATORS } from "@/pages/general-search/utils";

interface GeneralSearchControlsProps {
  activeFiltersCount: number;
  advancedMode: boolean;
  columns: string[];
  error: string;
  filters: FilterRow[];
  loading: boolean;
  loadingColumns: boolean;
  logic: "AND" | "OR";
  query: string;
  onAddFilter: () => void;
  onLogicChange: (value: "AND" | "OR") => void;
  onModeChange: (value: boolean) => void;
  onQueryChange: (value: string) => void;
  onRemoveFilter: (id: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onUpdateFilter: (id: string, updates: Partial<FilterRow>) => void;
}

export function GeneralSearchControls({
  activeFiltersCount,
  advancedMode,
  columns,
  error,
  filters,
  loading,
  loadingColumns,
  logic,
  query,
  onAddFilter,
  onLogicChange,
  onModeChange,
  onQueryChange,
  onRemoveFilter,
  onReset,
  onSearch,
  onUpdateFilter,
}: GeneralSearchControlsProps) {
  return (
    <div className="glass-wrapper mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant={advancedMode ? "outline" : "default"}
          size="sm"
          onClick={() => onModeChange(false)}
          data-testid="button-simple-search"
        >
          <Search className="mr-2 h-4 w-4" />
          Simple Search
        </Button>
        <Button
          variant={advancedMode ? "default" : "outline"}
          size="sm"
          onClick={() => onModeChange(true)}
          data-testid="button-advanced-search"
        >
          <Filter className="mr-2 h-4 w-4" />
          Advanced Search
          {activeFiltersCount > 0 ? (
            <Badge variant="secondary" className="ml-2">
              {activeFiltersCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      {!advancedMode ? (
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              placeholder="Enter IC No., name, or other keywords..."
              className="h-12 pl-10 text-base"
              data-testid="input-search"
            />
          </div>
          <Button
            onClick={onSearch}
            disabled={loading}
            className="h-12 px-6"
            data-testid="button-search"
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
            className="h-12 px-6"
            data-testid="button-reset"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Combine filters with:</span>
            <div className="flex gap-2">
              <Button
                variant={logic === "AND" ? "default" : "outline"}
                size="sm"
                onClick={() => onLogicChange("AND")}
                data-testid="button-logic-and"
              >
                AND
              </Button>
              <Button
                variant={logic === "OR" ? "default" : "outline"}
                size="sm"
                onClick={() => onLogicChange("OR")}
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
                className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3"
                data-testid={`filter-row-${index}`}
              >
                <span className="w-8 shrink-0 text-sm text-muted-foreground">
                  {index === 0 ? "Where" : logic}
                </span>

                <Select
                  value={filter.field}
                  onValueChange={(value) => onUpdateFilter(filter.id, { field: value })}
                >
                  <SelectTrigger className="w-[180px]" data-testid={`select-field-${index}`}>
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
                    className="w-[180px]"
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
                    value={filter.value}
                    onChange={(event) =>
                      onUpdateFilter(filter.id, { value: event.target.value })
                    }
                    placeholder="Value..."
                    className="min-w-[150px] flex-1"
                    data-testid={`input-value-${index}`}
                  />
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveFilter(filter.id)}
                  disabled={filters.length === 1}
                  className="shrink-0"
                  data-testid={`button-remove-filter-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddFilter}
              data-testid="button-add-filter"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Filter
            </Button>

            <div className="flex-1" />

            <Button onClick={onSearch} disabled={loading} data-testid="button-search-advanced">
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
              data-testid="button-reset-advanced"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}
    </div>
  );
}
