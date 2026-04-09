import type { ColumnFilter, ViewerFilterMutableField } from "@/pages/viewer/types";

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
  return ensureViewerFilterIds(previous).map((filter, filterIndex) =>
    filterIndex === index ? { ...filter, [field]: value } : filter,
  );
}

export function removeViewerFilterAt(previous: ColumnFilter[], index: number) {
  return ensureViewerFilterIds(previous).filter((_, filterIndex) => filterIndex !== index);
}
