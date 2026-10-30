import type { ColumnFilter, ViewerFilterMutableField } from "@/pages/viewer/types";
import { isDateImportFilterOperator, isImportFilterRangeOperator } from "@shared/common/import-data-filters";

let viewerFilterSequence = 0;

function createViewerFilterId() {
  viewerFilterSequence += 1;
  return `viewer-filter-${viewerFilterSequence}`;
}

export function ensureViewerFilterIds(previous: ColumnFilter[]) {
  return previous.map((filter) => (filter.id ? filter : { ...filter, id: createViewerFilterId() }));
}

export function appendViewerFilter(previous: ColumnFilter[], headers: string[]) {
  if (headers.length === 0) {
    return previous;
  }

  return [
    ...ensureViewerFilterIds(previous),
    { id: createViewerFilterId(), column: headers[0], operator: "contains", value: "" } satisfies ColumnFilter,
  ];
}

export function updateViewerFilterAt(
  previous: ColumnFilter[],
  index: number,
  field: ViewerFilterMutableField,
  value: string,
) {
  return ensureViewerFilterIds(previous).map((filter, filterIndex) => {
    if (filterIndex !== index) return filter;
    const next = { ...filter, [field]: value };
    if (field === "operator") {
      // Changing date/number/text families must never reinterpret an old value.
      if (isDateImportFilterOperator(filter.operator) !== isDateImportFilterOperator(value)) {
        next.value = "";
        delete next.valueTo;
      } else if (!isImportFilterRangeOperator(value)) delete next.valueTo;
    }
    return next;
  });
}

export function removeViewerFilterAt(previous: ColumnFilter[], index: number) {
  return ensureViewerFilterIds(previous).filter((_, filterIndex) => filterIndex !== index);
}
