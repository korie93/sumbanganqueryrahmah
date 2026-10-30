import type { ColumnFilter } from "@/pages/viewer/types";

export const VIEWER_FILTER_OPERATOR_OPTIONS: Array<{
  value: ColumnFilter["operator"];
  label: string;
}> = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "startsWith", label: "Starts With" },
  { value: "endsWith", label: "Ends With" },
  { value: "notEquals", label: "Not Equals" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "between", label: "Between" },
  { value: "dateBefore", label: "Before date" },
  { value: "dateAfter", label: "After date" },
  { value: "dateBetween", label: "Between dates" },
];

export function buildViewerFiltersEmptyMessage() {
  return 'No active filters. Click "Add Filter" to add one.';
}
