import { memo, useCallback, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIEWER_FILTER_OPERATOR_OPTIONS } from "@/pages/viewer/filter-utils";
import { ViewerFilterColumnPicker } from "@/pages/viewer/ViewerFilterColumnPicker";
import type { ColumnFilter, ViewerFilterMutableField } from "@/pages/viewer/types";
import {
  getImportFilterValidationIssue,
  isDateImportFilterOperator,
  isImportFilterRangeOperator,
  isNumericImportFilterOperator,
} from "@shared/common/import-data-filters";

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
  const handleValueToChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onUpdateFilter(index, "valueTo", event.target.value);
  }, [index, onUpdateFilter]);
  const handleRemoveFilter = useCallback(() => {
    onRemoveFilter(index);
  }, [index, onRemoveFilter]);
  const rowNumber = index + 1;
  const columnLabelId = `viewer-filter-column-label-${index}`;
  const operatorLabelId = `viewer-filter-operator-label-${index}`;
  const valueInputId = `viewer-filter-value-${index}`;
  const valueToInputId = `viewer-filter-value-to-${index}`;
  const helpId = `viewer-filter-help-${index}`;
  const numeric = isNumericImportFilterOperator(filter.operator);
  const date = isDateImportFilterOperator(filter.operator);
  const between = isImportFilterRangeOperator(filter.operator);
  const issue = numeric || date ? getImportFilterValidationIssue(filter) : null;
  const showError = Boolean(issue && (filter.value.trim() || filter.valueTo?.trim()));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/70 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <span id={columnLabelId} className="sr-only">
        Filter {rowNumber} column
      </span>
      <ViewerFilterColumnPicker
        headers={headers}
        value={filter.column}
        index={index}
        labelledBy={columnLabelId}
        onValueChange={handleColumnChange}
      />

      <span id={operatorLabelId} className="sr-only">
        Filter {rowNumber} operator
      </span>
      <Select
        value={filter.operator}
        onValueChange={handleOperatorChange}
      >
        <SelectTrigger
          aria-labelledby={operatorLabelId}
          className="w-full sm:w-40"
          data-testid={`select-filter-operator-${index}`}
        >
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

      <div className={`grid min-w-0 flex-1 gap-2${date && between ? " grid-cols-1 sm:min-w-80 sm:grid-cols-2" : ` sm:min-w-48${between ? " grid-cols-2" : ""}`}`}>
        <div className="min-w-0">
          <label htmlFor={valueInputId} className="sr-only">
            Filter {rowNumber} {date ? (between ? "start date" : "date") : (between ? "minimum value" : "value")}
          </label>
          <Input
            id={valueInputId}
            name={`viewerFilterValue${index + 1}`}
            type={date ? "date" : numeric ? "text" : "search"}
            inputMode={numeric ? "decimal" : undefined}
            min={date ? "0001-01-01" : undefined}
            max={date ? "9999-12-31" : undefined}
            value={filter.value}
            onChange={handleValueChange}
            placeholder={date ? undefined : between ? "Minimum" : numeric ? "Number..." : "Value..."}
            autoComplete="off"
            aria-describedby={numeric || date ? helpId : undefined}
            {...getAriaInvalidProps(showError)}
            className="min-w-0"
            data-testid={`input-filter-value-${index}`}
          />
        </div>
        {between ? (
          <div className="min-w-0">
            <label htmlFor={valueToInputId} className="sr-only">
              Filter {rowNumber} {date ? "end date" : "maximum value"}
            </label>
            <Input
              id={valueToInputId}
              name={`viewerFilterValueTo${index + 1}`}
              type={date ? "date" : "text"}
              inputMode={date ? undefined : "decimal"}
              min={date ? "0001-01-01" : undefined}
              max={date ? "9999-12-31" : undefined}
              value={filter.valueTo ?? ""}
              onChange={handleValueToChange}
              placeholder={date ? undefined : "Maximum"}
              autoComplete="off"
              aria-describedby={helpId}
              {...getAriaInvalidProps(showError)}
              className="min-w-0"
              data-testid={`input-filter-value-to-${index}`}
            />
          </div>
        ) : null}
      </div>

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
      {numeric || date ? (
        <p id={helpId} role={showError ? "status" : undefined} className={`w-full text-xs${showError ? " text-destructive" : " text-muted-foreground"}`}>
          {issue ?? (date
            ? `Imported dates: YYYY-MM-DD, YYYYMMDD or day-first D/M/YYYY and D-M-YYYY. ${between ? "Includes both dates." : "Excludes the selected date."}`
            : between ? "Includes both limits." : "Numbers only, for example 1,000.50.")}
        </p>
      ) : null}
    </div>
  );
}

export const ViewerFilterRow = memo(ViewerFilterRowImpl);
